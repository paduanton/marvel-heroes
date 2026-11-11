<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import AsyncPanel from '@/components/AsyncPanel.vue';
import ComicCover from '@/components/ComicCover.vue';
import { characterReturnQuery, returnCharacterId } from '@/features/characters/catalogNavigation';
import { getComic } from '@/services/catalog';
import type { ComicResource } from '@/types/catalog';
import { displayPublicationDate } from '@/utils/formatters';
import { focusActivatedRegion } from '@/utils/focus';
import ComicSourceAttribution from './ComicSourceAttribution.vue';

const props = defineProps<{ id: string }>();
const route = useRoute();
const result = ref<ComicResource>();
const loading = ref(true);
const error = ref<string | null>(null);
const retry = ref(0);
const details = ref<HTMLElement | null>(null);
const publicationDate = computed(() => displayPublicationDate(result.value?.data.on_sale_at ?? null));
const characterId = computed(() => returnCharacterId(route.query));

watch([() => props.id, retry], async ([id], _, onCleanup) => {
  const request = new AbortController();
  onCleanup(() => request.abort());
  result.value = undefined;
  error.value = null;
  loading.value = true;
  try {
    const response = await getComic(id, request.signal);
    if (!request.signal.aborted) result.value = response;
  } catch (exception) {
    if (!request.signal.aborted) error.value = exception instanceof Error ? exception.message : 'Unable to load this comic.';
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}, { immediate: true });
</script>

<template>
  <RouterLink v-if="characterId" class="back-link" :to="{ name: 'character-detail', params: { id: characterId }, query: characterReturnQuery(route.query) }">Back to character</RouterLink>
  <RouterLink v-else class="back-link" :to="{ name: 'comics', query: route.query }">Back to comics</RouterLink>
  <section ref="details" class="retry-region" tabindex="-1" aria-label="Comic details" :aria-busy="loading">
    <h1 v-if="!result" class="edition-title">Comic details</h1>
    <AsyncPanel :loading="loading" :error="error" :stale="result?.meta.cache.state === 'stale'" :empty="!result" empty-message="This comic is not available.">
      <div v-if="result" class="edition-detail">
        <ComicCover :comic="result.data" eager />
        <div>
          <p class="eyebrow">{{ result.data.format ?? 'Comic' }}</p>
          <h1 class="edition-title">{{ result.data.title }}</h1>
          <p v-if="result.meta.source === 'local'">Local catalog</p>
          <p v-if="publicationDate">On sale: <time :datetime="result.data.on_sale_at ?? undefined">{{ publicationDate }}</time></p>
          <p v-if="result.data.description" class="edition-description">{{ result.data.description }}</p>
          <ComicSourceAttribution v-if="result.meta.source" :source="result.meta.source" />
        </div>
      </div>
    </AsyncPanel>
    <button v-if="error && !loading" type="button" class="edition-retry" @click="focusActivatedRegion($event, details); retry++">Try comic again</button>
  </section>
</template>

<style scoped>
.edition-detail { display: grid; grid-template-columns: minmax(0, 260px) minmax(0, 1fr); gap: 28px; align-items: start; }
.edition-title { font-size: 2rem; line-height: 1.15; overflow-wrap: anywhere; }
.edition-description { max-width: 62ch; white-space: pre-line; overflow-wrap: anywhere; }
.edition-retry { min-height: 44px; margin-top: 16px; padding: 8px 12px; border: 1px solid #94a3b8; background: #fff; color: #111827; }
@media (max-width: 640px) { .edition-detail { grid-template-columns: 1fr; gap: 20px; } .edition-detail :deep(.edition-cover) { width: min(100%, 240px); } }
</style>
