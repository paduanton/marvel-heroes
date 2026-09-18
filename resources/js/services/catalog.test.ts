import { AxiosError, CanceledError } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, CatalogApiError } from './api';
import { getCharacter, listCharacters, listComics, listStories } from './catalog';

const requests = [
  { resource: 'characters', load: (signal: AbortSignal) => listCharacters({ page: 1, perPage: 20 }, signal) },
  { resource: 'character detail', load: (signal: AbortSignal) => getCharacter(1, signal) },
  { resource: 'stories', load: (signal: AbortSignal) => listStories(1, { page: 1, perPage: 10 }, signal) },
  { resource: 'comics', load: (signal: AbortSignal) => listComics(1, { page: 1, perPage: 20 }, signal) },
];
const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  api.defaults.adapter = async () => { throw new Error('Unexpected HTTP request in test.'); };
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe('catalog requests', () => {
  it.each(requests)('preserves cancellation for $resource', async ({ load }) => {
    const controller = new AbortController();
    controller.abort();

    await expect(load(controller.signal)).rejects.toBeInstanceOf(CanceledError);
  });

  it.each(requests)('preserves in-flight cancellation for $resource', async ({ load }) => {
    const controller = new AbortController();
    api.defaults.adapter = (config) => new Promise((_, reject) => {
      expect(config.signal).toBe(controller.signal);
      controller.signal.addEventListener('abort', () => reject(new CanceledError()), { once: true });
      controller.abort();
    });

    await expect(load(controller.signal)).rejects.toBeInstanceOf(CanceledError);
  });

  it.each(requests)('keeps HTTP problem details for $resource', async ({ load }) => {
    api.defaults.adapter = async (config) => {
      throw new AxiosError('Request failed', AxiosError.ERR_BAD_RESPONSE, config, undefined, {
        config,
        headers: {},
        status: 502,
        statusText: 'Bad Gateway',
        data: { code: 'upstream-unavailable', detail: 'Catalog is temporarily unavailable.' },
      });
    };

    const failure = await load(new AbortController().signal).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CatalogApiError);
    expect(failure).toMatchObject({
      status: 502,
      code: 'upstream-unavailable',
      message: 'Catalog is temporarily unavailable.',
    });
  });

  it('keeps a safe fallback for transport failures', async () => {
    api.defaults.adapter = async () => { throw new AxiosError('Network Error', AxiosError.ERR_NETWORK); };

    await expect(listCharacters({ page: 1, perPage: 20 })).rejects.toMatchObject({
      message: 'Unable to load the catalog right now.',
      status: undefined,
      code: undefined,
    });
  });
});
