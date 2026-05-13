import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Download, CheckCircle2, Loader2 } from 'lucide-react';
import {
  LUGARES,
  LOS_TUXTLAS_BOUNDS,
  LOS_TUXTLAS_CENTER,
  CATEGORIAS,
  type Lugar,
} from '../data/lugares';

// Fix: leaflet por defecto rompe los iconos en bundlers. Usamos divIcon SVG.
const iconPorCategoria = (cat: string) => {
  const colores: Record<string, string> = {
    Naturaleza: '#16a34a',
    Aventura: '#ea580c',
    Cultura: '#d97706',
    Gastronomia: '#dc2626',
    Hospedaje: '#2563eb',
    Playa: '#0891b2',
  };
  const color = colores[cat] || '#16a34a';
  const emoji = CATEGORIAS.find((c) => c.id === cat)?.emoji || '📍';
  return L.divIcon({
    html: `
      <div style="
        width: 36px; height: 36px;
        background: white;
        border: 3px solid ${color};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      ">
        <div style="transform: rotate(45deg); font-size: 16px;">${emoji}</div>
      </div>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -32],
  });
};

interface Props {
  onVerLugar: (lugar: Lugar) => void;
  filtroCategorias?: string[];
}

export default function MapScreen({ onVerLugar, filtroCategorias }: Props) {
  const lugares = filtroCategorias && filtroCategorias.length > 0
    ? LUGARES.filter((l) => filtroCategorias.includes(l.categoria))
    : LUGARES;

  const [descargandoTiles, setDescargandoTiles] = useState(false);
  const [tilesListos, setTilesListos] = useState(false);

  useEffect(() => {
    // Detecta si ya pre-cargamos los tiles para offline
    if (localStorage.getItem('tiles-precargados') === 'true') {
      setTilesListos(true);
    }
  }, []);

  return (
    <div className="relative h-full">
      <MapContainer
        center={LOS_TUXTLAS_CENTER}
        zoom={11}
        minZoom={9}
        maxZoom={17}
        maxBounds={LOS_TUXTLAS_BOUNDS}
        maxBoundsViscosity={0.7}
        className="h-full w-full"
        style={{ background: '#dcfce7' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {lugares.map((lugar) => (
          <Marker
            key={lugar.id}
            position={lugar.coords}
            icon={iconPorCategoria(lugar.categoria)}
          >
            <Popup>
              <div className="space-y-1.5 min-w-[200px]">
                <img
                  src={lugar.imagen}
                  alt={lugar.nombre}
                  className="w-full h-24 object-cover rounded-md mb-1"
                />
                <div className="font-bold text-jungle-950 text-base leading-tight">
                  {lugar.nombre}
                </div>
                <div className="text-xs text-jungle-700">
                  ⭐ {lugar.rating} · {lugar.categoria} · {lugar.duracionSugerida}
                </div>
                <p className="text-xs text-jungle-800 leading-snug">
                  {lugar.descripcionCorta}
                </p>
                <button
                  onClick={() => onVerLugar(lugar)}
                  className="w-full bg-jungle-700 hover:bg-jungle-800 text-white text-xs font-semibold py-2 rounded-md mt-1"
                >
                  Ver detalles
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
        <PrecacheTilesButton
          onStart={() => setDescargandoTiles(true)}
          onDone={() => {
            setDescargandoTiles(false);
            setTilesListos(true);
            localStorage.setItem('tiles-precargados', 'true');
          }}
          descargando={descargandoTiles}
          listos={tilesListos}
        />
      </MapContainer>

      {/* Leyenda flotante */}
      <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:max-w-xs bg-white/95 backdrop-blur rounded-2xl p-3 shadow-xl text-xs z-[1000]">
        <div className="font-semibold text-jungle-900 mb-2">
          {lugares.length} lugares en el mapa
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS.map((c) => (
            <span key={c.id} className={`${c.color} px-2 py-0.5 rounded-full`}>
              {c.emoji} {c.id}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Botón flotante: cuando el usuario lo presiona, el mapa "navega" por
// los 4 corners + center de Los Tuxtlas para forzar la carga de tiles,
// que Workbox cachea automáticamente con CacheFirst.
function PrecacheTilesButton({
  onStart,
  onDone,
  descargando,
  listos,
}: {
  onStart: () => void;
  onDone: () => void;
  descargando: boolean;
  listos: boolean;
}) {
  const map = useMap();
  const ranRef = useRef(false);

  const handleClick = async () => {
    if (ranRef.current || descargando) return;
    ranRef.current = true;
    onStart();

    const [[s, w], [n, e]] = LOS_TUXTLAS_BOUNDS;
    const puntos: { center: [number, number]; zoom: number }[] = [
      { center: [(s + n) / 2, (w + e) / 2], zoom: 10 },
      { center: [(s + n) / 2, (w + e) / 2], zoom: 11 },
      { center: [(s + n) / 2, (w + e) / 2], zoom: 12 },
      { center: [s + 0.05, w + 0.05], zoom: 13 },
      { center: [n - 0.05, w + 0.05], zoom: 13 },
      { center: [s + 0.05, e - 0.05], zoom: 13 },
      { center: [n - 0.05, e - 0.05], zoom: 13 },
      { center: [(s + n) / 2, (w + e) / 2], zoom: 13 },
    ];

    for (const p of puntos) {
      map.setView(p.center, p.zoom, { animate: false });
      await new Promise((r) => setTimeout(r, 1500));
    }
    map.setView(LOS_TUXTLAS_CENTER, 11);
    onDone();
  };

  return (
    <button
      onClick={handleClick}
      disabled={descargando || listos}
      className="absolute top-4 right-4 bg-white hover:bg-jungle-50 disabled:opacity-90 shadow-xl rounded-xl px-3 py-2.5 flex items-center gap-2 text-sm font-semibold text-jungle-900 z-[1000]"
    >
      {listos ? (
        <>
          <CheckCircle2 size={16} className="text-jungle-600" />
          Mapa listo offline
        </>
      ) : descargando ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          Descargando...
        </>
      ) : (
        <>
          <Download size={16} />
          Descargar mapa
        </>
      )}
    </button>
  );
}
