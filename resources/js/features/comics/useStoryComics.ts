import { computed, onScopeDispose, ref, watch } from 'vue';
import type { Router } from 'vue-router';
import { catalogPage } from '@/features/characters/catalogNavigation';
import { useAsyncCollection } from '@/composables/useAsyncCollection';
import { listComics } from '@/services/catalog';
import type { Comic } from '@/types/catalog';

export function useStoryComics(storyId: () => string, router?: Router) {
  const { items: comics, total, loading, error, stale, load: loadCollection, reset } = useAsyncCollection<Comic>();
  const localPage = ref(1);
  const page = computed(() => router ? catalogPage(router.currentRoute.value.query.comics_page) : localPage.value);
  const perPage = 20;
  let disposed = false;
  onScopeDispose(() => { disposed = true; });

  function load() {
    return loadCollection((signal) => listComics(storyId(), { page: page.value, perPage }, signal));
  }

  function next() {
    if (disposed || loading.value || page.value * perPage >= total.value) return;
    return changePage(page.value + 1);
  }

  function first() {
    if (disposed || loading.value || page.value <= 1) return;
    return changePage(1);
  }

  function previous() {
    if (disposed || loading.value || page.value <= 1) return;
    return changePage(page.value - 1);
  }

  function retry() {
    if (disposed || loading.value || !error.value) return;
    return load();
  }

  function changePage(target: number) {
    if (router) return router.push({
      name: 'story-comics', params: { id: storyId() },
      query: { ...router.currentRoute.value.query, comics_page: target > 1 ? String(target) : undefined },
    });
    localPage.value = target;
    return load();
  }

  watch(storyId, () => {
    localPage.value = 1;
    reset();
    if (!router) void load();
  }, { immediate: true });
  if (router) watch([storyId, page], () => {
    if (router.currentRoute.value.name === 'story-comics') void load();
  }, { immediate: true });

  return { comics, total, page, perPage, loading, error, stale, first, next, previous, retry };
}
