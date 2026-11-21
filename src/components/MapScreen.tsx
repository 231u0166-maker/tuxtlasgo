import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Map, Marker, Source, Layer, type MapRef } from '@vis.gl/react-maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Download, CheckCircle2, Loader2, X, Compass, LocateFixed, Layers, Plus, Minus, Map as MapIcon, Satellite, SlidersHorizontal } from 'lucide-react';
import {
  LUGARES,
  LOS_TUXTLAS_BOUNDS,
  LOS_TUXTLAS_CENTER,
  CATEGORIAS,
  type Lugar,
} from '../data/lugares';
import { listarServiciosAprobadosComoLugares } from '../lib/db';
import { useT } from '../lib/i18n';
import { colorTramo } from '../lib/colores';
import {
  TOKEN_MAPBOX,
  PLANTILLA_SATELITE,
  ESTILO_MAPA_URL,
  ajustarUrlSinConexion,
  leerZonas,
  planearZona,
  cajaDeZona,
  descargarZona,
  borrarZona,
  borrarMapaOffline,
  descargarRuta,
  planearCorredor,
  leerRutaGuardada,
  cargarIndiceMosaicos,
  cargarCobertura,
  estaCubierto,
  leerPendiente,
  limpiarPendiente,
  type Pendiente,
  type Caja,
  type RutaGuardada,
  TAMANOS,
  type TamanoZona,
  type ZonaOffline,
} from '../lib/mapaOffline';
import { olvidarGrafosZona } from '../lib/rutasOffline';
import { useOffline } from '../hooks/useOffline';
import NavegacionRuta from './NavegacionRuta';
import { obtenerUbicacionGPS, type Coord, type ModoRuta } from '../lib/routing';

// Referencia estable a propósito: el Map reaplica maxBounds cada vez que
// el prop cambia de identidad, y eso deshacería el desbloqueo para
// turistas de fuera de la región (ver efecto de la ruta).
// Para turistas de otros estados: todo México con margen.
const LIMITES_MEXICO: [[number, number], [number, number]] = [
  [-120, 13],
  [-84, 34],
];
const LIMITES_REGION: [[number, number], [number, number]] = [
  [LOS_TUXTLAS_BOUNDS[0][1], LOS_TUXTLAS_BOUNDS[0][0]],
  [LOS_TUXTLAS_BOUNDS[1][1], LOS_TUXTLAS_BOUNDS[1][0]],
];

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

export const ESTILO_MAPA = ESTILO_MAPA_URL;

// ============================================================
// CAPA SATÉLITE — para ubicarse en el mapa
// ============================================================
// Con token de Mapbox (VITE_MAPBOX_TOKEN): imágenes de Mapbox Satellite
// por la API de mosaicos raster (se piden como mosaicos HTTPS normales,
// MapLibre no entiende "mapbox://"). El token es público ("pk.") y se
// restringe por dominio en el panel de Mapbox. Mapbox rellena las zonas
// sin foto fina con una versión estirada, así que no salen huecos.
// Sin token (o si no está configurado en el servidor): Esri World Imagery,
// que en la selva a veces deja mosaicos en blanco ("Map data not yet
// available"); por eso con Esri la fuente deja de pedir mosaicos nuevos
// desde z15 y el mapa no deja acercar más de z16.
// (el token y la plantilla de URL viven en lib/mapaOffline.ts, porque la
// descarga offline necesita pedir exactamente las mismas URLs)
const ZOOM_SATELITE_FUENTE = TOKEN_MAPBOX ? 17 : 15;
export const ZOOM_SATELITE_MAX = TOKEN_MAPBOX ? 18 : 16;
export function estiloSatelite(maxzoomFuente: number) {
  return {
    version: 8 as const,
    sources: {
      'satelite': {
        type: 'raster' as const,
        tiles: [PLANTILLA_SATELITE],
        tileSize: 256,
        maxzoom: maxzoomFuente,
        attribution: TOKEN_MAPBOX
          ? '© Mapbox © Maxar © OpenStreetMap'
          : 'Imágenes © Esri, Maxar, Earthstar Geographics',
      },
    },
    layers: [{ id: 'satelite-capa', type: 'raster' as const, source: 'satelite' }],
  };
}
export const ESTILO_SATELITE = estiloSatelite(ZOOM_SATELITE_FUENTE);

// Mismos 7 colores que CATEGORIAS en data/lugares.ts (ahí están en
// clases Tailwind para badges; aquí en hex para pintar el mapa) —
// antes esta lista tenía solo 4 categorías reales + 2 que ni existen
// en los datos (Cultura, Playa), así que Comercio/Cooperativa/Otro
// caían todos al verde por defecto. Corregido para que coincida 1:1.
//
// Naturaleza y Aventura usan colores distintos a los demás (verde
// vivo / dorado) a propósito — nada de rojo ni tonos cafés, para que
// un lugar natural (cascada, reserva) no se vea como advertencia ni
// se confunda con una construcción. El resto conserva su color de
// categoría normal.
export const COLORES_CATEGORIA: Record<string, string> = {
  Naturaleza: '#16a34a',
  Aventura: '#f59e0b',
  Gastronomia: '#991b1b',
  Hospedaje: '#1e40af',
  Comercio: '#9a3412',
  Cooperativa: '#115e59',
  Otro: '#374151',
};

// ============================================================
// "EDIFICACIÓN" SINTÉTICA para cada lugar registrado
// ============================================================
// Verificar caso por caso si OpenFreeMap/OSM ya tiene el edificio
// real de cada prestador no es viable con el volumen de lugares del
// proyecto (y va a pasar en Catemaco, Santiago Tuxtla, San Andrés
// Tuxtla, etc.) — así que en vez de eso, SIEMPRE se dibuja un marcador
// extruido propio (no depende de que OSM tenga o no ese edificio
// mapeado) + el logo de categoría encima. Es consistente en todos
// lados, no requiere verificar sitio por sitio, y aplica igual para
// TODOS los lugares registrados en cada categoría (no solo Nanciyaga
// — cualquier cascada, reserva o sitio de aventura que se registre
// recibe el mismo tratamiento automáticamente).
//
// Naturaleza/Aventura NO usan forma de "edificio": una cascada o una
// reserva ecológica no es una construcción, así que en vez de una
// caja ancha y baja (como un local comercial), se dibuja un marcador
// angosto y alto — más parecido a un tótem/hito que a un edificio.
// El resto de categorías (negocios con local físico real) sí usan
// la caja tipo edificio.
const ALTURA_CATEGORIA: Record<string, number> = {
  Hospedaje: 11,
  Cooperativa: 8,
  Comercio: 7,
  Gastronomia: 6,
  Otro: 6,
  Aventura: 15,
  Naturaleza: 15,
};

// Radio de la huella (mitad del lado del cuadrado, en metros) — más
// angosto para Naturaleza/Aventura (tótem) que para el resto (local).
const RADIO_CATEGORIA: Record<string, number> = {
  Naturaleza: 3,
  Aventura: 3,
  Hospedaje: 6,
  Cooperativa: 5,
  Comercio: 5,
  Gastronomia: 5,
  Otro: 5,
};

