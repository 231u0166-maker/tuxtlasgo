import { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { Map, Marker, Source, Layer, type MapRef } from '@vis.gl/react-maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { WifiOff, Plus, Minus, Maximize2 } from 'lucide-react';
import { CATEGORIAS, type Lugar } from '../data/lugares';
import { ESTILO_MAPA, COLORES_CATEGORIA } from './MapScreen';
import { mapaDescargado } from '../lib/db';
import { useOffline } from '../hooks/useOffline';
import { colorTramo } from '../lib/colores';
import { obtenerRutaPorTramos } from '../lib/routing';

// ============================================================
// MINI-MAPA DENTRO DEL CHAT
// ============================================================
// Igual que cuando Google Maps aparece incrustado dentro de una
// respuesta de Gemini: en vez de que el turista tenga que salir del
// chat al tab del mapa para saber "dónde queda eso", lo ve de una
// vez aquí mismo — referencia geoespacial inmediata, más visual, y
// que empuja a querer ir al lugar (por eso vale la pena aunque ya
// exista el mapa completo aparte).
//
// Usa el MISMO estilo/tiles que la pantalla de Mapa (ESTILO_MAPA,
// importado desde MapScreen) — así que si el turista ya descargó el
// mapa para usar offline, este mini-mapa también funciona sin
// internet de forma automática, sin ningún código extra: son las
// mismas URLs, cacheadas por el mismo Service Worker.
//
// Si NO hay internet y el mapa tampoco se descargó, no hay tiles que
// mostrar — en vez de dejar un lienzo en blanco o roto, se avisa con
// claridad y se invita a descargarlo (mismo tono que el resto de la
// app en esos casos).
//
// Hallazgo real de campo: las líneas entre paradas eran RECTAS
// (una vista previa aproximada, sin llamar a OSRM) — pero Google Maps
// (la referencia que se comparó) sigue las calles de verdad. Ahora:
//   - Para la respuesta de distancia (A→B): se reusa la geometría REAL
//     que ya se calculó por carretera para dar el texto de tiempo —
//     antes se recalculaba una línea recta aparte para el dibujo, dos
//     fuentes de verdad para la misma pregunta.
//   - Para una ruta de varios días (numerado): se pide la ruta real
//     por tramo en cuanto se monta el mini-mapa. Mientras carga (o si
//     falla/no hay internet), se ve la línea recta punteada como antes
//     — nunca se rompe, solo se ve menos precisa hasta que llega la
//     real. Una vez que llega, se reemplaza por la línea sólida real.
//
// Nota de rendimiento: cada mini-mapa es una instancia real de
// MapLibre GL (WebGL). Los navegadores (sobre todo Safari/iOS)
// limitan cuántos contextos WebGL pueden vivir a la vez. Por eso
// solo se manda a renderizar para los mensajes dentro de la
// "ventana de mapas vivos" (ver `mapasVivos` en ChatAssistant.tsx) —
// los mensajes que quedan fuera de esa ventana se quedan con sus
// tarjetas y botones de siempre, sin mini-mapa, para no acumular
// mapas invisibles fuera de vista.
// ============================================================

interface Props {
  lugares: Lugar[];
  // true = pinta círculos numerados (1, 2, 3...) como una ruta del
  // día; false/undefined = pines de categoría (recomendaciones sueltas).
  numerado?: boolean;
  // Ubicación del turista, SOLO para la respuesta de "cuánto tiempo me
  // tomaría llegar" — dibuja un pin "A" (tu ubicación) y el lugar como
  // "B", igual que la vista previa de Google Maps ("Tiempo a X desde
  // Catemaco"). Solo tiene sentido junto con un único lugar en `lugares`.
  origen?: [number, number];
  // Geometría REAL ya calculada por carretera (viene de
  // obtenerRutaPorCarretera, reusada del cálculo de distancia/tiempo)
  // — si viene, se dibuja tal cual, sólida, sin volver a pedirla.
  rutaReal?: [number, number][];
  onVerLugar?: (lugar: Lugar) => void;
}

export default function MiniMapaChat({
  lugares,
  numerado,
  origen,
  rutaReal,
  onVerLugar,
}: Props) {
  const offline = useOffline();
  const mapRef = useRef<MapRef>(null);
  const conOrigen = !!origen && lugares.length === 1;

  // Ruta real por tramo para el caso de "varios días" — se pide en
  // cuanto se monta el mini-mapa (no hace falta esperar a que toquen
  // "Ver ruta en el mapa"). Si falla o no hay internet, se queda en
  // null y se usa la vista previa de líneas rectas como respaldo.
  const [tramosReales, setTramosReales] = useState<[number, number][][] | null>(null);
  const idsLugares = lugares.map((l) => l.id).join(',');

  useEffect(() => {
    setTramosReales(null);
    if (rutaReal) return; // caso A→B: ya viene calculada, nada que pedir
    if (!numerado || lugares.length < 2) return;

    let cancelado = false;
    obtenerRutaPorTramos(lugares.map((l) => l.coords))
      .then(({ tramos }) => {
        if (!cancelado) setTramosReales(tramos.map((t) => t.geometria));
      })
      .catch(() => {
        // Sin internet o el servicio de rutas no respondió — se queda
        // con la vista previa de líneas rectas, silencioso.
      });

    return () => {
      cancelado = true;
    };
    // idsLugares (no `lugares` directo) evita recalcular en cada
    // render por una nueva referencia de arreglo con el mismo contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsLugares, numerado, rutaReal]);

  const alCargar = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const lngLats: [number, number][] = lugares.map((l) => [l.coords[1], l.coords[0]]);
    if (conOrigen && origen) lngLats.push([origen[1], origen[0]]);
    if (lngLats.length < 2) return;

    const bounds = lngLats.reduce(
      (b, coord) => b.extend(coord),
      new maplibregl.LngLatBounds(lngLats[0], lngLats[0])
    );
    map.fitBounds(bounds, { padding: 42, duration: 0 });
  }, [lugares, conOrigen, origen]);

  // ¿Lo que se va a dibujar es la ruta REAL (por carretera) o solo la
  // vista previa de línea recta? Determina el estilo (sólida y firme
  // vs. punteada y más ligera) y de dónde sale cada tramo.
  const esRutaReal = !!rutaReal || (numerado && !!tramosReales);

  const tramosGeoJSON = useMemo(() => {
    if (rutaReal && rutaReal.length >= 2) {
      return {
        type: 'FeatureCollection' as const,
        features: [
          {
            type: 'Feature' as const,
            properties: { color: colorTramo(0) },
            geometry: {
              type: 'LineString' as const,
              coordinates: rutaReal.map(([lat, lng]) => [lng, lat]),
            },
          },
        ],
      };
    }

    if (conOrigen && origen) {
      return {
        type: 'FeatureCollection' as const,
        features: [
          {
            type: 'Feature' as const,
            properties: { color: colorTramo(0) },
            geometry: {
              type: 'LineString' as const,
              coordinates: [
                [origen[1], origen[0]],
                [lugares[0].coords[1], lugares[0].coords[0]],
              ],
            },
          },
        ],
      };
    }

    if (!numerado || lugares.length < 2) return null;

    // Real si ya llegó; si no, línea recta de respaldo entre las
    // mismas paradas consecutivas.
    const tramos: [number, number][][] =
      tramosReales ??
      lugares.slice(0, -1).map((lugar, i) => [lugar.coords, lugares[i + 1].coords]);

    return {
      type: 'FeatureCollection' as const,
      features: tramos.map((tramo, i) => ({
        type: 'Feature' as const,
        properties: { color: colorTramo(i) },
        geometry: {
          type: 'LineString' as const,
          coordinates: tramo.map(([lat, lng]) => [lng, lat]),
        },
      })),
    };
  }, [lugares, numerado, conOrigen, origen, rutaReal, tramosReales]);

  if (lugares.length === 0) return null;

  // Sin internet Y sin mapa descargado: no hay tiles disponibles.
  if (offline && !mapaDescargado()) {
    return (
      <div className="mt-2 rounded-xl border border-jungle-100 bg-jungle-50 px-3 py-2.5 flex items-center gap-2 text-xs text-jungle-600">
        <WifiOff size={14} className="flex-shrink-0" />
        Descarga el mapa (pestaña Mapa) para ver aquí la ubicación sin internet.
      </div>
    );
  }

  const centro = lugares[0];
  // El botón de "ampliar" abre la ficha completa del lugar (que ya
  // tiene su propio "Cómo llegar" / ver en el mapa grande) — solo
  // tiene sentido con UN destino. Para rutas de varios lugares
  // (numerado) ya existe el botón "Ver ruta en el mapa" justo debajo
  // del mini-mapa, así que aquí se omite para no duplicar.
  const puedeExpandir = lugares.length === 1 && !!onVerLugar;

  return (
    <div className="relative mt-2 rounded-xl overflow-hidden border border-jungle-100 h-[260px] sm:h-[340px]">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: centro.coords[1],
          latitude: centro.coords[0],
          zoom: 12.5,
        }}
        minZoom={8}
        maxZoom={16}
        mapStyle={ESTILO_MAPA}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        onLoad={alCargar}
      >
        {tramosGeoJSON && (
          <Source id="tramos-mini-mapa" type="geojson" data={tramosGeoJSON as any}>
            <Layer
              id="tramos-mini-mapa-linea"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={
                esRutaReal
                  ? {
                      'line-color': ['get', 'color'],
                      'line-width': 4,
                      'line-opacity': 0.85,
                    }
                  : {
                      'line-color': ['get', 'color'],
                      'line-width': 3,
                      'line-dasharray': [2, 2],
                      'line-opacity': 0.75,
                    }
              }
            />
          </Source>
        )}
        {conOrigen && origen && (
          <Marker longitude={origen[1]} latitude={origen[0]}>
            <PinLetra letra="A" color="#2563eb" />
          </Marker>
        )}
        {lugares.map((lugar, i) => (
          <Marker key={lugar.id} longitude={lugar.coords[1]} latitude={lugar.coords[0]}>
            {conOrigen ? (
              <PinLetra letra="B" color="#dc2626" onClick={() => onVerLugar?.(lugar)} />
            ) : (
              <PinMini
                categoria={lugar.categoria}
                numero={numerado ? i + 1 : undefined}
                onClick={() => onVerLugar?.(lugar)}
              />
            )}
          </Marker>
        ))}
      </Map>

      {/* Zoom +/- — mismo estilo que el mapa completo (MapScreen).
          Hallazgo real de campo (QA): con cooperativeGestures (2 dedos
          para mover) la gente probaba con un dedo, no pasaba nada, y no
          les gustó — así que el mini-mapa ahora se mueve libre con un
          solo dedo, igual que cualquier mapa normal. Estos botones son
          solo un atajo cómodo para acercar/alejar sin pellizcar. */}
      <div className="absolute bottom-2 right-2 bg-white rounded-xl shadow-md border border-jungle-100 flex flex-col overflow-hidden">
        <button
          onClick={() => mapRef.current?.getMap()?.zoomIn({ duration: 200 })}
          className="w-8 h-8 flex items-center justify-center text-jungle-800 hover:bg-jungle-50 border-b border-jungle-100"
          aria-label="Acercar"
          title="Acercar"
        >
          <Plus size={15} />
        </button>
        <button
          onClick={() => mapRef.current?.getMap()?.zoomOut({ duration: 200 })}
          className="w-8 h-8 flex items-center justify-center text-jungle-800 hover:bg-jungle-50"
          aria-label="Alejar"
          title="Alejar"
        >
          <Minus size={15} />
        </button>
      </div>

      {/* Ampliar — abre la ficha completa (con mapa grande, sin las
          restricciones de gestos de esta vista previa chica). */}
      {puedeExpandir && (
        <button
          onClick={() => onVerLugar?.(lugares[0])}
          className="absolute top-2 right-2 bg-white rounded-xl shadow-md border border-jungle-100 w-8 h-8 flex items-center justify-center text-jungle-800 hover:bg-jungle-50"
          aria-label="Ver en el mapa completo"
          title="Ver en el mapa completo"
        >
          <Maximize2 size={14} />
        </button>
      )}
    </div>
  );
}

