import { expect, test } from '@playwright/test';
import { syntheticSource } from './source';

test('concurrent catalog resources share the last two upstream budget slots', async ({ request }) => {
  const source = syntheticSource();
  source.setBudgetRemaining(2);
  const catalog = `/api/v1/characters?query=${source.query}`;
  const character = `/api/v1/characters/${source.id}`;
  const paths = [catalog, `${catalog}&page=2`, character, `/api/v1/characters/${source.id + 1}`,
    `${character}/stories`, `/api/v1/stories/${source.id + 100}/comics`];
  const responses = await Promise.all(paths.map(path => request.get(path)));
  expect(responses.map(response => response.status()).sort()).toEqual([200, 200, 503, 503, 503, 503]);

  const blocked: string[] = [];
  for (const [index, response] of responses.entries()) {
    if (response.status() === 200) {
      const payload = await response.json();
      expect(payload.meta.cache.state).toBe('fresh');
      const cached = await request.get(paths[index]);
      expect(cached.status()).toBe(200);
      expect(await cached.json()).toEqual(payload);
    } else {
      blocked.push(paths[index]);
      expect(response.headers()['content-type']).toContain('application/problem+json');
      expect(response.headers().etag).toBeUndefined();
      expect(await response.json()).toMatchObject({ code: 'upstream-budget-exhausted', request_id: response.headers()['x-request-id'] });
    }
  }
  expect(source.calls()).toHaveLength(2);
  expect(source.calls().every(call => call.signature_valid)).toBe(true);

  source.setBudgetRemaining(1);
  const recovered = await request.get(blocked[0]);
  expect(recovered.status()).toBe(200);
  expect((await recovered.json()).meta.cache.state).toBe('fresh');
  const stillBlocked = await request.get(blocked[1]);
  expect(stillBlocked.status()).toBe(503);
  expect(await stillBlocked.json()).toMatchObject({ code: 'upstream-budget-exhausted' });
  expect(source.calls()).toHaveLength(3);
});
