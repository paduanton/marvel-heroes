import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { audit } from '../Support/accessibility';
import { syntheticSource } from './source';

test('navigates paginated discovery through real HTTP and reuses cached return routes', async ({ page }, testInfo) => {
  const source = syntheticSource();
  await page.route('**/api/v1/**', route => route.continue());
  await page.goto(`/?query=${source.query}`);
  await expect(page.getByRole('link', { name: source.name, exact: true })).toBeVisible();
  await page.getByRole('link', { name: source.name, exact: true }).click();
  const stories = page.getByRole('region', { name: 'Related stories', exact: true });
  await expect(stories.getByRole('heading', { name: 'Synthetic Story 1', exact: true })).toBeVisible();
  await stories.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(stories.getByRole('heading', { name: 'Synthetic Story 11', exact: true })).toBeVisible();
  await page.reload();
  await expect(stories.getByRole('heading', { name: 'Synthetic Story 11', exact: true })).toBeVisible();
  await stories.getByRole('link', { name: 'View comics for Synthetic Story 11', exact: true }).click();
  const comics = page.getByRole('region', { name: 'Comic results', exact: true });
  await expect(comics.getByRole('heading', { name: 'Synthetic Comic #1', exact: true })).toBeVisible();
  await comics.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(comics.getByRole('heading', { name: 'Synthetic Comic #21', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('comics_page')).toBe('2');
  expect(new URL(page.url()).searchParams.get('stories_page')).toBe('2');
  expect(source.calls()).toHaveLength(6);
  await audit(page, testInfo, 'upstream-comic-accessibility');
  await page.screenshot({ path: testInfo.outputPath('upstream-comics.png'), fullPage: true });
  await page.getByRole('link', { name: 'Back to character', exact: true }).click();
  await expect(stories.getByRole('heading', { name: 'Synthetic Story 11', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to characters', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search characters' })).toHaveValue(source.query);
  await expect(page.getByRole('link', { name: source.name, exact: true })).toBeVisible();
  expect(source.calls()).toHaveLength(6);
});

for (const mode of ['redirect', 'truncated'] as const) {
  test(`recovers catalog manually after ${mode} without background request replay`, async ({ page }, testInfo) => {
    const source = syntheticSource();
    source.mode(mode);
    await page.route('**/api/v1/**', route => route.continue());
    await page.goto(`/?query=${source.query}`);
    const region = page.getByRole('region', { name: 'Character results', exact: true });
    await expect(region.getByRole('alert')).toHaveText('Catalog is temporarily unavailable. Please try again later.');
    expect(source.calls()).toHaveLength(1);
    await audit(page, testInfo, `upstream-${mode}-accessibility`);
    source.mode('healthy');
    await expect(region.getByRole('alert')).toBeVisible();
    expect(source.calls()).toHaveLength(1);
    await region.getByRole('button', { name: 'Try characters again', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(region.getByRole('link', { name: source.name, exact: true })).toBeVisible();
    await expect(region).toBeFocused();
    expect(source.calls()).toHaveLength(2);
  });
}

test('shows stale catalog data during a real transfer failure and clears the notice after recovery', async ({ page, request }) => {
  const source = syntheticSource();
  const path = `/api/v1/characters?query=${source.query}&page=1&per_page=20`;
  expect((await request.get(path)).status()).toBe(200);
  source.age([{ resource: 'characters', parameters: { query: source.query, offset: 0, limit: 20 } }]);
  source.mode('truncated');
  await page.route('**/api/v1/**', route => route.continue());
  await page.goto(`/?query=${source.query}`);
  const region = page.getByRole('region', { name: 'Character results', exact: true });
  await expect(region.getByRole('link', { name: source.name, exact: true })).toBeVisible();
  await expect(region.getByRole('status')).toHaveText('Showing cached data. This information may be out of date.');
  await expect(region.getByRole('alert')).toHaveCount(0);
  expect(source.calls()).toHaveLength(2);
  source.mode('healthy');
  await page.reload();
  await expect(region.getByRole('link', { name: source.name, exact: true })).toBeVisible();
  await expect(region.getByRole('status')).toHaveCount(0);
  expect(source.calls()).toHaveLength(3);
});

test('authenticated visitors discover public HTTP catalog data without catalog session cookies', async ({ page, context }) => {
  const source = syntheticSource();
  await page.goto('/register');
  await page.getByLabel('Name', { exact: true }).fill('HTTP Discovery Visitor');
  await page.getByLabel('Email', { exact: true }).fill(`http-${randomUUID()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('valid-http-test-passphrase');
  await page.getByLabel('Confirm password', { exact: true }).fill('valid-http-test-passphrase');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  const catalog = await context.request.get(`/api/v1/characters?query=${source.query}`);
  expect(catalog.status()).toBe(200);
  expect(catalog.headers()['cache-control']).toContain('public');
  expect(catalog.headers()['set-cookie']).toBeUndefined();
  expect((await catalog.json()).data[0]).toMatchObject({ id: source.id, name: source.name });
  await page.getByRole('link', { name: 'Browse characters', exact: true }).click();
  await expect(page.getByRole('link', { name: source.name, exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search characters' }).fill(source.query);
  await expect.poll(() => new URL(page.url()).searchParams.get('query')).toBe(source.query);
  await expect(page.getByRole('region', { name: 'Character results', exact: true })).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('link', { name: source.name, exact: true })).toBeVisible();
  expect(source.calls().filter(call => call.path === '/v1/public/characters')).toHaveLength(2);
  expect((await context.request.get('/api/v1/me')).status()).toBe(200);
});
