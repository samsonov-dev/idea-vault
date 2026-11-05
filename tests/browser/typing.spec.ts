import { test, expect } from './fixtures';

test('typing repeatedly keeps the idea form and application visible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Новая идея', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const title = dialog.getByRole('textbox', { name: 'Название', exact: true });
  const description = dialog.getByRole('textbox', { name: 'Описание', exact: true });
  await title.pressSequentially('Новая');
  await title.pressSequentially(' идея');
  await description.pressSequentially('Описание');
  await description.pressSequentially(' идеи');
  await dialog.getByLabel('Статус', { exact: true }).selectOption('progress');
  await dialog.getByLabel('Приоритет', { exact: true }).selectOption('high');
  await expect(title).toHaveValue('Новая идея');
  await expect(description).toHaveValue('Описание идеи');
  await expect(dialog.getByLabel('Статус', { exact: true })).toHaveValue('progress');
  await expect(dialog.getByLabel('Приоритет', { exact: true })).toHaveValue('high');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Хранилище идей', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled();
});
