import { expect, test } from '@playwright/test';
import { syntheticSource, type CacheEntry } from './source';

test('signs real upstream requests and shares fresh Redis entries across FPM calls', async ({ request }) => {
  const source = syntheticSource();
  const path = `/api/v1/characters?query=${source.query}`;
  const first = await request.get(path);
  expect(first.status()).toBe(200);
  const payload = await first.json();
  expect(payload.data[0]).toMatchObject({ id: source.id, name: source.name });
  expect(payload.meta).toMatchObject({ total: 21, cache: { state: 'fresh' } });
  const cached = await request.get(path);
  expect(cached.status()).toBe(200);
  const unchanged = await request.get(path, { headers: { 'If-None-Match': first.headers().etag } });
  expect(unchanged.status()).toBe(304);
  expect(await unchanged.body()).toHaveLength(0);
  expect(source.calls()).toEqual([{ path: '/v1/public/characters', method: 'GET', signature_valid: true }]);
});

for (const mode of ['redirect', 'failure', 'truncated', 'malformed'] as const) {
  test(`returns a safe problem for ${mode} and recovers without caching the failure`, async ({ request }) => {
    const source = syntheticSource();
    source.mode(mode);
    const path = `/api/v1/characters?query=${source.query}`;
    const failed = await request.get(path);
    expect(failed.status()).toBe(502);
    expect(failed.headers()['content-type']).toContain('application/problem+json');
    expect(failed.headers().etag).toBeUndefined();
    expect(await failed.json()).toMatchObject({ status: 502, code: 'upstream-unavailable', request_id: failed.headers()['x-request-id'] });
    expect(await failed.text()).not.toContain('Synthetic upstream-only diagnostic');
    expect(source.calls()).toEqual([{ path: '/v1/public/characters', method: 'GET', signature_valid: true }]);
    expect((await request.get('/ready')).status()).toBe(200);
    source.mode('healthy');
    const recovered = await request.get(path);
    expect(recovered.status()).toBe(200);
    expect((await recovered.json()).meta.cache.state).toBe('fresh');
    expect((await request.get(path)).status()).toBe(200);
    expect(source.calls()).toHaveLength(2);
  });
}

for (const mode of ['redirect', 'truncated'] as const) {
  test(`serves all stale resources during ${mode} and refreshes them independently`, async ({ request }) => {
    const source = syntheticSource();
    const resources: { path: string; entry: CacheEntry }[] = [
      { path: `/api/v1/characters?query=${source.query}`, entry: { resource: 'characters', parameters: { query: source.query, offset: 0, limit: 20 } } },
      { path: `/api/v1/characters/${source.id}`, entry: { resource: 'character', parameters: { characterId: source.id } } },
      { path: `/api/v1/characters/${source.id}/stories?per_page=10`, entry: { resource: 'stories', parameters: { characterId: source.id, offset: 0, limit: 10 } } },
      { path: `/api/v1/stories/${source.id + 100}/comics`, entry: { resource: 'comics', parameters: { storyId: source.id + 100, offset: 0, limit: 20 } } },
    ];
    const data: unknown[] = [];
    for (const resource of resources) {
      const response = await request.get(resource.path);
      expect(response.status()).toBe(200);
      data.push((await response.json()).data);
    }
    expect(source.calls()).toHaveLength(4);
    source.age(resources.map(resource => resource.entry));
    source.mode(mode);
    for (const [index, resource] of resources.entries()) {
      const response = await request.get(resource.path);
      expect(response.status()).toBe(200);
      const payload = await response.json();
      expect(payload.meta.cache.state).toBe('stale');
      expect(payload.data).toEqual(data[index]);
    }
    expect(source.calls()).toHaveLength(8);
    source.mode('healthy');
    for (const resource of resources) {
      const response = await request.get(resource.path);
      expect(response.status()).toBe(200);
      expect((await response.json()).meta.cache.state).toBe('fresh');
    }
    expect(source.calls()).toHaveLength(12);
    expect(source.calls().every(call => call.signature_valid && call.method === 'GET' && call.path !== '/redirect-target')).toBe(true);
  });
}

test('exhausted budget preserves fresh and stale catalog data without dispatching HTTP', async ({ request }) => {
  const source = syntheticSource();
  const path = `/api/v1/characters?query=${source.query}`;
  expect((await request.get(path)).status()).toBe(200);
  source.exhaustBudget();
  const fresh = await request.get(path);
  expect((await fresh.json()).meta.cache.state).toBe('fresh');
  const blocked = await request.get(`/api/v1/characters?query=${source.query}-missing`);
  expect(blocked.status()).toBe(503);
  expect(await blocked.json()).toMatchObject({ code: 'upstream-budget-exhausted' });
  source.age([{ resource: 'characters', parameters: { query: source.query, offset: 0, limit: 20 } }]);
  const stale = await request.get(path);
  expect(stale.status()).toBe(200);
  expect((await stale.json()).meta.cache.state).toBe('stale');
  expect(source.calls()).toHaveLength(1);
  source.resetBudget();
  const recovered = await request.get(path);
  expect((await recovered.json()).meta.cache.state).toBe('fresh');
  expect(source.calls()).toHaveLength(2);
});
