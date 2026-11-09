import {
  X, Star, MapPin, Clock, DollarSign, Calendar, Navigation, Heart, Route, Lightbulb, BadgeCheck,
  PawPrint, Instagram, Facebook, MessageCircle, Phone, Globe, CalendarCheck, Share2, ChevronDown, Maximize2, Minimize2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lugar } from '../data/lugares';
import { CATEGORIAS } from '../data/lugares';
import { toggleFavorito, esFavorito } from '../lib/db';
import { manejarErrorImagen } from '../lib/imagenLugar';
import type { TipoEnlace } from '../lib/enlaces';
import { registrarEventoServicio } from '../lib/eventos';
import { getCatalogoActivo } from '../lib/chatbot';
import ModalReservacion from './ModalReservacion';
import MiniMapaChat from './MiniMapaChat';
import { TarjetaLugar, BarraPregunta } from './ExploreScreen';
import { useT, useTd } from '../lib/i18n';
import { optimizarImagen, ANCHO_DETALLE, ANCHO_TARJETA } from '../lib/imagenOptimizada';

interface Props {
  lugar: Lugar;
  onClose: () => void;
  onVerEnMapa: () => void;
  // Para saltar a un lugar similar sin cerrar la hoja.
  onVerLugar?: (lugar: Lugar) => void;
  // Barra flotante "Pregunta…": manda la pregunta al asistente.
  onPreguntar?: (texto: string) => void;
}

type Pestana = 'resumen' | 'resenas' | 'ubicacion';
const PESTANAS: Pestana[] = ['resumen', 'resenas', 'ubicacion'];

