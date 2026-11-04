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
    <RouterLink
      :to="{ name: 'character-detail', params: { id: character.id }, query: catalogReturnQuery(route.query) }"
      class="character-card__link"
      :aria-label="character.name"
    >
      <div class="character-card__image">
        <CatalogImage :src="character.image_url" :alt="character.name" :fallback="initials(character.name)" />
      </div>
      <div class="character-card__body">
        <h2>{{ character.name }}</h2>
        <p>{{ excerpt(character.description) }}</p>
      </div>
    </RouterLink>
  </article>
</template>

<style scoped>
.character-card__link { display: block; height: 100%; }
.character-card__link:focus-visible { outline: 3px solid #e62429; outline-offset: 3px; }

@media (prefers-reduced-motion: reduce) {
  .character-card :deep(img) {
    transition: none;
  }

  .character-card:hover :deep(img) {
    transform: none;
  }
}
</style>
