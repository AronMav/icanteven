import { mount } from 'svelte';
import '@fontsource-variable/golos-text';
import '@fontsource/shantell-sans/cyrillic-400.css';
import '@fontsource/shantell-sans/latin-400.css';
import './styles.css';
import App from './App.svelte';
mount(App, { target: document.getElementById('app')! });
