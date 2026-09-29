import { setImmediate } from 'node:timers/promises';
import type { AxiosAdapter, GenericAbortSignal } from 'axios';
import { effectScope, ref, type EffectScope } from 'vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/services/api';
import { useCharacterDetail } from './useCharacterDetail';

const originalAdapter = api.defaults.adapter;
let scope: EffectScope;

beforeEach(() => {
  api.defaults.adapter = async (config) => ({
    config, headers: {}, status: 200, statusText: 'OK',
    data: config.url?.endsWith('/stories') ? {
      data: [{ id: 10, title: config.url, type: null, modified_at: null,
        counts: { creators: 0, characters: 1, comics: 2, events: 0 } }],
      meta: { page: 1, per_page: 10, total: 1 },
    } : {
      data: { id: Number(config.url?.split('/').at(-1)), name: config.url,
        description: null, modified_at: null, image_url: null },
    },
  });
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

describe('character detail', () => {
  it('makes the character available before its stories finish loading', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    api.defaults.adapter = async (config) => {
      if (config.url?.endsWith('/stories')) await gate;
      return respond(config);
    };
    const { detail } = await start();
    try {
      expect(detail.character.value?.id).toBe(1);
      expect(detail.loading.value).toBe(false);
      expect(detail.storiesLoading.value).toBe(true);
      expect(detail.stories.value).toEqual([]);
    } finally {
      release();
      await setImmediate();
    }
    expect(detail.stories.value[0].title).toBe('/characters/1/stories');
    expect(detail.storiesLoading.value).toBe(false);
  });

  it('clears previous data while another character and its stories load', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    api.defaults.adapter = async (config) => {
      if (config.url?.startsWith('/characters/2')) await gate;
      return respond(config);
    };
    const { detail, characterId } = await start();
    characterId.value = '2';
    await setImmediate();
    try {
      expect(detail.character.value).toBeNull();
      expect(detail.stories.value).toEqual([]);
      expect(detail.loading.value).toBe(true);
      expect(detail.storiesLoading.value).toBe(true);
      expect(detail.error.value).toBeNull();
      expect(detail.storiesError.value).toBeNull();
    } finally {
      release();
      await setImmediate();
    }
    expect(detail.character.value?.id).toBe(2);
    expect(detail.stories.value[0].title).toBe('/characters/2/stories');
  });

  it.each(['resolve', 'reject'])('does not end current loading when obsolete requests %s', async (outcome) => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let releaseOld!: () => void;
    let releaseCurrent!: () => void;
    const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
    const currentGate = new Promise<void>((resolve) => { releaseCurrent = resolve; });
    api.defaults.adapter = async (config) => {
      if (config.url?.startsWith('/characters/1')) {
        await oldGate;
        if (outcome === 'reject') throw new Error('Late failure');
      } else {
        await currentGate;
      }
      return respond(config);
    };
    const { detail, characterId } = await start();
    characterId.value = '2';
    await setImmediate();
    try {
      releaseOld();
      await setImmediate();
      expect(detail.loading.value).toBe(true);
      expect(detail.storiesLoading.value).toBe(true);
      expect(detail.character.value).toBeNull();
      expect(detail.stories.value).toEqual([]);
      expect(detail.error.value).toBeNull();
      expect(detail.storiesError.value).toBeNull();
    } finally {
      releaseOld();
      releaseCurrent();
      await setImmediate();
    }
    expect(detail.character.value?.id).toBe(2);
    expect(detail.loading.value).toBe(false);
    expect(detail.storiesLoading.value).toBe(false);
  });

  it('clears independent failures and recovers when another character is selected', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = async (config) => {
      if (config.url === '/characters/1') {
        throw { response: { status: 404, data: { code: 'not-found', detail: 'Character not found.' } } };
      }
      if (config.url === '/characters/1/stories') throw new Error('Offline');
      return respond(config);
    };
    const { detail, characterId } = await start();
    expect(detail.character.value).toBeNull();
    expect(detail.error.value).toBe('Character not found.');
    expect(detail.storiesError.value).toBe('Unable to load the catalog right now.');
    expect(detail.loading.value).toBe(false);
    expect(detail.storiesLoading.value).toBe(false);
    characterId.value = '2';
    await setImmediate();
    expect(detail.character.value?.id).toBe(2);
    expect(detail.stories.value[0].title).toBe('/characters/2/stories');
    expect(detail.error.value).toBeNull();
    expect(detail.storiesError.value).toBeNull();
  });

  it('keeps empty stories separate from character availability', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = async (config) => {
      if (config.url?.endsWith('/stories')) {
        return { config, headers: {}, status: 200, statusText: 'OK',
          data: { data: [], meta: { page: 1, per_page: 10, total: 0 } } };
      }
      return respond(config);
    };
    const { detail } = await start();
    expect(detail.character.value?.id).toBe(1);
    expect(detail.stories.value).toEqual([]);
    expect(detail.storiesLoading.value).toBe(false);
    expect(detail.storiesError.value).toBeNull();
    expect(detail.error.value).toBeNull();
  });

  it('does not reload an unchanged character ID', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    const requests: string[] = [];
    api.defaults.adapter = async (config) => {
      requests.push(config.url!);
      return respond(config);
    };
    const { characterId } = await start();
    characterId.value = '1';
    await setImmediate();
    expect(requests).toEqual(['/characters/1', '/characters/1/stories']);
  });

  it('aborts both requests on disposal and prevents later updates or reloads', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const signals: (GenericAbortSignal | undefined)[] = [];
    api.defaults.adapter = async (config) => {
      signals.push(config.signal);
      await gate;
      return respond(config);
    };
    const { detail, characterId } = await start();
    scope.stop();
    try {
      expect(signals).toHaveLength(2);
      expect(signals.every((signal) => signal?.aborted)).toBe(true);
      expect(detail.loading.value).toBe(false);
      expect(detail.storiesLoading.value).toBe(false);
    } finally {
      release();
      await setImmediate();
    }
    characterId.value = '2';
    await setImmediate();
    expect(detail.character.value).toBeNull();
    expect(detail.stories.value).toEqual([]);
    expect(detail.error.value).toBeNull();
    expect(detail.storiesError.value).toBeNull();
    expect(signals).toHaveLength(2);
  });

  it('aborts previous character requests and ignores late character and story responses', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const oldSignals: (GenericAbortSignal | undefined)[] = [];
    api.defaults.adapter = async (config) => {
      if (config.url === '/characters/1' || config.url === '/characters/1/stories') {
        oldSignals.push(config.signal);
        await gate;
      }
      return respond(config);
    };
    const { detail, characterId } = await start();
    characterId.value = '2';
    await setImmediate();
    try {
      expect(oldSignals).toHaveLength(2);
      expect(oldSignals.every((signal) => signal?.aborted)).toBe(true);
      expect(detail.character.value?.id).toBe(2);
      expect(detail.stories.value[0].title).toBe('/characters/2/stories');
    } finally {
      release();
      await setImmediate();
    }
    expect(detail.character.value?.id).toBe(2);
    expect(detail.stories.value[0].title).toBe('/characters/2/stories');
    expect(detail.error.value).toBeNull();
    expect(detail.storiesError.value).toBeNull();
  });

  it('reloads the character and its stories when the ID changes', async () => {
    const { detail, characterId } = await start();
    expect(detail.character.value?.id).toBe(1);
    characterId.value = '2';
    await setImmediate();
    expect(detail.character.value?.id).toBe(2);
    expect(detail.stories.value[0].title).toBe('/characters/2/stories');
    expect(detail.loading.value).toBe(false);
    expect(detail.storiesLoading.value).toBe(false);
  });

  it('keeps the character available when related stories fail', async () => {
    const respond = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = async (config) => {
      if (config.url?.endsWith('/stories')) throw new Error('Offline');
      return respond(config);
    };
    const { detail } = await start();
    expect(detail.character.value?.id).toBe(1);
    expect(detail.loading.value).toBe(false);
    expect(detail.error.value).toBeNull();
    expect(detail.storiesError.value).toBe('Unable to load the catalog right now.');
    expect(detail.storiesLoading.value).toBe(false);
    expect(detail.stories.value).toEqual([]);
  });
});
