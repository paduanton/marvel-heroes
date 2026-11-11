<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AsyncPanel from '@/components/AsyncPanel.vue';
import ComicEditionCard from '@/components/ComicEditionCard.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import { useAsyncCollection } from '@/composables/useAsyncCollection';
import { catalogPage } from '@/features/characters/catalogNavigation';
import { listCharacterComics } from '@/services/catalog';
import type { CatalogSource, Comic } from '@/types/catalog';
import { focusActivatedRegion } from '@/utils/focus';
import ComicSourceAttribution from './ComicSourceAttribution.vue';

const props = defineProps<{ characterId: string }>();
const route = useRoute();
const router = useRouter();
const region = ref<HTMLElement | null>(null);
const page = computed(() => catalogPage(route.query.character_comics_page));
const requestedSource = computed(() => {
  const value = route.query.character_comics_source;
  return value === 'local' || value === 'live' ? value : undefined;
});
const perPage = 20;
const { items, total, loading, stale, source, error, load, reset } = useAsyncCollection<Comic>();

function refresh() {
  return load((signal) => listCharacterComics(props.characterId, { page: page.value, perPage, source: requestedSource.value }, signal));
}

function paginate(target: number, selectedSource: CatalogSource | undefined = requestedSource.value ?? source.value) {
  return router.push({ query: {
    ...route.query,
    character_comics_page: target === 1 ? undefined : String(target),
    character_comics_source: selectedSource,
  } });
}

watch(() => props.characterId, reset);
watch([() => props.characterId, page, requestedSource], () => { void refresh(); }, { immediate: true });
</script>

<template>
  <section ref="region" class="related-section retry-region" tabindex="-1" aria-label="Related comic editions" :aria-busy="loading">
    <div class="section-heading"><h2>Related comics</h2></div>
    <AsyncPanel :loading="loading" :error="error" :stale="stale" :empty="items.length === 0" empty-message="No verified comic appearances are available.">
      <div class="edition-grid">
        <ComicEditionCard v-for="comic in items" :key="comic.id" :comic="comic" :to="{ name: 'comic-detail', params: { id: comic.id }, query: { ...route.query, character: characterId } }" />
      </div>
    </AsyncPanel>
    <div v-if="error && !loading" class="edition-actions">
      <button type="button" @click="focusActivatedRegion($event, region); refresh()">Try related comics again</button>
      <button v-if="requestedSource !== 'local'" type="button" @click="focusActivatedRegion($event, region); paginate(1, 'local')">Browse local catalog</button>
    </div>
    <PaginationControls v-if="!loading && !error" :page="page" :per-page="perPage" :total="total" :focus-target="region" @first="paginate(1)" @previous="paginate(page - 1)" @next="paginate(page + 1)" />
    <ComicSourceAttribution v-if="source && !loading && !error" :source="source" />
  </section>
</template>

<style scoped>
.edition-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 136px), 1fr)); gap: 16px; }
.edition-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
.edition-actions button { min-height: 44px; padding: 8px 12px; border: 1px solid #94a3b8; background: #fff; color: #111827; }
</style>
