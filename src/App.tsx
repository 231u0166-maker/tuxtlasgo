import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import AppShell from './components/AppShell';
import ProviderPanel from './components/ProviderPanel';
import AdminPanel from './components/AdminPanel';
import AuthScreen from './components/AuthScreen';
import { seedDemoSiVacio, listarServiciosAprobadosComoLugares } from './lib/db';
import { setCatalogoExtendido } from './lib/chatbot';
import { getUsuarioLocal, type UsuarioSesion } from './lib/auth';

export default function App() {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(getUsuarioLocal);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await seedDemoSiVacio();
        const aprobados = await listarServiciosAprobadosComoLugares();
        setCatalogoExtendido(aprobados);
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
        <Route path="/" element={<LandingPage usuario={usuario} onUsuario={setUsuario} />} />
        <Route path="/auth" element={
          usuario ? <Navigate to="/app" replace /> : <AuthScreen onSuccess={(u) => setUsuario(u)} />
        } />
        <Route path="/app" element={<AppShell usuario={usuario} onUsuario={setUsuario} />} />
        <Route path="/prestador" element={<ProviderPanel />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}