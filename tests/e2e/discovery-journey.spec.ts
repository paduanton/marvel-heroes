import { expect, test, type Page } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

async function expectNoHorizontalOverflow(page: Page) {
  const width = page.viewportSize()?.width;
  expect(width).toBeDefined();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(width!);
}

test('applies a search from a later catalog page and restores browser history', async ({ page }) => {
  const { requests } = await mockCatalog(page);
  await page.goto('/?page=2');
  await expect(page.getByRole('heading', { name: 'Thor', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Catalog pages' }).getByText('Page 2', { exact: true })).toBeVisible();

  const search = page.getByRole('searchbox', { name: 'Search characters' });
  await search.fill('sp');
  await expect(page).toHaveURL(/\?query=sp$/);
  await expect(page.getByRole('heading', { name: 'Results for "sp"', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Iron Man', exact: true })).toHaveCount(0);
  expect(requests.at(-1)?.searchParams.get('query')).toBe('sp');
  expect(requests.at(-1)?.searchParams.get('page')).toBe('1');

  await page.goBack();
  await expect(page).toHaveURL(/\?page=2$/);
  await expect(search).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Thor', exact: true })).toBeVisible();

  await page.goForward();
  await expect(search).toHaveValue('sp');
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await search.fill('');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Iron Man', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('discovers a character and paginates its related stories and comics', async ({ page }, testInfo) => {
  await mockCatalog(page);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Spider-Man', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('catalog.png'), fullPage: true });

  await page.getByRole('link', { name: 'Spider-Man', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/1$/);
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Origin of a hero', exact: true })).toBeVisible();
  const stories = page.getByRole('region', { name: 'Related stories', exact: true });
  await stories.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(stories.getByRole('heading', { name: 'Next adventure', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await stories.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(stories.getByRole('heading', { name: 'Origin of a hero', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('character.png'), fullPage: true });

  await stories.getByRole('link', { name: 'View comics', exact: true }).click();
  await expect(page).toHaveURL(/\/stories\/101\/comics\?character=1$/);
  await expect(page.getByRole('heading', { name: 'Related comics', exact: true })).toBeVisible();
  const comics = page.getByRole('region', { name: 'Comic results', exact: true });
  await expect(comics.getByRole('heading', { name: 'Amazing Spider-Man #1', exact: true })).toBeVisible();
  await comics.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(comics.getByRole('heading', { name: 'Amazing Spider-Man #2', exact: true })).toBeVisible();
  await comics.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(comics.getByRole('heading', { name: 'Amazing Spider-Man #1', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('comics.png'), fullPage: true });

  await page.getByRole('link', { name: 'Back to characters', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Discover Marvel characters', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Iron Man', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/2$/);
  await expect(page.getByRole('heading', { name: 'Iron Man', exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
