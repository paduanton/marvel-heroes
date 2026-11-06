<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AsyncPanel from '@/components/AsyncPanel.vue';
import ComicEditionCard from '@/components/ComicEditionCard.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import { useAsyncCollection } from '@/composables/useAsyncCollection';
import { catalogPage } from '@/features/characters/catalogNavigation';
import { listCharacterComics } from '@/services/catalog';
import type { Comic } from '@/types/catalog';
import { focusActivatedRegion } from '@/utils/focus';

const props = defineProps<{ characterId: string }>();
const route = useRoute();
const router = useRouter();
const region = ref<HTMLElement | null>(null);
const page = computed(() => catalogPage(route.query.character_comics_page));
const perPage = 20;
const { items, total, loading, stale, error, load, reset } = useAsyncCollection<Comic>();

function refresh() {
  return load((signal) => listCharacterComics(props.characterId, { page: page.value, perPage }, signal));
}

function paginate(target: number) {
  return router.push({ query: { ...route.query, character_comics_page: target === 1 ? undefined : String(target) } });
}

watch(() => props.characterId, reset);
watch([() => props.characterId, page], () => { void refresh(); }, { immediate: true });
</script>

<template>
  <section ref="region" class="related-section retry-region" tabindex="-1" aria-label="Related comic editions" :aria-busy="loading">
    <div class="section-heading"><h2>Related comics</h2></div>
    <AsyncPanel :loading="loading" :error="error" :stale="stale" :empty="items.length === 0" empty-message="No verified comic appearances are available.">
      <div class="edition-grid">
        <ComicEditionCard v-for="comic in items" :key="comic.id" :comic="comic" :to="{ name: 'comic-detail', params: { id: comic.id }, query: { ...route.query, character: characterId } }" />
      </div>
    </AsyncPanel>
    <button v-if="error && !loading" class="edition-retry" type="button" @click="focusActivatedRegion($event, region); refresh()">Try related comics again</button>
    <PaginationControls v-if="!loading && !error" :page="page" :per-page="perPage" :total="total" :focus-target="region" @first="paginate(1)" @previous="paginate(page - 1)" @next="paginate(page + 1)" />
  </section>
</template>

<style scoped>
.edition-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 136px), 1fr)); gap: 16px; }
.edition-retry { min-height: 44px; margin-top: 16px; padding: 8px 12px; border: 1px solid #94a3b8; background: #fff; color: #111827; }
</style>
