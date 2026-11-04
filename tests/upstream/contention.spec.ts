import { expect, test } from '@playwright/test';
import { syntheticSource } from './source';

for (const cached of [false, true]) {
  test(`shares one FPM refresh with a concurrent ${cached ? 'stale' : 'cold'} reader`, async ({ request }) => {
    const source = syntheticSource();
    const path = `/api/v1/characters?query=${source.query}`;
    let original: unknown;
    if (cached) {
      const seed = await request.get(path);
      expect(seed.status()).toBe(200);
      original = (await seed.json()).data;
      source.age([{ resource: 'characters', parameters: { query: source.query, offset: 0, limit: 20 } }]);
    }

    source.mode('held', true);
    const owner = request.get(path);
    try {
      await expect.poll(() => source.calls().length, { timeout: 4_000 }).toBe(1);
      const contender = await request.get(path);
      if (cached) {
        expect(contender.status()).toBe(200);
        expect(await contender.json()).toMatchObject({ data: original, meta: { cache: { state: 'stale' } } });
      } else {
        expect(contender.status()).toBe(503);
        expect(contender.headers()['content-type']).toContain('application/problem+json');
        expect(await contender.json()).toMatchObject({
          code: 'cache-refresh-in-progress', request_id: contender.headers()['x-request-id'],
        });
      }
      expect(source.calls()).toHaveLength(1);
    } finally {
      source.release();
      await owner;
    }

    const refreshed = await owner;
    expect(refreshed.status()).toBe(200);
    const payload = await refreshed.json();
    expect(payload.meta.cache.state).toBe('fresh');
    expect(payload.data[0]).toMatchObject({ id: source.id, description: 'Synthetic character refreshed over real HTTP.' });
    const reader = await request.get(path);
    expect(reader.status()).toBe(200);
    expect(await reader.json()).toEqual(payload);
    expect(source.calls()).toEqual([{ path: '/v1/public/characters', method: 'GET', signature_valid: true }]);
  });
}

test('lets a visitor retry a contended search without another upstream call', async ({ page, request }) => {
  const source = syntheticSource();
  await page.goto('/?query=x');
  const search = page.getByRole('searchbox', { name: 'Search characters' });
  const results = page.getByRole('region', { name: 'Character results' });
  await expect(search).toHaveValue('x');
  expect(source.calls()).toHaveLength(0);

  source.mode('held');
  const owner = request.get(`/api/v1/characters?query=${source.query}`);
  try {
    await expect.poll(() => source.calls().length, { timeout: 4_000 }).toBe(1);
    await search.fill(source.query);
    await search.press('Enter');
    await expect(results.getByRole('alert')).toHaveText('Catalog is being refreshed. Please try again shortly.');
  } finally {
    source.release();
    await owner;
  }

  expect((await owner).status()).toBe(200);
  await results.getByRole('button', { name: 'Try characters again', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(results.getByRole('link', { name: source.name, exact: true })).toBeVisible();
  await expect(results).toBeFocused();
  await expect(results.getByRole('alert')).toHaveCount(0);
  expect(source.calls()).toHaveLength(1);
});
