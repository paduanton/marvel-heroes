import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

test('restores story pagination through reload and browser history', async ({ page }) => {
  const { requests } = await mockCatalog(page);
  await page.goto('/characters/1?query=sp&page=2&source=portfolio');
  const stories = page.getByRole('region', { name: 'Related stories', exact: true });
  await expect(stories.getByRole('heading', { name: 'Origin of a hero', exact: true })).toBeVisible();
  await stories.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(stories.getByRole('heading', { name: 'Next adventure', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('stories_page')).toBe('2');
  expect(new URL(page.url()).searchParams.get('page')).toBe('2');
  expect(requests.filter(url => url.pathname === '/api/v1/characters/1')).toHaveLength(1);
  await page.reload();
  await expect(stories.getByRole('heading', { name: 'Next adventure', exact: true })).toBeVisible();
  await stories.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(stories.getByRole('heading', { name: 'Origin of a hero', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('stories_page')).toBe(false);
  await page.goBack();
  await expect(stories.getByRole('heading', { name: 'Next adventure', exact: true })).toBeVisible();
  await page.goForward();
  await expect(stories.getByRole('heading', { name: 'Origin of a hero', exact: true })).toBeVisible();
});
