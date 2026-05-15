import { useEffect, useRef, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Download, CheckCircle2, Loader2, X } from 'lucide-react';
import {
  LUGARES,
  LOS_TUXTLAS_BOUNDS,
  LOS_TUXTLAS_CENTER,
  CATEGORIAS,
  type Lugar,
} from '../data/lugares';
import { listarServiciosAprobadosComoLugares } from '../lib/db';

// ============================================================
// PANTALLA DE MAPA — OPTIMIZADA PARA NO TRABARSE
// ============================================================
// Mejoras de rendimiento vs. versión anterior:
// 1. Iconos de marcador cacheados (no se recrean en cada render)
// 2. Descarga de tiles más ligera: menos puntos, menos zoom
// 3. Descarga en segundo plano sin congelar la interfaz
// 4. Incluye prestadores aprobados como marcadores
// ============================================================

// CACHÉ de iconos: se crean UNA vez, no en cada render.
// Esto es clave para que el mapa no se trabe al haber muchos marcadores.
const COLORES_CATEGORIA: Record<string, string> = {
  Naturaleza: '#16a34a',
  Aventura: '#ea580c',
  Cultura: '#d97706',
  Gastronomia: '#dc2626',
  Hospedaje: '#2563eb',
  Playa: '#0891b2',
};

const iconCache = new Map<string, L.DivIcon>();

