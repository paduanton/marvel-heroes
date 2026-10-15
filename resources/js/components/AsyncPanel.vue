<script setup lang="ts">
defineProps<{ loading: boolean; error: string | null; empty: boolean; emptyMessage: string; stale?: boolean }>();
</script>

<template>
  <p v-if="stale && !loading && !error" class="cache-notice" role="status">Showing cached data. This information may be out of date.</p>
  <div v-if="loading" class="status-panel" role="status">Loading catalog data...</div>
  <div v-else-if="error" class="status-panel status-panel--error" role="alert">{{ error }}</div>
  <div v-else-if="empty" class="status-panel" role="status">{{ emptyMessage }}</div>
  <slot v-else />
</template>

<style scoped>
.cache-notice { margin: 0 0 16px; padding: 10px 12px; border-left: 3px solid #a16207; color: #713f12; background: #fefce8; font-size: 14px; }
</style>
