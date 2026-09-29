import { onScopeDispose, ref, watch } from 'vue';
import { useAsyncCollection } from '@/composables/useAsyncCollection';
import { getCharacter, listStories } from '@/services/catalog';
import type { Character, Story } from '@/types/catalog';

export function useCharacterDetail(characterId: () => string) {
  const character = ref<Character | null>(null);
  const { items: stories, loading: storiesLoading, error: storiesError, load: loadStories, reset: resetStories } = useAsyncCollection<Story>();
  const loading = ref(true);
  const error = ref<string | null>(null);
  let controller: AbortController | undefined;

  onScopeDispose(() => {
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

  watch(characterId, (id) => {
    character.value = null;
    resetStories();
    void load(id);
    void loadStories((signal) => listStories(id, { page: 1, perPage: 10 }, signal));
  }, { immediate: true });
  return { character, stories, loading, error, storiesLoading, storiesError };
}
