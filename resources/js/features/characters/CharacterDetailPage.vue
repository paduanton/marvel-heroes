<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import AsyncPanel from '@/components/AsyncPanel.vue';
import CatalogImage from '@/components/CatalogImage.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import { displayDate, excerpt, initials } from '@/utils/formatters';
import { focusActivatedRegion } from '@/utils/focus';
import { useCharacterDetail } from './useCharacterDetail';

const props = defineProps<{ id: string }>();
const characterRegion = ref<HTMLElement | null>(null);
const storiesRegion = ref<HTMLElement | null>(null);
const { character, stories, loading, error, retryCharacter, storiesLoading, storiesError,
  storiesPage, storiesPerPage, storiesTotal, nextStories, previousStories, retryStories } = useCharacterDetail(() => props.id);
</script>

<template>
  <RouterLink class="back-link" to="/">Back to characters</RouterLink>
  <section ref="characterRegion" class="retry-region" tabindex="-1" aria-label="Character details">
    <AsyncPanel :loading="loading" :error="error" :empty="!character" empty-message="This character is not available.">
      <section v-if="character" class="character-hero">
        <div class="character-hero__portrait">
          <CatalogImage :src="character.image_url" :alt="character.name" :fallback="initials(character.name)" large loading="eager" />
        </div>
        <div class="character-hero__copy">
          <p class="eyebrow">Character dossier</p>
          <h1>{{ character.name }}</h1>
          <p class="lead">{{ excerpt(character.description, 520) }}</p>
          <p v-if="displayDate(character.modified_at)" class="metadata">Last updated by Marvel: {{ displayDate(character.modified_at) }}</p>
        </div>
      </section>

      <section ref="storiesRegion" class="related-section retry-region" tabindex="-1" aria-label="Related stories">
        <div class="section-heading"><div><p class="eyebrow">Related stories</p><h2>Stories to explore next</h2></div></div>
        <AsyncPanel :loading="storiesLoading" :error="storiesError" :empty="stories.length === 0" empty-message="No related stories are available for this character.">
          <div class="story-list">
            <article v-for="story in stories" :key="story.id" class="story-item">
              <div><p class="story-type">{{ story.type ?? 'Story' }}</p><h3>{{ story.title }}</h3><p>{{ story.counts.comics }} related comics</p></div>
              <RouterLink :to="{ name: 'story-comics', params: { id: story.id } }">View comics</RouterLink>
            </article>
          </div>
        </AsyncPanel>
        <button v-if="storiesError && !storiesLoading" type="button" class="retry-stories" @click="focusActivatedRegion($event, storiesRegion); retryStories()">Try stories again</button>
        <PaginationControls v-if="!storiesLoading" :page="storiesPage" :per-page="storiesPerPage" :total="storiesTotal" :focus-target="storiesRegion" @previous="previousStories" @next="nextStories" />
      </section>
    </AsyncPanel>
    <button v-if="error && !loading" type="button" class="retry-button" @click="focusActivatedRegion($event, characterRegion); retryCharacter()">Try character again</button>
  </section>
</template>

<style scoped>
.retry-button, .retry-stories {
  display: block;
  min-height: 44px;
  max-width: 100%;
  margin: 16px auto 0;
  padding: 9px 14px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #111827;
}

.retry-button:focus-visible, .retry-stories:focus-visible {
  outline: 3px solid #e62429;
  outline-offset: 3px;
}
</style>
