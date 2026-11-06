<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Search, X } from '@lucide/vue';
import AsyncPanel from '@/components/AsyncPanel.vue';
import ComicEditionCard from '@/components/ComicEditionCard.vue';
import PaginationControls from '@/components/PaginationControls.vue';
import { useCatalogSearch } from '@/composables/useCatalogSearch';
import { searchComics } from '@/services/catalog';
import { focusActivatedRegion } from '@/utils/focus';

const route = useRoute();
const results = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const composing = ref(false);
const { items, total, loading, error, stale, source, requestedSource, search, page, perPage,
  first, previous, next, retry, canRetry, startLocal, submitSearch, clearSearch } =
  useCatalogSearch(useRouter(), 'comics', 'Marvel comics', searchComics);

function clear(event?: KeyboardEvent) {
  if (composing.value || event?.isComposing) return;
  event?.preventDefault();
  void clearSearch();
  input.value?.focus();
}
</script>

<template>
  <section class="edition-heading">
    <h1>Marvel comics</h1>
    <form class="edition-search" role="search" aria-label="Comic search" @submit.prevent="!composing && submitSearch()">
      <label class="sr-only" for="comic-search">Search comics</label>
      <input id="comic-search" ref="input" v-model="search" type="search" placeholder="Search by title or series" autocomplete="off" @keydown.esc="clear" @compositionstart="composing = true" @compositionend="composing = false" />
      <button v-if="search" type="button" title="Clear search" aria-label="Clear search" @click="clear()"><X :size="20" aria-hidden="true" /></button>
      <button type="submit" title="Apply search" aria-label="Apply search"><Search :size="20" aria-hidden="true" /></button>
    </form>
  </section>

  <section ref="results" class="retry-region" tabindex="-1" aria-label="Comic results" :aria-busy="loading">
    <p v-if="!loading && !error" class="edition-count" role="status">{{ total }} {{ total === 1 ? 'edition' : 'editions' }}<template v-if="source === 'local'"> · Local catalog</template></p>
    <AsyncPanel :loading="loading" :error="error" :stale="stale" :empty="items.length === 0" empty-message="No comics match this search.">
      <div class="edition-grid">
        <ComicEditionCard v-for="comic in items" :key="comic.id" :comic="comic" :to="{ name: 'comic-detail', params: { id: comic.id }, query: route.query }" />
      </div>
    </AsyncPanel>
    <div v-if="canRetry" class="edition-actions">
      <button type="button" @click="focusActivatedRegion($event, results); retry()">Try comics again</button>
      <button v-if="requestedSource !== 'local'" type="button" @click="focusActivatedRegion($event, results); startLocal()">Browse local catalog</button>
    </div>
    <PaginationControls v-if="!loading && !error" :page="page" :per-page="perPage" :total="total" :focus-target="results" @first="first" @previous="previous" @next="next" />
    <p v-if="source === 'local' && !loading && !error" class="edition-attribution">Metadata adapted from <a href="https://www.comics.org/">Grand Comics Database</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></p>
  </section>
</template>

<style scoped>
.edition-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; padding-bottom: 22px; border-bottom: 1px solid #cbd5e1; }
.edition-heading h1 { margin: 0; font-size: 2rem; }
.edition-search { display: flex; width: min(100%, 400px); min-width: 0; border: 1px solid #94a3b8; border-radius: 6px; background: #fff; }
.edition-search input { min-width: 0; flex: 1; border: 0; padding: 8px 12px; background: transparent; font: inherit; }
.edition-search input::-webkit-search-cancel-button { display: none; }
.edition-search button { display: grid; width: 44px; min-height: 44px; flex: 0 0 44px; place-items: center; padding: 0; border: 0; color: #334155; background: transparent; }
.edition-search button:hover { background: #e2e8f0; }
.edition-search :focus-visible { outline: 3px solid #b91c1c; outline-offset: -3px; }
.edition-count, .edition-attribution { margin: 16px 0; color: #475569; font-size: .875rem; }
.edition-attribution a { text-decoration: underline; }
.edition-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 136px), 1fr)); gap: 16px; }
.edition-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
.edition-actions button { min-height: 44px; padding: 8px 12px; border: 1px solid #94a3b8; background: #fff; color: #111827; }
</style>
