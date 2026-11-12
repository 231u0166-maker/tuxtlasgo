import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import ActualizacionDisponible from './components/ActualizacionDisponible';
import AvisoPrivacidad from './components/AvisoPrivacidad';
import { getUsuarioLocal, type UsuarioSesion } from './lib/auth';

// ============================================================
// APP LIGERA — solo la landing viaja en el JS inicial
// ============================================================
// Lighthouse (móvil, 4G lenta, CPU 4× más lenta) medía un LCP de ~8 s porque la
// landing esperaba a que se bajara y ejecutara TODO: chat, base de datos, motor de
// recomendación, mapa. Ahora todo eso es un chunk aparte que se pide al entrar a
// /app (o en la landing, unos segundos después de pintar). El arranque en sí
// (catálogo, conocimiento, modelo de IA) vive en ./arranque.ts.
const AppShell = lazy(() => import('./components/AppShell'));
const ProviderPanel = lazy(() => import('./components/ProviderPanel'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const GaleriaPage = lazy(() => import('./components/GaleriaPage'));
const TerminosPage = lazy(() => import('./components/TerminosPage'));
const PrivacidadPage = lazy(() => import('./components/PrivacidadPage'));
const CopyrightPage = lazy(() => import('./components/CopyrightPage'));
const DiagnosticoIA = lazy(() => import('./components/DiagnosticoIA'));

const cargarArranque = () => import('./arranque');

// Entrar directo a /app: pedir el chunk de la pantalla EN PARALELO con el arranque
// (antes se pedía recién cuando el arranque terminaba: una cascada más en la ruta crítica).
if (typeof location !== 'undefined' && location.pathname.startsWith('/app')) {
  void import('./components/AppShell');
}

// ============================================================
// PWA INSTALADA — saltar la landing de marketing
// ============================================================
// Abrir el ícono desde la pantalla de inicio caía SIEMPRE en "/" (la landing),
// aunque la app ya estuviera instalada. Cambiar `start_url` en el manifest
// arregla las instalaciones NUEVAS, pero un ícono viejo puede traerlo grabado:
// esta revisión en tiempo de carga es el respaldo real (display-mode standalone
// en Android/escritorio, `navigator.standalone` en iOS Safari).
function corriendoComoPWAInstalada(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if ((window.navigator as { standalone?: boolean }).standalone === true) return true;
  return false;
}

// Las pantallas que leen la base de datos / el catálogo esperan SOLO lo local
// (nunca la red: con señal débil eso dejaba la app en blanco hasta 6 s).
// `esperar={false}` (turista en /app): pinta YA y deja la preparación local corriendo en
// paralelo. Inicio no depende de ella: arranca con el catálogo fijo y, cuando termina,
// setCatalogoExtendido avisa y AppShell se actualiza. Prestador/Admin sí la esperan.
function ConArranque({ children, esperar = true }: { children: ReactNode; esperar?: boolean }) {
  const [listo, setListo] = useState(!esperar);
  useEffect(() => {
    let vivo = true;
    cargarArranque()
      .then(async (m) => {
        await m.prepararLocal();
        m.arrancarSegundoPlano();
      })
      .catch((e) => console.error('[TuxtlasGO] Arranque:', e))
      .finally(() => { if (vivo) setListo(true); });
    return () => { vivo = false; };
  }, []);
  return listo ? <>{children}</> : null;
}

export default function App() {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(getUsuarioLocal);
  const [conDiagnostico, setConDiagnostico] = useState(false);

  useEffect(() => {
    // En la landing el arranque (catálogo, conocimiento, IA) empieza unos segundos
    // DESPUÉS de pintar, para que no compita con el LCP. Es idempotente: si el
    // usuario entra a /app antes, ConArranque ya lo habrá iniciado.
    const t1 = window.setTimeout(() => {
      cargarArranque().then((m) => m.arrancarSegundoPlano()).catch(() => {});
    }, 4000);
    const t2 = window.setTimeout(() => setConDiagnostico(true), 6000);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);

  return (
    <BrowserRouter>
      {conDiagnostico && (
        <Suspense fallback={null}>
          <DiagnosticoIA />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <Routes>
          <Route
            path="/"
            element={
              corriendoComoPWAInstalada()
                ? <ConArranque esperar={false}><AppShell /></ConArranque>
                : <LandingPage usuario={usuario} onUsuario={setUsuario} />
            }
          />
          <Route path="/app" element={<ConArranque esperar={false}><AppShell /></ConArranque>} />
          <Route path="/prestador" element={<ConArranque><ProviderPanel /></ConArranque>} />
          <Route path="/admin" element={<ConArranque><AdminPanel /></ConArranque>} />
          <Route path="/galeria" element={<ConArranque><GaleriaPage /></ConArranque>} />
          <Route path="/comunidad" element={<Navigate to="/app?tab=comunidad" replace />} />
          <Route path="/terminos" element={<TerminosPage />} />
          <Route path="/privacidad" element={<PrivacidadPage />} />
          <Route path="/copyright" element={<CopyrightPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <ActualizacionDisponible />
      <AvisoPrivacidad />
    </BrowserRouter>
  );
}
