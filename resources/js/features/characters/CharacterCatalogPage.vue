<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AsyncPanel from '@/components/AsyncPanel.vue';
import CharacterCard from '@/components/CharacterCard.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import { focusRetryRegion } from '@/utils/focus';
import { useCharacterCatalog } from './useCharacterCatalog';

const { search, page, perPage, title, items, total, loading, error, next, previous, retry, canRetry } = useCharacterCatalog(useRouter());
const resultsRegion = ref<HTMLElement | null>(null);
</script>

<template>
  <section class="catalog-hero">
    <p class="eyebrow">Marvel character archive</p>
    <h1>{{ title }}</h1>
    <p class="lead">Explore the people, stories, and comics that make up the Marvel universe.</p>
    <label class="search-field">
      <span class="sr-only">Search characters</span>
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" /></svg>
      <input v-model="search" type="search" minlength="2" placeholder="Search a character name" autocomplete="off" />
    </label>
  </section>

  <section ref="resultsRegion" class="catalog-section retry-region" tabindex="-1" aria-label="Character results" aria-live="polite">
    <div class="section-heading">
      <p>{{ total }} characters in the archive</p>
    </div>
    <AsyncPanel :loading="loading" :error="error" :empty="items.length === 0" empty-message="No characters match this search yet.">
      <div class="character-grid">
        <CharacterCard v-for="character in items" :key="character.id" :character="character" />
      </div>
    </AsyncPanel>
    <button v-if="canRetry" type="button" class="retry-catalog" @click="focusRetryRegion($event, resultsRegion); retry()">Try characters again</button>
    <PaginationControls v-if="!loading" :page="page" :per-page="perPage" :total="total" @previous="previous" @next="next" />
  </section>
</template>

<style scoped>
.retry-catalog {
  display: block;
  min-height: 44px;
  max-width: 100%;
  margin: 16px auto 0;
  padding: 9px 14px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #111827;
}

.retry-catalog:focus-visible {
  outline: 3px solid #e62429;
  outline-offset: 3px;
}
</style>