function getIcono(categoria: string): L.DivIcon {
  if (iconCache.has(categoria)) {
    return iconCache.get(categoria)!;
  }
  const color = COLORES_CATEGORIA[categoria] || '#16a34a';
  const emoji = CATEGORIAS.find((c) => c.id === categoria)?.emoji || '📍';
  const icono = L.divIcon({
    html: `<div style="width:32px;height:32px;background:white;border:3px solid ${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,0.3)"><div style="transform:rotate(45deg);font-size:14px">${emoji}</div></div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -30],
  });
  iconCache.set(categoria, icono);
  return icono;
}

interface Props {
  onVerLugar: (lugar: Lugar) => void;
  filtroCategorias?: string[];
  // Lista de coordenadas que dibuja una ruta sobre las carreteras.
  // Si se pasa, se renderiza como polyline verde y el mapa hace zoom
  // para encuadrarla completa.
  rutaResaltada?: [number, number][];
  // Puntos numerados (paradas de la ruta del día) — opcional.
  // Se dibujan como círculos numerados al lado de cada lugar.
  paradasResaltadas?: { coord: [number, number]; orden: number }[];
  // Permite al usuario quitar la ruta visible y volver al mapa normal.
  onLimpiarRuta?: () => void;
}

// Icono numerado para las paradas de una ruta (1, 2, 3...)
const paradaIconCache = new Map<number, L.DivIcon>();
function iconoParada(orden: number): L.DivIcon {
  if (paradaIconCache.has(orden)) return paradaIconCache.get(orden)!;
  const icono = L.divIcon({
    html: `<div style="width:28px;height:28px;background:#15803d;color:white;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,0.4)">${orden}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  paradaIconCache.set(orden, icono);
  return icono;
}

// Componente interno: cuando recibe puntos, hace zoom para encuadrar
// toda la ruta. Se monta dentro del <MapContainer>.
function AjustarVistaARuta({ puntos }: { puntos: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (puntos.length < 2) return;
    const bounds = L.latLngBounds(puntos);
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [puntos, map]);
  return null;
}

export default function MapScreen({ onVerLugar, filtroCategorias, rutaResaltada, paradasResaltadas, onLimpiarRuta }: Props) {
  const [serviciosPrestadores, setServiciosPrestadores] = useState<Lugar[]>([]);
  const [descargando, setDescargando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [tilesListos, setTilesListos] = useState(false);
  const [mostrarAyuda, setMostrarAyuda] = useState(false);

  // Cargar prestadores aprobados al montar
  useEffect(() => {
    listarServiciosAprobadosComoLugares()
      .then(setServiciosPrestadores)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (localStorage.getItem('tiles-precargados') === 'true') {
      setTilesListos(true);
    }
  }, []);

  // Combinar lugares oficiales + prestadores aprobados
  const todosLosLugares = useMemo(() => {
    const base = [...LUGARES, ...serviciosPrestadores];
    if (filtroCategorias && filtroCategorias.length > 0) {
      return base.filter((l) => filtroCategorias.includes(l.categoria));
    }
    return base;
  }, [serviciosPrestadores, filtroCategorias]);

  return (
    <div className="relative h-full">
      <MapContainer
        center={LOS_TUXTLAS_CENTER}
        zoom={11}
        minZoom={9}
        maxZoom={16}
        maxBounds={LOS_TUXTLAS_BOUNDS}
        maxBoundsViscosity={0.7}
        className="h-full w-full"
        style={{ background: '#dcfce7' }}
        preferCanvas={true}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={18}
          keepBuffer={2}
        />
        {todosLosLugares.map((lugar) => (
          // Un tap en el marcador abre directo el detalle del lugar.
          // Antes teníamos un Popup intermedio de Leaflet, pero se traslapaba
          // visualmente con el panel inferior. Tap directo = un paso menos
          // y sin solapamiento.
          <Marker
            key={lugar.id}
            position={lugar.coords}
            icon={getIcono(lugar.categoria)}
            eventHandlers={{ click: () => onVerLugar(lugar) }}
          />
        ))}
        {/* Trazado de la ruta del día sobre las carreteras (si hay) */}
        {rutaResaltada && rutaResaltada.length >= 2 && (
          <>
            <Polyline
              positions={rutaResaltada}
              pathOptions={{
                color: '#15803d',
                weight: 5,
                opacity: 0.85,
              }}
            />
            <AjustarVistaARuta puntos={rutaResaltada} />
          </>
        )}
        {/* Paradas numeradas de la ruta del día */}
        {paradasResaltadas?.map((p) => (
          <Marker
            key={`parada-${p.orden}`}
            position={p.coord}
            icon={iconoParada(p.orden)}
          />
        ))}
        <ControladorDescarga
          descargando={descargando}
          onProgreso={setProgreso}
          onIniciar={() => setDescargando(true)}
          onTerminar={() => {
            setDescargando(false);
            setTilesListos(true);
            localStorage.setItem('tiles-precargados', 'true');
          }}
        />
      </MapContainer>

      {/* Pill flotante: cerrar ruta resaltada. Solo aparece cuando hay una. */}
      {rutaResaltada && onLimpiarRuta && (
        <button
          onClick={onLimpiarRuta}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-jungle-700 hover:bg-jungle-800 text-white shadow-lg rounded-full pl-3.5 pr-4 py-1.5 flex items-center gap-1.5 text-xs font-semibold"
          aria-label="Cerrar ruta y volver al mapa normal"
        >
          <X size={14} />
          Cerrar ruta
        </button>
      )}

      {/* Botón de descarga de mapa offline */}
      <div className="absolute top-3 right-3 z-[1000]">
        {tilesListos ? (
          <div className="bg-white shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 text-sm font-semibold text-jungle-800">
            <CheckCircle2 size={16} className="text-jungle-600" />
            Mapa disponible offline
          </div>
        ) : descargando ? (
          <div className="bg-white shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 text-sm font-semibold text-jungle-800">
            <Loader2 size={16} className="animate-spin" />
            Descargando {progreso}%
          </div>
        ) : (
          <button
            onClick={() => setMostrarAyuda(true)}
            className="bg-white hover:bg-jungle-50 shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 text-sm font-semibold text-jungle-900"
          >
            <Download size={16} />
            Descargar mapa
          </button>
        )}
      </div>

      {/* Modal de ayuda antes de descargar */}
      {mostrarAyuda && (
        <div className="absolute inset-0 z-[1100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm animate-fade-in">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-display font-bold text-lg text-jungle-950">
                Descargar mapa para usar offline
              </h3>
              <button
                onClick={() => setMostrarAyuda(false)}
                className="text-jungle-400 hover:text-jungle-700"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-jungle-700 mb-4">
              Vamos a guardar el mapa de Los Tuxtlas en tu dispositivo. Tarda
              unos 15 segundos. Después podrás ver el mapa aunque no tengas
              internet. Mantén esta pantalla abierta mientras descarga.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setMostrarAyuda(false)}
                className="flex-1 border-2 border-jungle-200 text-jungle-800 py-2.5 rounded-xl font-semibold text-sm"
              >
                Ahora no
              </button>
              <button
                onClick={() => {
                  setMostrarAyuda(false);
                  setDescargando(true);
                }}
                className="flex-1 bg-jungle-700 text-white py-2.5 rounded-xl font-semibold text-sm"
              >
                Descargar ahora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leyenda de categorías */}
      <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:max-w-xs bg-white/95 backdrop-blur rounded-2xl p-3 shadow-xl text-xs z-[1000]">
        <div className="font-semibold text-jungle-900 mb-2">
          {todosLosLugares.length} lugares en el mapa
          {serviciosPrestadores.length > 0 && (
            <span className="text-jungle-600 font-normal">
              {' '}
              ({serviciosPrestadores.length} de prestadores)
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIAS.map((c) => (
            <span
              key={c.id}
              className={`${c.color} px-2 py-0.5 rounded-full text-[10px]`}
            >
              {c.emoji} {c.id}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Controlador de descarga de tiles para uso offline.
// OPTIMIZADO: en lugar de saltar por 8 puntos a zoom alto (que
// descargaba miles de tiles y trababa el navegador), hace un
// barrido más inteligente y ligero, reportando progreso, y
// usando requestAnimationFrame para no congelar la UI.
// ─────────────────────────────────────────────
function ControladorDescarga({
  descargando,
  onProgreso,
  onIniciar,
  onTerminar,
}: {
  descargando: boolean;
  onProgreso: (p: number) => void;
  onIniciar: () => void;
  onTerminar: () => void;
}) {
  const map = useMap();
  const ejecutando = useRef(false);

  useEffect(() => {
    if (!descargando || ejecutando.current) return;
    ejecutando.current = true;
    onIniciar();

    const [[s, w], [n, e]] = LOS_TUXTLAS_BOUNDS;
    const centroLat = (s + n) / 2;
    const centroLng = (w + e) / 2;

    // Puntos de barrido: zoom medio (10-13), NO zoom alto.
    // Esto reduce drásticamente la cantidad de tiles y evita el trabado.
    const puntos: { center: [number, number]; zoom: number }[] = [
      { center: [centroLat, centroLng], zoom: 10 },
      { center: [centroLat, centroLng], zoom: 11 },
      { center: [centroLat, centroLng], zoom: 12 },
      { center: [s + 0.08, centroLng], zoom: 12 },
      { center: [n - 0.08, centroLng], zoom: 12 },
      { center: [centroLat, w + 0.1], zoom: 12 },
      { center: [centroLat, e - 0.1], zoom: 12 },
    ];

    let indice = 0;

    const procesarSiguiente = () => {
      if (indice >= puntos.length) {
        // Terminado: volver a la vista normal
        map.setView(LOS_TUXTLAS_CENTER, 11, { animate: false });
        onProgreso(100);
        setTimeout(() => {
          ejecutando.current = false;
          onTerminar();
        }, 300);
        return;
      }

      const punto = puntos[indice];
      map.setView(punto.center, punto.zoom, { animate: false });
      indice++;
      onProgreso(Math.round((indice / puntos.length) * 100));

      // Esperar a que carguen los tiles de este punto antes del siguiente.
      // 1.8s da tiempo a que Workbox los cachee sin saturar.
      setTimeout(procesarSiguiente, 1800);
    };

    // Pequeña espera inicial y arrancamos
    setTimeout(procesarSiguiente, 400);
  }, [descargando, map, onProgreso, onIniciar, onTerminar]);

  return null;
}
