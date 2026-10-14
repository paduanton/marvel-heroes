import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('equivalent searches reuse Redis and conditional HTTP requests do not call Marvel again', async ({ request }) => {
  const headers = { 'X-Marvel-Test-Scenario': randomUUID() };
  const first = await request.get('/api/v1/characters?query=sp', { headers });
  expect(first.status()).toBe(200);
  expect(first.headers()['x-test-upstream-calls']).toBe('1');
  const equivalent = await request.get('/api/v1/characters?query=%20SP%20', { headers });
  expect(equivalent.status()).toBe(200);
  expect(equivalent.headers()['x-test-upstream-calls']).toBe('1');
  expect(equivalent.headers().etag).toBe(first.headers().etag);
  const unchanged = await request.get('/api/v1/characters?query=sp', { headers: { ...headers, 'If-None-Match': first.headers().etag } });
  expect(unchanged.status()).toBe(304);
  expect(unchanged.headers()['x-test-upstream-calls']).toBe('1');
});

test('real stale fallback stays visible in the browser and clears after a successful refresh', async ({ page, request, context }) => {
  // Pass-through routing disables browser caching without replacing the Laravel response.
  await page.route('**/api/v1/**', route => route.continue());
  const scenario = { 'X-Marvel-Test-Scenario': randomUUID() };
  expect((await request.get('/api/v1/characters', { headers: scenario })).status()).toBe(200);
  await context.setExtraHTTPHeaders({ ...scenario, 'X-Marvel-Test-Age-Days': '31', 'X-Marvel-Test-Upstream-Status': '503' });
  const staleResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/characters');
  await page.goto('/');
  const stale = await staleResponse;
  expect(stale.status()).toBe(200);
  expect(stale.headers()['x-test-upstream-calls']).toBe('2');
  expect((await stale.json()).meta.cache.state).toBe('stale');
  await expect(page.getByText('Showing cached data. This information may be out of date.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('real-stale-catalog.png'), fullPage: true });

  await context.setExtraHTTPHeaders({ ...scenario, 'X-Marvel-Test-Age-Days': '31', 'X-Marvel-Test-Revision': '2' });
  const freshResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/characters');
  await page.reload();
  const fresh = await freshResponse;
  expect(fresh.headers()['x-test-upstream-calls']).toBe('3');
  expect((await fresh.json()).meta.cache.state).toBe('fresh');
  await expect(page.getByRole('heading', { name: 'Recovered Hero', exact: true })).toBeVisible();
  await expect(page.getByText('Showing cached data. This information may be out of date.', { exact: true })).toHaveCount(0);
});

for (const resource of [
  { name: 'character collection', path: '/api/v1/characters', collection: true, field: 'name' },
  { name: 'character detail', path: '/api/v1/characters/1', collection: false, field: 'name' },
  { name: 'related stories', path: '/api/v1/characters/1/stories', collection: true, field: 'title' },
  { name: 'related comics', path: '/api/v1/stories/1/comics', collection: true, field: 'title' },
]) {
  test(`expired ${resource.name} is not served after retention and recovers from a later response`, async ({ request }) => {
    const headers = { 'X-Marvel-Test-Scenario': randomUUID() };
    const seed = await request.get(resource.path, { headers });
    expect(seed.status()).toBe(200);
    expect(seed.headers()['x-test-upstream-calls']).toBe('1');
    const expired = await request.get(resource.path, { headers: { ...headers, 'X-Marvel-Test-Age-Days': '181', 'X-Marvel-Test-Upstream-Status': '503' } });
    expect(expired.status()).toBe(502);
    expect(await expired.json()).toMatchObject({ code: 'upstream-unavailable' });
    expect(expired.headers().etag).toBeUndefined();
    expect(expired.headers()['x-test-upstream-calls']).toBe('2');
    const recovered = await request.get(resource.path, { headers: { ...headers, 'X-Marvel-Test-Age-Days': '181', 'X-Marvel-Test-Revision': '2' } });
    expect(recovered.status()).toBe(200);
    const body = await recovered.json();
    expect((resource.collection ? body.data[0] : body.data)[resource.field]).toBe('Recovered Hero');
    expect(body.meta.cache.state).toBe('fresh');
    expect(recovered.headers()['x-test-upstream-calls']).toBe('3');
  });
}

test('a shared budget blocks uncached searches while fresh and stale entries remain available', async ({ request }) => {
  const headers = { 'X-Marvel-Test-Scenario': randomUUID(), 'X-Marvel-Test-Budget': '1' };
  expect((await request.get('/api/v1/characters?query=sp', { headers })).status()).toBe(200);
  const blocked = await request.get('/api/v1/characters?query=iron', { headers });
  expect(blocked.status()).toBe(503);
  expect(await blocked.json()).toMatchObject({ code: 'upstream-budget-exhausted' });
  expect(blocked.headers()['x-test-upstream-calls']).toBe('1');
  const exhausted = { ...headers, 'X-Marvel-Test-Budget': '0' };
  const fresh = await request.get('/api/v1/characters?query=sp', { headers: exhausted });
  expect(fresh.status()).toBe(200);
  expect((await fresh.json()).meta.cache.state).toBe('fresh');
  const stale = await request.get('/api/v1/characters?query=sp', { headers: { ...exhausted, 'X-Marvel-Test-Age-Days': '31' } });
  expect(stale.status()).toBe(200);
  expect((await stale.json()).meta.cache.state).toBe('stale');
  expect(stale.headers()['x-test-upstream-calls']).toBe('1');
});

test('malformed HTTP searches fail validation without calling the simulated source', async ({ request }) => {
  const response = await request.get('/api/v1/characters?query[]=sp', { headers: { 'X-Marvel-Test-Scenario': randomUUID() } });
  expect(response.status()).toBe(422);
  expect(await response.json()).toMatchObject({ code: 'validation-failed' });
  expect(response.headers()['x-test-upstream-calls']).toBe('0');
});

test('test scenarios cannot reuse another scenario cache or budget', async ({ request }) => {
  const first = await request.get('/api/v1/characters', { headers: { 'X-Marvel-Test-Scenario': randomUUID(), 'X-Marvel-Test-Budget': '1' } });
  const second = await request.get('/api/v1/characters', { headers: { 'X-Marvel-Test-Scenario': randomUUID(), 'X-Marvel-Test-Budget': '1', 'X-Marvel-Test-Revision': '2' } });
  expect(first.status()).toBe(200);
  expect(second.status()).toBe(200);
  expect((await first.json()).data[0].name).toBe('Spider-Man');
  expect((await second.json()).data[0].name).toBe('Recovered Hero');
  expect(second.headers()['x-test-upstream-calls']).toBe('1');
});
