import { createRouter, createWebHistory } from 'vue-router';
import CharacterCatalogPage from '@/features/characters/CharacterCatalogPage.vue';
import CharacterDetailPage from '@/features/characters/CharacterDetailPage.vue';
import StoryComicsPage from '@/features/comics/StoryComicsPage.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'characters', component: CharacterCatalogPage },
    { path: '/characters/:id', name: 'character-detail', component: CharacterDetailPage, props: true },
    { path: '/stories/:id/comics', name: 'story-comics', component: StoryComicsPage, props: true },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
