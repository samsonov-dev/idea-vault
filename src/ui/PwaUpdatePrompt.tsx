import { useState } from 'react';
import { Alert, Button, Group, Text } from '@mantine/core';
import { useRegisterSW } from 'virtual:pwa-register/react';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function PwaUpdatePrompt({ blocked }: { blocked: boolean }) {
  const [updating, setUpdating] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine && document.visibilityState === 'visible') {
          void registration.update().catch(console.error);
        }
      };
      const interval = window.setInterval(check, CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', check);
      window.addEventListener('focus', check);
      // Registration lives for the duration of this app session.
      window.addEventListener('pagehide', () => {
        window.clearInterval(interval);
        document.removeEventListener('visibilitychange', check);
        window.removeEventListener('focus', check);
      }, { once: true });
      check();
    },
    onRegisterError(error) {
      console.error('PWA registration failed', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <Alert title="A new version of Idea Vault is available" color="blue" mb="md">
      <Text size="sm" mb="sm">
        {blocked
          ? 'Finish editing or saving your idea before updating.'
          : 'Update the app to get the latest changes.'}
      </Text>
      <Group gap="xs">
        <Button size="xs" disabled={blocked || updating} loading={updating}
          onClick={() => {
            setUpdating(true);
            void updateServiceWorker().catch(error => {
              console.error('PWA update failed', error);
              setUpdating(false);
            });
          }}>
          Update now
        </Button>
        <Button size="xs" variant="subtle" onClick={() => setNeedRefresh(false)}>
          Later
        </Button>
      </Group>
    </Alert>
  );
}
