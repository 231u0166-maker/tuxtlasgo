import { Link } from 'react-router-dom';
import {
  ArrowLeft, Briefcase, User, LogOut,
  Compass, Map, MessageCircle, Heart, TreePine,
} from 'lucide-react';
import { useState } from 'react';
import { apiLogout, getUsuarioLocal, type UsuarioSesion } from '../lib/auth';
import AuthModal from './AuthModal';
import BottomNav, { type Tab } from './BottomNav';
import ExploreScreen from './ExploreScreen';
import { getCatalogoActivo } from '../lib/chatbot';
import MapScreen from './MapScreen';
import ChatAssistant from './ChatAssistant';
import FavoritesScreen from './FavoritesScreen';
import PlaceDetail from './PlaceDetail';
import OfflineIndicator from './OfflineIndicator';
import type { Lugar } from '../data/lugares';
import { obtenerRutaPorCarretera, type Coord } from '../lib/routing';

interface RutaVisible {
  geometria: Coord[];
  paradas: { coord: Coord; orden: number }[];
}

const TABS: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: 'explorar', label: 'Explorar', icon: Compass },
  { id: 'mapa', label: 'Mapa', icon: Map },
  { id: 'chat', label: 'Asistente IA', icon: MessageCircle },
  { id: 'favoritos', label: 'Mis lugares', icon: Heart },
];

