<script setup lang="ts">
import { computed } from 'vue';
import CatalogImage from '@/components/CatalogImage.vue';
import type { Comic } from '@/types/catalog';
import { displayDate, excerpt } from '@/utils/formatters';

const props = defineProps<{ comic: Comic }>();
const publicationDate = computed(() => displayDate(props.comic.on_sale_at));
</script>

<template>
  <article class="comic-card">
    <div class="comic-card__image"><CatalogImage :src="comic.image_url" :alt="comic.title" fallback="MH" /></div>
    <div>
      <p class="eyebrow">{{ comic.format ?? 'Comic' }}</p>
      <h2>{{ comic.title }}</h2>
      <p>{{ excerpt(comic.description, 120, 'No official description is available for this comic.') }}</p>
      <p v-if="publicationDate" class="comic-publication">On sale: <time :datetime="comic.on_sale_at ?? undefined">{{ publicationDate }}</time></p>
    </div>
  </article>
</template>

<style scoped>
.comic-publication { margin-top: 14px; padding-top: 12px; border-top: 1px solid #dbe3ee; }
</style>
