import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Map, Marker, Source, Layer, type MapRef } from '@vis.gl/react-maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Download, CheckCircle2, Loader2, X, Compass, Layers, Plus, Minus, Map as MapIcon, Satellite } from 'lucide-react';
import {
  LUGARES,
  LOS_TUXTLAS_BOUNDS,
  LOS_TUXTLAS_CENTER,
  CATEGORIAS,
  type Lugar,
} from '../data/lugares';
import { listarServiciosAprobadosComoLugares } from '../lib/db';

// ============================================================
// PANTALLA DE MAPA — migrado de Leaflet a MapLibre GL JS
// ============================================================
// DECISION DE ARQUITECTURA (por que se cambio):
// La maestra pidio un mapa mas interactivo, con edificios visibles
// "virtualmente" - Leaflet (lo que habia antes) NO PUEDE hacer
// edificios en 3D bajo ninguna circunstancia, es una limitacion de la
// tecnologia (tiles de imagen ya renderizadas), no de configuracion.
// MapLibre GL JS si, de forma nativa, porque dibuja el mapa a partir
// de datos vectoriales en el navegador, no de imagenes.
//
// Fuente de mapas: OpenFreeMap (tiles.openfreemap.org) - verificado:
// genuinamente gratis, sin limite de uso, sin clave API, licencia MIT.
// Se evaluo "mapcn" primero, pero su mapa base por default (CARTO)
// requiere licencia Enterprise de pago para uso comercial - y esta
// app cobra comision y plan Premium, asi que si cuenta como comercial.
//
// Estilo elegido: "liberty" - ya trae edificios en 3D integrados de
// fabrica (capa "building-3d" en su propio style.json, activa desde
// zoom 14 combinado con pitch>0) - no hace falta agregar codigo
// nuevo para eso, solo inclinar la camara.
//
// IMPORTANTE - AuthModal.tsx (el selector de ubicacion al registrar
// un prestador) sigue usando Leaflet por separado; no se toco, sigue
// funcionando igual. Esta migracion es solo de esta pantalla.
// ============================================================

const ESTILO_MAPA = 'https://tiles.openfreemap.org/styles/liberty';

// ============================================================
// CAPA SATELITAL — opcional, tipo "Google Maps" pero sin usar Google
// ============================================================
// Fuente: Esri World Imagery (server.arcgisonline.com) — imágenes
// satelitales/aéreas de uso libre en mapas web con atribución, sin
// llave de API. Se combina con una segunda capa de referencia (solo
// nombres de lugares/carreteras) para que la vista satelital siga
// siendo útil como mapa y no solo una foto sin contexto — igual que
// el modo "Satélite" de Google combina imagen + etiquetas.
const ESTILO_SATELITE = {
  version: 8 as const,
  sources: {
    'esri-imagenes': {
      type: 'raster' as const,
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Esri, Maxar, Earthstar Geographics',
    },
    'esri-etiquetas': {
      type: 'raster' as const,
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'esri-imagenes-capa', type: 'raster' as const, source: 'esri-imagenes' },
    { id: 'esri-etiquetas-capa', type: 'raster' as const, source: 'esri-etiquetas' },
  ],
};

const COLORES_CATEGORIA: Record<string, string> = {
  Naturaleza: '#16a34a',
  Aventura: '#ea580c',
  Cultura: '#d97706',
  Gastronomia: '#dc2626',
  Hospedaje: '#2563eb',
  Playa: '#0891b2',
};

// Pin más pequeño y discreto que antes (círculo simple, no gota) —
// hallazgo real de campo: la versión anterior (32px, forma de gota)
// se veía demasiado grande/llamativa y chocaba visualmente con los
// círculos numerados de una ruta activa. Este es más "nativo": un
// punto de color con el ícono adentro, sin bordes gruesos ni forma
// puntiaguda.
function PinLugar({ categoria, onClick }: { categoria: string; onClick: () => void }) {
  const color = COLORES_CATEGORIA[categoria] || '#16a34a';
  const emoji = CATEGORIAS.find((c) => c.id === categoria)?.emoji || '📍';
  return (
    <div
      onClick={onClick}
      style={{
        width: 22,
        height: 22,
        background: color,
        border: '2px solid white',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
        cursor: 'pointer',
        fontSize: 10,
        lineHeight: 1,
      }}
    >
      {emoji}
    </div>
  );
}

