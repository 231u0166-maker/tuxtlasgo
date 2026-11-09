import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Heart, Star, Map as MapIcon, Sparkles } from 'lucide-react';
import { LUGARES, CATEGORIAS, type Categoria, type Lugar } from '../data/lugares';
import { VIDEOS_HERO, type TarjetaHero } from '../data/heroMedia';
import { useT } from '../lib/i18n';
import { OfflineReadyBadge } from './OfflineIndicator';
import { toggleFavorito, esFavorito } from '../lib/db';
import { manejarErrorImagen } from '../lib/imagenLugar';
import { optimizarImagen, ANCHO_TARJETA } from '../lib/imagenOptimizada';
import { useEffect } from 'react';

interface Props {
  onVerLugar: (lugar: Lugar) => void;
  lugares?: Lugar[];
  busqueda?: string;
  onBusquedaChange?: (v: string) => void;
  // "Mapa": el mapa ya no se ve al entrar, se abre a pedido.
  onAbrirMapa?: () => void;
  onIrAlChat?: () => void;
  // Barra flotante "Pregunta…": manda el texto al asistente.
  onPreguntar?: (texto: string) => void;
}

// Secciones por servicio — cada una es un carrusel con su tarjeta final
// "Ver todos …" (como en la referencia). Mismas categorías reales del
// catálogo; la sección se salta si no hay ningún lugar de esa categoría.
const SECCIONES: { titulo: string; sub: string; categoria: Categoria }[] = [
  { titulo: 'Restaurantes', sub: 'Dónde comer en Los Tuxtlas, de lo local a lo más pedido.', categoria: 'Gastronomia' },
  { titulo: 'Actividades', sub: 'Aventura y recorridos para salir a moverse.', categoria: 'Aventura' },
  { titulo: 'Alojamientos', sub: 'Hoteles, cabañas y lugares para quedarte.', categoria: 'Hospedaje' },
  { titulo: 'Naturaleza', sub: 'Cascadas, selva, lagunas y miradores.', categoria: 'Naturaleza' },
  { titulo: 'Comercio', sub: 'Artesanías, tiendas y productos hechos aquí.', categoria: 'Comercio' },
  { titulo: 'Cooperativas', sub: 'Grupos locales que trabajan en comunidad.', categoria: 'Cooperativa' },
  { titulo: 'Otros servicios', sub: 'Más servicios de la región.', categoria: 'Otro' },
];

const SIGNOS_PRECIO: Record<Lugar['precio'], string> = { bajo: '$', medio: '$$', alto: '$$$' };

