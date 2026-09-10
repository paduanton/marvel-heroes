<script setup lang="ts">
defineProps<{ loading: boolean; error: string | null; empty: boolean; emptyMessage: string }>();
</script>

<template>
  <div v-if="loading" class="status-panel" role="status">Loading catalog data...</div>
  <div v-else-if="error" class="status-panel status-panel--error" role="alert">{{ error }}</div>
  <div v-else-if="empty" class="status-panel">{{ emptyMessage }}</div>
  <slot v-else />
</template>
