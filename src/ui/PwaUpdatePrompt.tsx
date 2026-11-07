import { useState } from 'react';
import { Alert, Button, Group, Text } from '@mantine/core';
import { useRegisterSW } from 'virtual:pwa-register/react';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function PwaUpdatePrompt({ blocked, loadFailed, onRetry }: {
  blocked: boolean;
  loadFailed: boolean;
  onRetry: () => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine && document.visibilityState === 'visible') {
          void registration.update().catch(error => console.error('PWA update check failed', error));
        }
      };
      const interval = window.setInterval(check, CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', check);
      window.addEventListener('focus', check);
      window.addEventListener('online', check);
      window.addEventListener('pagehide', () => {
        window.clearInterval(interval);
        document.removeEventListener('visibilitychange', check);
        window.removeEventListener('focus', check);
        window.removeEventListener('online', check);
      }, { once: true });
      check();
    },
    onRegisterError(error) {
      console.error('PWA registration failed', error);
      setError('Не удалось зарегистрировать обновления приложения.');
    },
  });

  const recover = async () => {
    if (blocked || !window.confirm('Сбросить локальный кеш приложения и перезагрузить страницу? Несохранённые локальные данные могут быть потеряны.')) return;
    setRecovering(true);
    setError(null);
    try {
      // Only unregister workers controlling this application, not unrelated apps.
      const registrations = await navigator.serviceWorker.getRegistrations();
      const scope = new URL(import.meta.env.BASE_URL, window.location.origin).href;
      await Promise.all(registrations.filter(reg => reg.scope === scope).map(reg => reg.unregister()));
      // Remove only Workbox precache/runtime caches belonging to this origin.
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith('workbox-')).map(key => caches.delete(key)));
      }
      window.location.reload();
    } catch (cause) {
      console.error('PWA recovery failed', cause);
      setError('Не удалось очистить кеш. Попробуйте переустановить приложение.');
      setRecovering(false);
    }
  };

  if (!needRefresh && !loadFailed && !error) return null;

  return (
    <Alert title={needRefresh ? 'Доступна новая версия «Хранилища идей»' : 'Проблема с загрузкой приложения'} color={loadFailed || error ? 'orange' : 'blue'} mb="md">
      <Text size="sm" mb="sm">
        {error ?? (needRefresh
          ? blocked ? 'Завершите редактирование или сохранение идеи перед обновлением.' : 'Обновите приложение, чтобы получить последние изменения.'
          : 'Не удалось загрузить идеи. Возможно, используется устаревший кеш приложения.')}
      </Text>
      <Group gap="xs">
        {needRefresh && <Button size="xs" disabled={blocked || updating || recovering} loading={updating}
          onClick={() => {
            setUpdating(true);
            setError(null);
            void updateServiceWorker(true).catch(cause => {
              console.error('PWA update failed', cause);
              setError('Не удалось установить обновление. Попробуйте ещё раз.');
              setUpdating(false);
            });
          }}>Обновить сейчас</Button>}
        {loadFailed && <Button size="xs" variant="light" disabled={recovering} onClick={onRetry}>Повторить запрос</Button>}
        {(loadFailed || error) && <Button size="xs" color="orange" variant="light" disabled={blocked || updating} loading={recovering} onClick={() => void recover()}>Сбросить кеш PWA</Button>}
        {needRefresh && !loadFailed && <Button size="xs" variant="subtle" onClick={() => setNeedRefresh(false)}>Позже</Button>}
      </Group>
    </Alert>
  );
}
