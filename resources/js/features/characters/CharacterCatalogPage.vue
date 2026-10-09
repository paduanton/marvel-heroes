<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Search, X } from '@lucide/vue';
import AsyncPanel from '@/components/AsyncPanel.vue';
import CharacterCard from '@/components/CharacterCard.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import { focusActivatedRegion } from '@/utils/focus';
import { useCharacterCatalog } from './useCharacterCatalog';

const { search, page, perPage, title, items, total, loading, error, next, previous, retry, canRetry, submitSearch, clearSearch } = useCharacterCatalog(useRouter());
const resultsRegion = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const isComposing = ref(false);

function clear() {
  if (isComposing.value) return;
  void clearSearch();
  searchInput.value?.focus();
}

function submit() {
  if (isComposing.value) return;
  void submitSearch();
}
</script>

<template>
  <section class="catalog-hero">
    <p class="eyebrow">Marvel character archive</p>
    <h1>{{ title }}</h1>
    <p class="lead">Explore the people, stories, and comics that make up the Marvel universe.</p>
    <form class="search-field" role="search" aria-label="Character search" novalidate @submit.prevent="submit">
      <label class="sr-only" for="character-search">Search characters</label>
      <input id="character-search" ref="searchInput" v-model="search" type="search" minlength="2" placeholder="Search a character name" autocomplete="off" @keydown.esc.prevent="clear" @compositionstart="isComposing = true" @compositionend="isComposing = false" />
      <button v-if="search" type="button" class="search-action" aria-label="Clear search" title="Clear search" @click="clear"><X :size="20" /></button>
      <button type="submit" class="search-action" aria-label="Apply search" title="Apply search"><Search :size="20" /></button>
    </form>
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
    <button v-if="canRetry" type="button" class="retry-catalog" @click="focusActivatedRegion($event, resultsRegion); retry()">Try characters again</button>
    <PaginationControls v-if="!loading" :page="page" :per-page="perPage" :total="total" :focus-target="resultsRegion" @previous="previous" @next="next" />
  </section>
</template>

<style scoped>
.search-field { padding: 0 4px 0 8px; }
.search-field input { min-width: 0; flex: 1; }
.search-field input::-webkit-search-cancel-button { display: none; }
.search-action { display: grid; place-items: center; flex: 0 0 44px; width: 44px; height: 44px; padding: 0; border: 0; color: #475569; background: transparent; }
.search-action:hover { background: #f1f5f9; }
.search-action:focus-visible { outline: 3px solid #e62429; outline-offset: -3px; }

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
