import { effectScope, type EffectScope } from 'vue';
import type { AxiosAdapter, GenericAbortSignal } from 'axios';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/services/api';
import { useCharacterCatalog } from './useCharacterCatalog';

type Query = { query?: string; page: number; per_page: number };
const originalAdapter = api.defaults.adapter;
let requests: Query[];
let scope: EffectScope;
let router: Router;

beforeEach(() => {
  vi.useFakeTimers();
  requests = [];
  api.defaults.adapter = async (config) => {
    expect(config.url).toBe('/characters');
    requests.push({ ...config.params });
    return {
      config, headers: {}, status: 200, statusText: 'OK',
      data: {
        data: [{ id: 1, name: config.params.query ?? 'Example Hero', description: null, image_url: null, modified_at: null }],
        meta: { page: config.params.page, per_page: 20, total: 100 },
      },
    };
  };
});

afterEach(() => {
  scope?.stop();
  api.defaults.adapter = originalAdapter;
  vi.useRealTimers();
});

async function start(path = '/') {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'characters', component: {} },
      { path: '/characters/:id', name: 'character-detail', component: {} },
    ],
  });
  await router.push(path);
  await router.isReady();
  scope = effectScope();
  const catalog = scope.run(() => useCharacterCatalog(router))!;
  await vi.advanceTimersByTimeAsync(0);
  return catalog;
}

