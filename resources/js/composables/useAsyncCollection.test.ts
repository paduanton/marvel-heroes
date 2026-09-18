import { effectScope, type EffectScope } from 'vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiCollection } from '@/types/catalog';
import { useAsyncCollection } from './useAsyncCollection';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const olderResult: ApiCollection<number> = { data: [1], meta: { page: 1, per_page: 20, total: 10 } };
const latestResult: ApiCollection<number> = { data: [2], meta: { page: 1, per_page: 20, total: 30 } };
let scope: EffectScope;
let collection: ReturnType<typeof useAsyncCollection<number>>;

beforeEach(() => {
  scope = effectScope();
  collection = scope.run(() => useAsyncCollection<number>())!;
});

afterEach(() => scope.stop());

describe('async catalog collection', () => {
  it('keeps loading the latest request when an older loader ignores cancellation', async () => {
    const older = deferred<ApiCollection<number>>();
    const latest = deferred<ApiCollection<number>>();
    let olderSignal: AbortSignal | undefined;
    const firstLoad = collection.load((signal) => {
      olderSignal = signal;
      return older.promise;
    });
    const latestLoad = collection.load(() => latest.promise);

    expect(olderSignal?.aborted).toBe(true);
    older.resolve(olderResult);
    await firstLoad;

    expect(collection.loading.value).toBe(true);
    expect(collection.items.value).toEqual([]);
    expect(collection.total.value).toBe(0);
    expect(collection.error.value).toBeNull();

    latest.resolve(latestResult);
    await latestLoad;
    expect(collection.items.value).toEqual([2]);
    expect(collection.total.value).toBe(30);
    expect(collection.loading.value).toBe(false);
  });

  it.each(['success', 'failure'])('ignores a late %s after the latest result is available', async (outcome) => {
    const older = deferred<ApiCollection<number>>();
    const firstLoad = collection.load(() => older.promise);
    await collection.load(async () => latestResult);

    if (outcome === 'success') older.resolve(olderResult);
    else older.reject(new Error('Outdated failure'));
    await firstLoad;

    expect(collection.items.value).toEqual([2]);
    expect(collection.total.value).toBe(30);
    expect(collection.error.value).toBeNull();
    expect(collection.loading.value).toBe(false);
  });

  it('ignores an outdated error while the latest request is pending', async () => {
    const older = deferred<ApiCollection<number>>();
    const latest = deferred<ApiCollection<number>>();
    const firstLoad = collection.load(() => older.promise);
    const latestLoad = collection.load(() => latest.promise);
    older.reject(new Error('Outdated failure'));
    await firstLoad;

    expect(collection.error.value).toBeNull();
    expect(collection.loading.value).toBe(true);
    latest.resolve(latestResult);
    await latestLoad;
    expect(collection.items.value).toEqual([2]);
  });

  it('preserves the latest failure when an older request later succeeds', async () => {
    const older = deferred<ApiCollection<number>>();
    const firstLoad = collection.load(() => older.promise);
    await collection.load(async () => { throw new Error('Current failure'); });
    older.resolve(olderResult);
    await firstLoad;

    expect(collection.items.value).toEqual([]);
    expect(collection.error.value).toBe('Current failure');
    expect(collection.loading.value).toBe(false);
  });

  it('clears the previous error and recovers on a later load', async () => {
    await collection.load(async () => { throw new Error('Temporary failure'); });
    const pending = deferred<ApiCollection<number>>();
    const retry = collection.load(() => pending.promise);
    expect(collection.error.value).toBeNull();
    expect(collection.loading.value).toBe(true);

    pending.resolve(latestResult);
    await retry;
    expect(collection.items.value).toEqual([2]);
    expect(collection.loading.value).toBe(false);
  });

  it('uses a fallback message for non-Error rejections', async () => {
    await collection.load(() => Promise.reject(null));
    expect(collection.error.value).toBe('Unable to load catalog items.');
    expect(collection.loading.value).toBe(false);
  });

  it.each(['success', 'failure'])('aborts on scope disposal and ignores a late %s', async (outcome) => {
    const pending = deferred<ApiCollection<number>>();
    let signal: AbortSignal | undefined;
    const load = collection.load((requestSignal) => {
      signal = requestSignal;
      return pending.promise;
    });
    scope.stop();

    expect(signal?.aborted).toBe(true);
    expect(collection.loading.value).toBe(false);
    if (outcome === 'success') pending.resolve(latestResult);
    else pending.reject(new Error('Failure after disposal'));
    await load;

    expect(collection.items.value).toEqual([]);
    expect(collection.total.value).toBe(0);
    expect(collection.error.value).toBeNull();
  });

  it('does not start another request after scope disposal', async () => {
    scope.stop();
    let called = false;
    await collection.load(async () => {
      called = true;
      return latestResult;
    });
    expect(called).toBe(false);
    expect(collection.loading.value).toBe(false);
    expect(collection.items.value).toEqual([]);
  });
});
