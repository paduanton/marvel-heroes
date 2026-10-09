import { computed, onScopeDispose, ref, watch } from 'vue';
import type { Router } from 'vue-router';
import { useAsyncCollection } from '@/composables/useAsyncCollection';
import { listCharacters } from '@/services/catalog';
import type { Character } from '@/types/catalog';

export function useCharacterCatalog(router: Router) {
  const route = router.currentRoute;
  const appliedQuery = computed(() => typeof route.value.query.query === 'string' ? route.value.query.query.trim() : '');
  const queryLength = computed(() => Array.from(appliedQuery.value).length);
  const page = computed(() => {
    const value = route.value.query.page;
    const parsed = typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : 1;
    return Number.isSafeInteger(parsed) ? parsed : 1;
  });
  const draft = ref(appliedQuery.value);
  const perPage = 20;
  const collection = useAsyncCollection<Character>();
  const canRetry = computed(() => route.value.name === 'characters'
    && queryLength.value !== 1 && queryLength.value <= 100
    && !collection.loading.value && !!collection.error.value);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const title = computed(() => appliedQuery.value ? `Results for "${appliedQuery.value}"` : 'Discover Marvel characters');

  function navigate(query: string, targetPage: number) {
    return router.push({
      name: 'characters',
      query: { ...route.value.query, query: query || undefined, page: targetPage > 1 ? String(targetPage) : undefined },
    });
  }

  const search = computed({
    get: () => draft.value,
    set: (value: string) => {
      if (disposed) return;
      draft.value = value;
      clearTimeout(debounceTimer);
      if (value.trim() === appliedQuery.value) return;
      debounceTimer = setTimeout(() => {
        if (!disposed && route.value.name === 'characters') void navigate(value.trim(), 1);
      }, 300);
    },
  });

  function submitSearch() {
    if (disposed || route.value.name !== 'characters') return;
    clearTimeout(debounceTimer);
    const query = draft.value.trim();
    if (query === appliedQuery.value) return;
    return navigate(query, 1);
  }

  function clearSearch() {
    if (disposed || route.value.name !== 'characters') return;
    clearTimeout(debounceTimer);
    draft.value = '';
    if (appliedQuery.value || page.value > 1) return navigate('', 1);
  }

  function next() {
    if (!disposed && !collection.loading.value && page.value * perPage < collection.total.value) {
      return navigate(appliedQuery.value, page.value + 1);
    }
  }

  function previous() {
    if (!disposed && !collection.loading.value && page.value > 1) {
      return navigate(appliedQuery.value, page.value - 1);
    }
  }

  function loadCatalog() {
    return collection.load((signal) => listCharacters({ query: appliedQuery.value, page: page.value, perPage }, signal));
  }

  function retry() {
    if (disposed || !canRetry.value) return;
    return loadCatalog();
  }

  watch(
    [() => route.value.name, () => route.value.query.query, () => route.value.query.page],
    () => {
      clearTimeout(debounceTimer);
      if (route.value.name !== 'characters') {
        collection.reset();
        return;
      }
      draft.value = appliedQuery.value;
      const length = queryLength.value;
      if (length === 1 || length > 100) {
        collection.reset();
        collection.error.value = length === 1
          ? 'Search must contain at least two characters.'
          : 'Search must contain at most 100 characters.';
        return;
      }
      void loadCatalog();
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    disposed = true;
    clearTimeout(debounceTimer);
  });

  return { ...collection, search, page, perPage, title, next, previous, retry, canRetry, submitSearch, clearSearch };
}
