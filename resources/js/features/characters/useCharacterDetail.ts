import { onScopeDispose, ref, watch } from 'vue';
import { useAsyncCollection } from '@/composables/useAsyncCollection';
import { getCharacter, listStories } from '@/services/catalog';
import type { Character, Story } from '@/types/catalog';

export function useCharacterDetail(characterId: () => string) {
  const character = ref<Character | null>(null);
  const { items: stories, total: storiesTotal, loading: storiesLoading, error: storiesError, load: loadStories, reset: resetStories } = useAsyncCollection<Story>();
  const storiesPage = ref(1);
  const storiesPerPage = 10;
  const loading = ref(true);
  const error = ref<string | null>(null);
  let controller: AbortController | undefined;
  let disposed = false;

  onScopeDispose(() => {
    disposed = true;
    controller?.abort();
    loading.value = false;
  });

  async function load(id: string) {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = null;
    try {
      const result = await getCharacter(id, request.signal);
      if (!request.signal.aborted) character.value = result;
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
    if (storiesLoading.value || storiesPage.value * storiesPerPage >= storiesTotal.value) return;
    storiesPage.value += 1;
    return loadStoriesPage(characterId());
  }

  function retryStories() {
    if (storiesLoading.value || !storiesError.value) return;
    return loadStoriesPage(characterId());
  }

  function previousStories() {
    if (storiesLoading.value || storiesPage.value <= 1) return;
    storiesPage.value -= 1;
    return loadStoriesPage(characterId());
  }

  watch(characterId, (id) => {
    character.value = null;
    storiesPage.value = 1;
    resetStories();
    void load(id);
    void loadStoriesPage(id);
  }, { immediate: true });
  return { character, stories, loading, error, retryCharacter, storiesLoading, storiesError,
    storiesPage, storiesPerPage, storiesTotal, nextStories, previousStories, retryStories };
}
