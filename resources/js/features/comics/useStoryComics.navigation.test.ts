import { setImmediate } from 'node:timers/promises';
import { effectScope, type EffectScope } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { api } from '@/services/api';
import { useStoryComics } from './useStoryComics';

const originalAdapter = api.defaults.adapter;
let scope: EffectScope;
let router: Router;
let requests: { url?: string; page: number }[];

beforeEach(() => {
  requests = [];
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/stories/:id/comics', name: 'story-comics', component: {} }] });
  api.defaults.adapter = async config => {
    requests.push({ url: config.url, page: config.params.page });
    return { config, headers: {}, status: 200, statusText: 'OK', data: {
      data: [{ id: 1001, title: `Comic page ${config.params.page}`, description: null, format: null, image_url: null, modified_at: null, on_sale_at: null, digital_price: null }],
      meta: { page: config.params.page, per_page: 20, total: 45 },
    } };
  };
});

afterEach(() => { scope?.stop(); api.defaults.adapter = originalAdapter; });

async function start(url: string) {
  await router.push(url);
  scope = effectScope();
  const comics = scope.run(() => useStoryComics(() => String(router.currentRoute.value.params.id), router))!;
  await setImmediate();
  return comics;
}

it('restores shared comic pages without overwriting story or catalog pagination', async () => {
  const comics = await start('/stories/101/comics?comics_page=2&stories_page=3&page=4&query=sp&character=1');
  expect(comics.comics.value[0].title).toBe('Comic page 2');
  await comics.next();
  await setImmediate();
  expect(comics.comics.value[0].title).toBe('Comic page 3');
  expect(router.currentRoute.value.query).toEqual({ comics_page: '3', stories_page: '3', page: '4', query: 'sp', character: '1' });
  await comics.first();
  await setImmediate();
  expect(comics.comics.value[0].title).toBe('Comic page 1');
  expect(router.currentRoute.value.query).toEqual({ stories_page: '3', page: '4', query: 'sp', character: '1' });
});

it('recovers a failing shared page without creating another history entry on retry', async () => {
  const respond = api.defaults.adapter as import('axios').AxiosAdapter;
  let fail = true;
  api.defaults.adapter = config => { if (fail) throw new Error('Offline'); return respond(config); };
  const comics = await start('/stories/101/comics?comics_page=2&source=demo');
  expect(comics.error.value).toBe('Unable to load the catalog right now.');
  fail = false;
  await comics.retry();
  expect(comics.comics.value[0].title).toBe('Comic page 2');
  expect(router.currentRoute.value.fullPath).toBe('/stories/101/comics?comics_page=2&source=demo');
  scope.stop();
  await comics.first();
  await comics.previous();
  await comics.next();
  expect(router.currentRoute.value.fullPath).toBe('/stories/101/comics?comics_page=2&source=demo');
  expect(requests).toHaveLength(1);
});

it('loads a new story page and ignores unrelated URL changes', async () => {
  const comics = await start('/stories/101/comics?comics_page=2');
  await router.push('/stories/101/comics?comics_page=2&source=portfolio');
  await setImmediate();
  expect(requests).toEqual([{ url: '/stories/101/comics', page: 2 }]);
  await router.push('/stories/102/comics');
  await setImmediate();
  expect(comics.page.value).toBe(1);
  expect(requests.at(-1)).toEqual({ url: '/stories/102/comics', page: 1 });
});
