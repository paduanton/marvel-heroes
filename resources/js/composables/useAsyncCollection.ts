import { onScopeDispose, ref } from 'vue';
import type { ApiCollection } from '@/types/catalog';

export function useAsyncCollection<T>() {
  const items = ref<T[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let controller: AbortController | undefined;
  let disposed = false;

  onScopeDispose(() => {
    disposed = true;
    controller?.abort();
    loading.value = false;
  });

  async function load(loader: (signal: AbortSignal) => Promise<ApiCollection<T>>) {
    if (disposed) return;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = null;
    try {
      const result = await loader(request.signal);
      if (request.signal.aborted) return;
      items.value = result.data;
      total.value = result.meta.total;
    } catch (exception) {
      if (!request.signal.aborted && (exception as { name?: string })?.name !== 'CanceledError') {
        error.value = exception instanceof Error ? exception.message : 'Unable to load catalog items.';
      }
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }

  return { items, total, loading, error, load };
}
