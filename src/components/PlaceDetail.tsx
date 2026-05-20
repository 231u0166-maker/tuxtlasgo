import {
  X,
  Star,
  MapPin,
  Clock,
  DollarSign,
  Calendar,
  Navigation,
  Heart,
  Route,
  Lightbulb,
  BadgeCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Lugar } from '../data/lugares';
import { CATEGORIAS } from '../data/lugares';
import { toggleFavorito, esFavorito } from '../lib/db';
import { manejarErrorImagen } from '../lib/imagenLugar';

interface Props {
  lugar: Lugar;
  onClose: () => void;
  onVerEnMapa: () => void;
}

export default function PlaceDetail({ lugar, onClose, onVerEnMapa }: Props) {
  const [fav, setFav] = useState(false);
  const cat = CATEGORIAS.find((c) => c.id === lugar.categoria);

  useEffect(() => {
    esFavorito(lugar.id).then(setFav);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [lugar.id]);

  const handleFav = async () => {
    const nuevoEstado = await toggleFavorito(lugar.id);
    setFav(nuevoEstado);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(2, 44, 22, 0.97)',
        display: 'flex',
        flexDirection: 'column',
        // El scroll ocurre en el div interior, no aquí
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: 1,
          backgroundColor: 'white',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'scroll',           // scroll siempre visible en iOS
          WebkitOverflowScrolling: 'touch', // scroll inercial en iOS
          overscrollBehavior: 'contain',  // evita que el scroll se escape al mapa
          touchAction: 'pan-y',           // solo permite scroll vertical táctil
        }}
      >
        <div className="relative aspect-[16/10] bg-jungle-200">
          <img
            src={lugar.imagen}
            alt={lugar.nombre}
            onError={manejarErrorImagen(lugar.categoria, lugar.nombre)}
            className="w-full h-full object-cover"
          />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/95 backdrop-blur flex items-center justify-center hover:bg-white shadow-md"
            aria-label="Cerrar"
          >
            <X size={20} className="text-jungle-900" />
          </button>
          <button
            onClick={handleFav}
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/95 backdrop-blur flex items-center justify-center hover:bg-white shadow-md"
            aria-label="Favorito"
          >
            <Heart
              size={20}
              className={fav ? 'fill-red-500 text-red-500' : 'text-jungle-900'}
            />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${cat?.color}`}
              >
                {cat?.emoji} {lugar.categoria}
              </span>
              {lugar.verificado && (
                <span className="inline-flex items-center gap-1 text-xs bg-jungle-100 text-jungle-800 px-2.5 py-1 rounded-full font-medium">
                  <BadgeCheck size={12} />
                  Info verificada
                </span>
              )}
            </div>
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-jungle-950 mt-2">
              {lugar.nombre}
            </h2>
            <div className="flex items-center gap-3 text-sm text-jungle-700 mt-1">
              {lugar.rating > 0 && (
                <>
                  <span className="flex items-center gap-1 font-semibold">
                    <Star size={15} className="fill-amber-400 text-amber-400" />
                    {lugar.rating}
                  </span>
                  <span>·</span>
                </>
              )}
              <span className="flex items-center gap-1">
                <MapPin size={14} /> {lugar.municipio}
              </span>
            </div>
          </div>

          <p className="text-jungle-800 leading-relaxed">{lugar.descripcion}</p>

          <div className="grid grid-cols-2 gap-3">
            <InfoChip
              icon={Clock}
              label="Duración"
              value={lugar.duracionSugerida}
            />
            <InfoChip icon={DollarSign} label="Costo" value={lugar.precioMxn} />
            <InfoChip
              icon={Calendar}
              label="Días"
              value={lugar.abierto.dias}
            />
            <InfoChip
              icon={Clock}
              label="Horario"
              value={lugar.abierto.horario}
            />
          </div>

          {/* Cómo llegar */}
          <div className="bg-jungle-50 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-xs text-jungle-600 mb-1 uppercase tracking-wide font-semibold">
              <Navigation size={12} />
              Cómo llegar
            </div>
            <p className="text-sm text-jungle-900">{lugar.comoLlegar}</p>
          </div>

          {/* Tip del lugar */}
          {lugar.tip && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-xs text-amber-700 mb-1 uppercase tracking-wide font-semibold">
                <Lightbulb size={12} />
                Consejo
              </div>
              <p className="text-sm text-amber-900">{lugar.tip}</p>
            </div>
          )}

          {/* Ideal para */}
          <div>
            <div className="text-xs font-semibold text-jungle-600 uppercase tracking-wide mb-2">
              Ideal para
            </div>
            <div className="flex flex-wrap gap-2">
              {lugar.ideal.map((g) => (
                <span
                  key={g}
                  className="bg-jungle-100 text-jungle-800 px-3 py-1 rounded-full text-xs font-medium"
                >
                  {g === 'solo'
                    ? '🧍 viajeros solos'
                    : g === 'pareja'
                    ? '💕 parejas'
                    : g === 'familia'
                    ? '👨‍👩‍👧 familias'
                    : '🎉 grupos'}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={onVerEnMapa}
            className="w-full bg-jungle-700 hover:bg-jungle-800 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2"
          >
            <Route size={18} />
            Ver en el mapa
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-jungle-50 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-xs text-jungle-600 mb-1">
        <Icon size={12} />
        {label}
      </div>
      <div className="text-sm font-semibold text-jungle-950">{value}</div>
    </div>
  );
}
