import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight, WifiOff, Sparkles, Compass, Users, MapPin, Download, Percent, TrendingUp, Camera, ShieldCheck,
} from 'lucide-react';
import { useT } from '../lib/i18n';
import { useDespuesDeCarga } from '../lib/useDespuesDeCarga';
import type { Lugar } from '../data/lugares';

// ============================================================
// RECORRIDO DE FOTOS — segunda parte de la historia de la landing
// ============================================================
// Escenario fijo donde las fotos de Los Tuxtlas "vuelan" una tras otra
// (entran desde abajo con una curva, crecen, se apilan y salen), mientras
// al lado se explica por qué TuxtlasGO. Al final aparece el cierre con el
// botón. Reemplaza las secciones "Por qué TuxtlasGO" y "Listo para
// descubrir" para que toda la landing sea una sola historia continua.
//
// Misma técnica que el inicio: un solo requestAnimationFrame que solo
// corre con la sección en pantalla, estilos escritos directo al DOM, sin
// librerías. Todas las fotos ya viven en el proyecto (nada externo).

interface Foto {
  src: string;
  // Nombre del prestador (solo en las fotos de prestadores reales).
  nombre?: string;
}

const FOTOS_BASE: Foto[] = [
  { src: '/img/slide_01.webp' },
  { src: '/lugares/eyipantla_1.webp' },
  { src: '/img/slide_09.webp' },
  { src: '/lugares/nanciyaga_1.webp' },
  { src: '/img/slide_05.webp' },
  { src: '/lugares/hechizo-amor_1.webp' },
  { src: '/img/slide_13.webp' },
  { src: '/lugares/jungla-balneario_1.webp' },
  { src: '/lugares/cerro-venado_1.webp' },
];

const FEATURES = [
  {
    icon: WifiOff,
    title: 'Funciona sin internet',
    desc: 'Service Worker + IndexedDB cachea el mapa, los lugares y el asistente. Una vez cargada, sigue funcionando aunque pierdas señal.',
  },
  {
    icon: Sparkles,
    title: 'Asistente con IA',
    desc: 'Te pregunta tus gustos, días disponibles y presupuesto. Te arma una ruta personalizada en segundos.',
  },
  {
    icon: Compass,
    title: 'Mapa interactivo',
    desc: 'Visualiza los lugares principales de Catemaco y San Andrés Tuxtla. Coordenadas reales, sin depender de Google.',
  },
  {
    icon: Users,
    title: 'Prestadores locales',
    desc: 'Cualquier prestador puede registrar su negocio en segundos. Sin intermediarios ni comisiones desproporcionadas.',
  },
  {
    icon: MapPin,
    title: 'Datos validados',
    desc: 'Los lugares y rutas se construyeron con base en visitas de campo, entrevistas con guías locales y datos oficiales.',
  },
  {
    icon: Download,
    title: 'Instalable como app',
    desc: 'PWA real: agregas un ícono a tu celular y se abre como una app nativa. Sin tienda de apps, sin actualizaciones manuales.',
  },
];

const FEATURES_PRESTADOR = [
  {
    icon: Percent,
    title: 'Comisiones justas',
    desc: 'A diferencia de otras plataformas, no te descontamos un porcentaje desproporcionado por cada reserva.',
  },
  {
    icon: TrendingUp,
    title: 'Visibilidad real',
    desc: 'Apareces en las rutas que arma el asistente de IA cuando un turista busca algo que tú ofreces.',
  },
  {
    icon: Camera,
    title: 'Empieza con lo que ya tienes',
    desc: 'Desde cero, vinculando tu Facebook o Instagram, o subiendo la foto de tu volante — tú eliges.',
  },
  {
    icon: WifiOff,
    title: 'Tu perfil, también offline',
    desc: 'Una vez cargado, tu servicio sigue disponible para turistas sin señal, igual que el resto de la app.',
  },
  {
    icon: Users,
    title: 'Comunidad local',
    desc: 'Formas parte del catálogo de prestadores verificados de Los Tuxtlas, no de un directorio genérico.',
  },
  {
    icon: ShieldCheck,
    title: 'Verificación simple',
    desc: 'Confirmamos que tu servicio es real sin un formulario largo — lo justo para dar confianza al turista.',
  },
];

const COLA = 2 + 3.5; // pasos extra para que las fotos salgan
const MIN_FOTOS = 6;
const MAX_FOTOS = 9;

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));

type Ruta = { lado: number; curva: number; giro: number };

