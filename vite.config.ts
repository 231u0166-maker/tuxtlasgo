import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// PWA + Workbox: cachea la app shell, los tiles del mapa OSM y las imágenes
// para que TuxtlasGO funcione 100% offline una vez visitada con internet.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'favicon.ico',
        'logo-tuxtlasgo.png',
        'icons/*.png',
      ],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,json}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        // Cuando el navegador rechaza por cuota, workbox limpia sus cachés.
        // Sin esto, un QuotaExceeded congela el service worker.
        runtimeCaching: [
          {
            // Tiles de OpenStreetMap. Bajamos a 800 entradas (suficiente
            // para cubrir Los Tuxtlas a varios zooms) y solo cacheamos
            // respuestas 200 — nada de respuestas opacas/error.
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: {
                maxEntries: 800,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Imágenes de Unsplash
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'place-images',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Fotos de prestadores en Cloudinary — caché offline
            urlPattern: /^https:\/\/res\.cloudinary\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cloudinary-fotos',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 60,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // API de servicios aprobados — NetworkFirst para tener datos frescos
            // pero fallback a caché si no hay internet
            urlPattern: /\/api\/servicios\/aprobados/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-servicios',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      manifest: {
        name: 'TuxtlasGO',
        short_name: 'TuxtlasGO',
        description:
          'Plataforma turística inteligente de Los Tuxtlas — funciona sin internet.',
        theme_color: '#047857',
        background_color: '#f0fdf4',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'es-MX',
        categories: ['travel', 'navigation', 'lifestyle'],
        icons: [
          { src: 'icons/icon-72.png',   sizes: '72x72',   type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-96.png',   sizes: '96x96',   type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-128.png',  sizes: '128x128', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-144.png',  sizes: '144x144', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-152.png',  sizes: '152x152', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-192.png',  sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-384.png',  sizes: '384x384', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png',  sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
