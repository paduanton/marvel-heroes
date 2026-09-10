import { ref } from 'vue';
import type { ApiCollection } from '@/types/catalog';

export function useAsyncCollection<T>() {
  const items = ref<T[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let controller: AbortController | undefined;

  async function load(loader: (signal: AbortSignal) => Promise<ApiCollection<T>>) {
    controller?.abort();
    controller = new AbortController();
    loading.value = true;
    error.value = null;
    try {
      const result = await loader(controller.signal);
      items.value = result.data;
      total.value = result.meta.total;
    } catch (exception) {
      if ((exception as { name?: string }).name !== 'CanceledError') {
        error.value = exception instanceof Error ? exception.message : 'Unable to load catalog items.';
      }
    } finally {
      loading.value = false;
    }
  }

  return { items, total, loading, error, load };
}
