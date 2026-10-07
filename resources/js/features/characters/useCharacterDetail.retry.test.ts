import { setImmediate } from 'node:timers/promises';
import type { AxiosAdapter, GenericAbortSignal } from 'axios';
import { effectScope, ref, type EffectScope } from 'vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/services/api';
import { useCharacterDetail } from './useCharacterDetail';

const originalAdapter = api.defaults.adapter;
let scope: EffectScope;
let requests: { url?: string; page?: number; per_page?: number }[];

beforeEach(() => {
  requests = [];
  api.defaults.adapter = async (config) => {
    requests.push({ url: config.url, ...config.params });
    return {
      config, headers: {}, status: 200, statusText: 'OK',
      data: config.url?.endsWith('/stories') ? {
        data: [{ id: 10, title: `Story page ${config.params.page}`, type: null, modified_at: null,
          counts: { creators: 0, characters: 1, comics: 2, events: 0 } }],
        meta: { page: config.params.page, per_page: 10, total: 20 },
      } : {
        data: { id: Number(config.url?.split('/').at(-1)), name: config.url,
          description: null, modified_at: null, image_url: null },
      },
    };
  };
});

afterEach(() => {
  scope?.stop();
  api.defaults.adapter = originalAdapter;
});

async function start() {
  const characterId = ref('1');
  scope = effectScope();
  const detail = scope.run(() => useCharacterDetail(() => characterId.value))!;
  await setImmediate();
  return { detail, characterId };
}

describe('character retries', () => {
  it('ignores an obsolete character retry when a new character is selected', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let attempts = 0;
    let signal: GenericAbortSignal | undefined;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      if (config.url === '/characters/1') {
        attempts += 1;
        if (attempts === 1) throw new Error('Offline');
        signal = config.signal;
        await gate;
      }
      return response;
    };
    const { detail, characterId } = await start();
    const retry = detail.retryCharacter();
    await setImmediate();
    characterId.value = '2';
    await setImmediate();
    try {
      expect(signal?.aborted).toBe(true);
      expect(detail.character.value?.id).toBe(2);
    } finally {
      release();
      await retry;
    }
    expect(detail.character.value?.id).toBe(2);
    expect(detail.error.value).toBeNull();
    expect(detail.loading.value).toBe(false);
  });

  it('preserves independent story errors through failed and successful character retries', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let attempts = 0;
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      if (config.url?.endsWith('/stories')) throw new Error('Offline');
      if (++attempts <= 2) throw new Error('Offline');
      return response;
    };
    const { detail } = await start();
    await detail.retryCharacter();
    expect(detail.error.value).toBe('Unable to load the catalog right now.');
    expect(detail.storiesError.value).toBe('Unable to load the catalog right now.');
    expect(detail.loading.value).toBe(false);
    await detail.retryCharacter();
    expect(detail.character.value?.id).toBe(1);
    expect(detail.error.value).toBeNull();
    expect(detail.storiesError.value).toBe('Unable to load the catalog right now.');
    expect(requests.filter((request) => request.url?.endsWith('/stories'))).toHaveLength(1);
  });

  it('does not retry a healthy character or a disposed page', async () => {
    const { detail } = await start();
    await detail.retryCharacter();
    expect(requests).toHaveLength(2);
    scope.stop();
    await detail.retryCharacter();
    expect(requests).toHaveLength(2);
    expect(detail.loading.value).toBe(false);
  });

  it('does not retry a failed character after disposal', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      if (config.url === '/characters/1') throw new Error('Offline');
      return response;
    };
    const { detail } = await start();
    scope.stop();
    await detail.retryCharacter();
    expect(requests).toHaveLength(2);
    expect(detail.loading.value).toBe(false);
  });

  it('ignores duplicate character retries while loading', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let attempts = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      if (config.url === '/characters/1') {
        attempts += 1;
        if (attempts === 1) throw new Error('Offline');
        await gate;
      }
      return response;
    };
    const { detail } = await start();
    const retry = detail.retryCharacter();
    await setImmediate();
    try {
      expect(detail.loading.value).toBe(true);
      expect(detail.error.value).toBeNull();
      detail.retryCharacter();
      await setImmediate();
      expect(attempts).toBe(2);
      expect(detail.stories.value).toHaveLength(1);
    } finally {
      release();
      await retry;
      await setImmediate();
    }
    expect(detail.loading.value).toBe(false);
    expect(detail.character.value?.id).toBe(1);
  });

  it('retries only the character while preserving loaded stories', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let failed = false;
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      if (config.url === '/characters/1' && !failed) {
        failed = true;
        throw new Error('Offline');
      }
      return response;
    };
    const { detail } = await start();
    expect(detail.character.value).toBeNull();
    expect(detail.error.value).toBe('Unable to load the catalog right now.');
    expect(detail.stories.value).toHaveLength(1);
    const before = requests.length;
    await detail.retryCharacter();
    expect(detail.character.value?.id).toBe(1);
    expect(detail.error.value).toBeNull();
    expect(detail.loading.value).toBe(false);
    expect(detail.storiesPage.value).toBe(1);
    expect(detail.stories.value[0].title).toBe('Story page 1');
    expect(requests.slice(before)).toEqual([{ url: '/characters/1' }]);
  });
});

