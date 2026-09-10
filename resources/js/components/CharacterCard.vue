<script setup lang="ts">
import type { Character } from '@/types/catalog';
import { excerpt, initials } from '@/utils/formatters';

defineProps<{ character: Character }>();
</script>

<template>
  <article class="character-card">
    <RouterLink :to="{ name: 'character-detail', params: { id: character.id } }" class="character-card__image" :aria-label="`View ${character.name}`">
      <img v-if="character.image_url" :src="character.image_url" :alt="character.name" loading="lazy" />
      <span v-else class="image-fallback" aria-hidden="true">{{ initials(character.name) }}</span>
    </RouterLink>
    <div class="character-card__body">
      <h2><RouterLink :to="{ name: 'character-detail', params: { id: character.id } }">{{ character.name }}</RouterLink></h2>
      <p>{{ excerpt(character.description) }}</p>
    </div>
  </article>
</template>
