import { defineConfig, loadEnv, type HtmlTagDescriptor } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { copy } from './src/lib/copy.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['SITE_', 'VITE_STATS_']);
  let statsOrigin = "'none'";
  if (env.VITE_STATS_ENDPOINT) {
    const endpoint = new URL(env.VITE_STATS_ENDPOINT);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
    if ((endpoint.protocol !== 'https:' && !(loopback && endpoint.protocol === 'http:'))
      || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/events') {
      throw new Error('VITE_STATS_ENDPOINT must be an HTTPS /events URL without credentials, query or fragment (HTTP allowed on loopback).');
    }
    statsOrigin = endpoint.origin;
  }
  const siteUrl = new URL(env.SITE_URL || 'https://яневывожу.рф/');
  if (!['https:', 'http:'].includes(siteUrl.protocol) || siteUrl.search || siteUrl.hash || siteUrl.username || siteUrl.password) {
    throw new Error('SITE_URL must be an absolute HTTP(S) URL without credentials, query or fragment.');
  }
  if (!siteUrl.pathname.endsWith('/')) siteUrl.pathname += '/';
  const imageUrl = new URL('og-image.png', siteUrl).href;
  const meta = (key: string, content: string): HtmlTagDescriptor => ({
    tag: 'meta', attrs: { [key.startsWith('og:') ? 'property' : 'name']: key, content }, injectTo: 'head',
  });
  return {
    base: './',
    plugins: [
      svelte(),
      {
        name: 'social-preview',
        transformIndexHtml() {
          return [
            { tag: 'title', children: copy.pageTitle, injectTo: 'head' },
            { tag: 'link', attrs: { rel: 'canonical', href: siteUrl.href }, injectTo: 'head' },
            meta('description', copy.pageDescription),
            meta('og:type', 'website'),
            meta('og:locale', 'ru_RU'),
            meta('og:site_name', copy.brand),
            meta('og:title', copy.brand),
            meta('og:description', copy.shareLine),
            meta('og:url', siteUrl.href),
            meta('og:image', imageUrl),
            meta('og:image:type', 'image/png'),
            meta('og:image:width', '1200'),
            meta('og:image:height', '630'),
            meta('og:image:alt', copy.shareImageAlt),
            meta('twitter:card', 'summary_large_image'),
            meta('twitter:title', copy.brand),
            meta('twitter:description', copy.shareLine),
            meta('twitter:image', imageUrl),
            meta('twitter:image:alt', copy.shareImageAlt),
          ] satisfies HtmlTagDescriptor[];
        },
      },
      {
        name: 'theme-before-first-paint',
        transformIndexHtml: {
          order: 'post',
          handler() {
            return [{ tag: 'script', attrs: { src: './theme-init.js' }, injectTo: 'head' }];
          },
        },
      },
      {
        name: 'production-privacy-policy',
        apply: 'build',
        transformIndexHtml() {
          return [{ tag: 'meta', attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ${statsOrigin}; object-src 'none'; base-uri 'self'; form-action 'none'; frame-src 'none'`,
          }, injectTo: 'head-prepend' }];
        },
      },
    ],
  };
});
