import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Briefcase } from 'lucide-react';
import BottomNav, { type Tab } from './BottomNav';
import ExploreScreen from './ExploreScreen';
import MapScreen from './MapScreen';
import ChatAssistant from './ChatAssistant';
import FavoritesScreen from './FavoritesScreen';
import PlaceDetail from './PlaceDetail';
import OfflineIndicator from './OfflineIndicator';
import type { Lugar } from '../data/lugares';
import { obtenerRutaPorCarretera, type Coord } from '../lib/routing';

// Ruta visible en el mapa: las paradas numeradas + la geometría del
// trazado por carretera (polyline). Cuando el usuario sale del tab de
// mapa o pide otra ruta, se limpia.
interface RutaVisible {
  geometria: Coord[];
  paradas: { coord: Coord; orden: number }[];
}

export default function AppShell() {
  const [tab, setTab] = useState<Tab>('explorar');
  const [lugarSeleccionado, setLugarSeleccionado] = useState<Lugar | null>(null);
  const [rutaVisible, setRutaVisible] = useState<RutaVisible | null>(null);
  const [cargandoRuta, setCargandoRuta] = useState(false);
  const [errorRuta, setErrorRuta] = useState<string | null>(null);

  const verLugar = (l: Lugar) => setLugarSeleccionado(l);
  const verEnMapa = () => {
    setLugarSeleccionado(null);
    setTab('mapa');
  };

  // Llamado desde el chat cuando hay una ruta del día lista para visualizar.
  // Calcula el trazado por carretera (online la 1ra vez, cache después) y
  // cambia al tab de mapa con la ruta dibujada.
  const verRutaEnMapa = async (lugares: Lugar[]) => {
    if (lugares.length < 2) return;
    setCargandoRuta(true);
    setErrorRuta(null);
    setLugarSeleccionado(null);

    const paradas = lugares.map((l, i) => ({
      coord: l.coords as Coord,
      orden: i + 1,
    }));

    try {
      const ruta = await obtenerRutaPorCarretera(
        lugares.map((l) => l.coords as Coord)
      );
      setRutaVisible({ geometria: ruta.geometria, paradas });
      setTab('mapa');
    } catch (err) {
      // Fallback: si OSRM no responde (sin internet y sin caché),
      // mostramos líneas rectas conectando los puntos. Es menos
      // bonito pero NUNCA deja al usuario sin algo en pantalla.
      console.warn('[TuxtlasGO] OSRM no disponible, usando líneas rectas:', err);
      setRutaVisible({
        geometria: lugares.map((l) => l.coords as Coord),
        paradas,
      });
      setErrorRuta(
        'Trazado aproximado (sin internet). Conéctate una vez para guardar la ruta real.'
      );
      setTab('mapa');
    } finally {
      setCargandoRuta(false);
    }
  };

  return (
    <div className="flex flex-col bg-jungle-50 h-screen [height:100dvh]">
      <OfflineIndicator />

      {/* Mini header con "atrás" + acceso a panel del prestador */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-2">
        <Link
          to="/"
          className="bg-white/90 backdrop-blur shadow-md rounded-full w-9 h-9 flex items-center justify-center text-jungle-900 hover:bg-white"
          aria-label="Volver al inicio"
        >
          <ArrowLeft size={18} />
        </Link>
        <Link
          to="/prestador"
          className="bg-white/90 backdrop-blur shadow-md rounded-full px-3 h-9 flex items-center gap-1 text-xs font-semibold text-jungle-800 hover:bg-white border border-jungle-200"
        >
          <Briefcase size={13} />
          Soy prestador
        </Link>
      </div>

      {/* Toast de error de ruta (cuando se usó fallback de líneas rectas) */}
      {errorRuta && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-amber-100 border border-amber-300 text-amber-900 text-xs px-3 py-2 rounded-lg shadow-md max-w-xs text-center">
          {errorRuta}
          <button
            onClick={() => setErrorRuta(null)}
            className="ml-2 font-bold"
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      )}

      {/* Overlay de carga mientras se calcula la ruta */}
      {cargandoRuta && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-6 py-5 shadow-xl flex flex-col items-center gap-3 max-w-xs">
            <div className="w-8 h-8 border-3 border-jungle-200 border-t-jungle-700 rounded-full animate-spin" />
            <div className="text-sm font-semibold text-jungle-900">
              Calculando ruta…
            </div>
            <div className="text-xs text-jungle-600 text-center">
              Trazando el camino por carretera. Se guardará para usarse sin internet.
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-hidden min-h-0">
        {tab === 'explorar' && (
          <div className="h-full overflow-y-auto">
            <ExploreScreen onVerLugar={verLugar} />
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
        {tab === 'chat' && (
          <ChatAssistant
            onVerLugar={verLugar}
            onVerRutaEnMapa={verRutaEnMapa}
          />
        )}
        {tab === 'favoritos' && (
          <div className="h-full overflow-y-auto">
            <FavoritesScreen onVerLugar={verLugar} />
          </div>
        )}
      </main>

      <BottomNav
        activa={tab}
        onChange={(nuevoTab) => {
          // Al cambiar de tab limpiamos la ruta resaltada del mapa,
          // para que no quede "fantasma" al volver al mapa más tarde.
          if (nuevoTab !== 'mapa' && rutaVisible) {
            setRutaVisible(null);
          }
          setTab(nuevoTab);
        }}
      />

      {lugarSeleccionado && (
        <>
          {/* Capa de bloqueo: captura TODOS los eventos táctiles antes
              de que lleguen al mapa de Leaflet. Sin esto, Leaflet sigue
              procesando toques aunque el modal esté encima visualmente. */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9998,
              touchAction: 'none',
            }}
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
    </div>
  );
}                   