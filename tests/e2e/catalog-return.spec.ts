import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

test('preserves the catalog location through character and comic discovery, including reload', async ({ page }) => {
  const { requests } = await mockCatalog(page);
  await page.goto('/?query=sp&page=2&source=demo');
  await page.getByRole('link', { name: 'Spider-Man', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View comics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Amazing Spider-Man #1', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Amazing Spider-Man #1', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to character', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to characters', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search characters' })).toHaveValue('sp');
  expect(new URL(page.url()).searchParams).toEqual(new URLSearchParams('query=sp&page=2&source=demo'));
  await expect.poll(() => requests.at(-1)?.pathname).toBe('/api/v1/characters');
  expect(requests.at(-1)?.searchParams.get('query')).toBe('sp');
  expect(requests.at(-1)?.searchParams.get('page')).toBe('2');
  expect(requests.at(-1)?.searchParams.has('character')).toBe(false);
});

test('offers a direct catalog return from comics while preserving the search', async ({ page }) => {
  await mockCatalog(page);
  await page.goto('/stories/101/comics?character=1&query=iron&page=2');
  await page.getByRole('link', { name: 'Back to characters', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search characters' })).toHaveValue('iron');
  expect(new URL(page.url()).searchParams.get('page')).toBe('2');
  expect(new URL(page.url()).searchParams.has('character')).toBe(false);
});

for (const character of ['', '../private', 'https://example.test', '0', '1&character=2']) {
  test(`does not create a character return link for invalid context: ${character}`, async ({ page }) => {
    await mockCatalog(page);
    await page.goto(`/stories/101/comics?character=${encodeURIComponent(character)}`);
    await expect(page.getByRole('heading', { name: 'Related comics', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to character', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Back to characters', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });
}
