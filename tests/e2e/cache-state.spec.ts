import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

const notice = 'Showing cached data. This information may be out of date.';

test('keeps stale catalog results usable and clears the notice after a fresh response', async ({ page }, testInfo) => {
  const { cacheStates, requests } = await mockCatalog(page);
  cacheStates.set('/api/v1/characters', 'stale');
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: notice })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Spider-Man', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(requests).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath('stale-catalog.png'), fullPage: true });
  cacheStates.set('/api/v1/characters', 'fresh');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Thor', exact: true })).toBeVisible();
  await expect(page.getByText(notice, { exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(2);
});

for (const state of [
  { name: 'character', character: 'stale', stories: 'fresh', total: 1, related: 0 },
  { name: 'stories', character: 'fresh', stories: 'stale', total: 1, related: 1 },
  { name: 'both', character: 'stale', stories: 'stale', total: 2, related: 1 },
] as const) {
  test(`limits cache notices to the stale ${state.name} section`, async ({ page }, testInfo) => {
    const { cacheStates, requests } = await mockCatalog(page);
    cacheStates.set('/api/v1/characters/1', state.character);
    cacheStates.set('/api/v1/characters/1/stories', state.stories);
    await page.goto('/characters/1');
    await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View comics', exact: true })).toBeVisible();
    await expect(page.getByText(notice, { exact: true })).toHaveCount(state.total);
    await expect(page.getByRole('region', { name: 'Related stories', exact: true }).getByText(notice, { exact: true })).toHaveCount(state.related);
    expect(requests).toHaveLength(2);
    await page.screenshot({ path: testInfo.outputPath('stale-detail.png'), fullPage: true });
  });
}

test('keeps stale comics navigable and removes the notice on a fresh page', async ({ page }) => {
  const { cacheStates, requests } = await mockCatalog(page);
  cacheStates.set('/api/v1/stories/101/comics', 'stale');
  await page.goto('/stories/101/comics');
  await expect(page.getByRole('status').filter({ hasText: notice })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Amazing Spider-Man #1', exact: true })).toBeVisible();
  cacheStates.set('/api/v1/stories/101/comics', 'fresh');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Amazing Spider-Man #2', exact: true })).toBeVisible();
  await expect(page.getByText(notice, { exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(2);
});

test('shows a stale empty result without inventing content or a retry', async ({ page }) => {
  const { cacheStates, requests } = await mockCatalog(page);
  cacheStates.set('/api/v1/characters', 'stale');
  await page.goto('/?query=unknown');
  await expect(page.getByText('No characters match this search yet.', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: notice })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try characters again', exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(1);
});

test('clears the stale notice on failure and does not bring it back after fresh recovery', async ({ page }) => {
  const { cacheStates, failures, requests } = await mockCatalog(page);
  cacheStates.set('/api/v1/characters', 'stale');
  await page.goto('/');
  await expect(page.getByText(notice, { exact: true })).toBeVisible();
  failures.set('/api/v1/characters', 1);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText(notice, { exact: true })).toHaveCount(0);
  cacheStates.set('/api/v1/characters', 'fresh');
  await page.getByRole('button', { name: 'Try characters again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Thor', exact: true })).toBeVisible();
  await expect(page.getByText(notice, { exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(3);
  expect(requests.every(url => !url.searchParams.has('refresh'))).toBe(true);
});
