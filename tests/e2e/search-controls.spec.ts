import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

test('applies and clears a filter while preserving keyboard focus and browser history', async ({ page }) => {
  const { requests } = await mockCatalog(page);
  await page.goto('/?page=2&source=demo');
  await expect(page.getByRole('heading', { name: 'Thor', exact: true })).toBeVisible();
  const input = page.getByRole('searchbox', { name: 'Search characters' });
  await input.fill('iron');
  await input.press('Enter');
  await expect(page).toHaveURL(/query=iron/);
  await expect(page.getByRole('heading', { name: 'Iron Man', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('source')).toBe('demo');
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  await expect(input).toBeFocused();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear search', exact: true })).toHaveCount(0);
  expect(requests.map(url => url.searchParams.get('query'))).toEqual([null, 'iron', null]);

  await page.goBack();
  await expect(input).toHaveValue('iron');
  await expect(page.getByRole('heading', { name: 'Iron Man', exact: true })).toBeVisible();
  await input.press('Escape');
  await expect(input).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
});

test('waits for completed text composition before applying a search', async ({ page }) => {
  const { requests } = await mockCatalog(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  const input = page.getByRole('searchbox', { name: 'Search characters' });
  await input.dispatchEvent('compositionstart');
  await input.fill('iron');
  await input.press('Enter');
  expect(new URL(page.url()).searchParams.has('query')).toBe(false);
  expect(requests).toHaveLength(1);
  await input.dispatchEvent('compositionend');
  await expect(page).toHaveURL(/query=iron/);
  await expect.poll(() => requests.length).toBe(2);
  await expect(page.getByRole('heading', { name: 'Iron Man', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[1].searchParams.get('query')).toBe('iron');
});

test('allows clearing a locally invalid search without a pointless retry', async ({ page }) => {
  const { requests } = await mockCatalog(page);
  await page.goto('/?query=s&page=2');
  await expect(page.getByRole('alert')).toHaveText('Search must contain at least two characters.');
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search characters' })).toBeFocused();
  expect(requests).toHaveLength(1);
});