describe('character catalog navigation', () => {
  it('preserves back navigation after retrying a later page', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let failed = false;
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      if (config.params.page === 3 && !failed) {
        failed = true;
        throw new Error('Offline');
      }
      return response;
    };
    const catalog = await start('/?query=sp&page=2&source=demo');
    await catalog.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(catalog.error.value).not.toBeNull();
    await catalog.retry();
    expect(catalog.page.value).toBe(3);
    await moveHistory('back');
    expect(catalog.page.value).toBe(2);
    expect(router.currentRoute.value.query).toEqual({ query: 'sp', page: '2', source: 'demo' });
    expect(requests.at(-1)).toEqual({ query: 'sp', page: 2, per_page: 20 });
  });

  it('retries the applied query while preserving a draft and cancels the retry when that draft applies', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let oldAttempts = 0;
    let signal: GenericAbortSignal | undefined;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      if (config.params.query === 'sp') {
        oldAttempts += 1;
        if (oldAttempts === 1) throw new Error('Offline');
        signal = config.signal;
        await gate;
      }
      return response;
    };
    const catalog = await start('/?query=sp&page=3');
    catalog.search.value = 'iron';
    const retry = catalog.retry();
    await vi.advanceTimersByTimeAsync(0);
    try {
      expect(catalog.search.value).toBe('iron');
      expect(requests).toEqual([
        { query: 'sp', page: 3, per_page: 20 }, { query: 'sp', page: 3, per_page: 20 },
      ]);
      await vi.advanceTimersByTimeAsync(300);
      expect(signal?.aborted).toBe(true);
      expect(router.currentRoute.value.query).toEqual({ query: 'iron' });
      expect(catalog.page.value).toBe(1);
      expect(catalog.items.value[0].name).toBe('iron');
    } finally {
      release();
      await retry;
    }
    expect(catalog.items.value[0].name).toBe('iron');
    expect(catalog.error.value).toBeNull();
    expect(catalog.loading.value).toBe(false);
  });

  it.each(['s', 's'.repeat(101)])('does not retry a locally invalid query', async (query) => {
    const catalog = await start(`/?query=${query}`);
    expect(catalog.canRetry.value).toBe(false);
    await catalog.retry();
    expect(requests).toEqual([]);
    expect(catalog.error.value).not.toBeNull();
  });

  it('does not retry a healthy collection', async () => {
    const catalog = await start('/?query=sp');
    expect(catalog.canRetry.value).toBe(false);
    await catalog.retry();
    expect(requests).toHaveLength(1);
  });

  it('clears the error while retrying and ignores repeated actions', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let attempts = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      attempts += 1;
      if (attempts === 1) throw new Error('Offline');
      await gate;
      return response;
    };
    const catalog = await start('/?query=sp&page=2');
    expect(catalog.canRetry.value).toBe(true);
    const retry = catalog.retry();
    await vi.advanceTimersByTimeAsync(0);
    try {
      expect(catalog.canRetry.value).toBe(false);
      expect(catalog.error.value).toBeNull();
      expect(catalog.loading.value).toBe(true);
      catalog.retry();
      await vi.advanceTimersByTimeAsync(0);
      expect(attempts).toBe(2);
    } finally {
      release();
      await retry;
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(catalog.items.value[0].name).toBe('sp');
    expect(catalog.page.value).toBe(2);
    expect(catalog.loading.value).toBe(false);
  });

  it.each(['/', '/?query=sp&page=3&source=demo'])('retries the applied URL %s after an HTTP failure', async (path) => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let failed = false;
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      if (!failed) {
        failed = true;
        throw new Error('Offline');
      }
      return response;
    };
    const catalog = await start(path);
    expect(catalog.error.value).toBe('Unable to load the catalog right now.');
    const appliedUrl = router.currentRoute.value.fullPath;
    await catalog.retry();
    expect(router.currentRoute.value.fullPath).toBe(appliedUrl);
    expect(requests).toEqual(path === '/' ? [
      { page: 1, per_page: 20 }, { page: 1, per_page: 20 },
    ] : [
      { query: 'sp', page: 3, per_page: 20 }, { query: 'sp', page: 3, per_page: 20 },
    ]);
    expect(catalog.items.value).toHaveLength(1);
    expect(catalog.error.value).toBeNull();
    expect(catalog.loading.value).toBe(false);
  });

  it('does not request a one-character search from a shared URL', async () => {
    const catalog = await start('/?query=s');
    expect(requests).toEqual([]);
    expect(catalog.items.value).toEqual([]);
    expect(catalog.loading.value).toBe(false);
    expect(catalog.error.value).toBe('Search must contain at least two characters.');
  });

  it('debounces a new search before resetting a later page and makes only one request', async () => {
    const catalog = await start('/?query=sp&page=3');
    expect(requests).toEqual([{ query: 'sp', page: 3, per_page: 20 }]);

    catalog.search.value = 'ir';
    await vi.advanceTimersByTimeAsync(299);
    expect(requests).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(requests).toEqual([
      { query: 'sp', page: 3, per_page: 20 },
      { query: 'ir', page: 1, per_page: 20 },
    ]);
    expect(router.currentRoute.value.query).toEqual({ query: 'ir' });
    expect(catalog.page.value).toBe(1);
    expect(catalog.items.value[0].name).toBe('ir');
  });

  it('restarts the debounce while typing and keeps the title tied to the applied query', async () => {
    const catalog = await start('/?query=sp');
    catalog.search.value = 'ir';
    await vi.advanceTimersByTimeAsync(200);
    catalog.search.value = 'iron';
    await vi.advanceTimersByTimeAsync(299);
    expect(requests).toHaveLength(1);
    expect(catalog.title.value).toBe('Results for "sp"');
    await vi.advanceTimersByTimeAsync(1);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual({ query: 'iron', page: 1, per_page: 20 });
    expect(catalog.title.value).toBe('Results for "iron"');
  });

  it('clears old results for a short query and returns to the unfiltered first page when cleared', async () => {
    const catalog = await start('/?query=sp&page=3');
    catalog.search.value = 's';
    await vi.advanceTimersByTimeAsync(300);
    expect(requests).toHaveLength(1);
    expect(catalog.items.value).toEqual([]);
    expect(catalog.total.value).toBe(0);
    expect(catalog.error.value).toBe('Search must contain at least two characters.');

    catalog.search.value = '   ';
    await vi.advanceTimersByTimeAsync(300);
    expect(requests[1]).toEqual({ page: 1, per_page: 20 });
    expect(router.currentRoute.value.query).toEqual({});
    expect(catalog.search.value).toBe('');
    expect(catalog.error.value).toBeNull();
  });

  it('rejects oversized shared queries without HTTP', async () => {
    const catalog = await start(`/?query=${'s'.repeat(101)}`);
    expect(requests).toEqual([]);
    expect(catalog.error.value).toBe('Search must contain at most 100 characters.');
  });

  it('counts Unicode code points instead of UTF-16 units for the minimum length', async () => {
    const catalog = await start(`/?query=${encodeURIComponent('\u{1F600}')}`);
    expect(requests).toEqual([]);
    expect(catalog.error.value).toBe('Search must contain at least two characters.');
  });

  it('restores query and page through back and forward navigation without another debounce', async () => {
    const catalog = await start('/?query=sp');
    await catalog.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(catalog.page.value).toBe(2);
    catalog.search.value = 'iron';
    await vi.advanceTimersByTimeAsync(300);

    await moveHistory('back');
    expect(catalog.search.value).toBe('sp');
    expect(catalog.page.value).toBe(2);
    expect(requests.at(-1)).toEqual({ query: 'sp', page: 2, per_page: 20 });
    await moveHistory('forward');
    expect(catalog.search.value).toBe('iron');
    expect(catalog.page.value).toBe(1);
    expect(requests.at(-1)).toEqual({ query: 'iron', page: 1, per_page: 20 });
    await vi.advanceTimersByTimeAsync(300);
    expect(requests).toHaveLength(5);
  });

  it('cancels a pending draft when another URL is selected', async () => {
    const catalog = await start('/?query=sp');
    catalog.search.value = 'iron';
    await router.push('/?query=thor&page=2');
    await vi.advanceTimersByTimeAsync(600);
    expect(catalog.search.value).toBe('thor');
    expect(catalog.page.value).toBe(2);
    expect(requests).toEqual([
      { query: 'sp', page: 1, per_page: 20 },
      { query: 'thor', page: 2, per_page: 20 },
    ]);
  });

  it('does not navigate or fetch after leaving the catalog with a pending draft', async () => {
    const catalog = await start();
    catalog.search.value = 'iron';
    await router.push('/characters/1');
    await vi.advanceTimersByTimeAsync(600);
    expect(router.currentRoute.value.path).toBe('/characters/1');
    expect(requests).toHaveLength(1);
    expect(catalog.loading.value).toBe(false);
  });

  it('clears its timer when the page scope is disposed', async () => {
    const catalog = await start();
    catalog.search.value = 'iron';
    scope.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(600);
    expect(requests).toHaveLength(1);
    expect(router.currentRoute.value.query).toEqual({});
  });

  it.each(['0', '-1', '1.5', 'text', '1e3', '9007199254740992'])('uses page one for invalid page %s', async (page) => {
    const catalog = await start(`/?page=${page}`);
    expect(catalog.page.value).toBe(1);
    expect(requests).toEqual([{ page: 1, per_page: 20 }]);
  });

  it('does not reload an unchanged trimmed query or unrelated URL parameters', async () => {
    const catalog = await start('/?query=sp&page=3');
    catalog.search.value = ' sp ';
    await vi.advanceTimersByTimeAsync(300);
    await router.push('/?query=sp&page=3&source=demo');
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(1);
    expect(catalog.page.value).toBe(3);
  });

  it('keeps unrelated URL parameters and respects pagination boundaries', async () => {
    const catalog = await start('/?source=demo');
    await catalog.previous();
    expect(requests).toHaveLength(1);
    catalog.search.value = 'sp';
    await vi.advanceTimersByTimeAsync(300);
    expect(router.currentRoute.value.query).toEqual({ source: 'demo', query: 'sp' });
    await catalog.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(router.currentRoute.value.query).toEqual({ source: 'demo', query: 'sp', page: '2' });
    await router.push('/?query=sp&page=5');
    await vi.advanceTimersByTimeAsync(0);
    const count = requests.length;
    await catalog.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(count);
    expect(catalog.page.value).toBe(5);
  });
});

async function moveHistory(direction: 'back' | 'forward') {
  await new Promise<void>((resolve) => {
    const remove = router.afterEach(() => { remove(); resolve(); });
    router[direction]();
  });
  await vi.advanceTimersByTimeAsync(0);
}