export default function AppShell() {
  const [tab, setTab] = useState<Tab>('explorar');
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(getUsuarioLocal());
  const [mostrarAuth, setMostrarAuth] = useState(false);
  const [lugarSeleccionado, setLugarSeleccionado] = useState<Lugar | null>(null);
  const [rutaVisible, setRutaVisible] = useState<RutaVisible | null>(null);
  const [cargandoRuta, setCargandoRuta] = useState(false);
  const [errorRuta, setErrorRuta] = useState<string | null>(null);

  const verLugar = (l: Lugar) => setLugarSeleccionado(l);
  const verEnMapa = async () => {
    if (!lugarSeleccionado) return;
    const destino = lugarSeleccionado;
    setLugarSeleccionado(null);
    setCargandoRuta(true);
    setErrorRuta(null);

    const paradas = [{ coord: destino.coords as Coord, orden: 1 }];

    // Intentar obtener ubicación del usuario
    const obtenerOrigen = (): Promise<Coord | null> =>
      new Promise((res) => {
        if (!navigator.geolocation) return res(null);
        navigator.geolocation.getCurrentPosition(
          (pos) => res([pos.coords.latitude, pos.coords.longitude]),
          () => res(null),
          { timeout: 4000 }
        );
      });

    const origen = await obtenerOrigen();
    const coords: Coord[] = origen
      ? [origen, destino.coords as Coord]
      : [destino.coords as Coord];

    try {
      if (coords.length >= 2) {
        const ruta = await obtenerRutaPorCarretera(coords);
        setRutaVisible({ geometria: ruta.geometria, paradas });
      } else {
        setRutaVisible({ geometria: coords, paradas });
      }
    } catch {
      // Sin internet → línea recta silenciosa, sin mostrar error
      setRutaVisible({ geometria: coords, paradas });
    }
    setCargandoRuta(false);
    setTab('mapa');
  };

  const verRutaEnMapa = async (lugares: Lugar[]) => {
    if (lugares.length < 2) return;
    setCargandoRuta(true);
    setErrorRuta(null);
    setLugarSeleccionado(null);
    const paradas = lugares.map((l, i) => ({ coord: l.coords as Coord, orden: i + 1 }));
    try {
      const ruta = await obtenerRutaPorCarretera(lugares.map((l) => l.coords as Coord));
      setRutaVisible({ geometria: ruta.geometria, paradas });
      setTab('mapa');
    } catch (err) {
      console.warn('[TuxtlasGO] OSRM no disponible:', err);
      // Línea recta entre paradas — silencioso, sin toast de error
      setRutaVisible({ geometria: lugares.map((l) => l.coords as Coord), paradas });
      setTab('mapa');
    } finally {
      setCargandoRuta(false);
    }
  };

  const cambiarTab = (nuevoTab: Tab) => {
    if (nuevoTab !== 'mapa' && rutaVisible) setRutaVisible(null);
    setTab(nuevoTab);
  };

  return (
    /* ── Layout raíz ── mobile: column flex  |  desktop: row flex ── */
    <div className="flex flex-col lg:flex-row bg-jungle-50 h-screen [height:100dvh]">
      <OfflineIndicator />

      {/* ══════════════ SIDEBAR (solo desktop) ══════════════ */}
      <aside className="hidden lg:flex flex-col w-56 xl:w-64 flex-shrink-0 bg-jungle-900 text-white">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-jungle-700/50">
          <Link to="/" className="flex items-center gap-2 group">
            <TreePine size={22} className="text-amber-400" />
            <span className="font-display font-extrabold text-lg tracking-tight group-hover:text-amber-300 transition-colors">
              TuxtlasGO
            </span>
          </Link>
          <p className="text-[11px] text-jungle-400 mt-0.5">Los Tuxtlas, Veracruz</p>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const activo = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => cambiarTab(t.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activo
                  ? 'bg-jungle-700 text-white shadow-sm'
                  : 'text-jungle-300 hover:bg-jungle-800 hover:text-white'
                  }`}
              >
                <Icon size={18} strokeWidth={activo ? 2.5 : 2} />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Acciones de usuario */}
        <div className="px-3 py-4 border-t border-jungle-700/50 space-y-2">
          <Link
            to="/prestador"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-jungle-300 hover:bg-jungle-800 hover:text-white transition-all"
          >
            <Briefcase size={16} />
            Portal prestadores
          </Link>

          <Link to="/perfil" className="text-xs text-jungle-300 hover:text-white underline">
            Mi perfil
          </Link>

          {usuario ? (
            <div className="flex items-center gap-2 px-3 py-2">
              <User size={15} className="text-jungle-400 flex-shrink-0" />
              <span className="text-sm text-jungle-200 truncate flex-1">{usuario.nombre.split(' ')[0]}</span>
              <button
                onClick={async () => { await apiLogout(); setUsuario(null); }}
                className="text-jungle-400 hover:text-red-400 transition-colors"
                title="Cerrar sesión"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setMostrarAuth(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-jungle-950 transition-colors"
            >
              <User size={16} />
              Iniciar sesión
            </button>



          )}

        </div>
      </aside>

      {/* ══════════════ ÁREA PRINCIPAL ══════════════ */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">

        {/* Header flotante móvil (solo mobile, en desktop no aparece) */}
        <div className="absolute top-3 left-3 z-30 flex items-center gap-2 lg:hidden">
          <Link
            to="/"
            className="bg-white/90 backdrop-blur shadow-md rounded-full w-9 h-9 flex items-center justify-center text-jungle-900 hover:bg-white"
          >
            <ArrowLeft size={18} />
          </Link>
          <Link
            to="/prestador"
            className="bg-white/90 backdrop-blur shadow-md rounded-full px-3 h-9 flex items-center gap-1 text-xs font-semibold text-jungle-800 hover:bg-white border border-jungle-200"
          >
            <Briefcase size={13} /> Soy prestador
          </Link>
          {usuario ? (
            <div className="flex items-center gap-1">
              <div className="bg-white/90 backdrop-blur shadow-md rounded-full px-3 h-9 flex items-center gap-1 text-xs font-semibold text-jungle-800 border border-jungle-200">
                <User size={13} />
                <span className="max-w-[80px] truncate">{usuario.nombre.split(' ')[0]}</span>
              </div>
              <button
                onClick={async () => { await apiLogout(); setUsuario(null); }}
                className="bg-white/90 backdrop-blur shadow-md rounded-full w-9 h-9 flex items-center justify-center text-jungle-600 hover:text-red-500 border border-jungle-200"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setMostrarAuth(true)}
              className="bg-jungle-700 text-white shadow-md rounded-full px-3 h-9 flex items-center gap-1 text-xs font-semibold hover:bg-jungle-800"
            >
              <User size={13} /> Entrar
            </button>
          )}
        </div>

        {/* Toast error ruta */}
        {errorRuta && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-amber-100 border border-amber-300 text-amber-900 text-xs px-3 py-2 rounded-lg shadow-md max-w-xs text-center">
            {errorRuta}
            <button onClick={() => setErrorRuta(null)} className="ml-2 font-bold">×</button>
          </div>
        )}

        {/* Overlay carga ruta */}
        {cargandoRuta && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
            <div className="bg-white rounded-2xl px-6 py-5 shadow-xl flex flex-col items-center gap-3 max-w-xs">
              <div className="w-8 h-8 border-2 border-jungle-200 border-t-jungle-700 rounded-full animate-spin" />
              <div className="text-sm font-semibold text-jungle-900">Calculando ruta…</div>
              <div className="text-xs text-jungle-600 text-center">
                Trazando el camino por carretera. Se guardará para usarse sin internet.
              </div>
            </div>
          </div>
        )}

        {/* Contenido principal */}
        <main className="flex-1 overflow-hidden min-h-0">
          {tab === 'explorar' && (
            <div className="h-full overflow-y-auto">
              <ExploreScreen onVerLugar={verLugar} lugares={getCatalogoActivo()} />
            </div>
          )}
          {tab === 'mapa' && (
            <MapScreen
              onVerLugar={verLugar}
              rutaResaltada={rutaVisible?.geometria}
              paradasResaltadas={rutaVisible?.paradas}
              onLimpiarRuta={() => setRutaVisible(null)}
            />
          )}
          <div style={{ display: tab === 'chat' ? 'flex' : 'none', height: '100%', flexDirection: 'column' }}>
            <ChatAssistant onVerLugar={verLugar} onVerRutaEnMapa={verRutaEnMapa} />
          </div>
          {tab === 'favoritos' && (
            <div className="h-full overflow-y-auto">
              <FavoritesScreen
                onVerLugar={verLugar}
                onVerRutaEnMapa={(lugares) => { verRutaEnMapa(lugares); setTab('mapa'); }}
              />
            </div>
          )}
        </main>

        {/* Bottom nav solo en móvil */}
        <div className="lg:hidden">
          <BottomNav activa={tab} onChange={cambiarTab} />
        </div>
      </div>

      {/* PlaceDetail overlay */}
      {lugarSeleccionado && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998, touchAction: 'none' }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
          <PlaceDetail
            lugar={lugarSeleccionado}
            onClose={() => setLugarSeleccionado(null)}
            onVerEnMapa={verEnMapa}
          />
        </>
      )}

      {mostrarAuth && (
        <AuthModal
          onClose={() => setMostrarAuth(false)}
          onSuccess={(u: UsuarioSesion) => { setUsuario(u); setMostrarAuth(false); }}
        />
      )}
    </div>
  );
}
