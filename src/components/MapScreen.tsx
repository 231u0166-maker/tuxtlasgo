import { useEffect, useRef, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Download, CheckCircle2, Loader2, X, Compass } from 'lucide-react';
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
        {todosLosLugares.map((lugar) => {
          // Si este lugar ya aparece como parada numerada en la ruta,
          // no mostramos el marcador normal para evitar superposición.
          const esParada = paradasResaltadas?.some(
            (p) => Math.abs(p.coord[0] - lugar.coords[0]) < 0.001 &&
                   Math.abs(p.coord[1] - lugar.coords[1]) < 0.001
          );
          if (esParada) return null;
          return (
            <Marker
              key={lugar.id}
              position={lugar.coords}
              icon={getIcono(lugar.categoria)}
              eventHandlers={{ click: () => onVerLugar(lugar) }}
            />
          );
        })}
        {/* Botón de brújula/reset: regresa al centro de Los Tuxtlas */}
        <ResetearVista />

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
          className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-jungle-700 hover:bg-jungle-800 text-white shadow-lg rounded-full pl-3.5 pr-4 py-1.5 flex items-center gap-1.5 text-xs font-semibold"
          aria-label="Cerrar ruta y volver al mapa normal"
        >
          <X size={14} />
          Cerrar ruta
        </button>
      )}

      {/* Botón de descarga de mapa offline */}
      <div className="absolute top-3 right-3 z-30">
        {tilesListos ? (
          <div className="bg-white shadow-lg rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 text-xs font-semibold text-jungle-800">
            <CheckCircle2 size={14} className="text-jungle-600 flex-shrink-0" />
            <span className="hidden sm:inline">Mapa disponible </span>offline ✓
          </div>
        ) : descargando ? (
          <div className="bg-white shadow-lg rounded-xl px-3 py-2.5 flex flex-col gap-1 min-w-[160px]">
            <div className="flex items-center gap-2 text-sm font-semibold text-jungle-800">
              <Loader2 size={14} className="animate-spin flex-shrink-0" />
              Guardando mapa… {progreso}%
            </div>
            <div className="w-full bg-jungle-100 rounded-full h-1.5">
              <div
                className="bg-jungle-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progreso}%` }}
              />
            </div>
            <p className="text-[10px] text-jungle-500">
              {progreso < 30 ? 'Descargando calles y carreteras…' :
               progreso < 60 ? 'Guardando zonas turísticas…' :
               progreso < 90 ? 'Casi listo, descargando detalles…' :
               'Finalizando…'}
            </p>
          </div>
        ) : (
          <button
            onClick={() => setMostrarAyuda(true)}
            className="bg-white hover:bg-jungle-50 shadow-lg rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-jungle-900"
          >
            <Download size={14} className="flex-shrink-0" />
            <span className="hidden xs:inline">Descargar </span>mapa
          </button>
        )}
      </div>

      {/* Modal de ayuda antes de descargar */}
      {mostrarAyuda && (
        <div className="absolute inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
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
      <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:max-w-xs bg-white/95 backdrop-blur rounded-2xl p-3 shadow-xl text-xs z-30">
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
// ─────────────────────────────────────────────
// Descarga inteligente de tiles para uso offline.
//
// En lugar de mover el mapa al azar, calcula matemáticamente
// TODOS los tiles de Los Tuxtlas en zoom 10-14 (659 tiles),
// los descarga con fetch() directo y los mete en el caché
// de Workbox. Sin mover el mapa, sin congelar la UI.
//
// Para zooms bajos (10-12) descarga todos los tiles.
// Para zoom 13-14 descarga solo los que cubren Los Tuxtlas.
// ─────────────────────────────────────────────

// Botón de brújula/reset: regresa el mapa al centro de Los Tuxtlas.
// El turista lo usa cuando el mapa se desconfiguró o está muy zoomado.
function ResetearVista() {
  const map = useMap();
  return (
    <div style={{ position: 'absolute', bottom: '140px', right: '12px', zIndex: 1000 }}>
      <button
        onClick={() => map.setView(LOS_TUXTLAS_CENTER, 11, { animate: true })}
        className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-jungle-800 hover:bg-jungle-50 border border-jungle-100"
        title="Regresar a Los Tuxtlas"
        aria-label="Regresar al centro del mapa"
      >
        <Compass size={20} />
      </button>
    </div>
  );
}

function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
}

function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
}

// Genera la lista completa de URLs de tiles que cubren Los Tuxtlas.
function generarTilesRegion(): string[] {
  const [[s, w], [n, e]] = LOS_TUXTLAS_BOUNDS;
  // Márgenes pequeños para cubrir un poco más allá de los bordes
  const margin = 0.05;
  const urls: string[] = [];
  const subdominios = ['a', 'b', 'c'];

  for (let zoom = 10; zoom <= 14; zoom++) {
    const xMin = lngToTileX(w - margin, zoom);
    const xMax = lngToTileX(e + margin, zoom);
    const yMin = latToTileY(n + margin, zoom); // norte = y menor
    const yMax = latToTileY(s - margin, zoom); // sur = y mayor

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const sub = subdominios[(x + y) % 3];
        urls.push(`https://${sub}.tile.openstreetmap.org/${zoom}/${x}/${y}.png`);
      }
    }
  }
  return urls;
}

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

    const tiles = generarTilesRegion();
    let descargados = 0;
    let errores = 0;

    // Descarga en lotes de 6 tiles simultáneos para no saturar
    // la red ni la cuota del caché del navegador.
    const LOTE = 6;
    let cursor = 0;

    const descargarLote = async () => {
      if (cursor >= tiles.length) {
        // Terminado — NO movemos la vista, el usuario está viendo el mapa
        // donde lo dejó. El botón de brújula le permite regresar si quiere.
        onProgreso(100);
        console.log(
          `[TuxtlasGO] Mapa descargado: ${descargados} tiles ok, ${errores} errores`
        );
        await new Promise((r) => setTimeout(r, 400));
        ejecutando.current = false;
        onTerminar();
        return;
      }

      const lote = tiles.slice(cursor, cursor + LOTE);
      cursor += LOTE;

      await Promise.allSettled(
        lote.map(async (url) => {
          try {
            // Usamos fetch con cache:'force-cache' para que el SW de
            // Workbox lo intercepte y lo guarde en su caché de tiles.
            // Si ya está cacheado, no hace petición de red.
            const r = await fetch(url, { cache: 'force-cache' });
            if (r.ok) descargados++;
            else errores++;
          } catch {
            errores++;
          }
        })
      );

      onProgreso(Math.round((cursor / tiles.length) * 100));

      // Pequeña pausa entre lotes para no bloquear el hilo principal
      await new Promise((r) => setTimeout(r, 80));
      descargarLote();
    };

    // Esperamos 300ms para que el modal de confirmación se cierre
    setTimeout(() => descargarLote(), 300);
  }, [descargando, map, onProgreso, onIniciar, onTerminar]);

  return null;
}
