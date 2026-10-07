import { setImmediate } from 'node:timers/promises';
import type { AxiosAdapter, GenericAbortSignal } from 'axios';
import { effectScope, ref, type EffectScope } from 'vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/services/api';
import { useStoryComics } from './useStoryComics';

const originalAdapter = api.defaults.adapter;
let scope: EffectScope;
let requests: { url?: string; page: number; per_page: number }[];

beforeEach(() => {
  requests = [];
  api.defaults.adapter = async (config) => {
    requests.push({ url: config.url, ...config.params });
    return {
      config, headers: {}, status: 200, statusText: 'OK',
      data: {
        data: [{ id: 1, title: config.url, description: null, digital_id: null, format: null,
          image_url: null, modified_at: null, on_sale_at: null, digital_price: null }],
        meta: { page: config.params.page, per_page: 20, total: 60 },
      },
    };
  };
});

afterEach(() => {
  scope?.stop();
  api.defaults.adapter = originalAdapter;
});

async function start() {
  const storyId = ref('1');
  scope = effectScope();
  const comics = scope.run(() => useStoryComics(() => storyId.value))!;
  await setImmediate();
  return { comics, storyId };
}

describe('story comics', () => {
  it('keeps repeated page failures visible and can return to the previous page', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      if (config.params.page === 2) throw new Error('Offline');
      return response;
    };
    const { comics } = await start();
    await comics.next();
    await comics.retry();
    expect(comics.page.value).toBe(2);
    expect(comics.error.value).toBe('Unable to load the catalog right now.');
    expect(comics.loading.value).toBe(false);
    expect(comics.total.value).toBe(60);
    expect(requests.filter((request) => request.page === 2)).toHaveLength(2);
    await comics.previous();
    expect(comics.page.value).toBe(1);
    expect(comics.error.value).toBeNull();
    expect(comics.comics.value[0].title).toBe('/stories/1/comics');
  });

  it('does not retry a collection without an error', async () => {
    const { comics } = await start();
    await comics.retry();
    expect(requests).toHaveLength(1);
    expect(comics.loading.value).toBe(false);
  });

  it('ignores repeated retry actions during loading', async () => {
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
    const { comics } = await start();
    const retry = comics.retry();
    await setImmediate();
    try {
      expect(comics.loading.value).toBe(true);
      expect(comics.error.value).toBeNull();
      comics.retry();
      await setImmediate();
      expect(attempts).toBe(2);
      expect(comics.page.value).toBe(1);
    } finally {
      release();
      await retry;
      await setImmediate();
    }
    expect(comics.loading.value).toBe(false);
    expect(comics.error.value).toBeNull();
  });

  it.each([1, 2])('retries failed comic page %i for the same story', async (page) => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let failed = false;
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      if (config.params.page === page && !failed) {
        failed = true;
        throw new Error('Offline');
      }
      return response;
    };
    const { comics } = await start();
    if (page === 2) await comics.next();
    expect(comics.error.value).toBe('Unable to load the catalog right now.');
    const before = requests.length;
    await comics.retry();
    expect(comics.page.value).toBe(page);
    expect(comics.comics.value[0].title).toBe('/stories/1/comics');
    expect(comics.error.value).toBeNull();
    expect(comics.loading.value).toBe(false);
    expect(requests.slice(before)).toEqual([{ url: '/stories/1/comics', page, per_page: 20 }]);
  });

  it('keeps pagination within the loaded collection bounds', async () => {
    const { comics } = await start();
    await comics.previous();
    expect(comics.page.value).toBe(1);
    expect(requests).toHaveLength(1);
    await comics.next();
    await comics.next();
    expect(comics.page.value).toBe(3);
    await comics.next();
    expect(comics.page.value).toBe(3);
    expect(requests).toHaveLength(3);
    await comics.previous();
    expect(comics.page.value).toBe(2);
    expect(requests.at(-1)).toEqual({ url: '/stories/1/comics', page: 2, per_page: 20 });
  });

  it('loads the first page of a new story when the same page instance is reused', async () => {
    const { comics, storyId } = await start();
    await comics.next();
    expect(comics.page.value).toBe(2);

    storyId.value = '2';
    await setImmediate();
    expect(requests).toEqual([
      { url: '/stories/1/comics', page: 1, per_page: 20 },
      { url: '/stories/1/comics', page: 2, per_page: 20 },
      { url: '/stories/2/comics', page: 1, per_page: 20 },
    ]);
    expect(comics.page.value).toBe(1);
    expect(comics.comics.value[0].title).toBe('/stories/2/comics');
    expect(comics.loading.value).toBe(false);
  });

  it('cancels a pending page of the previous story and ignores its late response', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let previousSignal: GenericAbortSignal | undefined;
    api.defaults.adapter = async (config) => {
      if (config.url === '/stories/1/comics' && config.params.page === 2) {
        previousSignal = config.signal;
        await gate;
      }
      return respond(config);
    };
    const { comics, storyId } = await start();
    const oldPage = comics.next();
    await setImmediate();
    storyId.value = '2';
    await setImmediate();

    try {
      expect(previousSignal?.aborted).toBe(true);
      expect(comics.page.value).toBe(1);
      expect(comics.comics.value[0].title).toBe('/stories/2/comics');
    } finally {
      release();
      await oldPage;
    }
    expect(comics.comics.value[0].title).toBe('/stories/2/comics');
    expect(comics.error.value).toBeNull();
    expect(comics.loading.value).toBe(false);
  });

  it('does not change pages again while a page request is pending', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    api.defaults.adapter = async (config) => {
      if (config.params.page === 2) await gate;
      return respond(config);
    };
    const { comics } = await start();
    const nextPage = comics.next();
    await setImmediate();
    try {
      expect(comics.loading.value).toBe(true);
      await comics.next();
      await comics.previous();
      expect(comics.page.value).toBe(2);
    } finally {
      release();
      await nextPage;
    }
    expect(requests).toEqual([
      { url: '/stories/1/comics', page: 1, per_page: 20 },
      { url: '/stories/1/comics', page: 2, per_page: 20 },
    ]);
    expect(comics.loading.value).toBe(false);
  });

  it('clears the previous story while loading, exposes a failure and recovers on another story', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    api.defaults.adapter = async (config) => {
      if (config.url === '/stories/2/comics') {
        await gate;
        throw new Error('Offline');
      }
      return respond(config);
    };
    const { comics, storyId } = await start();
    expect(comics.comics.value).toHaveLength(1);
    storyId.value = '2';
    await setImmediate();
    try {
      expect(comics.comics.value).toEqual([]);
      expect(comics.total.value).toBe(0);
      expect(comics.loading.value).toBe(true);
      expect(comics.error.value).toBeNull();
    } finally {
      release();
      await setImmediate();
    }
    expect(comics.error.value).toBe('Unable to load the catalog right now.');
    expect(comics.loading.value).toBe(false);
    expect(comics.comics.value).toEqual([]);

    storyId.value = '3';
    await setImmediate();
    expect(comics.error.value).toBeNull();
    expect(comics.comics.value[0].title).toBe('/stories/3/comics');
    expect(comics.page.value).toBe(1);
  });

  it('aborts loading on scope disposal and ignores the response', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let signal: GenericAbortSignal | undefined;
    api.defaults.adapter = async (config) => {
      signal = config.signal;
      await gate;
      return respond(config);
    };
    const { comics, storyId } = await start();
    scope.stop();
    try {
      expect(signal?.aborted).toBe(true);
      expect(comics.loading.value).toBe(false);
    } finally {
      release();
      await setImmediate();
    }
    expect(comics.comics.value).toEqual([]);
    expect(comics.error.value).toBeNull();
    storyId.value = '2';
    await setImmediate();
    expect(requests).toHaveLength(1);
  });

  it('keeps an empty collection without enabling another page', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      response.data.data = [];
      response.data.meta.total = 0;
      return response;
    };
    const { comics } = await start();
    await comics.next();
    await comics.previous();
    expect(comics.comics.value).toEqual([]);
    expect(comics.total.value).toBe(0);
    expect(comics.error.value).toBeNull();
    expect(comics.loading.value).toBe(false);
    expect(comics.page.value).toBe(1);
    expect(requests).toHaveLength(1);
  });

  it('does not reload an unchanged story', async () => {
    const { storyId } = await start();
    storyId.value = '1';
    await setImmediate();
    expect(requests).toHaveLength(1);
  });
});
