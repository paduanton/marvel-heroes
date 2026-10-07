import { ref, watch } from 'vue';
import { useAsyncCollection } from '@/composables/useAsyncCollection';
import { listComics } from '@/services/catalog';
import type { Comic } from '@/types/catalog';

export function useStoryComics(storyId: () => string) {
  const { items: comics, total, loading, error, load: loadCollection, reset } = useAsyncCollection<Comic>();
  const page = ref(1);
  const perPage = 20;

  function load() {
    return loadCollection((signal) => listComics(storyId(), { page: page.value, perPage }, signal));
  }

  function next() {
    if (loading.value || page.value * perPage >= total.value) return;
    page.value += 1;
    return load();
  }

  function previous() {
    if (loading.value || page.value <= 1) return;
    page.value -= 1;
    return load();
  }

  function retry() {
    if (loading.value || !error.value) return;
    return load();
  }

  watch(storyId, () => {
    page.value = 1;
    reset();
    void load();
  }, { immediate: true });

  return { comics, total, page, perPage, loading, error, next, previous, retry };
}
