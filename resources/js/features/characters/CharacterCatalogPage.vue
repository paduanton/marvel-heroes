<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AsyncPanel from '@/components/AsyncPanel.vue';
import CharacterCard from '@/components/CharacterCard.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import { useAsyncCollection } from '@/composables/useAsyncCollection';
import { listCharacters } from '@/services/catalog';
import type { Character } from '@/types/catalog';

const route = useRoute();
const router = useRouter();
const search = ref(typeof route.query.query === 'string' ? route.query.query : '');
const page = ref(Number(route.query.page ?? 1) || 1);
const perPage = 20;
const { error, items, load: loadCatalog, loading, total } = useAsyncCollection<Character>();
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

const title = computed(() => search.value ? `Results for "${search.value}"` : 'Discover Marvel characters');

function load() {
  loadCatalog((signal) => listCharacters({ query: search.value, page: page.value, perPage }, signal));
}

function updateRoute() {
  router.replace({ query: { ...(search.value ? { query: search.value } : {}), ...(page.value > 1 ? { page: String(page.value) } : {}) } });
}

function next() {
  page.value += 1;
}

function previous() {
  page.value -= 1;
}

watch(search, () => {
  page.value = 1;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    updateRoute();
    load();
  }, 300);
});

watch(page, () => {
  updateRoute();
  load();
});

onMounted(load);
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

  <section class="catalog-section" aria-live="polite">
    <div class="section-heading">
      <p>{{ total }} characters in the archive</p>
    </div>
    <AsyncPanel :loading="loading" :error="error" :empty="items.length === 0" empty-message="No characters match this search yet.">
      <div class="character-grid">
        <CharacterCard v-for="character in items" :key="character.id" :character="character" />
      </div>
      <PaginationControls :page="page" :per-page="perPage" :total="total" @previous="previous" @next="next" />
    </AsyncPanel>
  </section>
</template>
