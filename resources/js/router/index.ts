import { createRouter, createWebHistory } from 'vue-router';
import CharacterCatalogPage from '@/features/characters/CharacterCatalogPage.vue';
import CharacterDetailPage from '@/features/characters/CharacterDetailPage.vue';
import StoryComicsPage from '@/features/comics/StoryComicsPage.vue';
import AccountPage from '@/features/identity/AccountPage.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/account', name: 'account', component: AccountPage, props: { mode: 'account' }, meta: { title: 'Your account' } },
    { path: '/login', name: 'login', component: AccountPage, props: { mode: 'login' }, meta: { title: 'Sign in' } },
    { path: '/register', name: 'register', component: AccountPage, props: { mode: 'register' }, meta: { title: 'Create account' } },
    { path: '/', name: 'characters', component: CharacterCatalogPage, meta: { title: 'Characters' } },
    { path: '/characters/:id', name: 'character-detail', component: CharacterDetailPage, props: true, meta: { title: 'Character details' } },
    { path: '/stories/:id/comics', name: 'story-comics', component: StoryComicsPage, props: true, meta: { title: 'Related comics' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: (to, from, savedPosition) => savedPosition ?? (to.path === from.path ? false : { top: 0 }),
});
