<script setup lang="ts">
import { ChevronLeft, ChevronRight, ChevronsLeft } from '@lucide/vue';
import { focusActivatedRegion } from '@/utils/focus';

const props = defineProps<{ page: number; perPage: number; total: number; focusTarget?: HTMLElement | null }>();
const emit = defineEmits<{ first: []; previous: []; next: [] }>();

const hasPrevious = () => props.page > 1;
const hasNext = () => props.page * props.perPage < props.total;

function navigate(event: MouseEvent, direction: 'first' | 'previous' | 'next') {
  focusActivatedRegion(event, props.focusTarget ?? null);
  if (direction === 'first') emit('first');
  else if (direction === 'previous') emit('previous');
  else emit('next');
}
</script>

<template>
  <nav v-if="page > 1 || total > perPage" class="pagination" aria-label="Catalog pages">
    <button type="button" aria-label="First page" title="First page" :disabled="!hasPrevious()" @click="navigate($event, 'first')"><ChevronsLeft :size="20" aria-hidden="true" /></button>
    <button type="button" aria-label="Previous" title="Previous page" :disabled="!hasPrevious()" @click="navigate($event, 'previous')"><ChevronLeft :size="20" aria-hidden="true" /></button>
    <span>Page {{ page }}</span>
    <button type="button" aria-label="Next" title="Next page" :disabled="!hasNext()" @click="navigate($event, 'next')"><ChevronRight :size="20" aria-hidden="true" /></button>
  </nav>
</template>
