<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <RouterLink class="brand" to="/" aria-label="Marvel Heroes home">
        <span class="brand-mark">MH</span>
        <span>Marvel Heroes</span>
      </RouterLink>
      <nav aria-label="Primary navigation">
        <RouterLink to="/">Characters</RouterLink>
      </nav>
    </header>
    <main class="content"><RouterView /></main>
  </div>
</template>
