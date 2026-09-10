<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import AsyncPanel from '@/components/AsyncPanel.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import { listComics } from '@/services/catalog';
import type { Comic } from '@/types/catalog';
import { excerpt } from '@/utils/formatters';

const props = defineProps<{ id: string }>();
const comics = ref<Comic[]>([]);
const total = ref(0);
const page = ref(1);
const perPage = 20;
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const result = await listComics(props.id, { page: page.value, perPage });
    comics.value = result.data;
    total.value = result.meta.total;
  } catch (exception) {
    error.value = exception instanceof Error ? exception.message : 'Unable to load related comics.';
  } finally {
    loading.value = false;
  }
}

function next() { page.value += 1; load(); }
function previous() { page.value -= 1; load(); }

onMounted(load);
</script>

<template>
  <RouterLink class="back-link" to="/">Back to characters</RouterLink>
  <section class="catalog-hero catalog-hero--compact"><p class="eyebrow">Story library</p><h1>Related comics</h1><p class="lead">Browse the comic issues attached to this Marvel story.</p></section>
  <AsyncPanel :loading="loading" :error="error" :empty="comics.length === 0" empty-message="No comics are available for this story.">
    <section class="comic-grid">
      <article v-for="comic in comics" :key="comic.id" class="comic-card">
        <div class="comic-card__image"><img v-if="comic.image_url" :src="comic.image_url" :alt="comic.title" loading="lazy" /><span v-else class="image-fallback">MH</span></div>
        <div><p class="eyebrow">{{ comic.format ?? 'Comic' }}</p><h2>{{ comic.title }}</h2><p>{{ excerpt(comic.description, 120) }}</p></div>
      </article>
    </section>
    <PaginationControls :page="page" :per-page="perPage" :total="total" @previous="previous" @next="next" />
  </AsyncPanel>
</template>