// Pin con letra — estilo "A/B" de Google Maps, para la respuesta de
// distancia/tiempo (tu ubicación -> destino).
function PinLetra({
  letra,
  color,
  onClick,
}: {
  letra: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 26,
        height: 26,
        background: color,
        color: 'white',
        border: '2px solid white',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        cursor: onClick ? 'pointer' : 'default',
        fontSize: 13,
        fontWeight: 800,
        lineHeight: 1,
      }}
    >
      {letra}
    </div>
  );
}

// Pin compacto — mismo lenguaje visual que los pines del mapa
// completo (PinLugar/PinParada en MapScreen.tsx) pero un poco más
// chico, pensado para una previsualización de ~260-340px de alto.
function PinMini({
  categoria,
  numero,
  onClick,
}: {
  categoria: string;
  numero?: number;
  onClick?: () => void;
}) {
  const color = numero ? '#15803d' : COLORES_CATEGORIA[categoria] || '#16a34a';
  const emoji = CATEGORIAS.find((c) => c.id === categoria)?.emoji || '📍';
  return (
    <div
      onClick={onClick}
      style={{
        width: numero ? 22 : 20,
        height: numero ? 22 : 20,
        background: color,
        color: 'white',
        border: '2px solid white',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
        cursor: onClick ? 'pointer' : 'default',
        fontSize: numero ? 11 : 9,
        fontWeight: numero ? 800 : 400,
        lineHeight: 1,
      }}
    >
      {numero ?? emoji}
    </div>
  );
}
