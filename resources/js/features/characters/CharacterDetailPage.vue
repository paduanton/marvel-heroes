<script setup lang="ts">
import { RouterLink } from 'vue-router';
import AsyncPanel from '@/components/AsyncPanel.vue';
import { displayDate, excerpt, initials } from '@/utils/formatters';
import { useCharacterDetail } from './useCharacterDetail';

const props = defineProps<{ id: string }>();
const { character, stories, loading, error, storiesLoading, storiesError } = useCharacterDetail(() => props.id);
</script>

<template>
  <RouterLink class="back-link" to="/">Back to characters</RouterLink>
  <AsyncPanel :loading="loading" :error="error" :empty="!character" empty-message="This character is not available.">
    <section v-if="character" class="character-hero">
      <div class="character-hero__portrait">
        <img v-if="character.image_url" :src="character.image_url" :alt="character.name" />
        <span v-else class="image-fallback image-fallback--large" aria-hidden="true">{{ initials(character.name) }}</span>
      </div>
      <div class="character-hero__copy">
        <p class="eyebrow">Character dossier</p>
        <h1>{{ character.name }}</h1>
        <p class="lead">{{ excerpt(character.description, 520) }}</p>
        <p v-if="displayDate(character.modified_at)" class="metadata">Last updated by Marvel: {{ displayDate(character.modified_at) }}</p>
      </div>
    </section>

    <section class="related-section">
      <div class="section-heading"><div><p class="eyebrow">Related stories</p><h2>Stories to explore next</h2></div></div>
      <AsyncPanel :loading="storiesLoading" :error="storiesError" :empty="stories.length === 0" empty-message="No related stories are available for this character.">
        <div class="story-list">
          <article v-for="story in stories" :key="story.id" class="story-item">
            <div><p class="story-type">{{ story.type ?? 'Story' }}</p><h3>{{ story.title }}</h3><p>{{ story.counts.comics }} related comics</p></div>
            <RouterLink :to="{ name: 'story-comics', params: { id: story.id } }">View comics</RouterLink>
          </article>
        </div>
      </AsyncPanel>
    </section>
  </AsyncPanel>
</template>
