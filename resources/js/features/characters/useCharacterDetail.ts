import { computed, onScopeDispose, ref, watch } from 'vue';
import type { Router } from 'vue-router';
import { useAsyncCollection } from '@/composables/useAsyncCollection';
import { getCharacter, listStories } from '@/services/catalog';
import type { Character, Story } from '@/types/catalog';
import { catalogPage } from './catalogNavigation';

export function useCharacterDetail(characterId: () => string, router?: Router) {
  const character = ref<Character | null>(null);
  const { items: stories, total: storiesTotal, loading: storiesLoading, error: storiesError, stale: storiesStale, load: loadStories, reset: resetStories } = useAsyncCollection<Story>();
  const characterStale = ref(false);
  const localStoriesPage = ref(1);
  const storiesPage = computed(() => router ? catalogPage(router.currentRoute.value.query.stories_page) : localStoriesPage.value);
  const storiesPerPage = 10;
  const loading = ref(true);
  const error = ref<string | null>(null);
  let controller: AbortController | undefined;
  let disposed = false;

  onScopeDispose(() => {
    disposed = true;
    controller?.abort();
    loading.value = false;
    characterStale.value = false;
  });

  async function load(id: string) {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = null;
    characterStale.value = false;
    try {
      const result = await getCharacter(id, request.signal);
      if (!request.signal.aborted) {
        character.value = result.data;
        characterStale.value = result.meta?.cache?.state === 'stale';
      }
    } catch (exception) {
      if (!request.signal.aborted) {
        error.value = exception instanceof Error ? exception.message : 'Unable to load this character.';
      }
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }

  function loadStoriesPage(id: string) {
    return loadStories((signal) => listStories(id, { page: storiesPage.value, perPage: storiesPerPage }, signal));
  }

  function retryCharacter() {
    if (disposed || loading.value || !error.value) return;
    return load(characterId());
  }

  function nextStories() {
    if (disposed || storiesLoading.value || storiesPage.value * storiesPerPage >= storiesTotal.value) return;
    return changeStoriesPage(storiesPage.value + 1);
  }

  function retryStories() {
    if (disposed || storiesLoading.value || !storiesError.value) return;
    return loadStoriesPage(characterId());
  }

  function firstStories() {
    if (disposed || storiesLoading.value || storiesPage.value <= 1) return;
    return changeStoriesPage(1);
  }

  function previousStories() {
    if (disposed || storiesLoading.value || storiesPage.value <= 1) return;
    return changeStoriesPage(storiesPage.value - 1);
  }

  function changeStoriesPage(page: number) {
    if (router) return router.push({
      name: 'character-detail', params: { id: characterId() },
      query: { ...router.currentRoute.value.query, stories_page: page > 1 ? String(page) : undefined },
    });
    localStoriesPage.value = page;
    return loadStoriesPage(characterId());
  }

  watch(characterId, (id) => {
    character.value = null;
    localStoriesPage.value = 1;
    resetStories();
    void load(id);
    if (!router) void loadStoriesPage(id);
  }, { immediate: true });
  if (router) watch([characterId, storiesPage], ([id]) => {
    if (router.currentRoute.value.name === 'character-detail') void loadStoriesPage(id);
  }, { immediate: true });
  return { character, characterStale, stories, loading, error, retryCharacter, storiesLoading, storiesError, storiesStale,
    storiesPage, storiesPerPage, storiesTotal, firstStories, nextStories, previousStories, retryStories };
}
