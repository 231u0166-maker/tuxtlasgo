import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './lib/i18n';
import './styles/index.css';

// El registro del Service Worker ahora vive en
// src/components/ActualizacionDisponible.tsx, usando el hook
// useRegisterSW (en vez de la llamada imperativa registerSW de aquí)
// — así el registro vive dentro del árbol de React y puede mostrar un
// aviso visible ("hay una versión nueva") en vez de actualizar en
// silencio. Ver ese archivo para el porqué completo.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>
);
