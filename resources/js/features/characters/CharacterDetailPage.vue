<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import AsyncPanel from '@/components/AsyncPanel.vue';
import { getCharacter, listStories } from '@/services/catalog';
import type { Character, Story } from '@/types/catalog';
import { displayDate, excerpt, initials } from '@/utils/formatters';

const props = defineProps<{ id: string }>();
const character = ref<Character | null>(null);
const stories = ref<Story[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [characterResult, storiesResult] = await Promise.all([
      getCharacter(props.id),
      listStories(props.id, { page: 1, perPage: 10 }),
    ]);
    character.value = characterResult;
    stories.value = storiesResult.data;
  } catch (exception) {
    error.value = exception instanceof Error ? exception.message : 'Unable to load this character.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
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
      <div v-if="stories.length" class="story-list">
        <article v-for="story in stories" :key="story.id" class="story-item">
          <div><p class="story-type">{{ story.type ?? 'Story' }}</p><h3>{{ story.title }}</h3><p>{{ story.counts.comics }} related comics</p></div>
          <RouterLink :to="{ name: 'story-comics', params: { id: story.id } }">View comics</RouterLink>
        </article>
      </div>
      <p v-else class="status-panel">No related stories are available for this character.</p>
    </section>
  </AsyncPanel>
</template>
