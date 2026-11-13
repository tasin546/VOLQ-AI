import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function preloadOutfitFont(): Plugin {
  return {
    name: 'volq-preload-outfit-font',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        const outfitLatin = Object.keys(ctx.bundle).find(
          (name) => name.includes('outfit-latin-wght-normal') && name.endsWith('.woff2')
        );
        if (!outfitLatin) return html;
        const tag = `    <link rel="preload" as="font" type="font/woff2" crossorigin href="/${outfitLatin}" />\n`;
        return html.replace('</head>', `${tag}  </head>`);
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), preloadOutfitFont()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/healthz': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/manifest.webmanifest': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/healthz': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/manifest.webmanifest': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});
