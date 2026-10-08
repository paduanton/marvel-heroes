<script setup lang="ts">
import { focusActivatedRegion } from '@/utils/focus';

const props = defineProps<{ page: number; perPage: number; total: number; focusTarget?: HTMLElement | null }>();
const emit = defineEmits<{ previous: []; next: [] }>();

const hasPrevious = () => props.page > 1;
const hasNext = () => props.page * props.perPage < props.total;

function navigate(event: MouseEvent, direction: 'previous' | 'next') {
  focusActivatedRegion(event, props.focusTarget ?? null);
  if (direction === 'previous') emit('previous');
  else emit('next');
}
</script>

<template>
  <nav v-if="total > perPage" class="pagination" aria-label="Catalog pages">
    <button type="button" :disabled="!hasPrevious()" @click="navigate($event, 'previous')">Previous</button>
    <span>Page {{ page }}</span>
    <button type="button" :disabled="!hasNext()" @click="navigate($event, 'next')">Next</button>
  </nav>
</template>
