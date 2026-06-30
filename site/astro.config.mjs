import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// Static build, served as flat files by Caddy's file_server.
// Default directory URLs (`/privacy/` -> `privacy/index.html`) resolve natively.
export default defineConfig({
  site: 'https://trackie.nz',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      tsconfigPaths: true,
    },
  },
});