// Genera un cuadrado pequeño (en metros) alrededor de un punto
// lat/lng, para usarlo como "huella" de la edificación sintética.
function cuadroMetros(lat: number, lng: number, medioLadoM: number): [number, number][] {
  const dLat = medioLadoM / 111320;
  const dLng = medioLadoM / (111320 * Math.cos((lat * Math.PI) / 180));
  return [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ];
}

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
  // La misma ruta partida por tramo (parada A → parada B, B → C...)
  // — si viene, se pinta cada tramo de un color distinto (ver
  // src/lib/colores.ts) en vez de una sola línea verde de punta a
  // punta. Si no viene, se cae al comportamiento anterior usando
  // rutaResaltada completo en un solo color (compatibilidad).
  tramosResaltados?: [number, number][][];
  paradasResaltadas?: { coord: [number, number]; orden: number }[];
  // Posición GPS real del turista (ver AppShell.tsx) — si viene, se
  // dibuja como un punto azul pulsante "tú estás aquí", distinto de
  // los pines normales de lugares y de las paradas numeradas.
  miUbicacion?: [number, number];
  onLimpiarRuta?: () => void;
  // true cuando el mapa se ve chico (la vista previa de 224px dentro
  // de Explorar en móvil) — ahí no cabe bien la píldora de "mapa
  // disponible offline" al lado del buscador que flota encima
  // (chocaban, hallazgo real de campo). En la vista completa se
  // sigue mostrando igual que siempre.
  vistaCompacta?: boolean;
  // Servicios de FUERA de Los Tuxtlas que el turista eligió ver (aviso
  // "Te puede interesar", o abrir uno desde Explorar). Mientras haya
  // alguno, el mapa se libera de la caja de la región y se encuadra ahí;
  // al salir vuelve a Los Tuxtlas. Sin esto el mapa sigue encerrado en
  // la región, como siempre.
  zonaLibre?: Lugar[];
  onSalirZonaLibre?: () => void;
  // Resumen de la ruta dibujada (modo, tiempo, distancia) y acciones del
  // panel de ruta / navegación paso a paso (ver NavegacionRuta.tsx).
  infoRuta?: {
    modo: ModoRuta;
    distanciaMetros?: number;
    duracionSegundos?: number;
    aproximada: boolean;
    calculando: boolean;
  };
  // Datos de la ruta dibujada, para poder guardarla con su mapa (sin internet)
  datosRuta?: {
    nombre: string;
    modo: ModoRuta;
    puntos: Coord[];
    paradas: { coord: Coord; orden: number }[];
    distanciaMetros?: number;
    duracionSegundos?: number;
  };
  onAbrirRutaGuardada?: (r: RutaGuardada) => void;
  // Sin GPS: el turista toca en el mapa desde dónde sale
  elegirOrigen?: { nombre: string } | null;
  onElegirOrigen?: (coord: Coord) => void;
  onCancelarElegirOrigen?: () => void;
  onCambiarModoRuta?: (m: ModoRuta) => void;
  onRecalcularRuta?: (desde: Coord, m: ModoRuta) => void;
}

// Rendimiento en celulares (sobre todo la PWA instalada en Android, donde
// el mapa ocupa toda la pantalla sin la barra del navegador): MapLibre
// dibuja con el devicePixelRatio completo (×2.6–3 en Android), o sea 7–9
// veces más píxeles que en una pantalla de escritorio, con inclinación 3D
// y edificios encima. En equipos de gama baja (poca RAM o pocos núcleos)
// se limita la resolución interna del canvas y se quitan las
// animaciones de fundido de etiquetas, que obligan a repintar cuadros
// extra después de cada movimiento. El mapa se ve igual de nítido a
// simple vista; solo cambia cuánto trabaja la GPU.
function esGamaBaja(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.deviceMemory !== undefined && nav.deviceMemory <= 4)
    || (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4);
}
const GAMA_BAJA = esGamaBaja();
const PIXEL_RATIO_MAPA = Math.min(
  typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  GAMA_BAJA ? 1.5 : 2
);

