<script setup lang="ts">
import { ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

const route = useRoute();
const navigationStart = ref<HTMLElement | null>(null);
const mainContent = ref<HTMLElement | null>(null);

watch(() => route.path, () => navigationStart.value?.focus({ preventScroll: true }), { flush: 'post' });
</script>

<template>
  <div class="shell">
    <span ref="navigationStart" class="sr-only" tabindex="-1"></span>
    <a class="skip-link" href="#main-content" @click.prevent="mainContent?.focus()">Skip to main content</a>
    <header class="topbar">
      <RouterLink class="brand" to="/" aria-label="Marvel Heroes home">
        <span class="brand-mark">MH</span>
        <span>Marvel Heroes</span>
      </RouterLink>
      <nav aria-label="Primary navigation">
        <RouterLink to="/">Characters</RouterLink>
      </nav>
    </header>
    <main id="main-content" ref="mainContent" class="content" tabindex="-1"><RouterView /></main>
  </div>
</template>
