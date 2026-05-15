import { Star, MapPin, Clock, Heart } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Lugar } from '../data/lugares';
import { CATEGORIAS } from '../data/lugares';
import { toggleFavorito, esFavorito } from '../lib/db';

interface Props {
  lugar: Lugar;
  onClick?: () => void;
  compact?: boolean;
}

export default function PlaceCard({ lugar, onClick, compact }: Props) {
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
          src={lugar.imagen}
          alt={lugar.nombre}
          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
          loading="lazy"
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
            <span>{lugar.municipio}</span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all text-left border border-jungle-100 hover:border-jungle-300 flex flex-col"
    >
      <div className="relative aspect-[4/3] bg-jungle-100 overflow-hidden">
        <img
          src={lugar.imagen}
          alt={lugar.nombre}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <button
          onClick={handleFav}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center hover:bg-white transition"
          aria-label="Favorito"
        >
          <Heart
            size={18}
            className={fav ? 'fill-red-500 text-red-500' : 'text-jungle-700'}
          />
        </button>
        <div className="absolute top-3 left-3">
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cat?.color || 'bg-white text-jungle-800'}`}
          >
            {cat?.emoji} {lugar.categoria}
          </span>
        </div>
        {lugar.destacado && (
          <div className="absolute bottom-3 left-3 bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide">
            Destacado
          </div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-display font-bold text-jungle-950 leading-tight line-clamp-1">
          {lugar.nombre}
        </h3>
        <p className="text-sm text-jungle-700 mt-1 line-clamp-2 flex-1">
          {lugar.descripcionCorta}
        </p>
        <div className="flex items-center justify-between mt-3 text-xs text-jungle-600">
          {lugar.rating > 0 ? (
            <span className="flex items-center gap-1">
              <Star size={13} className="fill-amber-400 text-amber-400" />
              <span className="font-semibold text-jungle-900">{lugar.rating}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-jungle-500">
              Prestador local
            </span>
          )}
          <span className="flex items-center gap-1">
            <MapPin size={12} />
            {lugar.municipio}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {lugar.duracionSugerida}
          </span>
        </div>
      </div>
    </button>
  );
}
