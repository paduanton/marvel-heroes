<script setup lang="ts">
const props = defineProps<{ page: number; perPage: number; total: number }>();
const emit = defineEmits<{ previous: []; next: [] }>();

const hasPrevious = () => props.page > 1;
const hasNext = () => props.page * props.perPage < props.total;
</script>

<template>
  <nav v-if="total > perPage" class="pagination" aria-label="Catalog pages">
    <button type="button" :disabled="!hasPrevious()" @click="emit('previous')">Previous</button>
    <span>Page {{ page }}</span>
    <button type="button" :disabled="!hasNext()" @click="emit('next')">Next</button>
  </nav>
</template>
