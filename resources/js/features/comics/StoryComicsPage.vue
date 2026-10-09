<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { catalogReturnQuery, returnCharacterId } from '@/features/characters/catalogNavigation';
import AsyncPanel from '@/components/AsyncPanel.vue';
import ComicCard from '@/components/ComicCard.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import { focusActivatedRegion } from '@/utils/focus';
import { useStoryComics } from './useStoryComics';

const props = defineProps<{ id: string }>();
const route = useRoute();
const characterId = computed(() => returnCharacterId(route.query));
const resultsRegion = ref<HTMLElement | null>(null);
const { comics, total, page, perPage, loading, error, next, previous, retry } = useStoryComics(() => props.id);
</script>

<template>
  <nav class="discovery-return" aria-label="Return navigation">
    <RouterLink v-if="characterId" class="back-link" :to="{ name: 'character-detail', params: { id: characterId }, query: catalogReturnQuery(route.query) }">Back to character</RouterLink>
    <RouterLink class="back-link" :to="{ name: 'characters', query: catalogReturnQuery(route.query) }">Back to characters</RouterLink>
  </nav>
  <section class="catalog-hero catalog-hero--compact"><p class="eyebrow">Story library</p><h1>Related comics</h1><p class="lead">Browse the comic issues attached to this Marvel story.</p></section>
  <section ref="resultsRegion" class="retry-region" tabindex="-1" aria-label="Comic results">
    <AsyncPanel :loading="loading" :error="error" :empty="comics.length === 0" empty-message="No comics are available for this story.">
      <section class="comic-grid">
        <ComicCard v-for="comic in comics" :key="comic.id" :comic="comic" />
      </section>
    </AsyncPanel>
    <button v-if="error && !loading" type="button" class="retry-comics" @click="focusActivatedRegion($event, resultsRegion); retry()">Try comics again</button>
    <PaginationControls v-if="!loading" :page="page" :per-page="perPage" :total="total" :focus-target="resultsRegion" @previous="previous" @next="next" />
  </section>
</template>

<style scoped>
.discovery-return { display: flex; flex-wrap: wrap; gap: 12px 24px; }

.retry-comics {
  display: block;
  min-height: 44px;
  max-width: 100%;
  margin: 16px auto 0;
  padding: 9px 14px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #111827;
}

.retry-comics:focus-visible {
  outline: 3px solid #e62429;
  outline-offset: 3px;
}
</style>
