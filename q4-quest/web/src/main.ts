import '@fontsource/vt323/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './app.css';
import { mount } from 'svelte';
import { initTheme } from './lib/theme';
import App from './App.svelte';

initTheme();
mount(App, { target: document.getElementById('app')! });
