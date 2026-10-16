import { setImmediate } from 'node:timers/promises';
import type { GenericAbortSignal } from 'axios';
import { effectScope, type EffectScope } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { api } from '@/services/api';
import { useCharacterDetail } from './useCharacterDetail';

const originalAdapter = api.defaults.adapter;
let scope: EffectScope;
let router: Router;
let requests: { url?: string; page?: number }[];

beforeEach(() => {
  requests = [];
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/characters/:id', name: 'character-detail', component: {} },
    { path: '/', name: 'characters', component: {} },
  ] });
  api.defaults.adapter = async config => {
    requests.push({ url: config.url, page: config.params?.page });
    return { config, headers: {}, status: 200, statusText: 'OK', data: config.url?.endsWith('/stories')
      ? { data: [{ id: 101, title: `Story page ${config.params.page}`, type: null, modified_at: null, counts: { comics: 1 } }], meta: { page: config.params.page, per_page: 10, total: 25 } }
      : { data: { id: Number(config.url?.split('/').at(-1)), name: 'Example Hero', description: null, image_url: null, modified_at: null } } };
  };
});

afterEach(() => { scope?.stop(); api.defaults.adapter = originalAdapter; });

async function start(url: string) {
  await router.push(url);
  scope = effectScope();
  const detail = scope.run(() => useCharacterDetail(() => String(router.currentRoute.value.params.id), router))!;
  await setImmediate();
  return detail;
}

it('loads a shared story page and preserves unrelated catalog context while paging', async () => {
  const detail = await start('/characters/1?stories_page=2&query=sp&page=4&source=portfolio');
  expect(detail.stories.value[0].title).toBe('Story page 2');
  await detail.nextStories();
  await setImmediate();
  expect(detail.stories.value[0].title).toBe('Story page 3');
  expect(router.currentRoute.value.query).toEqual({ stories_page: '3', query: 'sp', page: '4', source: 'portfolio' });
  expect(requests.filter(request => request.url === '/characters/1')).toHaveLength(1);
  await detail.firstStories();
  await setImmediate();
  expect(router.currentRoute.value.query).toEqual({ query: 'sp', page: '4', source: 'portfolio' });
  expect(detail.stories.value[0].title).toBe('Story page 1');
});

it.each(['0', '-1', '01', '1.5', '1e2', '9007199254740992', '2&stories_page=3'])('falls back safely for story page %s without rewriting the URL', async page => {
  const url = `/characters/1?stories_page=${page}`;
  const detail = await start(url);
  expect(detail.storiesPage.value).toBe(1);
  expect(detail.stories.value[0].title).toBe('Story page 1');
  expect(router.currentRoute.value.fullPath).toBe(url);
});

it('does not reload the character or stories for unrelated query changes', async () => {
  await start('/characters/1?stories_page=2');
  await router.push('/characters/1?stories_page=2&source=portfolio');
  await setImmediate();
  expect(requests).toEqual([{ url: '/characters/1', page: undefined }, { url: '/characters/1/stories', page: 2 }]);
});

it('cancels an obsolete story page and ignores its late response', async () => {
  const respond = api.defaults.adapter as import('axios').AxiosAdapter;
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  let oldSignal: GenericAbortSignal | undefined;
  api.defaults.adapter = async config => {
    if (config.url === '/characters/1/stories' && config.params.page === 2) { oldSignal = config.signal; await gate; }
    return respond(config);
  };
  const detail = await start('/characters/1');
  await detail.nextStories();
  await setImmediate();
  await router.push('/characters/2?stories_page=3');
  await setImmediate();
  try {
    expect(oldSignal?.aborted).toBe(true);
    expect(detail.character.value?.id).toBe(2);
    expect(detail.stories.value[0].title).toBe('Story page 3');
  } finally { release(); await setImmediate(); }
  expect(detail.stories.value[0].title).toBe('Story page 3');
  expect(detail.storiesError.value).toBeNull();
});
