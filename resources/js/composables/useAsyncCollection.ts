import { onScopeDispose, ref } from 'vue';
import type { ApiCollection, CatalogSource } from '@/types/catalog';

export function useAsyncCollection<T>() {
  const items = ref<T[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const stale = ref(false);
  const source = ref<CatalogSource>();
  let controller: AbortController | undefined;
  let disposed = false;

  onScopeDispose(() => {
    disposed = true;
    controller?.abort();
    loading.value = false;
    stale.value = false;
    source.value = undefined;
  });

  function reset() {
    if (disposed) return;
    controller?.abort();
    items.value = [];
    total.value = 0;
    loading.value = false;
    error.value = null;
    stale.value = false;
    source.value = undefined;
  }

  async function load(loader: (signal: AbortSignal) => Promise<ApiCollection<T>>) {
    if (disposed) return;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = null;
    stale.value = false;
    try {
      const result = await loader(request.signal);
      if (request.signal.aborted) return;
      items.value = result.data;
      total.value = result.meta.total;
      stale.value = result.meta.cache?.state === 'stale';
      source.value = result.meta.source;
    } catch (exception) {
      if (!request.signal.aborted && (exception as { name?: string })?.name !== 'CanceledError') {
        error.value = exception instanceof Error ? exception.message : 'Unable to load catalog items.';
      }
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }

  return { items, total, loading, error, stale, source, load, reset };
}
