import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { LUGARES, CATEGORIAS, type Categoria, type Lugar } from '../data/lugares';
import PlaceCard from './PlaceCard';
import { OfflineReadyBadge } from './OfflineIndicator';

interface Props {
  onVerLugar: (lugar: Lugar) => void;
  lugares?: Lugar[];
  // Controlado desde AppShell en móvil (la caja de búsqueda vive
  // flotando sobre la vista previa del mapa, no aquí dentro — ver
  // AppShell.tsx). Si no llega el prop (nadie más usa este
  // componente todavía, pero por si acaso), se cae a estado propio
  // para no romper nada.
  busqueda?: string;
  onBusquedaChange?: (v: string) => void;
}

// Secciones por categoría — antes solo existían "Destacados" +
// una sola cuadrícula plana ("se ve muy simple"). Mismas categorías
// reales del catálogo, con la etiqueta que pidió el usuario
// (Restaurantes/Actividades/Alojamientos), no los rótulos de
// mindtrip que no coinciden con lo que de verdad tenemos.
const SECCIONES: { titulo: string; categoria: Categoria }[] = [
  { titulo: 'Restaurantes', categoria: 'Gastronomia' },
  { titulo: 'Actividades', categoria: 'Aventura' },
  { titulo: 'Alojamientos', categoria: 'Hospedaje' },
  { titulo: 'Naturaleza', categoria: 'Naturaleza' },
];

export default function ExploreScreen({
  onVerLugar,
  lugares: lugaresProps,
  busqueda: busquedaProp,
  onBusquedaChange,
}: Props) {
  const [busquedaLocal, setBusquedaLocal] = useState('');
  const busqueda = busquedaProp ?? busquedaLocal;
  const setBusqueda = onBusquedaChange ?? setBusquedaLocal;

  const [catActiva, setCatActiva] = useState<Categoria | 'todas'>('todas');

  const todosLugares = lugaresProps ?? LUGARES;

  const normalizar = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda);
    return todosLugares.filter((l) => {
      if (catActiva !== 'todas' && l.categoria !== catActiva) return false;
      if (!q) return true;
      const haystack = normalizar(`${l.nombre} ${l.descripcionCorta} ${l.municipio} ${l.tags.join(' ')}`);
      return haystack.includes(q);
    });
  }, [busqueda, catActiva]);

  const destacados = todosLugares.filter((l) => l.destacado);
  // Solo se muestran las secciones cuando de verdad no hay nada
  // filtrado — si ya buscaste o elegiste categoría, tiene más sentido
  // ver directo el resultado (el grid de abajo) que siete carruseles.
  const sinFiltro = !busqueda && catActiva === 'todas';

  return (
    <div className="pb-24 lg:pb-8">
      {/* Hero grande — SOLO escritorio. En móvil el mapa de arriba ya
          cumple ese rol de "encabezado", y el buscador ahí vive
          flotando sobre el mapa (AppShell.tsx), no aquí. */}
      <div className="hidden lg:block bg-gradient-to-br from-jungle-700 to-jungle-900 text-white px-4 lg:px-8 pt-6 lg:pt-8 pb-8 rounded-b-3xl">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-display font-extrabold text-2xl lg:text-3xl">
            Descubre Los Tuxtlas
          </h1>
          <OfflineReadyBadge />
        </div>
        <p className="text-sm text-jungle-100 opacity-90 mb-5">
          {todosLugares.length} lugares verificados, listos para tu próxima aventura.
        </p>
        <Buscador value={busqueda} onChange={setBusqueda} claro />
      </div>

      {/* Categorías */}
      <div className="px-4 lg:px-8 mt-4 lg:mt-5">
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

      {/* Destacados */}
      {sinFiltro && destacados.length > 0 && (
        <FilaHorizontal titulo="Destacados" lugares={destacados} onVerLugar={onVerLugar} />
      )}

      {/* Una sección por categoría — Restaurantes/Actividades/
          Alojamientos/Naturaleza, cada una con sus propios lugares.
          Se salta la sección si no hay ningún lugar de esa categoría
          todavía, en vez de mostrar un carrusel vacío. */}
      {sinFiltro &&
        SECCIONES.map((s) => {
          const lugaresSeccion = todosLugares.filter((l) => l.categoria === s.categoria);
          if (lugaresSeccion.length === 0) return null;
          return (
            <FilaHorizontal
              key={s.categoria}
              titulo={s.titulo}
              lugares={lugaresSeccion}
              onVerLugar={onVerLugar}
            />
          );
        })}

      {/* Grid — catch-all con TODO (incluye Comercio/Cooperativa/Otro,
          que no tienen su propia sección arriba), y es lo único que se
          ve cuando hay búsqueda o categoría activa. */}
      <section className="px-4 lg:px-8 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-lg text-jungle-950">
            {sinFiltro
              ? 'Todos los lugares'
              : catActiva === 'todas'
                ? 'Resultados'
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
              <PlaceCard key={l.id} lugar={l} onClick={() => onVerLugar(l)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FilaHorizontal({
  titulo,
  lugares,
  onVerLugar,
}: {
  titulo: string;
  lugares: Lugar[];
  onVerLugar: (l: Lugar) => void;
}) {
  return (
    <section className="px-4 lg:px-8 mt-6">
      <h2 className="font-display font-bold text-lg text-jungle-950 mb-3">{titulo}</h2>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x">
        {lugares.map((l) => (
          <div key={l.id} className="snap-start flex-shrink-0 w-64">
            <PlaceCard lugar={l} onClick={() => onVerLugar(l)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Buscador({
  value,
  onChange,
  claro,
}: {
  value: string;
  onChange: (v: string) => void;
  claro?: boolean;
}) {
  return (
    <div className="relative">
      <Search
        size={18}
        className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${claro ? 'text-jungle-600' : 'text-jungle-500'}`}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar lugares, comida, hoteles..."
        className={`w-full rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${claro
          ? 'bg-white text-jungle-950 placeholder:text-jungle-500'
          : 'bg-jungle-50 text-jungle-950 border border-jungle-100 placeholder:text-jungle-500'
          }`}
      />
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
      className={`flex-shrink-0 snap-start px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
        activo
          ? 'bg-jungle-800 text-white shadow-md'
          : 'bg-white text-jungle-800 border border-jungle-200 hover:border-jungle-400'
      }`}
    >
      {emoji} {label}
    </button>
  );
}