// Cada foto tiene su propia curva y giro, alternando de lado.
const rutasPara = (n: number): Ruta[] =>
  Array.from({ length: n }, (_, i) => ({
    lado: i % 2 === 0 ? 1 : -1,
    curva: 45 + (i % 3) * 15,
    giro: (i % 2 === 0 ? 1 : -1) * (8 + (i % 4) * 3),
  }));

// ¿La foto carga y tiene tamaño suficiente para verse bien en grande?
// (las fotos de baja resolución de los prestadores se descartan)
function fotoConCalidad(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const fin = setTimeout(() => resolve(false), 7000);
    img.onload = () => {
      clearTimeout(fin);
      resolve(Math.min(img.naturalWidth, img.naturalHeight) >= 480);
    };
    img.onerror = () => {
      clearTimeout(fin);
      resolve(false);
    };
    img.src = src;
  });
}

function movimiento(p0: number, ruta: Ruta) {
  const p = clamp(p0);
  const escala = 0.22 + Math.pow(p, 0.8) * 0.78;
  const amp = Math.pow(1 - p, 0.85);
  const s = Math.sin((1 - p) * Math.PI * 1.2);
  return {
    amp,
    curva: s * ruta.curva * ruta.lado,
    giro: s * ruta.giro,
    escala,
    opacidad: p < 0.22 ? p / 0.22 : 1,
  };
}

