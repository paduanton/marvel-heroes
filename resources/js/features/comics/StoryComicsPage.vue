<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import AsyncPanel from '@/components/AsyncPanel.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import { excerpt } from '@/utils/formatters';
import { focusRetryRegion } from '@/utils/focus';
import { useStoryComics } from './useStoryComics';

const props = defineProps<{ id: string }>();
const resultsRegion = ref<HTMLElement | null>(null);
const { comics, total, page, perPage, loading, error, next, previous, retry } = useStoryComics(() => props.id);
</script>

<template>
  <RouterLink class="back-link" to="/">Back to characters</RouterLink>
  <section class="catalog-hero catalog-hero--compact"><p class="eyebrow">Story library</p><h1>Related comics</h1><p class="lead">Browse the comic issues attached to this Marvel story.</p></section>
  <section ref="resultsRegion" class="retry-region" tabindex="-1" aria-label="Comic results">
    <AsyncPanel :loading="loading" :error="error" :empty="comics.length === 0" empty-message="No comics are available for this story.">
      <section class="comic-grid">
        <article v-for="comic in comics" :key="comic.id" class="comic-card">
          <div class="comic-card__image"><img v-if="comic.image_url" :src="comic.image_url" :alt="comic.title" loading="lazy" /><span v-else class="image-fallback">MH</span></div>
          <div><p class="eyebrow">{{ comic.format ?? 'Comic' }}</p><h2>{{ comic.title }}</h2><p>{{ excerpt(comic.description, 120) }}</p></div>
        </article>
      </section>
    </AsyncPanel>
    <button v-if="error && !loading" type="button" class="retry-comics" @click="focusRetryRegion($event, resultsRegion); retry()">Try comics again</button>
    <PaginationControls v-if="!loading" :page="page" :per-page="perPage" :total="total" @previous="previous" @next="next" />
  </section>
</template>

<style scoped>
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
