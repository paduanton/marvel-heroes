import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const base = 'https://comicvine.gamespot.com/api/';
const marvel = 31;
const spiderMan = 1443;
const maxCalls = 8;

class ProbeFailure extends Error {}

function requireMatch(condition) {
  if (!condition) throw new ProbeFailure('unexpected-response');
}

function isId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function verifyPage(payload, offset, size) {
  const { results, number_of_total_results: total } = payload;
  requireMatch(Array.isArray(results) && results.length === size
    && payload.number_of_page_results === size && payload.offset === offset
    && Number.isSafeInteger(total) && total >= offset + size);
  return total;
}

function hasCover(image) {
  return [image?.medium_url, image?.super_url].some(value => {
    if (typeof value !== 'string') return false;
    const url = URL.parse(value);
    return url?.protocol === 'https:' && !url.username && !url.password;
  });
}

export async function probeComicVine({ key, fetcher = fetch, pause = setTimeout }) {
  if (typeof key !== 'string' || !key.trim()) {
    return { outcome: 'not-run', calls: 0, stage: 'configuration', reason: 'missing-key' };
  }

  let calls = 0;
  let stage = 'search';

  async function read(path, query) {
    if (calls >= maxCalls) throw new ProbeFailure('call-limit');
    if (calls > 0) await pause(1100);
    const url = new URL(path, base);
    url.search = new URLSearchParams({ ...query, format: 'json', api_key: key.trim() });
    calls++;

    let response;
    try {
      response = await fetcher(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'marvel-heroes-catalog-probe/1' },
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ProbeFailure('transport-error');
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new ProbeFailure(`http-${response.status}`);
    }
    const payload = await response.json();
    requireMatch(payload && typeof payload === 'object' && !Array.isArray(payload));
    if ([100, 101, 102, 103, 104, 105].includes(payload.status_code)) {
      throw new ProbeFailure(`provider-${payload.status_code}`);
    }
    requireMatch(payload.status_code === 1);
    return payload;
  }

  function search(publisher, offset) {
    // Publisher filtering on issues is a hypothesis, not a verified provider contract.
    return read('issues/', {
      filter: `name:Spider-Man,publisher:${publisher}`,
      sort: 'id:asc', offset, limit: 1, field_list: 'id,name,volume',
    });
  }

  try {
    const first = await search(marvel, 0);
    const total = verifyPage(first, 0, 1);
    const firstIssue = first.results[0];
    requireMatch(total >= 2 && isId(firstIssue?.id) && isId(firstIssue?.volume?.id)
      && typeof firstIssue.name === 'string' && firstIssue.name.toLowerCase().includes('spider-man'));

    stage = 'pagination';
    const second = await search(marvel, 1);
    const secondIssue = second.results?.[0];
    requireMatch(verifyPage(second, 1, 1) === total && isId(secondIssue?.id)
      && secondIssue.id > firstIssue.id && isId(secondIssue?.volume?.id)
      && typeof secondIssue.name === 'string' && secondIssue.name.toLowerCase().includes('spider-man'));

    stage = 'publisher-control';
    requireMatch(verifyPage(await search(2147483647, 0), 0, 0) === 0);

    stage = 'issue-detail';
    const issue = (await read(`issue/4000-${firstIssue.id}/`, { field_list: 'id,name,image,volume' })).results;
    requireMatch(issue?.id === firstIssue.id && issue.volume?.id === firstIssue.volume.id && hasCover(issue.image));

    stage = 'publisher-sample';
    for (const volumeId of new Set([firstIssue.volume.id, secondIssue.volume.id])) {
      const volume = (await read(`volume/4050-${volumeId}/`, { field_list: 'id,publisher' })).results;
      requireMatch(volume?.id === volumeId && volume.publisher?.id === marvel);
    }

    stage = 'character';
    const character = (await read(`character/4005-${spiderMan}/`, { field_list: 'id,publisher,issue_credits' })).results;
    requireMatch(character?.id === spiderMan && character.publisher?.id === marvel && Array.isArray(character.issue_credits));
    const appearanceId = character.issue_credits[0]?.id;
    requireMatch(isId(appearanceId));

    stage = 'character-appearance';
    const appearance = (await read(`issue/4000-${appearanceId}/`, { field_list: 'id,character_credits' })).results;
    requireMatch(appearance?.id === appearanceId && Array.isArray(appearance.character_credits)
      && appearance.character_credits.some(credit => credit?.id === spiderMan));
    return { outcome: 'sample-passed', calls, stage };
  } catch (error) {
    const reason = error instanceof ProbeFailure ? error.message : 'unexpected-response';
    return { outcome: 'sample-failed', calls, stage, reason };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3 || process.argv[2] !== '--live') {
    process.stdout.write('No requests made. To run an authorized probe, pass --live with COMIC_VINE_API_KEY configured.\n');
  } else {
    const report = await probeComicVine({ key: process.env.COMIC_VINE_API_KEY });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.exitCode = report.outcome === 'sample-passed' ? 0 : 1;
  }
}