export default function ExploreScreen({
  onVerLugar,
  lugares: lugaresProps,
  busqueda: busquedaProp,
  onBusquedaChange,
  onAbrirMapa,
  onIrAlChat,
  onPreguntar,
}: Props) {
  const [busquedaLocal, setBusquedaLocal] = useState('');
  const busqueda = busquedaProp ?? busquedaLocal;
  const setBusqueda = onBusquedaChange ?? setBusquedaLocal;

  const t = useT();
  const [catActiva, setCatActiva] = useState<Categoria | 'todas'>('todas');

  const todosLugares = lugaresProps ?? LUGARES;

  const normalizar = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda);
    return todosLugares.filter((l) => {
      if (catActiva !== 'todas' && l.categoria !== catActiva) return false;
      if (!q) return true;
      const haystack = normalizar(`${l.nombre} ${l.descripcionCorta} ${l.municipio} ${l.tags.join(' ')}`);
      return haystack.includes(q);
    });
  }, [busqueda, catActiva, todosLugares]);

  const destacados = todosLugares.filter((l) => l.destacado);
  const sinFiltro = !busqueda && catActiva === 'todas';
  const tarjetasHero: TarjetaHero[] = destacados.slice(0, 5).map((l) => ({
    id: l.id,
    titulo: l.nombre,
    imagen: l.imagen,
    video: VIDEOS_HERO[l.id],
  }));

  return (
    <div className="pb-6">
      {/* Cabecera: emblema + saludo + mosaico de videos/fotos. Sustituye
          al bloque verde "Descubre Los Tuxtlas". */}
      {sinFiltro && (
        <section className="px-4 lg:px-8 pt-6 lg:pt-8">
          <div className="flex items-start justify-between gap-3">
            <span className="h-14 w-14 rounded-full bg-white shadow-sm border border-jungle-100 flex items-center justify-center flex-shrink-0">
              <img src="/logo-emblema.png" alt="TuxtlasGO" className="h-10 w-10 object-contain" />
            </span>
            <OfflineReadyBadge />
          </div>
          <h1 className="font-display font-extrabold text-2xl lg:text-4xl text-jungle-950 mt-4 leading-tight max-w-3xl">
            {t('Conoce Los Tuxtlas: cascadas, selva, lago y sabor local.')}
          </h1>
          <p className="text-jungle-700 mt-1.5 max-w-2xl">
            {t('Todo lo que ofrecen los prestadores de la región, en un solo lugar y disponible sin internet.')}
          </p>
          <div className="mt-5" />
          <HeroMedia tarjetas={tarjetasHero} />
        </section>
      )}

      {/* Barra de búsqueda y filtros */}
      <div className="px-4 lg:px-8 mt-7">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-display font-extrabold text-xl lg:text-2xl text-jungle-950 mr-auto">
            {t('Para ti en Los Tuxtlas')}
          </h2>
          <div className="relative w-full sm:w-72 order-3 sm:order-none">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-jungle-500" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t('Buscar lugares, comida, hoteles...')}
              className="w-full rounded-full bg-white border border-jungle-200 pl-10 pr-4 py-2.5 text-sm text-jungle-950 placeholder:text-jungle-500 focus:outline-none focus:ring-2 focus:ring-jungle-400"
            />
          </div>
          {onAbrirMapa && (
            <button
              onClick={onAbrirMapa}
              className="inline-flex items-center gap-2 rounded-full border border-jungle-300 bg-white text-jungle-900 text-sm font-semibold px-4 py-2.5 hover:bg-jungle-50 transition-colors"
            >
              <MapIcon size={16} /> {t('Mapa')}
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 mt-4 scroll-smooth snap-x scroll-pl-4 lg:scroll-pl-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <CategoryChip label={`${t('Todos')} · ${todosLugares.length}`} emoji="✨" activo={catActiva === 'todas'} onClick={() => setCatActiva('todas')} />
          {CATEGORIAS.map((c) => (
            <CategoryChip
              key={c.id}
              label={`${t(c.id)} · ${todosLugares.filter((l) => l.categoria === c.id).length}`}
              emoji={c.emoji}
              activo={catActiva === c.id}
              onClick={() => setCatActiva(c.id)}
            />
          ))}
        </div>
      </div>

      {sinFiltro && destacados.length > 0 && (
        <FilaHorizontal
          titulo={t('Destacados')}
          subtitulo={t('Lo mejor valorado y lo que más recomendamos.')}
          lugares={destacados}
          onVerLugar={onVerLugar}
        />
      )}

      {sinFiltro &&
        SECCIONES.map((s) => {
          const lugaresSeccion = todosLugares.filter((l) => l.categoria === s.categoria);
          if (lugaresSeccion.length === 0) return null;
          return (
            <FilaHorizontal
              key={s.categoria}
              titulo={t(s.titulo)}
              subtitulo={`${lugaresSeccion.length === 1 ? t('{n} lugar', { n: 1 }) : t('{n} lugares', { n: lugaresSeccion.length })} · ${t(s.sub)}`}
              lugares={lugaresSeccion}
              onVerLugar={onVerLugar}
              verTodos={{
                etiqueta: t('Ver todos {x}', { x: t(s.titulo) }),
                onClick: () => {
                  setCatActiva(s.categoria);
                  document.getElementById('explorar-resultados')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                },
              }}
            />
          );
        })}

      {/* Todos los servicios — para que se vea TODO lo que hay, no solo
          los primeros de cada carrusel. */}
      {sinFiltro && todosLugares.length > 0 && (
        <section className="mx-3 lg:mx-8 mt-5 rounded-3xl bg-white/70 border border-jungle-200 shadow-[0_2px_16px_rgba(5,46,22,0.07)] p-4 lg:p-6">
          <h2 className="font-display font-extrabold text-xl text-jungle-950">{t('Todos los servicios')}</h2>
          <p className="text-sm text-jungle-600 mt-0.5 mb-5">
            {todosLugares.length === 1 ? t('{n} lugar', { n: 1 }) : t('{n} lugares', { n: todosLugares.length })}
            {' · '}{t('Todo lo que hay en la plataforma')}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-7">
            {todosLugares.map((l) => (
              <TarjetaLugar key={l.id} lugar={l} onClick={() => onVerLugar(l)} />
            ))}
          </div>
        </section>
      )}

      {/* Resultados — lo único que se ve con búsqueda o categoría activa. */}
      {!sinFiltro && (
        <section id="explorar-resultados" className="px-4 lg:px-8 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg text-jungle-950">
              {catActiva === 'todas' ? t('Resultados') : t(CATEGORIAS.find((c) => c.id === catActiva)?.id ?? '')}
            </h2>
            <span className="text-xs text-jungle-600">
              {filtrados.length === 1 ? t('{n} resultado', { n: 1 }) : t('{n} resultados', { n: filtrados.length })}
            </span>
          </div>
          {filtrados.length === 0 ? (
            <div className="text-center py-12 text-jungle-700">
              <SlidersHorizontal className="mx-auto mb-3 opacity-40" size={40} />
              <p className="font-semibold">{t('Sin resultados')}</p>
              <p className="text-sm opacity-70 mt-1">{t('Prueba con otra palabra o cambia la categoría.')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-7">
              {filtrados.map((l) => (
                <TarjetaLugar key={l.id} lugar={l} onClick={() => onVerLugar(l)} />
              ))}
            </div>
          )}
        </section>
      )}

      {onPreguntar && <BarraPregunta onPreguntar={onPreguntar} />}
    </div>
  );
}

// Barra flotante de cristal: se queda pegada abajo mientras se desliza y
// difumina lo que pasa por detrás (tarjetas, fotos).
export function BarraPregunta({
  onPreguntar,
  placeholder,
}: {
  onPreguntar: (t: string) => void;
  placeholder?: string;
}) {
  const t = useT();
  const [texto, setTexto] = useState("");
  const enviar = () => {
    const q = texto.trim();
    if (!q) return;
    setTexto("");
    onPreguntar(q);
  };
  return (
    <div className="sticky bottom-4 z-20 px-4 lg:px-8 mt-6 pointer-events-none">
      <form
        onSubmit={(e) => { e.preventDefault(); enviar(); }}
        className="pointer-events-auto mx-auto max-w-3xl flex items-center gap-2 rounded-3xl p-2 pl-5 bg-white/30 backdrop-blur-2xl backdrop-saturate-150 border border-white/60 shadow-[0_8px_32px_rgba(2,44,22,0.22)] supports-[not(backdrop-filter:blur(1px))]:bg-white/90"
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={placeholder ?? t("Pregunta a TuxtlasGO…")}
          className="flex-1 min-w-0 bg-transparent text-base text-jungle-950 placeholder:text-jungle-800/70 py-2.5 focus:outline-none"
        />
        <button
          type="submit"
          aria-label={t("Enviar")}
          className="h-10 w-10 rounded-full bg-jungle-900 text-white flex items-center justify-center hover:bg-jungle-800 transition-colors flex-shrink-0"
        >
          <Sparkles size={18} />
        </button>
      </form>
    </div>
  );
}

// ── Mosaico de la cabecera ─────────────────────────────────────────
function HeroMedia({ tarjetas }: { tarjetas: TarjetaHero[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 mt-6 snap-x scroll-pl-4 lg:scroll-pl-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tarjetas.map((c) => (
        <TarjetaMedia key={c.id} tarjeta={c} />
      ))}
    </div>
  );
}

function TarjetaMedia({ tarjeta }: { tarjeta: TarjetaHero }) {
  const [videoRoto, setVideoRoto] = useState(false);
  const usaVideo = !!tarjeta.video && !videoRoto;
  return (
    <div className="relative snap-start flex-shrink-0 w-44 sm:w-52 lg:w-56 h-52 lg:h-60 rounded-2xl overflow-hidden bg-jungle-200">
      {usaVideo ? (
        <video
          src={tarjeta.video}
          poster={tarjeta.imagen}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => setVideoRoto(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <img
          src={optimizarImagen(tarjeta.imagen, ANCHO_TARJETA)}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover animate-zoom-lento"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <span className="absolute bottom-3 left-3 right-3 text-white font-display font-bold text-sm leading-tight drop-shadow">
        {tarjeta.titulo}
      </span>
    </div>
  );
}

// ── Carrusel por servicio ──────────────────────────────────────────
function FilaHorizontal({
  titulo,
  subtitulo,
  lugares,
  onVerLugar,
  verTodos,
}: {
  titulo: string;
  subtitulo?: string;
  lugares: Lugar[];
  onVerLugar: (l: Lugar) => void;
  verTodos?: { etiqueta: string; onClick: () => void };
}) {
  return (
    <section className="mx-3 lg:mx-8 mt-5 rounded-3xl bg-white/70 border border-jungle-200 shadow-[0_2px_16px_rgba(5,46,22,0.07)] p-4 lg:p-6">
      <h2 className="font-display font-extrabold text-xl text-jungle-950">{titulo}</h2>
      {subtitulo && <p className="text-sm text-jungle-600 mt-0.5 mb-4">{subtitulo}</p>}
      <div className="flex gap-4 overflow-x-auto -mx-4 px-4 lg:-mx-6 lg:px-6 pb-2 snap-x scroll-pl-4 lg:scroll-pl-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {lugares.map((l) => (
          <div key={l.id} className="snap-start flex-shrink-0 w-[15.5rem] sm:w-64">
            <TarjetaLugar lugar={l} onClick={() => onVerLugar(l)} />
          </div>
        ))}
        {verTodos && (
          <button
            onClick={verTodos.onClick}
            className="snap-start flex-shrink-0 w-[15.5rem] sm:w-64 aspect-square rounded-2xl border border-jungle-200 bg-white hover:bg-jungle-50 transition-colors flex flex-col items-center justify-center gap-4 px-4"
          >
            <Collage lugares={lugares.slice(0, 3)} />
            <span className="font-display font-bold text-sm text-jungle-950 text-center">{verTodos.etiqueta}</span>
          </button>
        )}
      </div>
    </section>
  );
}

function Collage({ lugares }: { lugares: Lugar[] }) {
  const giros = ['-rotate-6 -translate-x-8', 'rotate-3 translate-x-8 translate-y-3', 'rotate-0 -translate-y-6'];
  return (
    <div className="relative w-28 h-24">
      {lugares.map((l, i) => (
        <img
          key={l.id}
          src={optimizarImagen(l.imagen, 200)}
          alt=""
          onError={manejarErrorImagen(l.categoria, l.nombre)}
          className={`absolute left-1/2 top-1/2 -ml-8 -mt-8 w-16 h-16 rounded-xl object-cover border-2 border-white shadow-md ${giros[i]}`}
        />
      ))}
    </div>
  );
}

// ── Tarjeta de lugar (estilo Mindtrip: foto grande, datos debajo) ───
export function TarjetaLugar({ lugar, onClick }: { lugar: Lugar; onClick: () => void }) {
  const t = useT();
  const [fav, setFav] = useState(false);
  useEffect(() => {
    esFavorito(lugar.id).then(setFav);
  }, [lugar.id]);
  const cat = CATEGORIAS.find((c) => c.id === lugar.categoria);

  const alternarFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setFav(await toggleFavorito(lugar.id));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="group cursor-pointer text-left min-w-0 focus:outline-none"
    >
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-jungle-100">
        <img
          src={optimizarImagen(lugar.imagen, ANCHO_TARJETA)}
          alt={lugar.nombre}
          loading="lazy"
          onError={manejarErrorImagen(lugar.categoria, lugar.nombre)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <button
          onClick={alternarFav}
          aria-label={t('Favorito')}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center hover:bg-white transition"
        >
          <Heart size={18} className={fav ? 'fill-red-500 text-red-500' : 'text-jungle-800'} />
        </button>
        {lugar.premium && (
          <span className="absolute bottom-3 left-3 bg-violet-600 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide">
            {t('Patrocinado')}
          </span>
        )}
      </div>
      <div className="mt-2.5 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display font-bold text-jungle-950 leading-snug line-clamp-2 min-w-0">{lugar.nombre}</h3>
          {lugar.rating > 0 && (
            <span className="flex items-center gap-1 text-sm flex-shrink-0">
              <Star size={13} className="fill-amber-400 text-amber-400" />
              <span className="font-semibold text-jungle-900">{lugar.rating}</span>
            </span>
          )}
        </div>
        <p className="text-sm text-jungle-600 mt-0.5 truncate">
          {cat?.emoji} {t(lugar.categoria)}
        </p>
        <p className="text-sm text-jungle-600 truncate">{lugar.municipio}</p>
        <p className="text-sm text-jungle-500">{SIGNOS_PRECIO[lugar.precio]}</p>
      </div>
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
          ? 'bg-jungle-900 text-white shadow-md'
          : 'bg-white text-jungle-800 border border-jungle-200 hover:border-jungle-400'
      }`}
    >
      {emoji} {label}
    </button>
  );
}
