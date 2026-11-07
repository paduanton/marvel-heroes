import assert from 'node:assert/strict';
import { test } from 'node:test';
import { probeComicVine } from '../../tools/catalog/probe-comic-vine.mjs';

const issue = (id, volumeId) => ({ id, name: 'Spider-Man', volume: { id: volumeId } });
const page = (offset, results, total = 3) => ({
  status_code: 1, offset, limit: 1, results,
  number_of_page_results: results.length, number_of_total_results: total,
});
const detail = (results) => ({ status_code: 1, results });
const records = [
  page(0, [issue(101, 11)]),
  page(1, [issue(102, 12)]),
  page(0, [], 0),
  detail({ ...issue(101, 11), image: { medium_url: 'https://example.test/cover.jpg' } }),
  detail({ id: 11, publisher: { id: 31 } }),
  detail({ id: 12, publisher: { id: 31 } }),
  detail({ id: 1443, publisher: { id: 31 }, issue_credits: [{ id: 101 }] }),
  detail({ id: 101, character_credits: [{ id: 1443 }] }),
];

function transport(responses) {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    const result = responses[requests.length - 1];
    return result instanceof Response ? result : Response.json(result);
  };
  return { fetcher, requests };
}

test('checks two distinct pages, a negative publisher control, details and a related issue within eight calls', async () => {
  const { fetcher, requests } = transport(records);
  const report = await probeComicVine({ key: 'fixture-key', fetcher, pause: async () => {} });

  assert.deepEqual(report, {
    outcome: 'sample-passed', calls: 8, stage: 'character-appearance',
  });
  assert.equal(requests.length, 8);
  assert.deepEqual(requests.slice(0, 3).map(({ url }) => url.searchParams.get('offset')), ['0', '1', '0']);
  assert.notEqual(requests[0].url.searchParams.get('filter'), requests[2].url.searchParams.get('filter'));
  assert.ok(requests.every(({ url, options }) => url.origin === 'https://comicvine.gamespot.com'
    && url.searchParams.get('api_key') === 'fixture-key' && options.redirect === 'error' && options.signal));
  assert.doesNotMatch(JSON.stringify(report), /fixture-key|https:/);
});

test('stops when a later page repeats an issue or when the publisher control is not empty', async () => {
  for (const [overrides, stage, calls] of [
    [[records[0], page(1, [issue(101, 11)])], 'pagination', 2],
    [[records[0], records[1], records[0]], 'publisher-control', 3],
  ]) {
    const { fetcher, requests } = transport(overrides);
    const report = await probeComicVine({ key: 'fixture-key', fetcher, pause: async () => {} });
    assert.deepEqual(report, { outcome: 'sample-failed', calls, stage, reason: 'unexpected-response' });
    assert.equal(requests.length, calls);
  }
});

test('never dispatches without a key and stops after HTTP or provider errors without leaking details', async () => {
  const missing = transport([]);
  assert.deepEqual(await probeComicVine({ key: ' ', fetcher: missing.fetcher }), {
    outcome: 'not-run', calls: 0, stage: 'configuration', reason: 'missing-key',
  });
  assert.equal(missing.requests.length, 0);

  for (const [failure, reason] of [
    [new Response('fixture-key', { status: 429 }), 'http-429'],
    [{ status_code: 104, error: 'fixture-key' }, 'provider-104'],
    [new Response('fixture-key', { status: 200 }), 'unexpected-response'],
  ]) {
    const { fetcher, requests } = transport([failure]);
    const report = await probeComicVine({ key: 'fixture-key', fetcher });
    assert.deepEqual(report, { outcome: 'sample-failed', calls: 1, stage: 'search', reason });
    assert.equal(requests.length, 1);
    assert.doesNotMatch(JSON.stringify(report), /fixture-key/);
  }

  const report = await probeComicVine({
    key: 'fixture-key',
    fetcher: async () => { throw new Error('signed URL contains fixture-key'); },
  });
  assert.deepEqual(report, { outcome: 'sample-failed', calls: 1, stage: 'search', reason: 'transport-error' });
});