export default function RecorridoCartas({ modo = 'turista' }: { modo?: 'turista' | 'prestador' }) {
  const t = useT();
  const prestador = modo === 'prestador';
  const fotosListas = useDespuesDeCarga();
  const FEATS = prestador ? FEATURES_PRESTADOR : FEATURES;

  // Turistas: las fotos de siempre. Prestadores: fotos reales de los
  // prestadores registrados (solo las que cargan y tienen buena
  // resolución); si faltan, se completa con las fotos de la región.
  const [fotos, setFotos] = useState<Foto[]>(FOTOS_BASE);
  useEffect(() => {
    if (!prestador) {
      setFotos(FOTOS_BASE);
      return;
    }
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/servicios/aprobados');
        const d = r.ok ? await r.json() : null;
        if (!vivo || !d || !Array.isArray(d.lugares)) return;
        const prestadores = (d.lugares as Lugar[])
          .filter((l) => l.imagen)
          .sort(
            (x, y) =>
              (y.imagenesExtra?.length ?? 0) - (x.imagenesExtra?.length ?? 0) ||
              Number(!!y.premium) - Number(!!x.premium) ||
              y.rating - x.rating
          );
        const candidatas: Foto[] = [];
        const vistas = new Set<string>();
        for (const l of prestadores) {
          for (const src of [l.imagen, ...(l.imagenesExtra ?? [])].slice(0, 2)) {
            if (src && !vistas.has(src)) {
              vistas.add(src);
              candidatas.push({ src, nombre: l.nombre });
            }
          }
        }
        const pruebas = await Promise.all(candidatas.slice(0, 24).map((f) => fotoConCalidad(f.src)));
        const buenas = candidatas.slice(0, 24).filter((_, i) => pruebas[i]);
        if (!vivo || buenas.length === 0) return;
        // Una foto por prestador primero, para que haya variedad.
        const porNombre = new Map<string, Foto>();
        buenas.forEach((f) => {
          if (f.nombre && !porNombre.has(f.nombre)) porNombre.set(f.nombre, f);
        });
        const lista = [...porNombre.values(), ...buenas.filter((f) => ![...porNombre.values()].includes(f))].slice(
          0,
          MAX_FOTOS
        );
        const relleno = FOTOS_BASE.filter((b) => !lista.some((f) => f.src === b.src));
        while (lista.length < MIN_FOTOS && relleno.length) lista.push(relleno.shift() as Foto);
        setFotos(lista);
      } catch {
        /* sin conexión: se quedan las fotos de la región */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [prestador]);

  const N = fotos.length;
  const TOTAL = N + COLA;
  const RUTAS = useMemo(() => rutasPara(N), [N]);
  const refSec = useRef<HTMLElement>(null);
  const refEscena = useRef<HTMLDivElement>(null);
  const refCartas = useRef<(HTMLDivElement | null)[]>([]);
  const refPanel = useRef<HTMLDivElement>(null);
  const refFeats = useRef<(HTMLDivElement | null)[]>([]);
  const refPuntos = useRef<(HTMLSpanElement | null)[]>([]);
  const refNum = useRef<HTMLSpanElement>(null);
  const refCierre = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sec = refSec.current;
    const escena = refEscena.current;
    if (!sec || !escena) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let actual = 0;
    let raf = 0;
    let activo = false;
    let W = escena.clientWidth;
    let H = escena.clientHeight;
    const medir = () => {
      W = escena.clientWidth;
      H = escena.clientHeight;
    };
    window.addEventListener('resize', medir);

    const tick = () => {
      const r = sec.getBoundingClientRect();
      const objetivo = clamp(-r.top / Math.max(1, sec.offsetHeight - window.innerHeight));
      actual = reduce ? objetivo : actual + (objetivo - actual) * 0.07;
      if (Math.abs(objetivo - actual) < 0.0002) actual = objetivo;
      const paso = actual * TOTAL;

      refCartas.current.forEach((c, i) => {
        if (!c) return;
        const entrada = clamp(paso - i);
        const salida = clamp((paso - (i + 2)) / 3.5);
        const ruta = RUTAS[i];
        let m;
        let saliendo = false;
        if (salida > 0) {
          m = movimiento(1 - salida, ruta);
          saliendo = true;
        } else if (entrada < 1) {
          m = movimiento(entrada, ruta);
        } else {
          m = { amp: 0, curva: 0, giro: 0, escala: 1, opacidad: 1 };
        }
        // Siempre entran desde abajo y salen hacia arriba; la curva va de lado.
        const dir = saliendo ? -1 : 1;
        const tx = m.curva;
        const ty = dir * m.amp * H * 0.62;
        c.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${m.escala}) rotate(${m.giro}deg)`;
        c.style.opacity = String(m.opacidad);
      });
      void W;

      // Panel de "por qué" — aparece con la primera foto, se va al final.
      const pIn = seg(paso, 0.2, 1);
      const pOut = seg(paso, N + 0.4, N + 1.8);
      if (refPanel.current) {
        refPanel.current.style.opacity = String(pIn * (1 - pOut));
        refPanel.current.style.transform = `translateY(${(1 - pIn) * 30 - pOut * 30}px)`;
        refPanel.current.style.visibility = pIn * (1 - pOut) > 0 ? 'visible' : 'hidden';
      }
      // Una característica por cada tramo de fotos.
      const pos = Math.min(FEATS.length - 1, Math.max(0, (paso / N) * FEATS.length - 0.5));
      let activa = 0;
      FEATS.forEach((_, i) => {
        const d = Math.abs(pos - i);
        const k = clamp(1 - d * 1.5);
        const el = refFeats.current[i];
        if (el) {
          el.style.opacity = String(k);
          el.style.transform = `translateY(${(i - pos) * 24}px)`;
        }
        if (d < Math.abs(pos - activa)) activa = i;
      });
      refPuntos.current.forEach((p, i) => {
        if (p) {
          p.style.opacity = i === activa ? '1' : '0.35';
          p.style.width = i === activa ? '22px' : '8px';
        }
      });
      if (refNum.current) refNum.current.textContent = `0${activa + 1} / 0${FEATS.length}`;

      // Cierre
      const c = seg(paso, N + 2.2, N + 3.6);
      if (refCierre.current) {
        refCierre.current.style.opacity = String(c);
        refCierre.current.style.transform = `translateY(${(1 - c) * 24}px) scale(${0.96 + c * 0.04})`;
        refCierre.current.style.visibility = c > 0 ? 'visible' : 'hidden';
      }

      if (activo) raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !activo) {
          activo = true;
          medir();
          raf = requestAnimationFrame(tick);
        } else if (!e.isIntersecting) {
          activo = false;
          cancelAnimationFrame(raf);
        }
      },
      { rootMargin: '120px' }
    );
    io.observe(sec);
    return () => {
      activo = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', medir);
    };
  }, [FEATS.length, N, TOTAL, RUTAS]);

  return (
    <section
      id="features"
      ref={refSec}
      className="relative"
      style={{ height: `${Math.round(TOTAL * 75)}vh` }}
      aria-label={t(prestador ? 'Por qué registrarte en TuxtlasGO' : 'Por qué TuxtlasGO')}
    >
      <div className="sticky top-16 h-[calc(100svh-4rem)] overflow-hidden bg-jungle-950 isolate">
        {/* Fondo: verde profundo con luces suaves */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 55% at 22% 80%, rgba(74,222,128,0.20) 0%, transparent 70%),' +
              'radial-gradient(ellipse 80% 60% at 80% 12%, rgba(103,232,249,0.14) 0%, transparent 75%),' +
              'linear-gradient(180deg, #052e16 0%, #0b3b20 55%, #14532d 100%)',
          }}
        />

        {/* Escenario de las fotos (izquierda en escritorio, arriba en celular) */}
        <div
          ref={refEscena}
          className="absolute left-0 top-0 flex h-[52%] w-full items-center justify-center lg:h-full lg:w-[56%]"
          style={{ perspective: '1200px' }}
        >
          {fotos.map((foto, i) => (
            <div
              key={foto.src}
              ref={(el) => {
                refCartas.current[i] = el;
              }}
              className="absolute aspect-[13/18] w-[min(40vw,15rem)] rounded-2xl border border-white/80 bg-white p-2 shadow-[0_16px_40px_rgba(0,0,0,0.35)] will-change-transform sm:p-2.5 lg:w-[min(22vw,19rem)]"
              style={{ zIndex: i + 1, opacity: 0 }}
            >
              <img
                src={fotosListas ? foto.src : undefined}
                alt={foto.nombre ?? ''}
                loading="lazy"
                draggable={false}
                className="h-full w-full select-none rounded-xl object-cover"
              />
              {foto.nombre && (
                <span className="absolute inset-x-2.5 bottom-2.5 truncate rounded-b-xl bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8 font-display text-xs font-bold text-white sm:text-sm">
                  {foto.nombre}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Panel: por qué TuxtlasGO */}
        <div
          ref={refPanel}
          className="invisible absolute inset-x-4 bottom-6 z-20 text-white lg:inset-x-auto lg:bottom-auto lg:right-10 lg:top-1/2 lg:w-[38%] lg:-translate-y-1/2"
          style={{ opacity: 0 }}
        >
          <span className="inline-flex h-6 items-center rounded bg-jungle-300 px-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-jungle-950">
            {t(prestador ? 'Por qué registrarte en TuxtlasGO' : 'Por qué TuxtlasGO')}
          </span>
          <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            {t(prestador ? 'Hecho para prestadores locales' : 'Pensada para Los Tuxtlas')}
          </h2>
          <div className="relative mt-4 h-48 lg:mt-6 lg:h-52">
            {FEATS.map((f, i) => (
              <div
                key={f.title}
                ref={(el) => {
                  refFeats.current[i] = el;
                }}
                className="absolute inset-0 rounded-2xl border border-white/25 bg-white/10 p-4 backdrop-blur-xl sm:p-5"
                style={{ opacity: 0 }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-jungle-300 text-jungle-950">
                  <f.icon size={20} />
                </div>
                <h3 className="mt-3 font-display text-lg font-bold sm:text-xl">{t(f.title)}</h3>
                <p className="mt-1 text-sm leading-relaxed text-white/80">{t(f.desc)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            {FEATS.map((_, i) => (
              <span
                key={i}
                ref={(el) => {
                  refPuntos.current[i] = el;
                }}
                className="h-2 rounded-full bg-jungle-300 transition-[width,opacity] duration-300"
                style={{ width: 8, opacity: 0.35 }}
              />
            ))}
            <span ref={refNum} className="ml-auto font-mono text-xs tracking-widest text-white/70">
              01 / 06
            </span>
          </div>
        </div>

        {/* Cierre */}
        <div
          ref={refCierre}
          className="invisible absolute inset-0 z-30 flex flex-col items-center justify-center px-5 text-center text-white"
          style={{ opacity: 0 }}
        >
          <div className="rounded-3xl border border-white/25 bg-jungle-950/55 px-6 py-10 backdrop-blur-xl sm:px-12 sm:py-14">
            <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
              {t(prestador ? 'Súmate a los prestadores de Los Tuxtlas' : 'Listo para descubrir Los Tuxtlas')}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-white/80">
              {t(
                prestador
                  ? 'Registrar tu servicio es gratis. Tú decides qué información compartes.'
                  : 'La aplicación es gratuita. Tus datos no salen de tu dispositivo.'
              )}
            </p>
            <Link
              to={prestador ? '/prestador' : '/app'}
              className="pointer-events-auto mt-7 inline-flex items-center gap-2 rounded-full bg-jungle-300 px-8 py-4 text-lg font-semibold text-jungle-950 shadow-xl transition-colors hover:bg-jungle-200"
            >
              {t(prestador ? 'Únete ahora' : 'Empezar ahora')}
              <ChevronRight size={20} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
