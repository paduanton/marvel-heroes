<script setup lang="ts">
import CatalogImage from '@/components/CatalogImage.vue';
import { useRoute } from 'vue-router';
import { catalogReturnQuery } from '@/features/characters/catalogNavigation';
import type { Character } from '@/types/catalog';
import { excerpt, initials } from '@/utils/formatters';

defineProps<{ character: Character }>();
const route = useRoute();
</script>

<template>
  <article class="character-card">
    <RouterLink :to="{ name: 'character-detail', params: { id: character.id }, query: catalogReturnQuery(route.query) }" class="character-card__image" :aria-label="`View ${character.name}`">
      <CatalogImage :src="character.image_url" :alt="character.name" :fallback="initials(character.name)" />
    </RouterLink>
    <div class="character-card__body">
      <h2><RouterLink :to="{ name: 'character-detail', params: { id: character.id }, query: catalogReturnQuery(route.query) }">{{ character.name }}</RouterLink></h2>
      <p>{{ excerpt(character.description) }}</p>
    </div>
  </article>
</template>

<style scoped>
@media (prefers-reduced-motion: reduce) {
  .character-card :deep(img) {
    transition: none;
  }

  .character-card:hover :deep(img) {
    transform: none;
  }
}
</style>
