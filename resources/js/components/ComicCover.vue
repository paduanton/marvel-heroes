<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Comic } from '@/types/catalog';

const props = defineProps<{ comic: Comic; eager?: boolean }>();
const failed = ref(false);
watch(() => props.comic.image_url, () => { failed.value = false; });
const issueNumber = computed(() => props.comic.title.match(/#([0-9]+)$/)?.[1]);
const palette = computed(() => props.comic.id % 4);
</script>

<template>
  <div class="edition-cover" :class="`edition-cover--${palette}`">
    <img v-if="comic.image_url && !failed" :src="comic.image_url" :alt="`Cover of ${comic.title}`" :loading="eager ? 'eager' : 'lazy'" @error="failed = true" />
    <template v-else>
      <span aria-hidden="true" class="edition-cover__print">{{ issueNumber ? `#${issueNumber}` : 'MH' }}</span>
      <span class="edition-cover__label">Illustrative cover</span>
    </template>
  </div>
</template>

<style scoped>
.edition-cover { position: relative; display: grid; place-items: center; isolation: isolate; overflow: hidden; aspect-ratio: 2 / 3; background: #16353a; color: #f4fbf7; }
.edition-cover--1 { background: #75273a; color: #fff1d9; }
.edition-cover--2 { background: #26446a; color: #e8f6ff; }
.edition-cover--3 { background: #584530; color: #fff1c8; }
.edition-cover::before { position: absolute; z-index: -1; inset: 11%; content: ''; border: 2px solid currentColor; transform: rotate(-12deg); }
.edition-cover__print { font-size: 3.5rem; font-weight: 800; line-height: 1; }
.edition-cover__label { position: absolute; bottom: 0; width: 100%; padding: 6px; background: #111827; color: #fff; text-align: center; font-size: .75rem; }
.edition-cover img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: contain; background: #111827; }
</style>
