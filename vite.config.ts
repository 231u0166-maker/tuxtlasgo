import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

// Mismas cabeceras de seguridad que en producción (vercel.json), para probar el CSP en local.
const cabecerasSeguridad = Object.fromEntries(
  (JSON.parse(readFileSync('./vercel.json', 'utf-8')).headers as { source: string; headers: { key: string; value: string }[] }[])
    .filter((h) => h.source === '/(.*)')
    .flatMap((h) => h.headers.map((x) => [x.key, x.value])),
);

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
        // El grafo de calles es grande: se baja aparte (runtimeCaching), no en la instalación
        globIgnores: ['**/grafo-vial.json'],
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
            // Manifiesto (/planet), estilo y sprites de OpenFreeMap: con
            // internet siempre se pide lo vigente (el manifiesto dice qué
            // carpeta de mosaicos existe hoy y cambia cada pocos días);
            // sin internet se usa la copia guardada en la descarga offline.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/(planet\/?(\?.*)?|styles\/.*|sprites\/.*)$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mapa-offline-v1',
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Mosaicos vectoriales y tipos de letra de OpenFreeMap, y
            // mosaicos de satélite (Mapbox / Esri). SIN expiración: es el
            // mismo caché que llena la descarga manual (lib/mapaOffline.ts)
            // y lo descargado no debe borrarse solo a los 30 días.
            urlPattern: /^https:\/\/(tiles\.openfreemap\.org\/(planet|fonts|natural_earth)\/|api\.mapbox\.com\/v4\/mapbox\.satellite\/|server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/)/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mapa-offline-v1',
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Mosaicos de altura (perfil de elevación de las rutas): se conservan al verlos
            // con internet para poder dibujar el perfil después sin conexión
            urlPattern: /^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium\//i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mapa-offline-v1',
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Red de calles para calcular rutas sin internet
            urlPattern: /\/grafo-vial\.json$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'grafo-vial',
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
        // La PWA arranca en la raíz para que la URL que se ve sea
        // go.tuxtlas.xyz y no go.tuxtlas.xyz/app. En modo instalado,
        // App.tsx pinta la app en "/" directo (sin redirigir a /app,
        // que volvería a mostrar esa ruta).
        start_url: '/',
        // `id` fijo en '/app': el id por defecto sale del start_url, y
        // cambiarlo haría que las instalaciones ya hechas se tomen como
        // una app distinta (y no se actualicen). Así conservan su identidad.
        id: '/app',
        scope: '/',
        lang: 'es-MX',
        categories: ['travel', 'navigation', 'lifestyle'],
        icons: [
          { src: 'icons/icon-72.png', sizes: '72x72', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-96.png', sizes: '96x96', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-128.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
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
    headers: cabecerasSeguridad,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});