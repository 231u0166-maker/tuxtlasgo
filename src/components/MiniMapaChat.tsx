import { useRef, useCallback, useMemo } from 'react';
import { Map, Marker, Source, Layer, type MapRef } from '@vis.gl/react-maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { WifiOff } from 'lucide-react';
import { CATEGORIAS, type Lugar } from '../data/lugares';
import { ESTILO_MAPA, COLORES_CATEGORIA } from './MapScreen';
import { mapaDescargado } from '../lib/db';
import { useOffline } from '../hooks/useOffline';
import { colorTramo } from '../lib/colores';

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
  onVerLugar?: (lugar: Lugar) => void;
}

export default function MiniMapaChat({ lugares, numerado, onVerLugar }: Props) {
  const offline = useOffline();
  const mapRef = useRef<MapRef>(null);

  const alCargar = useCallback(() => {
    if (lugares.length < 2) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const lngLats: [number, number][] = lugares.map((l) => [l.coords[1], l.coords[0]]);
    const bounds = lngLats.reduce(
      (b, coord) => b.extend(coord),
      new maplibregl.LngLatBounds(lngLats[0], lngLats[0])
    );
    map.fitBounds(bounds, { padding: 36, duration: 0 });
  }, [lugares]);

  // Líneas RECTAS de vista previa entre paradas consecutivas (sin
  // llamar a OSRM aquí — sería demasiado costoso para una vista
  // previa chica). Se pintan punteadas y más delgadas a propósito,
  // para distinguirlas claramente de la ruta real por carretera que
  // se ve al tocar "Ver ruta en el mapa" (esa sí sigue calles reales
  // y usa las mismas líneas sólidas, gruesas). Cada tramo usa el
  // MISMO color que tendrá en el mapa completo (colorTramo por
  // posición) — así el turista ya reconoce el patrón de colores
  // desde el chat, antes de abrir el mapa grande.
  const tramosPreviewGeoJSON = useMemo(() => {
    if (!numerado || lugares.length < 2) return null;
    return {
      type: 'FeatureCollection' as const,
      features: lugares.slice(0, -1).map((lugar, i) => ({
        type: 'Feature' as const,
        properties: { color: colorTramo(i) },
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [lugar.coords[1], lugar.coords[0]],
            [lugares[i + 1].coords[1], lugares[i + 1].coords[0]],
          ],
        },
      })),
    };
  }, [lugares, numerado]);

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

  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-jungle-100 h-[210px] sm:h-[260px]">
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
        cooperativeGestures
        onLoad={alCargar}
      >
        {tramosPreviewGeoJSON && (
          <Source id="tramos-preview" type="geojson" data={tramosPreviewGeoJSON as any}>
            <Layer
              id="tramos-preview-linea"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 3,
                'line-dasharray': [2, 2],
                'line-opacity': 0.75,
              }}
            />
          </Source>
        )}
        {lugares.map((lugar, i) => (
          <Marker key={lugar.id} longitude={lugar.coords[1]} latitude={lugar.coords[0]}>
            <PinMini
              categoria={lugar.categoria}
              numero={numerado ? i + 1 : undefined}
              onClick={() => onVerLugar?.(lugar)}
            />
          </Marker>
        ))}
      </Map>
    </div>
  );
}

// Pin compacto — mismo lenguaje visual que los pines del mapa
// completo (PinLugar/PinParada en MapScreen.tsx) pero un poco más
// chico, pensado para una previsualización de ~210-260px de alto.
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
