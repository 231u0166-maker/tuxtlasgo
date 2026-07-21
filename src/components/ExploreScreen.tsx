import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { LUGARES, CATEGORIAS, type Categoria, type Lugar } from '../data/lugares';
import PlaceCard from './PlaceCard';
import { OfflineReadyBadge } from './OfflineIndicator';

interface Props {
  onVerLugar: (lugar: Lugar) => void;
  onVerLugarEnMapa?: (lugar: Lugar) => void;
  lugares?: Lugar[];
}

export default function ExploreScreen({ onVerLugar, onVerLugarEnMapa, lugares: lugaresProps }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [catActiva, setCatActiva] = useState<Categoria | 'todas'>('todas');

  const todosLugares = lugaresProps ?? LUGARES;

  const filtrados = useMemo(() => {
    const q = busqueda
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return todosLugares.filter((l) => {
      if (catActiva !== 'todas' && l.categoria !== catActiva) return false;
      if (!q) return true;
      const haystack = `${l.nombre} ${l.descripcionCorta} ${l.municipio} ${l.tags.join(' ')}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return haystack.includes(q);
    });
  }, [busqueda, catActiva]);

  const destacados = todosLugares.filter((l) => l.destacado);

  return (
    <div className="pb-24 lg:pb-8">
      {/* Hero compacto */}
      <div className="bg-gradient-to-br from-jungle-700 to-jungle-900 text-white px-4 lg:px-8 pt-6 lg:pt-8 pb-8 rounded-b-3xl">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-display font-extrabold text-2xl lg:text-3xl">
            Descubre Los Tuxtlas
          </h1>
          <OfflineReadyBadge />
        </div>
        <p className="text-sm text-jungle-100 opacity-90 mb-5">
          {todosLugares.length} lugares verificados, listos para tu próxima aventura.
        </p>

        {/* Buscador */}
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-600"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar lugares, comida, hoteles..."
            className="w-full bg-white text-jungle-950 rounded-xl pl-10 pr-4 py-3 text-sm placeholder:text-jungle-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      </div>

      {/* Categorías */}
      <div className="px-4 lg:px-8 mt-5">
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scroll-smooth snap-x">
          <CategoryChip
            label="Todos"
            emoji="✨"
            activo={catActiva === 'todas'}
            onClick={() => setCatActiva('todas')}
          />
          {CATEGORIAS.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.id}
              emoji={c.emoji}
              activo={catActiva === c.id}
              onClick={() => setCatActiva(c.id)}
            />
          ))}
        </div>
      </div>

      {/* Destacados (solo cuando no hay búsqueda activa) */}
      {!busqueda && catActiva === 'todas' && (
        <section className="px-4 lg:px-8 mt-6">
          <h2 className="font-display font-bold text-lg text-jungle-950 mb-3">
            Destacados
          </h2>
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x">
            {destacados.map((l) => (
              <div key={l.id} className="snap-start flex-shrink-0 w-64">
                <PlaceCard lugar={l} onClick={() => onVerLugar(l)} onVerMapa={onVerLugarEnMapa} />              </div>
            ))}
          </div>
        </section>
      )}

      {/* Grid */}
      <section className="px-4 lg:px-8 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-lg text-jungle-950">
            {catActiva === 'todas'
              ? 'Todos los lugares'
              : CATEGORIAS.find((c) => c.id === catActiva)?.id}
          </h2>
          <span className="text-xs text-jungle-600">
            {filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filtrados.length === 0 ? (
          <div className="text-center py-12 text-jungle-700">
            <SlidersHorizontal className="mx-auto mb-3 opacity-40" size={40} />
            <p className="font-semibold">Sin resultados</p>
            <p className="text-sm opacity-70 mt-1">
              Prueba con otra palabra o cambia la categoría.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtrados.map((l) => (
              <PlaceCard key={l.id} lugar={l} onClick={() => onVerLugar(l)} onVerMapa={onVerLugarEnMapa} />))}
          </div>
        )}
      </section>
    </div>
  );
}

function CategoryChip({
  label,
  emoji,
  activo,
  onClick,
}: {
  label: string;
  emoji: string;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 snap-start px-4 py-2 rounded-full text-sm font-semibold transition-colors ${activo
        ? 'bg-jungle-800 text-white shadow-md'
        : 'bg-white text-jungle-800 border border-jungle-200 hover:border-jungle-400'
        }`}
    >
      {emoji} {label}
    </button>
  );
}