describe('story retries', () => {
  it('keeps a failed retry visible and allows another manual attempt', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let attempts = 0;
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      if (config.url?.endsWith('/stories') && ++attempts <= 2) throw new Error('Offline');
      return response;
    };
    const { detail } = await start();
    await detail.retryStories();
    expect(detail.storiesError.value).toBe('Unable to load the catalog right now.');
    expect(detail.storiesLoading.value).toBe(false);
    expect(detail.storiesPage.value).toBe(1);
    expect(detail.character.value?.id).toBe(1);
    expect(attempts).toBe(2);
    await detail.retryStories();
    expect(detail.storiesError.value).toBeNull();
    expect(detail.stories.value).toHaveLength(1);
    expect(attempts).toBe(3);
  });

  it.each(['change character', 'dispose'])('cancels a pending retry on %s', async (action) => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let attempts = 0;
    let signal: GenericAbortSignal | undefined;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      if (config.url === '/characters/1/stories') {
        attempts += 1;
        if (attempts === 1) throw new Error('Offline');
        signal = config.signal;
        response.data.data[0].title = 'Obsolete story';
        await gate;
      }
      return response;
    };
    const { detail, characterId } = await start();
    const retry = detail.retryStories();
    await setImmediate();
    if (action === 'dispose') scope.stop();
    else characterId.value = '2';
    await setImmediate();
    try {
      expect(signal?.aborted).toBe(true);
    } finally {
      release();
      await retry;
    }
    expect(detail.storiesLoading.value).toBe(false);
    expect(detail.storiesError.value).toBeNull();
    if (action === 'dispose') expect(detail.stories.value).toEqual([]);
    else {
      expect(detail.character.value?.id).toBe(2);
      expect(detail.stories.value[0].title).toBe('Story page 1');
      expect(detail.storiesPage.value).toBe(1);
    }
    const before = requests.length;
    await detail.retryStories();
    expect(requests).toHaveLength(before);
  });

  it('does not refresh a healthy collection', async () => {
    const { detail } = await start();
    const before = requests.length;
    await detail.retryStories();
    expect(requests).toHaveLength(before);
    expect(detail.storiesLoading.value).toBe(false);
  });

  it('ignores repeated retry actions while a retry is pending', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let attempts = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      if (config.url?.endsWith('/stories')) {
        attempts += 1;
        if (attempts === 1) throw new Error('Offline');
        await gate;
      }
      return response;
    };
    const { detail } = await start();
    const retry = detail.retryStories();
    await setImmediate();
    try {
      expect(detail.storiesLoading.value).toBe(true);
      expect(detail.storiesError.value).toBeNull();
      detail.retryStories();
      await setImmediate();
      expect(attempts).toBe(2);
      expect(detail.character.value?.id).toBe(1);
    } finally {
      release();
      await retry;
      await setImmediate();
    }
    expect(detail.storiesLoading.value).toBe(false);
    expect(detail.storiesError.value).toBeNull();
  });

  it.each([1, 2])('retries failed page %i without reloading the character', async (page) => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let failed = false;
    api.defaults.adapter = async (config) => {
      const response = await respond(config);
      if (config.url?.endsWith('/stories') && config.params.page === page && !failed) {
        failed = true;
        throw new Error('Offline');
      }
      return response;
    };
    const { detail } = await start();
    if (page === 2) await detail.nextStories();
    expect(detail.storiesError.value).toBe('Unable to load the catalog right now.');
    const before = requests.length;
    await detail.retryStories();
    expect(detail.character.value?.id).toBe(1);
    expect(detail.loading.value).toBe(false);
    expect(detail.error.value).toBeNull();
    expect(detail.storiesPage.value).toBe(page);
    expect(detail.stories.value[0].title).toBe(`Story page ${page}`);
    expect(detail.storiesError.value).toBeNull();
    expect(detail.storiesLoading.value).toBe(false);
    expect(requests.slice(before)).toEqual([{ url: '/characters/1/stories', page, per_page: 10 }]);
    expect(requests.filter((request) => request.url === '/characters/1')).toHaveLength(1);
  });
});
