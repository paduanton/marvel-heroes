import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

const pages = [
  { url: '/', title: 'Characters | Marvel Heroes', resource: '/api/v1/characters', retry: 'Try characters again', result: 'Spider-Man' },
  { url: '/characters/1', title: 'Character details | Marvel Heroes', resource: '/api/v1/characters/1', retry: 'Try character again', result: 'Spider-Man' },
  { url: '/stories/101/comics', title: 'Related comics | Marvel Heroes', resource: '/api/v1/stories/101/comics', retry: 'Try comics again', result: 'Amazing Spider-Man #1' },
];

for (const destination of pages) {
  test(`identifies ${destination.url} in the document title after direct navigation`, async ({ page }) => {
    await mockCatalog(page);
    await page.goto(destination.url);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page).toHaveTitle(destination.title);
  });

  test(`keeps the ${destination.url} title during an API failure and recovery`, async ({ page }) => {
    const { failures } = await mockCatalog(page);
    failures.set(destination.resource, 1);
    await page.goto(destination.url);
    const retry = page.getByRole('button', { name: destination.retry, exact: true });
    await expect(retry).toBeVisible();
    await expect(page).toHaveTitle(destination.title);
    await retry.click();
    await expect(retry).toHaveCount(0);
    await expect(page.getByRole('heading', { name: destination.result, exact: true })).toBeVisible();
    await expect(page).toHaveTitle(destination.title);
  });
}

test('updates page titles through discovery and browser history without more API requests', async ({ page }) => {
  const { requests } = await mockCatalog(page);
  await page.goto('/');
  await expect(page).toHaveTitle('Characters | Marvel Heroes');
  await page.getByRole('link', { name: 'Spider-Man', exact: true }).click();
  await expect(page).toHaveTitle('Character details | Marvel Heroes');
  await page.getByRole('link', { name: 'View comics', exact: true }).click();
  await expect(page).toHaveTitle('Related comics | Marvel Heroes');
  await expect(page.getByRole('heading', { name: 'Amazing Spider-Man #1', exact: true })).toBeVisible();
  expect(requests.map(url => url.pathname).sort()).toEqual([
    '/api/v1/characters', '/api/v1/characters/1', '/api/v1/characters/1/stories', '/api/v1/stories/101/comics',
  ].sort());

  await page.goBack();
  await expect(page).toHaveTitle('Character details | Marvel Heroes');
  await page.goForward();
  await expect(page).toHaveTitle('Related comics | Marvel Heroes');
  await page.goto('/unknown-route');
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle('Characters | Marvel Heroes');
});
