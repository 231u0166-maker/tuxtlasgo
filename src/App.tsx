import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import AppShell from './components/AppShell';
import ProviderPanel from './components/ProviderPanel';
import AdminPanel from './components/AdminPanel';
import { seedDemoSiVacio, listarServiciosAprobadosComoLugares } from './lib/db';
import { setCatalogoExtendido } from './lib/chatbot';
import { getUsuarioLocal, type UsuarioSesion } from './lib/auth';
import { embeddingsListo, indexarCatalogo } from './lib/embeddings';

// Función global para recargar catálogo (usada por GestorFotos y ProviderPanel)
// Pre-cachea imágenes de Cloudinary para que estén disponibles offline
async function precachearImagenes(lugares: any[]) {
  if (!('caches' in window)) return;
  const cache = await caches.open('cloudinary-fotos');
  const urls: string[] = [];
  for (const l of lugares) {
    if (l.imagen && l.imagen.includes('cloudinary')) urls.push(l.imagen);
    if (l.imagenesExtra) urls.push(...l.imagenesExtra.filter((u: string) => u.includes('cloudinary')));
  }
  // Cachear en paralelo, ignorar errores individuales
  await Promise.allSettled(
    urls.map(url => cache.add(url).catch(() => {}))
  );
}

export async function recargarCatalogo() {
  try {
    const aprobadosLocal = await listarServiciosAprobadosComoLugares();
    const res = await fetch('/api/servicios/aprobados');
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.lugares?.length > 0) {
        // Neon gana para IDs compartidos — sus datos son siempre más frescos
        // que los de IndexedDB local (que pueden estar desactualizados tras una edición).
        // Los de IndexedDB solo aportan servicios que Neon todavía no conoce (raro).
        const idsNeon = new Set(data.lugares.map((l: any) => l.id));
        const soloLocales = aprobadosLocal.filter((l: any) => !idsNeon.has(l.id));
        const todos = [...data.lugares, ...soloLocales];
        setCatalogoExtendido(todos);
        precachearImagenes(todos).catch(() => {});
        // Si la IA ya está activa en esta sesión, re-indexa en segundo
        // plano para que un prestador recién aprobado aparezca de
        // inmediato en la búsqueda semántica (no solo tras recargar).
        if (embeddingsListo()) indexarCatalogo(todos).catch(() => {});
        return todos;
      }
    }
    setCatalogoExtendido(aprobadosLocal);
    if (embeddingsListo()) indexarCatalogo(aprobadosLocal).catch(() => {});
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