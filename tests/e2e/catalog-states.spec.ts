import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

test('shows loading until the initial character collection is available', async ({ page }) => {
  await mockCatalog(page);
  let release = () => {};
  const pendingResponse = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.pathname === '/api/v1/characters', async route => {
    await pendingResponse;
    await route.fallback();
  });

  try {
    await page.goto('/');
    const results = page.getByRole('region', { name: 'Character results', exact: true });
    await expect(results.getByRole('status')).toHaveText('Loading catalog data...');
    await expect(results.getByRole('alert')).toHaveCount(0);
    await expect(results.getByRole('link', { name: 'Spider-Man', exact: true })).toHaveCount(0);
    await expect(results.getByRole('button', { name: 'Try characters again', exact: true })).toHaveCount(0);
    await expect(results.getByRole('navigation', { name: 'Catalog pages' })).toHaveCount(0);
  } finally {
    release();
  }

  await expect(page.getByRole('link', { name: 'Spider-Man', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Catalog pages' })).toBeVisible();
});

test('shows an empty search without treating it as a failed request', async ({ page }) => {
  await mockCatalog(page);
  await page.goto('/?query=zzzz');
  const emptyMessage = page.getByText('No characters match this search yet.', { exact: true });
  await expect(emptyMessage).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try characters again', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Catalog pages' })).toHaveCount(0);

  await page.getByRole('searchbox', { name: 'Search characters' }).fill('sp');
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await expect(emptyMessage).toHaveCount(0);
});

const invalidQueries = [
  { name: 'one-character', value: 's', message: 'Search must contain at least two characters.' },
  { name: 'overlong', value: 'a'.repeat(101), message: 'Search must contain at most 100 characters.' },
];

for (const query of invalidQueries) {
  test(`rejects ${query.name} search text without a request and recovers after correction`, async ({ page }) => {
    const { requests } = await mockCatalog(page);
    await page.goto(`/?query=${encodeURIComponent(query.value)}`);
    await expect(page.getByRole('alert')).toHaveText(query.message);
    expect(requests).toHaveLength(0);
    await expect(page.getByRole('button', { name: 'Try characters again', exact: true })).toHaveCount(0);

    const search = page.getByRole('searchbox', { name: 'Search characters' });
    await search.fill('sp');
    await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(requests).toHaveLength(1);

    await search.fill(query.value);
    await expect(page.getByRole('alert')).toHaveText(query.message);
    await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Catalog pages' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try characters again', exact: true })).toHaveCount(0);
    expect(requests).toHaveLength(1);

    await search.fill('');
    await expect(page.getByRole('heading', { name: 'Iron Man', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(requests).toHaveLength(2);
    expect(requests.at(-1)?.searchParams.has('query')).toBe(false);
  });
}