export default function MapScreen({
  onVerLugar,
  filtroCategorias,
  rutaResaltada,
  tramosResaltados,
  paradasResaltadas,
  miUbicacion,
  onLimpiarRuta,
  vistaCompacta,
  zonaLibre,
  onSalirZonaLibre,
  infoRuta,
  datosRuta,
  onAbrirRutaGuardada,
  elegirOrigen,
  onElegirOrigen,
  onCancelarElegirOrigen,
  onCambiarModoRuta,
  onRecalcularRuta,
}: Props) {
  const t = useT();
  const mapRef = useRef<MapRef>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  // En PWA instalada en móvil, MapLibre a veces no se entera solo de
  // que su contenedor cambió de tamaño (por ejemplo al volver de
  // otra pestaña donde el mapa estaba en display:none) — se queda
  // con el canvas mal recortado o en blanco hasta que se le avisa a
  // fuerza con .resize(). En PC/desktop esto casi nunca pasa porque
  // el navegador maneja mejor esas transiciones.
  useEffect(() => {
    if (!contenedorRef.current) return;
    const observador = new ResizeObserver(() => {
      mapRef.current?.getMap()?.resize();
    });
    observador.observe(contenedorRef.current);
    return () => observador.disconnect();
  }, []);

  // Navegación paso a paso: posición GPS en vivo y si está activa
  const [navPos, setNavPos] = useState<Coord | null>(null);
  const [navegando, setNavegando] = useState(false);
  const navegandoRef = useRef(false);
  navegandoRef.current = navegando;
  const ultimoRumbo = useRef(0);
  const alPosicion = useCallback((pos: Coord | null, rumboGrados: number | null) => {
    setNavPos(pos);
    const m = mapRef.current?.getMap();
    if (!pos || !m) return;
    if (rumboGrados != null) ultimoRumbo.current = rumboGrados;
    // La cámara sigue al turista, mirando hacia donde avanza
    m.easeTo({
      center: [pos[1], pos[0]],
      bearing: ultimoRumbo.current,
      pitch: 55,
      zoom: Math.max(m.getZoom(), 16.5),
      duration: 900,
      essential: true,
    });
  }, []);
  useEffect(() => {
    // Si se cierra la ruta (Cerrar mapa) mientras se navega, se apaga todo
    if (!rutaResaltada || rutaResaltada.length < 2) { setNavegando(false); setNavPos(null); }
  }, [rutaResaltada]);
  useEffect(() => {
    // Al terminar la navegación se quita la inclinación y el giro
    if (!navegando) mapRef.current?.getMap()?.easeTo({ bearing: 0, pitch: 45, duration: 600 });
  }, [navegando]);

  // Posición actual del muñeco caminando sobre la ruta ([lng, lat]) —
  // null cuando no hay animación en curso.
  const [posicionCaminante, setPosicionCaminante] = useState<[number, number] | null>(null);
  // Permite cancelar la secuencia en curso si la ruta cambia de nuevo
  // a medias (ej. el turista pide otra ruta antes de que termine la
  // animación anterior) — sin esto, dos secuencias se pisarían entre sí.
  const secuenciaActiva = useRef(0);

  // Turista de otro estado (Tabasco, CDMX, Jalisco...): si su ubicación
  // cae fuera de Los Tuxtlas, el recuadro encerraba la cámara y no podía
  // ver su ruta ni su seguimiento. Se amplía el límite a todo México con
  // la API del mapa (por prop no sirve: undefined no lo limpia, null/el
  // mundo entero hacen fallar o se revierten en MapLibre).
  // Posición propia pedida con el botón "Mi ubicación" (sirve también sin ruta)
  const [miPosLocal, setMiPosLocal] = useState<Coord | null>(null);
  const ubic = miUbicacion ?? miPosLocal;
  const fueraDeRegion = (lat: number, lng: number) =>
    lat < LOS_TUXTLAS_BOUNDS[0][0] || lat > LOS_TUXTLAS_BOUNDS[1][0] ||
    lng < LOS_TUXTLAS_BOUNDS[0][1] || lng > LOS_TUXTLAS_BOUNDS[1][1];
  const origenFueraDeRegion = !!ubic && fueraDeRegion(ubic[0], ubic[1]);
  // Zonas descargadas en otras partes de México (p. ej. Puebla) también
  // liberan el mapa: si no, no podrían verse sin internet.
  const [zonas, setZonas] = useState<ZonaOffline[]>(() => leerZonas());
  const hayZonaDescargadaFuera = zonas.some((z) =>
    fueraDeRegion((z.caja[1] + z.caja[3]) / 2, (z.caja[0] + z.caja[2]) / 2));
  // También se libera cuando el turista eligió ver servicios de otra zona.
  const hayZonaLibre = !!zonaLibre && zonaLibre.length > 0;
  const mapaLiberado = origenFueraDeRegion || hayZonaLibre || hayZonaDescargadaFuera;
  const origenFueraRef = useRef(mapaLiberado);
  origenFueraRef.current = mapaLiberado;
  // MapLibre revierte el límite a los pocos cientos de ms de aplicarlo
  // (copia estado entre transformaciones internas), así que además de
  // aplicarlo se verifica en idle/moveend y se corrige si no coincide.
  const aplicarLimiteRegion = useCallback(() => {
    const m = mapRef.current?.getMap();
    if (!m) return;
    const deseado = origenFueraRef.current ? LIMITES_MEXICO : LIMITES_REGION;
    const actual = m.getMaxBounds();
    if (actual && actual.getWest() === deseado[0][0] && actual.getNorth() === deseado[1][1]) return;
    m.setMaxBounds(deseado);
  }, []);
  useEffect(() => {
    aplicarLimiteRegion();
  }, [mapaLiberado, aplicarLimiteRegion]);

  // Al elegir una zona de fuera: encuadra sus servicios. Al salir de
  // ella: regresa a Los Tuxtlas (si no, la cámara quedaría fuera de la
  // caja que se vuelve a aplicar).
  const habiaZonaLibre = useRef(false);
  useEffect(() => {
    if (!hayZonaLibre && !habiaZonaLibre.current) return;
    // Se espera un instante: al elegir una zona, el contenedor del mapa
    // acaba de pasar de oculto a visible y la caja de la región todavía
    // no se ha quitado — mover la cámara antes la dejaba atrapada en el
    // borde de Los Tuxtlas (lo vimos en la prueba: el mapa se liberaba
    // pero seguía mostrando la laguna de Catemaco).
    const id = window.setTimeout(() => {
      const mapa = mapRef.current?.getMap();
      if (!mapa) return;
      mapa.resize();
      aplicarLimiteRegion(); // aplica o quita la caja ANTES de mover la cámara
      if (hayZonaLibre && zonaLibre) {
        habiaZonaLibre.current = true;
        const puntos = zonaLibre.map((l) => [l.coords[1], l.coords[0]] as [number, number]);
        if (puntos.length === 1) {
          mapa.flyTo({ center: puntos[0], zoom: 13, pitch: 0, duration: 1600 });
        } else {
          const caja = puntos.reduce(
            (b, p) => b.extend(p),
            new maplibregl.LngLatBounds(puntos[0], puntos[0])
          );
          mapa.fitBounds(caja, { padding: 80, maxZoom: 14, duration: 1600, pitch: 0 });
        }
      } else if (habiaZonaLibre.current) {
        habiaZonaLibre.current = false;
        mapa.flyTo({
          center: [LOS_TUXTLAS_CENTER[1], LOS_TUXTLAS_CENTER[0]],
          zoom: 11,
          pitch: 45,
          duration: 1400,
        });
      }
    }, 450);
    return () => window.clearTimeout(id);
  }, [zonaLibre, hayZonaLibre, aplicarLimiteRegion]);
  const [serviciosPrestadores, setServiciosPrestadores] = useState<Lugar[]>([]);
  // Vista satélite (Mapbox/Esri) en vez de calles vectoriales (OpenFreeMap) —
  // ver ESTILO_SATELITE arriba. El panel de capas es el mismo patrón visual
  // que el selector de Google Maps (icono de capas → opciones).
  const [vistaSatelite, setVistaSatelite] = useState(false);

  // ---- Mapas offline: descarga unificada por zona ----
  const sinConexion = useOffline();
  const [mostrarPanelOffline, setMostrarPanelOffline] = useState(false);
  const [tarea, setTarea] = useState<{ pct: number; etapa: string } | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const [avisoMapa, setAvisoMapa] = useState<string | null>(null);
  const cancelarRef = useRef<AbortController | null>(null);

  useEffect(() => { cargarIndiceMosaicos().then(cargarCobertura); }, []);

  // Descarga interrumpida (se cerró la app o se fue el internet): se ofrece reanudar
  const [pendiente, setPendiente] = useState<Pendiente | null>(() => leerPendiente());
  useEffect(() => {
    const revisar = () => setPendiente(leerPendiente());
    window.addEventListener('online', revisar);
    return () => window.removeEventListener('online', revisar);
  }, []);
  const reanudarDescarga = useCallback(async () => {
    const pd = leerPendiente();
    if (!pd || cancelarRef.current) return;
    const ctl = new AbortController();
    cancelarRef.current = ctl;
    setErrorDescarga(null);
    setTarea({ pct: 0, etapa: 'Retomando…' });
    try {
      const prog = (pct: number, etapa: string) => setTarea({ pct, etapa });
      if (pd.tipo === 'zona') await descargarZona(pd.caja, pd.conSatelite, pd.nombre, prog, ctl.signal);
      else await descargarRuta(pd.ruta, pd.conSatelite, prog, ctl.signal);
      olvidarGrafosZona();
      setZonas(leerZonas());
    } catch (e) {
      const err = e as Error;
      if (err.name !== 'AbortError') setAvisoMapa(err.message || 'No se pudo completar la descarga.');
    } finally {
      cancelarRef.current = null;
      setTarea(null);
      setPendiente(leerPendiente());
    }
  }, []);
  const descartarPendiente = () => { limpiarPendiente(); setPendiente(null); };

  // Aviso de bienvenida: sin ninguna zona guardada y con internet, se recuerda descargar
  const [avisoDescargaCerrado, setAvisoDescargaCerrado] = useState(() => {
    try { return localStorage.getItem('aviso-descarga-cerrado') === 'true'; } catch { return false; }
  });
  const cerrarAvisoDescarga = () => {
    setAvisoDescargaCerrado(true);
    try { localStorage.setItem('aviso-descarga-cerrado', 'true'); } catch { /* nada */ }
  };

  // Vista previa del cuadro a descargar (se dibuja en el mapa mientras el panel está abierto)
  const [previewCaja, setPreviewCaja] = useState<Caja | null>(null);
  const alPreview = useCallback((caja: Caja | null) => {
    setPreviewCaja(caja);
    const m = mapRef.current?.getMap();
    if (caja && m) {
      m.fitBounds([[caja[0], caja[1]], [caja[2], caja[3]]], {
        padding: { top: 70, left: 24, right: 24, bottom: Math.round(window.innerHeight * 0.6) },
        duration: 500, pitch: 0,
      });
    }
  }, []);

  // Sin internet y mirando una parte del mapa que no se descargó
  const [sinMapaAqui, setSinMapaAqui] = useState(false);
  const revisarCobertura = useCallback(() => {
    if (navigator.onLine) { setSinMapaAqui(false); return; }
    const c = mapRef.current?.getMap()?.getCenter();
    if (c) setSinMapaAqui(!estaCubierto(c.lat, c.lng));
  }, []);
  useEffect(() => { revisarCobertura(); }, [sinConexion, zonas, revisarCobertura]);
  const irAMapaGuardado = useCallback(() => {
    const z = zonas[zonas.length - 1];
    const m = mapRef.current?.getMap();
    if (!z || !m) return;
    m.flyTo({ center: [(z.caja[0] + z.caja[2]) / 2, (z.caja[1] + z.caja[3]) / 2], zoom: z.corredor ? 9 : 12, pitch: 0, duration: 1200 });
  }, [zonas]);

  // Botón "Mi ubicación": funciona también sin internet (es GPS). Si estás
  // fuera de Los Tuxtlas, el mapa se libera y te lleva ahí.
  const irAMiUbicacion = useCallback(async () => {
    const r = await obtenerUbicacionGPS();
    if (!r) {
      setAvisoMapa('No pude obtener tu ubicación. Revisa el permiso de ubicación del navegador.');
      return;
    }
    setMiPosLocal(r.coord);
    window.setTimeout(() => {
      const m = mapRef.current?.getMap();
      if (!m) return;
      aplicarLimiteRegion();
      m.flyTo({ center: [r.coord[1], r.coord[0]], zoom: 14, pitch: 0, duration: 1200 });
    }, 500);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Guardar la ruta dibujada junto con su mapa (franja de calles + satélite)
  const [geomGuardada, setGeomGuardada] = useState<Coord[] | null>(null);
  const rutaGuardable = !!rutaResaltada && rutaResaltada.length >= 2 && !infoRuta?.aproximada && !!datosRuta;
  const mbGuardarRuta = useMemo(
    () => (rutaGuardable && rutaResaltada ? planearCorredor(rutaResaltada, true).mbTotal : undefined),
    [rutaGuardable, rutaResaltada]
  );
  const guardarRuta = useCallback(async () => {
    if (!datosRuta || !rutaResaltada || cancelarRef.current) return;
    const ctl = new AbortController();
    cancelarRef.current = ctl;
    setErrorDescarga(null);
    setTarea({ pct: 0, etapa: 'Preparando…' });
    const geom = rutaResaltada;
    try {
      await descargarRuta(
        {
          nombre: datosRuta.nombre, modo: datosRuta.modo, geometria: geom,
          puntos: datosRuta.puntos, paradas: datosRuta.paradas,
          distanciaMetros: datosRuta.distanciaMetros, duracionSegundos: datosRuta.duracionSegundos,
        },
        true,
        (pct, etapa) => setTarea({ pct, etapa }),
        ctl.signal
      );
      olvidarGrafosZona();
      setZonas(leerZonas());
      setGeomGuardada(geom);
    } catch (e) {
      const err = e as Error;
      if (err.name !== 'AbortError') {
        console.error('[TuxtlasGO] Guardar ruta offline:', err);
        setAvisoMapa(err.message || 'No se pudo guardar la ruta.');
      }
    } finally {
      cancelarRef.current = null;
      setTarea(null);
    }
  }, [datosRuta, rutaResaltada]);

  const abrirRutaGuardada = useCallback(async (id: string) => {
    const r = await leerRutaGuardada(id);
    if (!r) { setAvisoMapa('No se encontró esa ruta guardada.'); return; }
    setMostrarPanelOffline(false);
    setGeomGuardada(r.geometria as Coord[]);
    onAbrirRutaGuardada?.(r);
  }, [onAbrirRutaGuardada]);

  // Centro de lo que se ve en el mapa: la zona se descarga alrededor de ahí
  const centroMapa = useCallback((): [number, number] => {
    const c = mapRef.current?.getMap()?.getCenter();
    return c ? [c.lat, c.lng] : [LOS_TUXTLAS_CENTER[0], LOS_TUXTLAS_CENTER[1]];
  }, []);

  const iniciarDescarga = useCallback(async (tamano: TamanoZona, conSatelite: boolean, centroElegido?: [number, number]) => {
    if (cancelarRef.current) return;
    const ctl = new AbortController();
    cancelarRef.current = ctl;
    setErrorDescarga(null);
    setTarea({ pct: 0, etapa: 'Preparando…' });
    const centro = centroElegido ?? centroMapa();
    const caja = cajaDeZona(tamano, centro);
    const nombre = tamano === 'tuxtlas'
      ? 'Los Tuxtlas'
      : `Zona ${centro[0].toFixed(2)}, ${centro[1].toFixed(2)}`;
    try {
      await descargarZona(caja, conSatelite, nombre, (pct, etapa) => setTarea({ pct, etapa }), ctl.signal);
      olvidarGrafosZona();
      setZonas(leerZonas());
      setMostrarPanelOffline(false);
    } catch (e) {
      const err = e as Error;
      if (err.name !== 'AbortError') {
        console.error('[TuxtlasGO] Descarga de mapa offline:', err);
        setErrorDescarga(err.message || 'No se pudo completar la descarga.');
      }
    } finally {
      cancelarRef.current = null;
      setTarea(null);
    }
  }, [centroMapa]);

  // Satélite guardado: el nivel más fino que tienen TODAS las zonas con
  // satélite (conservador). Sin internet la fuente se limita a ese nivel y el
  // mapa estira la imagen dos niveles más, en vez de dejar mosaicos en blanco.
  const zonasConSatelite = zonas.filter((z) => z.satelite);
  const zoomSateliteGuardado = zonasConSatelite.length
    ? Math.min(...zonasConSatelite.map((z) => z.satelite!.zoomMax))
    : 0;

  // Sin internet, el satélite solo existe si se descargó; si no, se vuelve a
  // calles en vez de dejar el mapa en blanco.
  useEffect(() => {
    if (sinConexion && vistaSatelite && zonasConSatelite.length === 0) {
      setVistaSatelite(false);
      setAvisoMapa('El satélite no está descargado: se muestran las calles. Descárgalo con internet desde "Mapa sin internet".');
    }
  }, [sinConexion, vistaSatelite, zonasConSatelite.length]);
  useEffect(() => {
    if (!avisoMapa) return;
    const id = window.setTimeout(() => setAvisoMapa(null), 6000);
    return () => window.clearTimeout(id);
  }, [avisoMapa]);
  const satelitePorZonas = sinConexion && zonasConSatelite.length > 0;
  const zoomMaxSatelite = satelitePorZonas
    ? Math.min(ZOOM_SATELITE_MAX, zoomSateliteGuardado + 2)
    : ZOOM_SATELITE_MAX;
  const estiloSatActual = useMemo(
    () => estiloSatelite(satelitePorZonas ? zoomSateliteGuardado : ZOOM_SATELITE_FUENTE),
    [satelitePorZonas, zoomSateliteGuardado]
  );
  // Al pasar a satélite, si la cámara está más cerca de lo permitido, se aleja.
  useEffect(() => {
    if (!vistaSatelite) return;
    const m = mapRef.current?.getMap();
    if (m && m.getZoom() > zoomMaxSatelite) m.easeTo({ zoom: zoomMaxSatelite, duration: 600 });
  }, [vistaSatelite, zoomMaxSatelite]);
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


  // Filtro por categoría — propio del mapa, no depende de que el
  // padre pase `filtroCategorias`. Botón "Filtros" del cluster de
  // controles, abajo. Solo nuestras categorías reales (CATEGORIAS de
  // data/lugares.ts), no se copia el widget completo de mindtrip
  // (avatares/precios no aplican aquí).
  const [categoriaFiltroInterna, setCategoriaFiltroInterna] = useState<string | null>(null);
  const [mostrarFiltroCategorias, setMostrarFiltroCategorias] = useState(false);

  const todosLosLugares = useMemo(() => {
    let base = [...LUGARES, ...serviciosPrestadores];
    if (filtroCategorias && filtroCategorias.length > 0) {
      base = base.filter((l) => filtroCategorias.includes(l.categoria));
    }
    if (categoriaFiltroInterna) {
      base = base.filter((l) => l.categoria === categoriaFiltroInterna);
    }
    return base;
  }, [serviciosPrestadores, filtroCategorias, categoriaFiltroInterna]);

  // Para los contadores del panel de filtro — ANTES de aplicar el
  // filtro interno (si no, la categoría elegida siempre mostraría el
  // total completo y las demás 0, cuando lo útil es ver cuántas hay
  // de cada una para decidir a cuál cambiar).
  const lugaresParaConteo = useMemo(() => {
    const base = [...LUGARES, ...serviciosPrestadores];
    if (filtroCategorias && filtroCategorias.length > 0) {
      return base.filter((l) => filtroCategorias.includes(l.categoria));
    }
    return base;
  }, [serviciosPrestadores, filtroCategorias]);

  // GeoJSON de las "edificaciones" sintéticas — un cuadro pequeño por
  // cada lugar registrado, coloreado según su categoría. Ver nota en
  // ALTURA_CATEGORIA arriba: esto reemplaza tener que verificar si
  // OSM ya tiene el edificio real de cada sitio.
  const edificiosGeoJSON = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: todosLosLugares.map((lugar) => ({
        type: 'Feature' as const,
        properties: {
          color: COLORES_CATEGORIA[lugar.categoria] || '#166534',
          altura: ALTURA_CATEGORIA[lugar.categoria] ?? 6,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            cuadroMetros(
              lugar.coords[0],
              lugar.coords[1],
              RADIO_CATEGORIA[lugar.categoria] ?? 5
            ),
          ],
        },
      })),
    };
  }, [todosLosLugares]);


  // GeoJSON de la ruta del dia - MapLibre/GeoJSON usan [lng, lat],
  // al reves de Leaflet ([lat, lng], que es como sigue llegando desde
  // props por compatibilidad con el resto de la app) - se voltea aqui,
  // en un solo lugar, para no tener que tocar nada mas.
  //
  // Antes esto era una sola Feature (una línea, un solo color verde
  // de punta a punta) — ahora es una FeatureCollection con una
  // Feature POR TRAMO (parada A → parada B, B → C...), cada una con
  // su propio color (colorTramo) vía data-driven styling de MapLibre
  // ('line-color': ['get','color']). Así se distingue de un vistazo
  // por dónde se mueve el turista en cada segmento del recorrido, en
  // vez de ver todo como una sola línea continua.
  //
  // Si no llegan tramosResaltados (por compatibilidad, p.ej. algún
  // llamador viejo que solo pase rutaResaltada), cae a tratar toda la
  // ruta como un solo tramo — se sigue viendo una línea, solo que de
  // un color en vez de varios.
  const rutaGeoJSON = useMemo(() => {
    const tramos: [number, number][][] =
      tramosResaltados && tramosResaltados.length > 0
        ? tramosResaltados
        : rutaResaltada && rutaResaltada.length >= 2
          ? [rutaResaltada]
          : [];
    const tramosValidos = tramos.filter((t) => t.length >= 2);
    if (tramosValidos.length === 0) return null;
    return {
      type: 'FeatureCollection' as const,
      features: tramosValidos.map((tramo, i) => ({
        type: 'Feature' as const,
        properties: { color: colorTramo(i) },
        geometry: {
          type: 'LineString' as const,
          coordinates: tramo.map(([lat, lng]) => [lng, lat]),
        },
      })),
    };
  }, [rutaResaltada, tramosResaltados]);

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
    if (navegandoRef.current) return;
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
      if (miUbicacion && !origenFueraDeRegion && !cancelado()) {
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
    <div ref={contenedorRef} role="region" aria-label={t('Mapa de lugares')} className="relative h-full">
      <p className="sr-only">{t('El mapa es visual. Para recorrer los lugares con lector de pantalla usa la pestaña Explorar.')}</p>
      {hayZonaLibre && onSalirZonaLibre && (
        <button
          onClick={onSalirZonaLibre}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-jungle-700 hover:bg-jungle-800 text-white shadow-lg rounded-full px-4 py-2 flex items-center gap-1.5 text-sm font-semibold"
        >
          ← {t('Volver a Los Tuxtlas')}
        </button>
      )}
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: LOS_TUXTLAS_CENTER[1],
          latitude: LOS_TUXTLAS_CENTER[0],
          zoom: 11,
          pitch: 45,
        }}
        pixelRatio={PIXEL_RATIO_MAPA}
        fadeDuration={GAMA_BAJA ? 0 : 300}
        minZoom={mapaLiberado ? 4 : 9}
        maxZoom={vistaSatelite ? zoomMaxSatelite : 18}
        transformRequest={(url: string) => ({ url: ajustarUrlSinConexion(url) })}
        // Turista de otro estado (Tabasco, CDMX, Jalisco...): si su
        // ubicación cae fuera de Los Tuxtlas, el recuadro encerraba la
        // cámara y no podía ver su ruta ni su seguimiento. Sin origen
        // lejano se conserva el límite de siempre.
        // El límite se quita/restaura con map.setMaxBounds en el efecto
        // de la ruta: pasar undefined por prop no lo limpia, y pasar el
        // mundo entero hace fallar a MapLibre.
        onLoad={aplicarLimiteRegion}
        onIdle={aplicarLimiteRegion}
        onMoveEnd={() => { aplicarLimiteRegion(); revisarCobertura(); }}
        onClick={(e) => { if (elegirOrigen && onElegirOrigen) onElegirOrigen([e.lngLat.lat, e.lngLat.lng]); }}
        cursor={elegirOrigen ? 'crosshair' : undefined}
        mapStyle={vistaSatelite ? (estiloSatActual as any) : ESTILO_MAPA}
        style={{ width: '100%', height: '100%' }}
      >
        {previewCaja && (
          <Source
            id="preview-zona"
            type="geojson"
            data={{
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [[
                  [previewCaja[0], previewCaja[1]], [previewCaja[2], previewCaja[1]],
                  [previewCaja[2], previewCaja[3]], [previewCaja[0], previewCaja[3]], [previewCaja[0], previewCaja[1]],
                ]],
              },
            } as any}
          >
            <Layer id="preview-zona-relleno" type="fill" paint={{ 'fill-color': '#16a34a', 'fill-opacity': 0.12 }} />
            <Layer id="preview-zona-borde" type="line" paint={{ 'line-color': '#15803d', 'line-width': 3, 'line-dasharray': [2, 1] }} />
          </Source>
        )}

        {edificiosGeoJSON.features.length > 0 && (
          <Source id="edificios-servicios" type="geojson" data={edificiosGeoJSON as any}>
            <Layer
              id="edificios-servicios-capa"
              type="fill-extrusion"
              paint={{
                'fill-extrusion-color': ['get', 'color'],
                'fill-extrusion-height': ['get', 'altura'],
                'fill-extrusion-base': 0,
                'fill-extrusion-opacity': 0.85,
              }}
            />
          </Source>
        )}

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

        {navPos && (
          <Marker longitude={navPos[1]} latitude={navPos[0]}>
            <PinMiUbicacion />
          </Marker>
        )}

        {ubic && !navPos && (
          <Marker longitude={ubic[1]} latitude={ubic[0]}>
            <PinMiUbicacion />
          </Marker>
        )}

        {rutaGeoJSON && (
          <Source id="ruta-dia" type="geojson" data={rutaGeoJSON as any}>
            <Layer
              id="ruta-dia-linea"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.85 }}
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
        {/* Filtros — categorías reales del catálogo. Blanco como el
            resto del cluster a propósito: un botón verde sólido aquí
            competía visualmente con los pines y con "Cerrar ruta" —
            mismo lenguaje que Capas/Zoom/Brújula, solo el ARO interior
            se pinta cuando hay un filtro activo, no el botón entero. */}
        <div className="relative">
          <button
            onClick={() => setMostrarFiltroCategorias((v) => !v)}
            className={`w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center border hover:bg-jungle-50 ${categoriaFiltroInterna ? 'border-jungle-600 text-jungle-700' : 'border-jungle-100 text-jungle-800'
              }`}
            title={t('Filtrar por categoría')}
            aria-label={t('Filtrar lugares por categoría')}
            aria-expanded={mostrarFiltroCategorias}
          >
            <SlidersHorizontal size={17} />
          </button>

          {mostrarFiltroCategorias && (
            <div className="absolute right-12 bottom-0 w-56 bg-white rounded-2xl shadow-xl border border-jungle-100 p-2 max-h-[70vh] overflow-y-auto">
              <button
                onClick={() => { setCategoriaFiltroInterna(null); setMostrarFiltroCategorias(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-left ${!categoriaFiltroInterna ? 'bg-jungle-50 text-jungle-700' : 'text-jungle-800 hover:bg-jungle-50'
                  }`}
              >
                <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${!categoriaFiltroInterna ? 'border-jungle-700 bg-jungle-700' : 'border-jungle-300'}`} />
                {t('Todos')}
                <span className="ml-auto text-xs font-normal text-jungle-500">{lugaresParaConteo.length}</span>
              </button>
              {CATEGORIAS.map((c) => {
                const cantidad = lugaresParaConteo.filter((l) => l.categoria === c.id).length;
                const activa = categoriaFiltroInterna === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => { setCategoriaFiltroInterna(c.id); setMostrarFiltroCategorias(false); }}
                    disabled={cantidad === 0}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-left disabled:opacity-35 ${activa ? 'bg-jungle-50 text-jungle-700' : 'text-jungle-800 hover:bg-jungle-50'
                      }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${activa ? 'border-jungle-700 bg-jungle-700' : 'border-jungle-300'}`} />
                    <span>{c.emoji} {t(c.id)}</span>
                    <span className="ml-auto text-xs font-normal text-jungle-500">{cantidad}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Capas: Calles / Satélite */}
        <div className="relative">
          <button
            onClick={() => setMostrarCapas((v) => !v)}
            className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-jungle-800 hover:bg-jungle-50 border border-jungle-100"
            title={t('Tipo de mapa')}
            aria-label={t('Cambiar tipo de mapa')}
            aria-expanded={mostrarCapas}
          >
            <Layers size={18} />
          </button>

          {mostrarCapas && (
            <div className="absolute right-12 top-0 bg-white rounded-2xl shadow-xl border border-jungle-100 p-2 flex gap-2">
              <button
                onClick={() => { setVistaSatelite(false); setMostrarCapas(false); }}
                className={`w-16 flex flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-semibold ${!vistaSatelite ? 'bg-jungle-700 text-white' : 'text-jungle-800 hover:bg-jungle-50'
                  }`}
              >
                <MapIcon size={18} />
                {t('Calles')}
              </button>
              <button
                onClick={() => { setVistaSatelite(true); setMostrarCapas(false); }}
                className={`w-16 flex flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-semibold ${vistaSatelite ? 'bg-jungle-700 text-white' : 'text-jungle-800 hover:bg-jungle-50'
                  }`}
              >
                <Satellite size={18} />
                {t('Satélite')}
              </button>
            </div>
          )}
        </div>

        {/* Zoom +/- */}
        <div className="bg-white rounded-2xl shadow-lg border border-jungle-100 flex flex-col overflow-hidden">
          <button
            onClick={() => mapRef.current?.getMap()?.zoomIn({ duration: 250 })}
            className="w-10 h-10 flex items-center justify-center text-jungle-800 hover:bg-jungle-50 border-b border-jungle-100"
            aria-label={t('Acercar')}
            title={t('Acercar')}
          >
            <Plus size={18} />
          </button>
          <button
            onClick={() => mapRef.current?.getMap()?.zoomOut({ duration: 250 })}
            className="w-10 h-10 flex items-center justify-center text-jungle-800 hover:bg-jungle-50"
            aria-label={t('Alejar')}
            title={t('Alejar')}
          >
            <Minus size={18} />
          </button>
        </div>

        <button
          onClick={irAMiUbicacion}
          className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-jungle-800 hover:bg-jungle-50 border border-jungle-100"
          title={t('Mi ubicación')}
          aria-label={t('Ir a mi ubicación')}
        >
          <LocateFixed size={18} />
        </button>

        {/* Brujula/reset */}
        <button
          onClick={resetearVista}
          className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-jungle-800 hover:bg-jungle-50 border border-jungle-100"
          title={t('Regresar a Los Tuxtlas')}
          aria-label={t('Regresar al centro del mapa')}
        >
          <Compass size={20} />
        </button>
      </div>

      {/* Pill flotante: cerrar ruta resaltada — solo escritorio, en
          móvil esta función ya la absorbe el botón "Cerrar mapa" de
          arriba (antes se veían los dos juntos, redundante). */}
      {rutaResaltada && onLimpiarRuta && (
        <button
          onClick={onLimpiarRuta}
          className="hidden lg:flex absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-jungle-700 hover:bg-jungle-800 text-white shadow-lg rounded-full pl-3.5 pr-4 py-1.5 items-center gap-1.5 text-xs font-semibold"
          aria-label={t('Cerrar ruta y volver al mapa normal')}
        >
          <X size={14} />
          {t('Cerrar ruta')}
        </button>
      )}

      {/* Botón de mapas sin internet — oculto en la vista previa chica
          de Explorar, ahí choca con el buscador que flota encima. */}
      {!vistaCompacta && (
        <div className="absolute top-14 right-3 z-30">
          {tarea ? (
            <div className="bg-white shadow-lg rounded-xl px-3 py-2.5 flex flex-col gap-1 min-w-[180px]">
              <div className="flex items-center gap-2 text-sm font-semibold text-jungle-800">
                <Loader2 size={14} className="animate-spin flex-shrink-0" />
                {t('Guardando mapa…')} {tarea.pct}%
              </div>
              <div className="w-full bg-jungle-100 rounded-full h-1.5">
                <div className="bg-jungle-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${tarea.pct}%` }} />
              </div>
              <p className="text-[10px] text-jungle-500">{tarea.etapa}</p>
              <button
                onClick={() => cancelarRef.current?.abort()}
                className="text-[11px] font-semibold text-jungle-700 underline self-start"
              >
                {t('Cancelar')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setErrorDescarga(null); setMostrarPanelOffline(true); }}
              className="bg-white hover:bg-jungle-50 shadow-lg rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-jungle-900"
              aria-label={t('Mapa sin internet')}
            >
              {zonas.length > 0
                ? <CheckCircle2 size={14} className="text-jungle-600 flex-shrink-0" />
                : <Download size={14} className="flex-shrink-0" />}
              <span>{zonas.length > 0 ? t('Mapa offline ✓') : t('Descargar mapa')}</span>
            </button>
          )}
        </div>
      )}

      {rutaResaltada && rutaResaltada.length >= 2 && infoRuta && !vistaCompacta && onCambiarModoRuta && onRecalcularRuta && (
        <NavegacionRuta
          geometria={rutaResaltada}
          modo={infoRuta.modo}
          distanciaMetros={infoRuta.distanciaMetros}
          duracionSegundos={infoRuta.duracionSegundos}
          aproximada={infoRuta.aproximada}
          calculando={infoRuta.calculando}
          onCambiarModo={onCambiarModoRuta}
          onRecalcular={onRecalcularRuta}
          onPosicion={alPosicion}
          onNavegando={setNavegando}
          onGuardar={rutaGuardable ? guardarRuta : undefined}
          mbGuardar={mbGuardarRuta}
          guardando={!!tarea}
          guardada={!!rutaResaltada && geomGuardada === rutaResaltada}
          zonasClave={zonas.map((z) => z.id).join(',')}
        />
      )}

      {/* Una sola tarjeta de aviso a la vez, por prioridad */}
      {!vistaCompacta && !tarea && !mostrarPanelOffline && (() => {
        const tarjeta = 'absolute top-28 left-3 right-3 z-30 rounded-xl px-3 py-2 shadow-lg text-xs ';
        if (elegirOrigen) {
          return (
            <div role="status" className={tarjeta + 'bg-jungle-700 text-white'}>
              <p className="font-semibold mb-1.5">No pude ubicarte. Toca en el mapa el punto desde donde sales para ir a {elegirOrigen.nombre}.</p>
              <button onClick={onCancelarElegirOrigen} className="underline font-semibold">Cancelar</button>
            </div>
          );
        }
        if (pendiente && !sinConexion) {
          return (
            <div role="status" className={tarjeta + 'bg-amber-50 border border-amber-300 text-amber-900'}>
              <p className="font-semibold mb-1.5">Quedó una descarga de mapa a medias. Lo ya guardado no se repite.</p>
              <button onClick={reanudarDescarga} className="font-bold underline mr-3">Reanudar</button>
              <button onClick={descartarPendiente} className="underline">Descartar</button>
            </div>
          );
        }
        if (sinMapaAqui) {
          return (
            <div role="status" className={tarjeta + 'bg-amber-50 border border-amber-300 text-amber-900'}>
              <p className="font-semibold mb-1.5">
                {zonas.length === 0
                  ? 'Sin internet y sin mapa descargado: el fondo se verá en blanco.'
                  : 'Esta parte del mapa no está descargada: se verá en blanco.'}
              </p>
              {zonas.length > 0 && <button onClick={irAMapaGuardado} className="font-bold underline">Ir a mi mapa guardado</button>}
            </div>
          );
        }
        if (!sinConexion && zonas.length === 0 && !avisoDescargaCerrado && !rutaResaltada) {
          return (
            <div role="status" className={tarjeta + 'bg-white border border-jungle-200 text-jungle-900'}>
              <p className="font-semibold mb-1.5">¿Vas a salir de señal? Guarda el mapa ahora, con Wi-Fi, para usarlo sin internet.</p>
              <button onClick={() => { setErrorDescarga(null); setMostrarPanelOffline(true); }} className="font-bold underline mr-3 text-jungle-700">Descargar mapa</button>
              <button onClick={cerrarAvisoDescarga} className="underline">Ahora no</button>
            </div>
          );
        }
        return null;
      })()}

      {avisoMapa && (
        <div role="status" className="absolute top-28 left-3 right-3 z-30 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold rounded-xl px-3 py-2 shadow-lg">
          {avisoMapa}
        </div>
      )}

      {/* Panel: qué hay guardado y qué se puede descargar */}
      {mostrarPanelOffline && (
        <PanelMapaOffline
          zonas={zonas}
          sinConexion={sinConexion}
          error={errorDescarga}
          centro={centroMapa()}
          onPreview={alPreview}
          onCerrar={() => setMostrarPanelOffline(false)}
          onDescargar={iniciarDescarga}
          onAbrirRuta={abrirRutaGuardada}
          onBorrarZona={async (id) => { await borrarZona(id); olvidarGrafosZona(); setZonas(leerZonas()); }}
          onBorrarTodo={async () => { await borrarMapaOffline(); olvidarGrafosZona(); setZonas(leerZonas()); }}
        />
      )}
    </div>
  );
}

