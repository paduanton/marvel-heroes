<script setup lang="ts">
import { ref } from 'vue';

withDefaults(defineProps<{
  src: string | null;
  alt: string;
  fallback: string;
  large?: boolean;
  loading?: 'lazy' | 'eager';
}>(), { large: false, loading: 'lazy' });

const failed = ref(false);
</script>

<template>
  <img v-if="src && !failed" :src="src" :alt="alt" :loading="loading" @error="failed = true" />
  <span v-else class="image-fallback" :class="{ 'image-fallback--large': large }" aria-hidden="true">{{ fallback }}</span>
</template>
