import { test, expect, idea } from './fixtures';

test('creates an idea with all form values', async ({ page, api }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Новая идея', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Название', exact: true }).pressSequentially('Новая идея');
  await dialog.getByLabel('Описание', { exact: true }).pressSequentially('Подробности идеи');
  await dialog.getByLabel('Статус', { exact: true }).selectOption('refine');
  await dialog.getByLabel('Приоритет', { exact: true }).selectOption('high');
  await dialog.getByLabel('Новый тег', { exact: true }).fill('работа');
  await dialog.getByRole('button', { name: 'Добавить тег', exact: true }).click();
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Редактировать: Новая идея', exact: true })).toBeVisible();
  await expect(page.getByText('Подробности идеи', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('Высокий', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('работа', { exact: true })).toBeVisible();
  expect(api.mutations).toEqual([{ method: 'POST', path: '/api/ideas', body: {
    title: 'Новая идея', description: 'Подробности идеи', status: 'refine', priority: 'high', tags: ['работа'],
  } }]);
});

test('edits an idea and preserves values when reopened', async ({ page, api }) => {
  api.ideas = [idea()];
  await page.goto('/');
  await page.getByRole('button', { name: 'Редактировать: План путешествия', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Описание', { exact: true })).toHaveValue('Маршрут по Грузии');
  await dialog.getByRole('textbox', { name: 'Название', exact: true }).fill('Обновлённая идея');
  await dialog.getByLabel('Описание', { exact: true }).fill('Новые подробности');
  await dialog.getByLabel('Статус', { exact: true }).selectOption('refine');
  await dialog.getByLabel('Приоритет', { exact: true }).selectOption('low');
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Новые подробности', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('Низкий', { exact: true })).toBeVisible();
  expect(api.mutations).toEqual([{ method: 'PATCH', path: `/api/ideas/${api.ideas[0].id}`, body: {
    title: 'Обновлённая идея', description: 'Новые подробности', status: 'refine', priority: 'low', tags: ['личное'],
  } }]);
  await page.getByRole('button', { name: 'Редактировать: Обновлённая идея', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Название', exact: true })).toHaveValue('Обновлённая идея');
  await expect(dialog.getByLabel('Описание', { exact: true })).toHaveValue('Новые подробности');
  await expect(dialog.getByLabel('Статус', { exact: true })).toHaveValue('refine');
  await expect(dialog.getByLabel('Приоритет', { exact: true })).toHaveValue('low');
  await expect(dialog.getByText('личное', { exact: true })).toBeVisible();
});

test('cancels creation without sending a mutation', async ({ page, api }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Новая идея', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Название', exact: true }).fill('Несохранённая идея');
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Идеи не найдены', { exact: true })).toBeVisible();
  expect(api.mutations).toEqual([]);
  await expect(page.getByRole('button', { name: 'Редактировать: Несохранённая идея', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '+ Новая идея', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Название', exact: true })).toHaveValue('');
});

test('searches and combines filters, then restores the list', async ({ page, api }) => {
  api.ideas = [
    idea({ priority: 'high' }),
    idea({ id: '00000000-0000-4000-8000-000000000002', title: 'Рабочий проект',
      description: 'Подготовить прототип', priority: 'high', tags: '["работа"]' }),
    idea({ id: '00000000-0000-4000-8000-000000000003', title: 'Купить книгу',
      description: 'Роман', priority: 'low' }),
  ];
  await page.goto('/');
  const cards = page.getByRole('button', { name: /^Редактировать: / });
  await expect(cards).toHaveCount(3);
  await page.getByRole('textbox', { name: 'Поиск', exact: true }).fill('прототип');
  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAccessibleName('Редактировать: Рабочий проект');
  await page.getByRole('textbox', { name: 'Поиск', exact: true }).fill('');
  await page.getByRole('combobox', { name: 'Приоритет', exact: true }).click();
  await page.getByRole('option', { name: 'Высокий', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Теги', exact: true }).click();
  await page.getByRole('option', { name: 'личное', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAccessibleName('Редактировать: План путешествия');
  await page.getByLabel('Сбросить приоритет', { exact: true }).click();
  await expect(cards).toHaveCount(2);
  await page.getByLabel('Очистить теги', { exact: true }).click();
  await expect(cards).toHaveCount(3);
  expect(api.mutations).toEqual([]);
});

test('keeps the form after a failed save and allows retry', async ({ page, api }) => {
  api.failNextSave = true;
  await page.goto('/');
  await page.getByRole('button', { name: '+ Новая идея', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Название', exact: true }).fill('Не потерять идею');
  await dialog.getByLabel('Описание', { exact: true }).fill('Важные подробности');
  await dialog.getByLabel('Статус', { exact: true }).selectOption('refine');
  await dialog.getByLabel('Приоритет', { exact: true }).selectOption('high');
  await dialog.getByLabel('Новый тег', { exact: true }).fill('важное');
  await dialog.getByRole('button', { name: 'Добавить тег', exact: true }).click();
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByText('Error: Внутренняя ошибка сервера', { exact: true })).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Название', exact: true })).toHaveValue('Не потерять идею');
  await expect(dialog.getByLabel('Описание', { exact: true })).toHaveValue('Важные подробности');
  await expect(dialog.getByLabel('Статус', { exact: true })).toHaveValue('refine');
  await expect(dialog.getByLabel('Приоритет', { exact: true })).toHaveValue('high');
  await expect(dialog.getByText('важное', { exact: true })).toBeVisible();
  expect(api.ideas).toEqual([]);
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Редактировать: Не потерять идею', exact: true })).toBeVisible();
  expect(api.mutations).toHaveLength(2);
  expect(api.mutations[0]).toEqual(api.mutations[1]);
  expect(api.mutations[1].body).toEqual({ title: 'Не потерять идею', description: 'Важные подробности',
    status: 'refine', priority: 'high', tags: ['важное'] });
});
