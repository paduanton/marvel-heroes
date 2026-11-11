<script setup lang="ts">
import type { CatalogSource } from '@/types/catalog';

defineProps<{ source: CatalogSource }>();
</script>

<template>
  <p class="edition-attribution">
    Metadata adapted from
    <a v-if="source === 'live'" href="https://metron.cloud/">Metron</a>
    <a v-else href="https://www.comics.org/">Grand Comics Database</a>
    · <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>
  </p>
</template>

<style scoped>
.edition-attribution { margin: 16px 0; color: #475569; font-size: .875rem; }
.edition-attribution a { text-decoration: underline; }
</style>
