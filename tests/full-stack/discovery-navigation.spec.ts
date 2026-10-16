import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const collections = [
  { url: '/characters/1', path: '/api/v1/characters/1/stories', parameter: 'stories_page', region: 'Related stories', perPage: 10, first: 'Origin of a hero', second: 'A new beginning', retry: 'Try stories again', empty: 'No related stories are available for this character.', calls: 4 },
  { url: '/stories/101/comics', path: '/api/v1/stories/101/comics', parameter: 'comics_page', region: 'Comic results', perPage: 20, first: 'Amazing Spider-Man #1', second: 'Amazing Spider-Man #21', retry: 'Try comics again', empty: 'No comics are available for this story.', calls: 3 },
];

for (const collection of collections) {
  test(`restores shared ${collection.region} pages through Laravel and Redis`, async ({ page, context }) => {
    await context.setExtraHTTPHeaders({ 'X-Marvel-Test-Scenario': randomUUID(), 'X-Marvel-Test-Catalog': 'journey' });
    await page.route('**/api/v1/**', route => route.continue());
    await page.goto(`${collection.url}?${collection.parameter}=2&page=4&query=sp&source=portfolio`);
    const region = page.getByRole('region', { name: collection.region, exact: true });
    await expect(region.getByRole('heading', { name: collection.second, exact: true })).toBeVisible();
    await page.reload();
    await expect(region.getByRole('heading', { name: collection.second, exact: true })).toBeVisible();
    await region.getByRole('button', { name: 'First page', exact: true }).click();
    await expect(region.getByRole('heading', { name: collection.first, exact: true })).toBeVisible();
    await page.goBack();
    await expect(region.getByRole('heading', { name: collection.second, exact: true })).toBeVisible();
    await page.goForward();
    await expect(region.getByRole('heading', { name: collection.first, exact: true })).toBeVisible();
    const cached = await context.request.get(`${collection.path}?page=2&per_page=${collection.perPage}`);
    expect(cached.status()).toBe(200);
    expect((await cached.json()).meta.cache.state).toBe('fresh');
    expect(cached.headers()['x-test-upstream-calls']).toBe(collection.region === 'Related stories' ? '3' : '2');
    expect(new URL(page.url()).searchParams.get('page')).toBe('4');
    expect(new URL(page.url()).searchParams.get('source')).toBe('portfolio');
  });

  test(`recovers an empty deep-linked ${collection.region} page without overflow`, async ({ page, context }) => {
    await context.setExtraHTTPHeaders({ 'X-Marvel-Test-Scenario': randomUUID(), 'X-Marvel-Test-Catalog': 'journey' });
    await page.goto(`${collection.url}?${collection.parameter}=9007199254740991&source=portfolio`);
    const region = page.getByRole('region', { name: collection.region, exact: true });
    await expect(region.getByRole('status')).toHaveText(collection.empty);
    await expect(region.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await region.getByRole('button', { name: 'First page', exact: true }).click();
    await expect(region.getByRole('heading', { name: collection.first, exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.has(collection.parameter)).toBe(false);
    expect(new URL(page.url()).searchParams.get('source')).toBe('portfolio');
    await expect(region.getByRole('alert')).toHaveCount(0);
  });

  test(`recovers a failed ${collection.region} page without automatic retries`, async ({ page, context }) => {
    const headers = { 'X-Marvel-Test-Scenario': randomUUID(), 'X-Marvel-Test-Catalog': 'journey' };
    await context.setExtraHTTPHeaders(headers);
    await page.route('**/api/v1/**', route => route.continue());
    let pageAttempts = 0;
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === collection.path && url.searchParams.get('page') === '2') pageAttempts++;
    });
    await page.goto(collection.url);
    const region = page.getByRole('region', { name: collection.region, exact: true });
    await expect(region.getByRole('heading', { name: collection.first, exact: true })).toBeVisible();
    await context.setExtraHTTPHeaders({ ...headers, 'X-Marvel-Test-Upstream-Status': '503' });
    await region.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(region.getByRole('alert')).toHaveText('Catalog is temporarily unavailable. Please try again later.');
    expect(new URL(page.url()).searchParams.get(collection.parameter)).toBe('2');
    expect(pageAttempts).toBe(1);
    await context.setExtraHTTPHeaders(headers);
    await region.getByRole('button', { name: collection.retry, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(region.getByRole('heading', { name: collection.second, exact: true })).toBeVisible();
    await expect(region).toBeFocused();
    expect(pageAttempts).toBe(2);
    const cached = await context.request.get(`${collection.path}?page=1&per_page=${collection.perPage}`);
    expect(cached.status()).toBe(200);
    expect(cached.headers()['x-test-upstream-calls']).toBe(String(collection.calls));
  });

  test(`serves shared stale ${collection.region} pages with no remaining budget`, async ({ page, context }) => {
    const headers = { 'X-Marvel-Test-Scenario': randomUUID(), 'X-Marvel-Test-Catalog': 'journey' };
    await context.setExtraHTTPHeaders(headers);
    expect((await context.request.get(`${collection.path}?page=2&per_page=${collection.perPage}`)).status()).toBe(200);
    await context.setExtraHTTPHeaders({ ...headers, 'X-Marvel-Test-Age-Days': '31', 'X-Marvel-Test-Budget': '0' });
    await page.route('**/api/v1/**', route => route.continue());
    await page.goto(`${collection.url}?${collection.parameter}=2`);
    const region = page.getByRole('region', { name: collection.region, exact: true });
    await expect(region.getByRole('heading', { name: collection.second, exact: true })).toBeVisible();
    await expect(region.getByRole('status')).toHaveText('Showing cached data. This information may be out of date.');
    await expect(region.getByRole('alert')).toHaveCount(0);
    const stale = await context.request.get(`${collection.path}?page=2&per_page=${collection.perPage}`);
    expect(stale.status()).toBe(200);
    expect((await stale.json()).meta.cache.state).toBe('stale');
    expect(stale.headers()['x-test-upstream-calls']).toBe('1');
  });
}