export default function PlaceDetail({ lugar, onClose, onVerEnMapa, onVerLugar, onPreguntar }: Props) {
  const t = useT();
  const td = useTd();
  const [fav, setFav] = useState(false);
  const [mostrarReservacion, setMostrarReservacion] = useState(false);
  const [leerMas, setLeerMas] = useState(false);
  const [pestana, setPestana] = useState<Pestana>('resumen');
  // "panel": ocupa el área de contenido (la barra lateral sigue a la vista).
  // "expandido": pantalla completa y más ancho, para repartir mejor todo.
  const [expandido, setExpandido] = useState(false);
  const [galeriaAbierta, setGaleriaAbierta] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const refResumen = useRef<HTMLElement>(null);
  const refResenas = useRef<HTMLElement>(null);
  const refUbicacion = useRef<HTMLElement>(null);
  const refSecciones = { resumen: refResumen, resenas: refResenas, ubicacion: refUbicacion };
  const cat = CATEGORIAS.find((c) => c.id === lugar.categoria);
  // La foto principal + lo que el prestador haya subido de más.
  const fotos = [lugar.imagen, ...(lugar.imagenesExtra ?? [])];
  const similares = useMemo(
    () => getCatalogoActivo().filter((l) => l.id !== lugar.id && l.categoria === lugar.categoria).slice(0, 6),
    [lugar.id, lugar.categoria]
  );

  useEffect(() => {
    esFavorito(lugar.id).then(setFav);
    document.body.style.overflow = 'hidden';
    setLeerMas(false);
    setPestana('resumen');
    scrollRef.current?.scrollTo({ top: 0 });
    // Cuenta como "vista" para las estadísticas del prestador — solo
    // servicios reales (con servicioId).
    registrarEventoServicio(lugar.servicioId, 'vista');
    return () => {
      document.body.style.overflow = '';
    };
  }, [lugar.id]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (galeriaAbierta) setGaleriaAbierta(false);
      else onClose();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [galeriaAbierta, onClose]);

  const handleFav = async () => setFav(await toggleFavorito(lugar.id));

  const compartir = async () => {
    const datos = { title: lugar.nombre, text: lugar.descripcionCorta, url: window.location.origin };
    try {
      if (navigator.share) await navigator.share(datos);
      else await navigator.clipboard.writeText(`${lugar.nombre} — ${datos.url}`);
    } catch {
      /* el turista canceló */
    }
  };

  const irA = (p: Pestana) => {
    setPestana(p);
    const cont = scrollRef.current;
    const sec = refSecciones[p].current;
    if (!cont || !sec) return;
    // 56px = alto de la barra de pestañas pegada arriba.
    cont.scrollTo({ top: sec.offsetTop - 56, behavior: 'smooth' });
  };

  // La pestaña activa sigue al scroll.
  const alDeslizar = () => {
    const cont = scrollRef.current;
    if (!cont) return;
    const y = cont.scrollTop + 90;
    let activa: Pestana = 'resumen';
    PESTANAS.forEach((p) => {
      const sec = refSecciones[p].current;
      if (sec && sec.offsetTop <= y) activa = p;
    });
    // Al llegar al final del todo, la última pestaña no alcanza a pasar
    // de la línea de arriba: se marca a mano.
    if (cont.scrollTop + cont.clientHeight >= cont.scrollHeight - 4) activa = 'ubicacion';
    setPestana(activa);
  };

  const descLarga = lugar.descripcion.length > 260;
  const etiquetaPestana: Record<Pestana, string> = {
    resumen: t('Resumen'),
    resenas: t('Reseñas'),
    ubicacion: t('Ubicación'),
  };

  return (
    <div
      className={`fixed inset-y-0 right-0 z-[9999] bg-white animate-fade-in ${expandido ? 'left-0' : 'left-0 lg:left-[72px] lg:border-l lg:border-jungle-200'}`}
    >
      <div className="relative w-full h-full overflow-hidden flex flex-col">
        {/* Barra de acciones — fija arriba */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-jungle-100 bg-white">
          <button
            onClick={onClose}
            aria-label={t('Cerrar')}
            className="w-10 h-10 rounded-full hover:bg-jungle-50 flex items-center justify-center text-jungle-900"
          >
            <X size={20} />
          </button>
          <button
            onClick={() => setExpandido((v) => !v)}
            aria-label={expandido ? t('Contraer') : t('Expandir')}
            title={expandido ? t('Contraer') : t('Expandir')}
            className="hidden lg:flex w-10 h-10 rounded-full hover:bg-jungle-50 items-center justify-center text-jungle-900"
          >
            {expandido ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleFav}
              className="inline-flex items-center gap-1.5 rounded-full border border-jungle-300 px-3.5 py-2 text-sm font-semibold text-jungle-900 hover:bg-jungle-50"
            >
              <Heart size={16} className={fav ? 'fill-red-500 text-red-500' : ''} />
              <span className="hidden sm:inline">{fav ? t('Guardado') : t('Guardar')}</span>
            </button>
            {lugar.aceptaReservaciones && (
              <button
                onClick={() => setMostrarReservacion(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-sun-500 hover:bg-sun-400 text-obsidiana-950 px-3.5 py-2 text-sm font-semibold"
              >
                <CalendarCheck size={16} /> {t('Reservar')}
              </button>
            )}
            <button
              onClick={onVerEnMapa}
              aria-label={t('Ver en el mapa')}
              title={t('Ver en el mapa')}
              className="w-10 h-10 rounded-full border border-jungle-300 flex items-center justify-center text-jungle-900 hover:bg-jungle-50"
            >
              <Route size={17} />
            </button>
            <button
              onClick={compartir}
              aria-label={t('Compartir')}
              className="w-10 h-10 rounded-full border border-jungle-300 flex items-center justify-center text-jungle-900 hover:bg-jungle-50"
            >
              <Share2 size={17} />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={alDeslizar}
          className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain"
        >
          <div className={`mx-auto w-full ${expandido ? 'max-w-[1400px]' : 'max-w-5xl'}`}>
          {/* Título */}
          <div className="px-5 sm:px-8 pt-6">
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-jungle-950">{lugar.nombre}</h2>
            <div className="flex items-center gap-2 flex-wrap text-sm text-jungle-700 mt-1.5">
              {lugar.rating > 0 && (
                <>
                  <span className="flex items-center gap-1 font-semibold text-jungle-950">
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
            <div className="flex items-center gap-2 flex-wrap mt-2.5">
              <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${cat?.color}`}>
                {cat?.emoji} {t(lugar.categoria)}
              </span>
              {lugar.verificado && (
                <span className="inline-flex items-center gap-1 text-xs bg-jungle-100 text-jungle-800 px-2.5 py-1 rounded-full font-medium">
                  <BadgeCheck size={12} /> {t('Info verificada')}
                </span>
              )}
            </div>
          </div>

          {/* Mosaico de fotos: una grande + hasta cuatro chicas */}
          <div className="px-5 sm:px-8 mt-5">
            <MosaicoFotos fotos={fotos} nombre={lugar.nombre} categoria={lugar.categoria} grande={expandido} onAbrir={() => setGaleriaAbierta(true)} />
          </div>

          {/* Pestañas — se quedan pegadas arriba al deslizar */}
          <div className="sticky top-0 z-10 bg-white mt-5 px-5 sm:px-8 border-b border-jungle-100 flex gap-6">
            {PESTANAS.map((id) => (
              <button
                key={id}
                onClick={() => irA(id)}
                className={`py-3.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  pestana === id
                    ? 'border-jungle-900 text-jungle-950'
                    : 'border-transparent text-jungle-500 hover:text-jungle-800'
                }`}
              >
                {etiquetaPestana[id]}
              </button>
            ))}
          </div>

          <div className="px-5 sm:px-8 pb-10">
            {/* Resumen */}
            <section ref={refResumen} className="pt-6 space-y-6">
              <div>
                <p className={`text-jungle-900 leading-relaxed ${leerMas ? '' : 'line-clamp-5'}`}>
                  {lugar.descripcion}
                </p>
                {descLarga && (
                  <button
                    onClick={() => setLeerMas((v) => !v)}
                    className="mt-3 inline-flex items-center gap-1 rounded-full border border-jungle-300 px-4 py-2 text-sm font-semibold text-jungle-900 hover:bg-jungle-50"
                  >
                    {leerMas ? t('Leer menos') : t('Leer más')}
                    <ChevronDown size={14} className={leerMas ? 'rotate-180' : ''} />
                  </button>
                )}
              </div>

              <div className={`border-t border-jungle-100 pt-6 grid sm:grid-cols-2 gap-x-8 gap-y-5 ${expandido ? 'xl:grid-cols-3' : ''}`}>
                {lugar.comoLlegar && (
                  <Dato icono={Navigation} titulo={t('Cómo llegar')}>{lugar.comoLlegar}</Dato>
                )}
                <Dato icono={Clock} titulo={t('Horario')}>
                  {td(lugar.abierto.dias)} · {td(lugar.abierto.horario)}
                </Dato>
                <Dato icono={DollarSign} titulo={t('Costo')}>{td(lugar.precioMxn)}</Dato>
                <Dato icono={Calendar} titulo={t('Duración')}>{td(lugar.duracionSugerida)}</Dato>
                {lugar.contacto && <Dato icono={Phone} titulo={t('Contacto')}>{lugar.contacto}</Dato>}
                {/* Mascotas: solo si el prestador la declaró; sin dato, no
                    se dice nada (nunca se supone). */}
                {lugar.mascotas && <Dato icono={PawPrint} titulo={t('Mascotas')}>{lugar.mascotas}</Dato>}
              </div>

              {lugar.tip && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 mb-1 uppercase tracking-wide font-semibold">
                    <Lightbulb size={12} /> {t('Consejo')}
                  </div>
                  <p className="text-sm text-amber-900">{lugar.tip}</p>
                </div>
              )}

              <div>
                <div className="text-xs font-semibold text-jungle-600 uppercase tracking-wide mb-2">
                  {t('Ideal para')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {lugar.ideal.map((g) => (
                    <span key={g} className="bg-jungle-100 text-jungle-800 px-3 py-1 rounded-full text-xs font-medium">
                      {g === 'solo'
                        ? t('🧍 viajeros solos')
                        : g === 'pareja'
                          ? t('💕 parejas')
                          : g === 'familia'
                            ? t('👨‍👩‍👧 familias')
                            : t('🎉 grupos')}
                    </span>
                  ))}
                </div>
              </div>

              {lugar.enlaces && lugar.enlaces.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {lugar.enlaces.map((en) => (
                    <a
                      key={en.id}
                      href={en.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 bg-jungle-50 hover:bg-jungle-100 text-jungle-800 text-xs font-semibold px-3 py-2 rounded-full"
                    >
                      <IconoEnlaceLugar tipo={en.tipo} />
                      {en.tipo === 'sitio' ? t('Sitio web') : en.tipo === 'otro' ? t('Enlace') : ETIQUETA_ENLACE[en.tipo]}
                    </a>
                  ))}
                </div>
              )}
            </section>

            {/* Reseñas — todavía no existe un sistema de reseñas, así que se
                dice tal cual: nunca se inventan opiniones. */}
            <section ref={refResenas} className="pt-10 border-t border-jungle-100 mt-10">
              <h3 className="font-display font-bold text-xl text-jungle-950">{t('Reseñas')}</h3>
              {lugar.rating > 0 && (
                <p className="flex items-center gap-1.5 mt-2 text-jungle-900">
                  <Star size={18} className="fill-amber-400 text-amber-400" />
                  <span className="font-bold text-lg">{lugar.rating}</span>
                  <span className="text-sm text-jungle-600">{t('calificación del lugar')}</span>
                </p>
              )}
              <p className="text-sm text-jungle-600 mt-2">
                {t('Todavía no hay reseñas de turistas para este lugar.')}
              </p>
            </section>

            {/* Ubicación */}
            <section ref={refUbicacion} className="pt-10 border-t border-jungle-100 mt-10">
              <h3 className="font-display font-bold text-xl text-jungle-950">{t('Ubicación')}</h3>
              <p className="flex items-center gap-1.5 text-sm text-jungle-700 mt-2">
                <MapPin size={15} /> {lugar.municipio}, Veracruz
              </p>
              <div className={`relative mt-4 ${expandido ? 'h-96 sm:h-[30rem]' : 'h-72 sm:h-80'} rounded-2xl overflow-hidden border border-jungle-100`}>
                <MiniMapaChat lugares={[lugar]} />
                <button
                  onClick={onVerEnMapa}
                  className="absolute top-3 left-3 z-10 inline-flex items-center gap-2 rounded-full bg-jungle-900 text-white text-sm font-semibold px-4 py-2.5 shadow-lg hover:bg-jungle-800"
                >
                  {t('Cómo llegar')} <Route size={15} />
                </button>
              </div>
            </section>

            {/* Similares */}
            {similares.length > 0 && (
              <section className="pt-10 border-t border-jungle-100 mt-10">
                <h3 className="font-display font-bold text-xl text-jungle-950 mb-5">{t('Lugares similares')}</h3>
                <div className={`grid grid-cols-2 gap-x-4 gap-y-7 ${expandido ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
                  {similares.map((l) => (
                    <TarjetaLugar key={l.id} lugar={l} onClick={() => onVerLugar?.(l)} />
                  ))}
                </div>
              </section>
            )}
          </div>
          </div>

          {onPreguntar && (
            <BarraPregunta
              placeholder={t('Pregunta sobre {nombre}…', { nombre: lugar.nombre })}
              onPreguntar={(q) => {
                onClose();
                onPreguntar(`${lugar.nombre}: ${q}`);
              }}
            />
          )}
        </div>
      </div>

      {galeriaAbierta && (
        <GaleriaFotos
          fotos={fotos}
          lugar={lugar}
          fav={fav}
          onFav={handleFav}
          onCompartir={compartir}
          onCerrar={() => setGaleriaAbierta(false)}
        />
      )}

      {mostrarReservacion && (
        <ModalReservacion lugar={lugar} onCerrar={() => setMostrarReservacion(false)} />
      )}
    </div>
  );
}

function Dato({
  icono: Icono,
  titulo,
  children,
}: {
  icono: typeof Clock;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 min-w-0">
      <Icono size={18} className="text-jungle-700 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="font-bold text-jungle-950 text-sm">{titulo}</div>
        <div className="text-sm text-jungle-800 mt-0.5 break-words">{children}</div>
      </div>
    </div>
  );
}

// Una foto grande a la izquierda y hasta cuatro chicas en cuadrícula, como
// en la referencia. Con una sola foto, ocupa todo el ancho.
function MosaicoFotos({
  fotos,
  nombre,
  categoria,
  grande,
  onAbrir,
}: {
  fotos: string[];
  nombre: string;
  categoria: Lugar['categoria'];
  grande?: boolean;
  onAbrir: () => void;
}) {
  const t = useT();
  const chicas = fotos.slice(1, 5);
  const img = (url: string, ancho: number) => (
    <img
      src={optimizarImagen(url, ancho)}
      alt={nombre}
      loading="lazy"
      onError={manejarErrorImagen(categoria, nombre)}
      className="w-full h-full object-cover"
    />
  );
  if (chicas.length === 0) {
    return (
      <button onClick={onAbrir} className="block w-full aspect-[16/9] rounded-2xl overflow-hidden bg-jungle-100">
        {img(fotos[0], ANCHO_DETALLE)}
      </button>
    );
  }
  return (
    <div className={`grid grid-cols-4 grid-rows-2 gap-2 aspect-[16/9] ${grande ? 'sm:aspect-[5/2]' : 'sm:aspect-[2/1]'} rounded-2xl overflow-hidden`}>
      <button onClick={onAbrir} className="col-span-2 row-span-2 bg-jungle-100 overflow-hidden">{img(fotos[0], ANCHO_DETALLE)}</button>
      {chicas.map((url, i) => (
        <button key={url + i} onClick={onAbrir} className={`relative bg-jungle-100 overflow-hidden ${claseChica(chicas.length, i)}`}>
          {img(url, ANCHO_TARJETA)}
          {i === chicas.length - 1 && fotos.length > 5 && (
            <span className="absolute inset-0 bg-black/45 text-white font-semibold text-sm flex items-center justify-center">
              {t('+{n} fotos', { n: fotos.length - 5 })}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// Cómo se reparte el lado derecho según cuántas fotos chicas haya, para no
// dejar huecos vacíos en la cuadrícula de 4 columnas x 2 filas.
function claseChica(n: number, i: number): string {
  if (n === 1) return 'col-span-2 row-span-2';
  if (n === 2) return 'col-span-2';
  if (n === 3) return i === 0 ? 'col-span-2' : '';
  return '';
}

const ETIQUETA_ENLACE: Record<TipoEnlace, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
  sitio: 'Sitio web',
  otro: 'Enlace',
};

function IconoEnlaceLugar({ tipo }: { tipo: TipoEnlace }) {
  const props = { size: 13 };
  switch (tipo) {
    case 'instagram': return <Instagram {...props} />;
    case 'facebook': return <Facebook {...props} />;
    case 'whatsapp': return <MessageCircle {...props} />;
    default: return <Globe {...props} />;
  }
}

// Galería a pantalla completa: todas las fotos del lugar en columnas,
// como en la referencia. Esc o la X la cierran.
function GaleriaFotos({
  fotos,
  lugar,
  fav,
  onFav,
  onCompartir,
  onCerrar,
}: {
  fotos: string[];
  lugar: Lugar;
  fav: boolean;
  onFav: () => void;
  onCompartir: () => void;
  onCerrar: () => void;
}) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-[10000] bg-obsidiana-950 text-white flex flex-col animate-fade-in">
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <button
          onClick={onCerrar}
          aria-label={t('Cerrar')}
          className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center"
        >
          <X size={20} />
        </button>
        <h3 className="font-display font-bold truncate">{lugar.nombre}</h3>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onFav}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/30 px-3.5 py-2 text-sm font-semibold hover:bg-white/10"
          >
            <Heart size={16} className={fav ? 'fill-red-500 text-red-500' : ''} />
            <span className="hidden sm:inline">{fav ? t('Guardado') : t('Guardar')}</span>
          </button>
          <button
            onClick={onCompartir}
            aria-label={t('Compartir')}
            className="w-10 h-10 rounded-full border border-white/30 flex items-center justify-center hover:bg-white/10"
          >
            <Share2 size={17} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-6">
        <div className={`mx-auto columns-1 sm:columns-2 gap-3 sm:gap-4 ${fotos.length >= 5 ? 'lg:columns-3 max-w-[1500px]' : 'max-w-5xl'}`}>
          {fotos.map((url, i) => (
            <img
              key={url + i}
              src={optimizarImagen(url, ANCHO_DETALLE)}
              alt={lugar.nombre}
              loading="lazy"
              onError={manejarErrorImagen(lugar.categoria, lugar.nombre)}
              className="w-full mb-3 sm:mb-4 rounded-lg break-inside-avoid"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
