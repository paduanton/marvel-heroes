<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router';
import ComicCover from './ComicCover.vue';
import type { Comic } from '@/types/catalog';

defineProps<{ comic: Comic; to: RouteLocationRaw }>();
</script>

<template>
  <article class="edition-card">
    <ComicCover :comic="comic" />
    <h2><RouterLink :to="to">{{ comic.title }}</RouterLink></h2>
  </article>
</template>

<style scoped>
.edition-card { position: relative; min-width: 0; border: 1px solid #dbe3ee; border-radius: 6px; overflow: hidden; background: #fff; }
.edition-card h2 { margin: 0; padding: 12px; font-size: 1rem; line-height: 1.4; overflow-wrap: anywhere; }
.edition-card a::after { position: absolute; inset: 0; content: ''; }
.edition-card:focus-within { outline: 3px solid #b91c1c; outline-offset: 3px; }
</style>
