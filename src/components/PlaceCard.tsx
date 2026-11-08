import { Star, MapPin, Clock, Heart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT, useTd } from '../lib/i18n';
import { optimizarImagen, ANCHO_TARJETA, ANCHO_MINIATURA } from '../lib/imagenOptimizada';
import type { Lugar } from '../data/lugares';
import { CATEGORIAS, estaEnLaRegion } from '../data/lugares';
import { toggleFavorito, esFavorito } from '../lib/db';
import { manejarErrorImagen } from '../lib/imagenLugar';

interface Props {
  lugar: Lugar;
  onClick?: () => void;
  compact?: boolean;
}

export default function PlaceCard({ lugar, onClick, compact }: Props) {
  const t = useT();
  const td = useTd();
  const [fav, setFav] = useState(false);

  useEffect(() => {
    esFavorito(lugar.id).then(setFav);
  }, [lugar.id]);

  const cat = CATEGORIAS.find((c) => c.id === lugar.categoria);

  const handleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nuevoEstado = await toggleFavorito(lugar.id);
    setFav(nuevoEstado);
  };

  if (compact) {
    return (
      <button
        onClick={onClick}
        className="w-full flex gap-3 bg-white rounded-xl p-3 hover:bg-jungle-50 transition-colors text-left border border-jungle-100"
      >
        <img
          src={optimizarImagen(lugar.imagen, ANCHO_MINIATURA)}
          alt={lugar.nombre}
          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
          loading="lazy"
        onError={manejarErrorImagen(lugar.categoria, lugar.nombre)}
          />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-jungle-950 text-sm leading-tight truncate">
            {lugar.nombre}
          </div>
          <div className="text-xs text-jungle-700 mt-0.5 truncate">
            {lugar.descripcionCorta}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-jungle-600">
            {lugar.rating > 0 && (
              <>
                <Star size={12} className="fill-amber-400 text-amber-400" />
                <span>{lugar.rating}</span>
                <span>·</span>
              </>
            )}
            <span className="truncate min-w-0">{lugar.municipio}</span>
          </div>
          {!estaEnLaRegion(lugar.coords) && (
            <div className="text-[11px] text-amber-700 font-medium mt-0.5 truncate">
              {t('Fuera de Los Tuxtlas')}
            </div>
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="group w-full h-full min-w-0 bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all text-left border border-jungle-100 hover:border-jungle-300 flex flex-col"
    >
      <div className="relative aspect-[4/3] bg-jungle-100 overflow-hidden">
        <img
          src={optimizarImagen(lugar.imagen, ANCHO_TARJETA)}
          alt={lugar.nombre}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        onError={manejarErrorImagen(lugar.categoria, lugar.nombre)}
          />
        <button
          onClick={handleFav}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center hover:bg-white transition"
          aria-label={t('Favorito')}
        >
          <Heart
            size={18}
            className={fav ? 'fill-red-500 text-red-500' : 'text-jungle-700'}
          />
        </button>
        <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5 max-w-[calc(100%-4.5rem)]">
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cat?.color || 'bg-white text-jungle-800'}`}
          >
            {cat?.emoji} {t(lugar.categoria)}
          </span>
          {!estaEnLaRegion(lugar.coords) && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shadow-sm">
              {t('Fuera de Los Tuxtlas')}
            </span>
          )}
        </div>
        {lugar.destacado && (
          <div className="absolute bottom-3 left-3 bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide">
            {t('Destacado')}
          </div>
        )}
        {/* Distinto del badge "Destacado" (esa es curaduría nuestra,
            sin dinero de por medio) — "Patrocinado" es honesto sobre
            que este lugar pagó el Plan Premium. Mismo criterio que la
            sección de Inicio: nunca mezclar contenido pagado con
            contenido editorial sin decirlo. */}
        {lugar.premium && (
          <div className="absolute bottom-3 right-3 bg-violet-600 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide">
            {t('Patrocinado')}
          </div>
        )}
      </div>
      {/* Estructura fija, igual en todas las tarjetas (así las filas de un
          carrusel quedan parejas aunque un nombre o un municipio sea
          largo): nombre + calificación arriba, descripción, y UNA sola
          línea al pie con ubicación y duración — la ubicación se recorta
          con "…" en vez de partirse en varias líneas. La etiqueta de
          "Fuera de Los Tuxtlas" va sobre la foto, no en esta línea. */}
      <div className="p-4 flex-1 flex flex-col min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display font-bold text-jungle-950 leading-tight line-clamp-1 min-w-0">
            {lugar.nombre}
          </h3>
          {lugar.rating > 0 ? (
            <span className="flex items-center gap-1 text-xs flex-shrink-0 pt-0.5">
              <Star size={13} className="fill-amber-400 text-amber-400" />
              <span className="font-semibold text-jungle-900">{lugar.rating}</span>
            </span>
          ) : (
            <span className="text-[11px] text-jungle-500 flex-shrink-0 pt-0.5 whitespace-nowrap">
              {t('Prestador local')}
            </span>
          )}
        </div>
        <p className="text-sm text-jungle-700 mt-1 line-clamp-2 flex-1">
          {lugar.descripcionCorta}
        </p>
        <div className="flex items-center justify-between gap-3 mt-3 text-xs text-jungle-600">
          <span className="flex items-center gap-1 min-w-0 flex-1">
            <MapPin size={12} className="flex-shrink-0" />
            <span className="truncate">{lugar.municipio}</span>
          </span>
          <span className="flex items-center gap-1 min-w-0 max-w-[48%] flex-shrink-0">
            <Clock size={12} className="flex-shrink-0" />
            <span className="truncate">{td(lugar.duracionSugerida)}</span>
          </span>
        </div>
      </div>
    </button>
  );
}