// Circulo numerado para las paradas de una ruta (1, 2, 3...)
function PinParada({ orden }: { orden: number }) {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        background: '#15803d',
        color: 'white',
        border: '3px solid white',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: 13,
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
      }}
    >
      {orden}
    </div>
  );
}

// Punto azul pulsante "tú estás aquí" — mismo lenguaje visual que
// Google Maps / la mayoría de apps de navegación, para que se
// reconozca de inmediato qué representa sin necesitar explicación.
function PinMiUbicacion() {
  return (
    <div style={{ position: 'relative', width: 20, height: 20 }}>
      <div
        style={{
          position: 'absolute',
          inset: -10,
          borderRadius: '50%',
          background: 'rgba(37, 99, 235, 0.25)',
          animation: 'tuxtlasgo-pulso-ubicacion 2s ease-out infinite',
        }}
      />
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#2563eb',
          border: '3px solid white',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}
      />
      <style>{`
        @keyframes tuxtlasgo-pulso-ubicacion {
          0% { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// "Stickman" caminando — se anima EN SU LUGAR con CSS (piernas y
// brazos que se balancean), mientras el marcador en sí se mueve sobre
// la ruta real cambiando de coordenadas cada cuadro (ver el efecto de
// animación más abajo) — la combinación de ambas cosas da la
// impresión de que camina siguiendo el camino, no solo que "aparece"
// en distintos puntos.
function PinCaminante() {
  return (
    <div style={{ width: 26, height: 34 }}>
      <svg width="26" height="34" viewBox="0 0 26 34" style={{ overflow: 'visible' }}>
        <circle cx="13" cy="6" r="5" fill="#1e293b" />
        <line x1="13" y1="11" x2="13" y2="24" stroke="#1e293b" strokeWidth="3" strokeLinecap="round" />
        <line x1="13" y1="15" x2="7" y2="20" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" className="tuxtlasgo-brazo-a" />
        <line x1="13" y1="15" x2="19" y2="20" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" className="tuxtlasgo-brazo-b" />
        <line x1="13" y1="24" x2="7" y2="33" stroke="#1e293b" strokeWidth="3" strokeLinecap="round" className="tuxtlasgo-pierna-a" />
        <line x1="13" y1="24" x2="19" y2="33" stroke="#1e293b" strokeWidth="3" strokeLinecap="round" className="tuxtlasgo-pierna-b" />
      </svg>
      <style>{`
        @keyframes tuxtlasgo-paso-a { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(22deg); } }
        @keyframes tuxtlasgo-paso-b { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-22deg); } }
        .tuxtlasgo-pierna-a { transform-origin: 13px 24px; animation: tuxtlasgo-paso-a 0.45s ease-in-out infinite; }
        .tuxtlasgo-pierna-b { transform-origin: 13px 24px; animation: tuxtlasgo-paso-b 0.45s ease-in-out infinite; }
        .tuxtlasgo-brazo-a { transform-origin: 13px 15px; animation: tuxtlasgo-paso-b 0.45s ease-in-out infinite; }
        .tuxtlasgo-brazo-b { transform-origin: 13px 15px; animation: tuxtlasgo-paso-a 0.45s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

interface Props {
  onVerLugar: (lugar: Lugar) => void;
  filtroCategorias?: string[];
  // Lista de coordenadas [lat, lng] que dibuja una ruta sobre las
  // carreteras. Se convierte a [lng, lat] internamente (GeoJSON/
  // MapLibre usan ese orden, al reves de Leaflet) justo antes de
  // dibujarse - ver rutaGeoJSON mas abajo.
  rutaResaltada?: [number, number][];
  paradasResaltadas?: { coord: [number, number]; orden: number }[];
  // Posición GPS real del turista (ver AppShell.tsx) — si viene, se
  // dibuja como un punto azul pulsante "tú estás aquí", distinto de
  // los pines normales de lugares y de las paradas numeradas.
  miUbicacion?: [number, number];
  onLimpiarRuta?: () => void;
}

export default function MapScreen({
  onVerLugar,
  filtroCategorias,
  rutaResaltada,
  paradasResaltadas,
  miUbicacion,
  onLimpiarRuta,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  // Posición actual del muñeco caminando sobre la ruta ([lng, lat]) —
  // null cuando no hay animación en curso.
  const [posicionCaminante, setPosicionCaminante] = useState<[number, number] | null>(null);
  // Permite cancelar la secuencia en curso si la ruta cambia de nuevo
  // a medias (ej. el turista pide otra ruta antes de que termine la
  // animación anterior) — sin esto, dos secuencias se pisarían entre sí.
  const secuenciaActiva = useRef(0);
  const [serviciosPrestadores, setServiciosPrestadores] = useState<Lugar[]>([]);
  const [descargando, setDescargando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [tilesListos, setTilesListos] = useState(false);
  const [mostrarAyuda, setMostrarAyuda] = useState(false);
  // Vista satelital (Esri) en vez de calles vectoriales (OpenFreeMap) —
  // ver ESTILO_SATELITE arriba. El panel de capas es el mismo patrón
  // visual que el selector de Google Maps (icono de capas → opciones).
  const [vistaSatelital, setVistaSatelital] = useState(false);
  const [mostrarCapas, setMostrarCapas] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const local = await listarServiciosAprobadosComoLugares();
        setServiciosPrestadores(local);
        const res = await fetch('/api/servicios/aprobados');
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.lugares?.length > 0) {
            const idsLocales = new Set(local.map((l: any) => l.id));
            const deNeon = data.lugares.filter((l: any) => !idsLocales.has(l.id));
            setServiciosPrestadores([...local, ...deNeon]);
          }
        }
      } catch {
        listarServiciosAprobadosComoLugares()
          .then(setServiciosPrestadores)
          .catch(console.error);
      }
    })();
  }, []);

  useEffect(() => {
    if (localStorage.getItem('tiles-precargados') === 'true') {
      setTilesListos(true);
    }
  }, []);

  const todosLosLugares = useMemo(() => {
    const base = [...LUGARES, ...serviciosPrestadores];
    if (filtroCategorias && filtroCategorias.length > 0) {
      return base.filter((l) => filtroCategorias.includes(l.categoria));
    }
    return base;
  }, [serviciosPrestadores, filtroCategorias]);

  // GeoJSON de la ruta del dia - MapLibre/GeoJSON usan [lng, lat],
  // al reves de Leaflet ([lat, lng], que es como sigue llegando desde
  // props por compatibilidad con el resto de la app) - se voltea aqui,
  // en un solo lugar, para no tener que tocar nada mas.
  const rutaGeoJSON = useMemo(() => {
    if (!rutaResaltada || rutaResaltada.length < 2) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: rutaResaltada.map(([lat, lng]) => [lng, lat]),
      },
    };
  }, [rutaResaltada]);

  // Secuencia cinematográfica cuando aparece una ruta nueva:
  //   1) La cámara recorre las paradas en orden INVERSO (última,
  //      penúltima... hasta la primera) y termina en tu ubicación —
  //      efecto "revelación": primero ves los destinos, al final "y
  //      aquí es donde tú estás", tal como se pidió.
  //   2) Encuadre con todo visible.
  //   3) El muñeco (PinCaminante) camina la ruta REAL, en el orden
  //      real en que se recorre (de tu ubicación hacia el lugar 1,
  //      luego 2, luego 3), siguiendo la geometría de calles ya
  //      calculada por OSRM — la misma línea verde que ya se dibuja.
  useEffect(() => {
    setPosicionCaminante(null);
    if (!rutaResaltada || rutaResaltada.length < 2 || !paradasResaltadas || paradasResaltadas.length === 0) {
      return;
    }
    const map = mapRef.current?.getMap();
    if (!map) return;

    const idSecuencia = ++secuenciaActiva.current;
    const cancelado = () => idSecuencia !== secuenciaActiva.current;
    const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    (async () => {
      // 1) Recorrido de cámara, de la última parada a la primera, y
      // luego a tu ubicación.
      const paradasDescendente = [...paradasResaltadas].sort((a, b) => b.orden - a.orden);
      for (const p of paradasDescendente) {
        if (cancelado()) return;
        map.flyTo({ center: [p.coord[1], p.coord[0]], zoom: 15.5, pitch: 55, duration: 1300 });
        await esperar(1700);
      }
      if (miUbicacion && !cancelado()) {
        map.flyTo({ center: [miUbicacion[1], miUbicacion[0]], zoom: 16, pitch: 55, duration: 1300 });
        await esperar(1700);
      }
      if (cancelado()) return;

      // 2) Encuadre con todo visible antes de empezar a caminar.
      const lngLats = rutaResaltada.map(([lat, lng]) => [lng, lat] as [number, number]);
      const bounds = lngLats.reduce(
        (b, coord) => b.extend(coord),
        new maplibregl.LngLatBounds(lngLats[0], lngLats[0])
      );
      map.fitBounds(bounds, { padding: 70, duration: 900, pitch: 45 });
      await esperar(1000);
      if (cancelado()) return;

      // 3) El muñeco camina la ruta real, interpolando posición sobre
      // la geometría de calles — mientras más larga la ruta, más
      // tarda (con un tope para que nunca se sienta eterno).
      const duracionCaminata = Math.min(3000 + lngLats.length * 120, 9000);
      const inicio = performance.now();
      await new Promise<void>((resolve) => {
        function paso(ahora: number) {
          if (cancelado()) return resolve();
          const t = Math.min((ahora - inicio) / duracionCaminata, 1);
          const posExacta = t * (lngLats.length - 1);
          const i0 = Math.floor(posExacta);
          const i1 = Math.min(i0 + 1, lngLats.length - 1);
          const frac = posExacta - i0;
          const lng = lngLats[i0][0] + (lngLats[i1][0] - lngLats[i0][0]) * frac;
          const lat = lngLats[i0][1] + (lngLats[i1][1] - lngLats[i0][1]) * frac;
          setPosicionCaminante([lng, lat]);
          if (t < 1) requestAnimationFrame(paso);
          else resolve();
        }
        requestAnimationFrame(paso);
      });
    })();

    return () => {
      secuenciaActiva.current++;
    };
  }, [rutaResaltada]);

  const resetearVista = useCallback(() => {
    mapRef.current?.getMap()?.flyTo({
      center: [LOS_TUXTLAS_CENTER[1], LOS_TUXTLAS_CENTER[0]],
      zoom: 11,
      pitch: 45,
      bearing: 0,
      duration: 800,
    });
  }, []);

  return (
    <div className="relative h-full">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: LOS_TUXTLAS_CENTER[1],
          latitude: LOS_TUXTLAS_CENTER[0],
          zoom: 11,
          pitch: 45,
        }}
        minZoom={9}
        maxZoom={18}
        maxBounds={[
          [LOS_TUXTLAS_BOUNDS[0][1], LOS_TUXTLAS_BOUNDS[0][0]],
          [LOS_TUXTLAS_BOUNDS[1][1], LOS_TUXTLAS_BOUNDS[1][0]],
        ]}
        mapStyle={vistaSatelital ? (ESTILO_SATELITE as any) : ESTILO_MAPA}
        style={{ width: '100%', height: '100%' }}
      >
        {todosLosLugares.map((lugar) => {
          const esParada = paradasResaltadas?.some(
            (p) =>
              Math.abs(p.coord[0] - lugar.coords[0]) < 0.001 &&
              Math.abs(p.coord[1] - lugar.coords[1]) < 0.001
          );
          if (esParada) return null;
          return (
            <Marker key={lugar.id} longitude={lugar.coords[1]} latitude={lugar.coords[0]}>
              <PinLugar categoria={lugar.categoria} onClick={() => onVerLugar(lugar)} />
            </Marker>
          );
        })}

        {paradasResaltadas?.map((p) => (
          <Marker key={`parada-${p.orden}`} longitude={p.coord[1]} latitude={p.coord[0]}>
            <PinParada orden={p.orden} />
          </Marker>
        ))}

        {miUbicacion && (
          <Marker longitude={miUbicacion[1]} latitude={miUbicacion[0]}>
            <PinMiUbicacion />
          </Marker>
        )}

        {posicionCaminante && (
          <Marker longitude={posicionCaminante[0]} latitude={posicionCaminante[1]}>
            <PinCaminante />
          </Marker>
        )}

        {rutaGeoJSON && (
          <Source id="ruta-dia" type="geojson" data={rutaGeoJSON as any}>
            <Layer
              id="ruta-dia-linea"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#15803d', 'line-width': 5, 'line-opacity': 0.85 }}
            />
          </Source>
        )}
      </Map>

      {mostrarCapas && (
        <div
          className="absolute inset-0 z-20"
          onClick={() => setMostrarCapas(false)}
          aria-hidden="true"
        />
      )}

      {/* Cluster de controles del mapa (capas, zoom, brujula) — mismo
          patron visual que Google Maps: botones circulares blancos
          apilados del lado derecho, en vez de un solo boton suelto. */}
      <div
        style={{ position: 'absolute', bottom: '140px', right: '12px', zIndex: 30 }}
        className="flex flex-col items-end gap-2"
      >
        {/* Capas: Calles / Satélite */}
        <div className="relative">
          <button
            onClick={() => setMostrarCapas((v) => !v)}
            className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-jungle-800 hover:bg-jungle-50 border border-jungle-100"
            title="Tipo de mapa"
            aria-label="Cambiar tipo de mapa"
            aria-expanded={mostrarCapas}
          >
            <Layers size={18} />
          </button>

          {mostrarCapas && (
            <div className="absolute right-12 top-0 bg-white rounded-2xl shadow-xl border border-jungle-100 p-2 flex gap-2">
              <button
                onClick={() => { setVistaSatelital(false); setMostrarCapas(false); }}
                className={`w-16 flex flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-semibold ${!vistaSatelital ? 'bg-jungle-700 text-white' : 'text-jungle-800 hover:bg-jungle-50'
                  }`}
              >
                <MapIcon size={18} />
                Calles
              </button>
              <button
                onClick={() => { setVistaSatelital(true); setMostrarCapas(false); }}
                className={`w-16 flex flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-semibold ${vistaSatelital ? 'bg-jungle-700 text-white' : 'text-jungle-800 hover:bg-jungle-50'
                  }`}
              >
                <Satellite size={18} />
                Satélite
              </button>
            </div>
          )}
        </div>

        {/* Zoom +/- */}
        <div className="bg-white rounded-2xl shadow-lg border border-jungle-100 flex flex-col overflow-hidden">
          <button
            onClick={() => mapRef.current?.getMap()?.zoomIn({ duration: 250 })}
            className="w-10 h-10 flex items-center justify-center text-jungle-800 hover:bg-jungle-50 border-b border-jungle-100"
            aria-label="Acercar"
            title="Acercar"
          >
            <Plus size={18} />
          </button>
          <button
            onClick={() => mapRef.current?.getMap()?.zoomOut({ duration: 250 })}
            className="w-10 h-10 flex items-center justify-center text-jungle-800 hover:bg-jungle-50"
            aria-label="Alejar"
            title="Alejar"
          >
            <Minus size={18} />
          </button>
        </div>

        {/* Brujula/reset */}
        <button
          onClick={resetearVista}
          className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-jungle-800 hover:bg-jungle-50 border border-jungle-100"
          title="Regresar a Los Tuxtlas"
          aria-label="Regresar al centro del mapa"
        >
          <Compass size={20} />
        </button>
      </div>

      {/* Pill flotante: cerrar ruta resaltada */}
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

      {/* Boton de descarga de mapa offline */}
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
              {progreso < 20
                ? 'Preparando…'
                : progreso < 70
                  ? 'Descargando calles y edificios…'
                  : progreso < 95
                    ? 'Guardando estilo del mapa…'
                    : 'Finalizando…'}
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
              unos segundos. Después podrás ver el mapa aunque no tengas
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

      {descargando && (
        <ControladorDescarga
          onProgreso={setProgreso}
          onTerminar={() => {
            setDescargando(false);
            setTilesListos(true);
            localStorage.setItem('tiles-precargados', 'true');
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// DESCARGA OFFLINE - mapas vectoriales (MapLibre/OpenFreeMap)
// ============================================================
// Distinto del sistema anterior (tiles PNG de OpenStreetMap): aqui
// hay que guardar TRES tipos de recursos, no solo un tipo de imagen:
//   1. El estilo (style.json) - los colores/capas del mapa.
//   2. El sprite (iconos de POIs) - un punado de archivos fijos.
//   3. Los tiles vectoriales (.pbf) - los datos de calles/edificios
//      de la region, igual que antes se enumeraban tiles PNG por
//      x/y/zoom, pero ahora con extension .pbf.
//
// IMPORTANTE: la URL de los tiles vectoriales de OpenFreeMap incluye
// un identificador de snapshot con fecha (ej. ".../planet/20260621_
// 080001_pt/{z}/{x}/{y}.pbf") que cambia cuando ellos actualizan su
// copia de datos - por eso NO se puede escribir esa URL fija en el
// codigo; hay que preguntarle al manifiesto (/planet) cual es la
// plantilla vigente CADA VEZ que se descarga, en vez de asumir que
// siempre sera la misma.
//
// Los glyphs (fuentes de texto) NO se pre-descargan aqui a proposito:
// son demasiadas combinaciones de idioma/rango de caracteres para
// enumerar de antemano, pero se cachean solos (ver runtimeCaching en
// vite.config.ts) conforme el mapa los va pidiendo mientras se navega
// - para la region y el espanol, es un conjunto chico y se completa
// solo con el uso normal de la app.

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

// Genera las URLs de tiles vectoriales que cubren Los Tuxtlas, dada
// la plantilla vigente (con el snapshot correcto ya resuelto).
function generarTilesVectorialesRegion(plantilla: string): string[] {
  const [[s, w], [n, e]] = LOS_TUXTLAS_BOUNDS;
  const margin = 0.05;
  const urls: string[] = [];

  for (let zoom = 10; zoom <= 13; zoom++) {
    const xMin = lngToTileX(w - margin, zoom);
    const xMax = lngToTileX(e + margin, zoom);
    const yMin = latToTileY(n + margin, zoom);
    const yMax = latToTileY(s - margin, zoom);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        urls.push(
          plantilla.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y))
        );
      }
    }
  }
  return urls;
}

