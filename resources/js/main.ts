import { createApp } from 'vue';
import App from './app/App.vue';
import router from './router';
import './app/styles.css';

createApp(App).use(router).mount('#app');
