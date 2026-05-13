import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/index.css';

// Registro automático del Service Worker (Workbox).
// Auto-update cuando hay nueva versión.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    // En consola para debugging durante la demo
    if (registration) {
      console.log('[TuxtlasGO] Service Worker activo. App lista para offline.');
    }
  },
  onOfflineReady() {
    console.log('[TuxtlasGO] Listo para usarse sin conexión.');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
