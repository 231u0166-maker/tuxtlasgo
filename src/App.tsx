import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import AppShell from './components/AppShell';
import ProviderPanel from './components/ProviderPanel';
import { seedDemoSiVacio, listarServiciosAprobadosComoLugares } from './lib/db';
import { setCatalogoExtendido } from './lib/chatbot';

export default function App() {
  useEffect(() => {
    // Al arrancar la app: seed inicial + cargar prestadores aprobados
    // en el catálogo del motor para que aparezcan en recomendaciones,
    // rutas y búsquedas del asistente, no solo en el mapa.
    (async () => {
      try {
        await seedDemoSiVacio();
        const aprobados = await listarServiciosAprobadosComoLugares();
        setCatalogoExtendido(aprobados);
      } catch (err) {
        console.error('[TuxtlasGO] Error inicializando catálogo:', err);
      }
    })();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<AppShell />} />
        <Route path="/prestador" element={<ProviderPanel />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  );
}
