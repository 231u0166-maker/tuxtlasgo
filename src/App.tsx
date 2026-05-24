import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import AppShell from './components/AppShell';
import ProviderPanel from './components/ProviderPanel';
import AdminPanel from './components/AdminPanel';
import { seedDemoSiVacio, listarServiciosAprobadosComoLugares } from './lib/db';
import { setCatalogoExtendido } from './lib/chatbot';
import { getUsuarioLocal, type UsuarioSesion } from './lib/auth';

// Función global para recargar catálogo (usada por GestorFotos y ProviderPanel)
export async function recargarCatalogo() {
  try {
    const aprobadosLocal = await listarServiciosAprobadosComoLugares();
    const res = await fetch('/api/servicios/aprobados');
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.lugares?.length > 0) {
        const idsLocales = new Set(aprobadosLocal.map((l: any) => l.id));
        const nuevosDeNeon = data.lugares.filter((l: any) => !idsLocales.has(l.id));
        setCatalogoExtendido([...aprobadosLocal, ...nuevosDeNeon]);
        return [...aprobadosLocal, ...nuevosDeNeon];
      }
    }
    setCatalogoExtendido(aprobadosLocal);
    return aprobadosLocal;
  } catch {
    return [];
  }
}

export default function App() {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(getUsuarioLocal);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await seedDemoSiVacio();
        await recargarCatalogo();
      } catch (err) {
        console.error('[TuxtlasGO] Error inicializando:', err);
      } finally {
        setListo(true);
      }
    })();
  }, []);

  if (!listo) return null;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<AppShell />} />
        <Route path="/prestador" element={<ProviderPanel />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}