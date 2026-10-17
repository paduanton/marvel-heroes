import { expect, test } from '@playwright/test';
import { syntheticSource } from './source';

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
