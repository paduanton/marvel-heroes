import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

test('keeps stories navigable while character details fail and recover', async ({ page }) => {
  const { failures, requests } = await mockCatalog(page);
  failures.set('/api/v1/characters/1', 1);
  await page.goto('/characters/1?source=demo');
  const character = page.getByRole('region', { name: 'Character details', exact: true });
  const stories = page.getByRole('region', { name: 'Related stories', exact: true });
  await expect(character.getByRole('alert')).toBeVisible();
  await expect(stories.getByRole('heading', { name: 'Origin of a hero' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Character details' })).toBeVisible();
  await stories.getByRole('button', { name: 'Next', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(stories.getByRole('heading', { name: 'Next adventure' })).toBeVisible();
  await character.getByRole('button', { name: 'Try character again' }).focus();
  await page.keyboard.press('Enter');
  await expect(character.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await expect(character).toBeFocused();
  await expect(stories.getByRole('heading', { name: 'Next adventure' })).toBeVisible();
  await expect(stories.getByText('Page 2', { exact: true })).toBeVisible();
  expect(requests.filter(url => url.pathname === '/api/v1/characters/1')).toHaveLength(2);
  expect(requests.filter(url => url.pathname === '/api/v1/characters/1/stories')).toHaveLength(2);
  await stories.getByRole('link', { name: 'View comics' }).click();
  await expect(page).toHaveURL(/\/stories\/102\/comics/);
});

test('shows stories before a pending character response without stealing focus', async ({ page }) => {
  await mockCatalog(page);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.pathname === '/api/v1/characters/1', async route => {
    await gate;
    await route.fallback();
  });
  try {
    await page.goto('/characters/1');
    await expect(page.getByRole('region', { name: 'Character details', exact: true }).getByRole('status')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Origin of a hero' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to characters', exact: true }).focus();
  } finally {
    release();
  }
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to characters', exact: true })).toBeFocused();
});