function fechaCorta(ms: number) {
  return new Date(ms).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function PanelMapaOffline({
  zonas, sinConexion, error, centro, onCerrar, onDescargar, onAbrirRuta, onBorrarZona, onBorrarTodo, onPreview,
}: {
  zonas: ZonaOffline[];
  sinConexion: boolean;
  error: string | null;
  centro: [number, number];
  onCerrar: () => void;
  onDescargar: (tamano: TamanoZona, conSatelite: boolean, centro: [number, number]) => void;
  onAbrirRuta: (id: string) => void;
  onBorrarZona: (id: string) => void;
  onBorrarTodo: () => void;
  onPreview: (caja: Caja | null) => void;
}) {
  const t = useT();
  // El centro se fija al abrir el panel (si siguiera al mapa, la zona se movería sola)
  const centroInicial = useRef(centro).current;
  const [desde, setDesde] = useState<'mapa' | 'yo'>('mapa');
  const [miPos, setMiPos] = useState<[number, number] | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [avisoGps, setAvisoGps] = useState<string | null>(null);
  const [tamano, setTamano] = useState<TamanoZona>('ciudad');
  const [conSatelite, setConSatelite] = useState(true);
  const centroEfectivo: [number, number] = desde === 'yo' && miPos ? miPos : centroInicial;
  const caja = useMemo(() => cajaDeZona(tamano, centroEfectivo), [tamano, centroEfectivo]);
  const plan = useMemo(() => planearZona(caja, conSatelite), [caja, conSatelite]);

  // Dibuja en el mapa el cuadro que se va a descargar
  useEffect(() => {
    onPreview(caja);
  }, [caja]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreview(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const usarMiUbicacion = async () => {
    setAvisoGps(null);
    setBuscandoGps(true);
    const r = await obtenerUbicacionGPS();
    setBuscandoGps(false);
    if (!r) {
      setAvisoGps('No pude obtener tu ubicación. Revisa el permiso de ubicación; mientras tanto puedes mover el mapa y elegir "Lo que veo".');
      return;
    }
    setMiPos(r.coord);
    setDesde('yo');
  };

  return (
    <div className="absolute inset-0 z-40 bg-black/15 flex items-end justify-center p-3" onClick={onCerrar}>
      <div className="bg-white rounded-2xl p-4 w-full max-w-sm max-h-[64%] overflow-y-auto animate-fade-in shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h3 className="font-display font-bold text-lg text-jungle-950">{t('Mapa sin internet')}</h3>
          <button onClick={onCerrar} className="text-jungle-400 hover:text-jungle-700" aria-label={t('Cerrar')}>
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-jungle-600 mb-3">
          {zonas.length > 0
            ? t('Ya tienes mapas guardados: todo lo que quede dentro funciona sin internet, sin preguntar nada. Agrega otra zona solo si vas a salir de ellas.')
            : t('Guarda calles, edificios, satélite, rutas y senderos de una zona de México para usarlos sin señal. Hazlo con Wi-Fi antes de salir.')}
        </p>

        {error && (
          <p role="alert" className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>
        )}
        {sinConexion && (
          <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            {t('Estás sin internet: para descargar necesitas conectarte.')}
          </p>
        )}

        <p className="text-xs font-semibold text-jungle-800 mb-1.5">1. {t('¿Alrededor de qué punto?')}</p>
        <div className="grid grid-cols-2 gap-2 mb-1.5">
          <button
            onClick={() => setDesde('mapa')}
            aria-pressed={desde === 'mapa'}
            className={'rounded-xl border-2 px-2 py-2 text-xs font-semibold ' + (desde === 'mapa' ? 'border-jungle-700 bg-jungle-50 text-jungle-900' : 'border-jungle-100 text-jungle-700')}
          >
            {t('Lo que veo en el mapa')}
          </button>
          <button
            onClick={usarMiUbicacion}
            disabled={buscandoGps}
            aria-pressed={desde === 'yo'}
            className={'rounded-xl border-2 px-2 py-2 text-xs font-semibold disabled:opacity-60 ' + (desde === 'yo' ? 'border-jungle-700 bg-jungle-50 text-jungle-900' : 'border-jungle-100 text-jungle-700')}
          >
            {buscandoGps ? t('Buscando…') : t('Donde estoy ahora')}
          </button>
        </div>
        {avisoGps && <p className="text-[11px] text-amber-800 mb-1.5">{avisoGps}</p>}
        <p className="text-[11px] text-jungle-500 mb-3">{t('El cuadro verde en el mapa es lo que se va a guardar.')}</p>

        <p className="text-xs font-semibold text-jungle-800 mb-1.5">2. {t('Tamaño')}</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {TAMANOS.map((o) => (
            <button
              key={o.id}
              onClick={() => setTamano(o.id)}
              aria-pressed={tamano === o.id}
              className={'text-left rounded-xl border-2 px-3 py-1.5 ' + (tamano === o.id
                ? 'border-jungle-700 bg-jungle-50' : 'border-jungle-100 hover:bg-jungle-50')}
            >
              <div className="text-sm font-semibold text-jungle-900">{t(o.nombre)}</div>
              <div className="text-[11px] text-jungle-600">{t(o.detalle)}</div>
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-jungle-900 font-semibold mb-3">
          <input type="checkbox" checked={conSatelite} onChange={(e) => setConSatelite(e.target.checked)} className="w-4 h-4 accent-jungle-700" />
          <Satellite size={15} /> {t('Incluir satélite')}
          {conSatelite && <span className="text-[11px] font-normal text-jungle-600">({t('acercamiento hasta')} {plan.satelite.zoomMax})</span>}
        </label>

        <button
          disabled={sinConexion}
          onClick={() => onDescargar(tamano, conSatelite, centroEfectivo)}
          className="w-full bg-jungle-700 disabled:opacity-40 text-white py-2.5 rounded-xl font-semibold text-sm"
        >
          {t('Descargar zona')} (~{plan.mbTotal} MB)
        </button>
        <p className="text-[11px] text-jungle-500 mt-1.5 mb-3">
          {t('Si se va el internet, la descarga se pausa y sigue sola. Puedes cancelar cuando quieras.')}
        </p>

        {zonas.length > 0 && (
          <div className="border-t border-jungle-100 pt-3">
            <p className="text-xs font-semibold text-jungle-800 mb-1.5">{t('Zonas y rutas guardadas')}</p>
            <ul className="space-y-1.5 mb-2">
              {zonas.map((z) => (
                <li key={z.id} className="flex items-center gap-2 text-xs text-jungle-800 bg-jungle-50 rounded-lg px-2.5 py-1.5">
                  <CheckCircle2 size={14} className="text-jungle-600 flex-shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold">{z.nombre}</span>
                    <span className="block text-[10px] text-jungle-500">
                      {z.ruta ? `${t('Ruta')} · ${z.ruta.distanciaMetros ? Math.round(z.ruta.distanciaMetros / 1000) + ' km · ' : ''}` : ''}{fechaCorta(z.fecha)} · {z.satelite ? t('con satélite') : t('sin satélite')} · {z.grafo ? t('rutas listas') : t('sin rutas offline')}
                    </span>
                  </span>
                  {z.ruta && (
                    <button onClick={() => onAbrirRuta(z.id)} className="text-jungle-700 font-semibold underline">{t('Abrir')}</button>
                  )}
                  <button onClick={() => onBorrarZona(z.id)} className="text-red-700 font-semibold underline">{t('Borrar')}</button>
                </li>
              ))}
            </ul>
            <button onClick={onBorrarTodo} className="text-xs font-semibold text-red-700 underline">
              {t('Borrar todos los mapas descargados')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