async function urlsDeRecursosFijos(): Promise<string[]> {
  const urls = [ESTILO_MAPA];
  const spriteBase = 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm';
  urls.push(`${spriteBase}.json`, `${spriteBase}.png`, `${spriteBase}@2x.json`, `${spriteBase}@2x.png`);
  return urls;
}

function ControladorDescarga({
  onProgreso,
  onTerminar,
}: {
  onProgreso: (p: number) => void;
  onTerminar: () => void;
}) {
  const ejecutando = useRef(false);

  useEffect(() => {
    if (ejecutando.current) return;
    ejecutando.current = true;

    (async () => {
      try {
        onProgreso(5);

        const manifiestoRes = await fetch('https://tiles.openfreemap.org/planet', {
          cache: 'force-cache',
        });
        const manifiesto = await manifiestoRes.json();
        const plantilla: string = manifiesto.tiles[0];
        onProgreso(10);

        const fijos = await urlsDeRecursosFijos();
        await Promise.allSettled(
          fijos.map((url) => fetch(url, { cache: 'force-cache' }).catch(() => { }))
        );
        onProgreso(20);

        const tiles = generarTilesVectorialesRegion(plantilla);
        const LOTE = 8;
        let cursor = 0;
        let descargados = 0;
        let errores = 0;

        while (cursor < tiles.length) {
          const lote = tiles.slice(cursor, cursor + LOTE);
          cursor += LOTE;
          await Promise.allSettled(
            lote.map(async (url) => {
              try {
                const r = await fetch(url, { cache: 'force-cache' });
                if (r.ok) descargados++;
                else errores++;
              } catch {
                errores++;
              }
            })
          );
          onProgreso(20 + Math.round((cursor / tiles.length) * 75));
          await new Promise((r) => setTimeout(r, 60));
        }

        onProgreso(100);
        console.log(
          `[TuxtlasGO] Mapa vectorial descargado: ${descargados} tiles ok, ${errores} errores`
        );
        await new Promise((r) => setTimeout(r, 400));
      } catch (err) {
        console.error('[TuxtlasGO] Error descargando mapa offline:', err);
      } finally {
        ejecutando.current = false;
        onTerminar();
      }
    })();
  }, [onProgreso, onTerminar]);

  return null;
}