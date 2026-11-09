import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronDown, Download, MapPin, Star } from 'lucide-react';
import { LUGARES, type Lugar } from '../data/lugares';
import { useT } from '../lib/i18n';

// ============================================================
// INICIO DE LA LANDING — historia que avanza con el scroll
// ============================================================
// Idea tomada de un demo de scroll-storytelling (escenario fijo que
// va cambiando mientras se desliza: cámara con parallax, palabras que
// aparecen desenfocadas, tarjetas que entran, contadores). Todo es
// propio: fotos reales de Los Tuxtlas, textos de TuxtlasGO y datos del
// catálogo — nada de assets ni marca de terceros.
//
// Cero librerías: un solo requestAnimationFrame que SOLO corre cuando
// la sección está en pantalla, y escribe estilos directo al DOM (no hay
// re-render de React por frame). Es una PWA pensada para celulares con
// señal débil, así que las fotos son las mismas que ya trae la app.

const ESCENAS = [
  '/img/slide_05.jpg', // lago de Catemaco
  '/lugares/eyipantla_1.jpg', // cascada
  '/lugares/nanciyaga_1.jpg', // selva
  '/lugares/hechizo-amor_1.jpg', // atardecer
];

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export default function HeroScroll() {
  const t = useT();

  // Datos reales del catálogo — nada inventado.
  const destacados = useMemo(() => LUGARES.filter((l) => l.destacado).slice(0, 4), []);
  // Catálogo fijo + los servicios aprobados de los prestadores (si hay
  // conexión). Sin internet se queda con el catálogo fijo: la cifra nunca
  // se inventa, solo cuenta lo que de verdad hay.
  const [todos, setTodos] = useState<Lugar[]>(LUGARES);
  useEffect(() => {
    let vivo = true;
    fetch('/api/servicios/aprobados')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d || !Array.isArray(d.lugares)) return;
        const ids = new Set(LUGARES.map((l) => l.id));
        setTodos([...LUGARES, ...(d.lugares as Lugar[]).filter((l) => !ids.has(l.id))]);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);
  const cifras = useMemo(
    () => [
      { n: todos.length, etiqueta: 'Lugares en el mapa' },
      { n: new Set(todos.map((l) => l.municipio)).size, etiqueta: 'Municipios' },
      { n: new Set(todos.map((l) => l.categoria)).size, etiqueta: 'Tipos de servicio' },
    ],
    [todos]
  );

  const refStory = useRef<HTMLElement>(null);
  const refCam = useRef<HTMLDivElement>(null);
  const refEscenas = useRef<(HTMLImageElement | null)[]>([]);
  const refHero = useRef<HTMLDivElement>(null);
  const refHud = useRef<HTMLDivElement>(null);
  const refHint = useRef<HTMLDivElement>(null);
  const refVision = useRef<HTMLDivElement>(null);
  const refLugares = useRef<HTMLDivElement>(null);
  const refFinal = useRef<HTMLDivElement>(null);
  const refProg = useRef<HTMLDivElement>(null);
  const refCifras = useRef<(HTMLSpanElement | null)[]>([]);

  const palabrasVision = t('De información dispersa a rutas claras, locales y sin internet').split(' ');

  useEffect(() => {
    const story = refStory.current;
    if (!story) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let sp = 0;
    let sx = 0;
    let sy = 0;
    let px = window.innerWidth / 2;
    let py = window.innerHeight / 2;
    let raf = 0;
    let activo = false;
    let ultimo = 0;

    const capas = (el: HTMLElement | null, visible: boolean) => {
      if (el) el.style.visibility = visible ? 'visible' : 'hidden';
    };

    const tick = (now: number) => {
      const dt = Math.min(64, now - (ultimo || now));
      ultimo = now;
      const r = story.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, story.offsetHeight - window.innerHeight));
      // Suaviza el avance (inercia); con "menos movimiento" va directo.
      sp = reduce ? p : sp + (p - sp) * (1 - Math.pow(0.86, dt / 16.7));
      if (Math.abs(p - sp) < 0.0002) sp = p;
      sx += (px / window.innerWidth - 0.5 - sx) * 0.06;
      sy += (py / window.innerHeight - 0.5 - sy) * 0.06;
      if (reduce) {
        sx = 0;
        sy = 0;
      }

      // Cámara: parallax con el mouse + acercamiento lento con el scroll.
      if (refCam.current) {
        refCam.current.style.transform = `translate3d(${-sx * 18}px,${-sy * 12}px,0) scale(${1.04 + sp * 0.1})`;
      }
      // Escenas: cada una se encima a la anterior.
      const a = [1, seg(sp, 0.2, 0.34), seg(sp, 0.42, 0.52), seg(sp, 0.7, 0.8)];
      refEscenas.current.forEach((img, i) => {
        if (img) img.style.opacity = String(a[i]);
      });

      // 1) Portada
      const h = seg(sp, 0.02, 0.11);
      if (refHero.current) {
        refHero.current.style.transform = `translate3d(${-sx * 10}px,${-h * 80 - sy * 6}px,0) scale(${1 + h * 0.1})`;
        refHero.current.style.filter = `blur(${h * 14}px)`;
        refHero.current.style.opacity = String(1 - h);
      }
      capas(refHero.current, h < 1);
      if (refHud.current) {
        refHud.current.style.opacity = String(1 - seg(sp, 0.02, 0.08));
        refHud.current.style.transform = `translate3d(${sx * 20}px,${sy * 14}px,0)`;
      }
      if (refHint.current) refHint.current.style.opacity = String(1 - seg(sp, 0.01, 0.05));

      // 2) Visión: palabras que entran desenfocadas y salen hacia arriba
      const vIn = seg(sp, 0.14, 0.25);
      const vOut = seg(sp, 0.34, 0.42);
      const vis = refVision.current;
      if (vis) {
        const ws = vis.querySelectorAll<HTMLElement>('[data-w]');
        ws.forEach((w, i) => {
          const k = clamp(vIn * 1.7 - i * 0.07);
          w.style.transform = `translate3d(0,${(1 - k) * 28 - vOut * 60}px,0)`;
          w.style.filter = `blur(${(1 - k) * 12 + vOut * 14}px)`;
          w.style.opacity = String(k * (1 - vOut));
        });
        const sub = vis.querySelector<HTMLElement>('[data-sub]');
        if (sub) {
          const o = clamp(vIn * 2 - 0.6) * (1 - vOut);
          sub.style.opacity = String(o);
          sub.style.transform = `translateY(${-vOut * 50}px)`;
        }
        capas(vis, vIn > 0 && vOut < 1);
      }

      // 3) Lugares reales: tarjetas que entran una por una
      const lIn = seg(sp, 0.45, 0.55);
      const lOut = seg(sp, 0.66, 0.72);
      const lug = refLugares.current;
      if (lug) {
        lug.querySelectorAll<HTMLElement>('[data-card]').forEach((c, i) => {
          const k = ease(seg(sp, 0.47 + i * 0.02, 0.54 + i * 0.02)) * (1 - lOut);
          c.style.opacity = String(k);
          c.style.transform = `translate3d(${-sx * 22}px,${(1 - k) * 36 - sy * 14}px,0) scale(${0.9 + k * 0.1})`;
        });
        const tit = lug.querySelector<HTMLElement>('[data-tit]');
        if (tit) {
          tit.style.opacity = String(lIn * (1 - lOut));
          tit.style.filter = `blur(${(1 - lIn) * 8 + lOut * 10}px)`;
          tit.style.transform = `translateY(${(1 - lIn) * 20 - lOut * 40}px)`;
        }
        capas(lug, lIn > 0 && lOut < 1);
      }

      // 4) Cierre: cifras que cuentan + lista + botón
      const fIn = ease(seg(sp, 0.75, 0.86));
      if (refFinal.current) {
        refFinal.current.style.opacity = String(fIn);
        refFinal.current.style.transform = `translate3d(${-sx * 10}px,${(1 - fIn) * 50}px,0)`;
        capas(refFinal.current, fIn > 0);
      }
      const cuenta = seg(sp, 0.77, 0.92);
      refCifras.current.forEach((el, i) => {
        if (el) el.textContent = String(Math.round(cifras[i].n * cuenta));
      });
      if (refProg.current) refProg.current.style.transform = `scaleX(${sp})`;

      if (activo) raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !activo) {
          activo = true;
          ultimo = 0;
          raf = requestAnimationFrame(tick);
        } else if (!e.isIntersecting) {
          activo = false;
          cancelAnimationFrame(raf);
        }
      },
      { rootMargin: '120px' }
    );
    io.observe(story);

    const mover = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
    };
    window.addEventListener('pointermove', mover, { passive: true });
    return () => {
      activo = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('pointermove', mover);
    };
  }, [cifras]);

  const sombra = { textShadow: '0 2px 30px rgba(2,30,15,0.55), 0 1px 3px rgba(2,30,15,0.35)' };

  return (
    <section ref={refStory} className="relative h-[420vh] sm:h-[460vh]" aria-label={t('Tu guía de Los Tuxtlas')}>
      <div className="sticky top-16 h-[calc(100svh-4rem)] overflow-hidden bg-jungle-950 isolate">
        {/* Escenas */}
        <div ref={refCam} className="absolute -inset-[4%] will-change-transform">
          {ESCENAS.map((src, i) => (
            <img
              key={src}
              ref={(el) => {
                refEscenas.current[i] = el;
              }}
              src={src}
              alt=""
              loading={i === 0 ? 'eager' : 'lazy'}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ opacity: i === 0 ? 1 : 0 }}
            />
          ))}
        </div>
        {/* Velo para que el texto blanco siempre se lea */}
        <div className="absolute inset-0 bg-gradient-to-b from-jungle-950/55 via-jungle-950/15 to-jungle-950/60" />

        {/* 1) Portada */}
        <div ref={refHero} className="absolute inset-x-0 top-[13vh] z-10 px-5 text-center">
          <span className="inline-flex h-6 items-center rounded bg-jungle-300 px-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-jungle-950">
            {t('Guía turística offline')}
          </span>
          <h1
            className="mx-auto mt-5 max-w-4xl font-display text-[2.6rem] font-extrabold leading-[0.98] tracking-tight text-white sm:text-6xl lg:text-7xl"
            style={sombra}
          >
            {t('Tu guía de')} {t('Los Tuxtlas,')}
            <br />
            <span className="text-jungle-300">{t('sin límites.')}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/90 sm:text-lg" style={sombra}>
            {t('Rutas personalizadas con IA, mapa offline y prestadores locales verificados. Sin cuenta, sin anuncios, sin depender de señal.')}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/app"
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-jungle-300 px-6 py-3.5 font-semibold text-jungle-950 shadow-lg transition-colors hover:bg-jungle-200"
            >
              {t('Empezar a explorar')}
              <ChevronRight size={18} />
            </Link>
            <button
              onClick={() =>
                alert(t('Para instalar en tu celular: ábrela en Chrome o Safari y elige "Agregar a pantalla de inicio".'))
              }
              className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/50 bg-white/15 px-6 py-3.5 font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/25"
            >
              <Download size={18} />
              {t('Instalar en mi celular')}
            </button>
          </div>
        </div>

        {/* Coordenadas reales de Catemaco */}
        <div
          ref={refHud}
          className="absolute bottom-6 left-5 z-10 hidden border-l-2 border-jungle-300 pl-3 font-mono text-[11px] uppercase leading-relaxed tracking-[0.13em] text-white/90 sm:left-8 sm:block"
          style={sombra}
        >
          Catemaco · Veracruz
          <br />
          LAT 18.4217° N · LON 95.1131° O
        </div>
        <div
          ref={refHint}
          className="absolute bottom-6 right-5 z-10 flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-white/90 sm:right-8"
          style={sombra}
        >
          {t('Desliza para explorar')}
          <span className="grid h-5 w-5 place-items-center rounded-full border border-white/80">
            <ChevronDown size={13} className="animate-pulse-slow" />
          </span>
        </div>

        {/* 2) Visión */}
        <div
          ref={refVision}
          className="invisible absolute left-1/2 top-1/2 z-10 w-[min(860px,90vw)] -translate-x-1/2 -translate-y-1/2 text-center text-white"
        >
          <span className="inline-flex h-6 items-center rounded bg-jungle-300 px-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-jungle-950">
            {t('Nuestra idea')}
          </span>
          <h2
            className="mt-5 font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl"
            style={sombra}
          >
            {palabrasVision.map((w, i) => (
              <span key={i} data-w className="inline-block">
                {w}
                {' '}
              </span>
            ))}
          </h2>
          <p data-sub className="mx-auto mt-5 max-w-lg text-base sm:text-lg" style={sombra}>
            {t('Un solo lugar con todo lo que ofrecen los prestadores de la región.')}
          </p>
        </div>

        {/* 3) Lugares reales del catálogo */}
        <div ref={refLugares} className="invisible absolute inset-0 z-10">
          <div data-tit className="absolute left-5 top-[11vh] max-w-xl text-white sm:left-8" style={sombra}>
            <span className="inline-flex h-6 items-center rounded bg-jungle-300 px-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-jungle-950">
              {t('Lugares reales')}
            </span>
            <p className="mt-4 font-display text-2xl font-bold leading-tight sm:text-4xl">
              {t('Cada lugar con horario, costo y cómo llegar, validado con visitas de campo.')}
            </p>
          </div>
          <div className="absolute inset-x-4 bottom-[9vh] mx-auto grid max-w-5xl grid-cols-2 gap-3 lg:grid-cols-4">
            {destacados.map((l) => (
              <Link
                key={l.id}
                data-card
                to="/app"
                className="pointer-events-auto rounded-2xl border border-white/30 bg-white/20 p-3 text-white backdrop-blur-xl transition-colors hover:bg-white/30 sm:p-4"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-jungle-200">
                  <Star size={13} className="fill-jungle-300 text-jungle-300" />
                  {l.rating}
                </div>
                <div className="mt-1.5 font-display text-sm font-bold leading-tight sm:text-base">{l.nombre}</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-white/80">
                  <MapPin size={12} />
                  {l.municipio}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* 4) Cierre */}
        <div
          ref={refFinal}
          className="invisible absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 px-4 text-center text-white"
        >
          <h2 className="max-w-3xl font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl" style={sombra}>
            {t('Pensada para Los Tuxtlas')}
          </h2>
          <div className="grid w-full max-w-2xl grid-cols-3 gap-2 rounded-2xl border border-white/30 bg-jungle-950/35 p-4 backdrop-blur-xl sm:gap-4 sm:p-6">
            {cifras.map((c, i) => (
              <div key={c.etiqueta}>
                <span
                  ref={(el) => {
                    refCifras.current[i] = el;
                  }}
                  className="block font-display text-4xl font-extrabold tabular-nums sm:text-6xl"
                >
                  0
                </span>
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-white/80 sm:text-xs">
                  {t(c.etiqueta)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex max-w-2xl flex-wrap justify-center gap-2 text-xs font-semibold sm:text-sm">
            {['Funciona sin internet', 'Asistente con IA', 'Mapa interactivo', 'Prestadores locales', 'Datos validados'].map((f) => (
              <span key={f} className="rounded-full border border-white/35 bg-white/15 px-3.5 py-1.5 backdrop-blur-md">
                {t(f)}
              </span>
            ))}
          </div>
          <Link
            to="/app"
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-jungle-300 px-7 py-4 text-lg font-semibold text-jungle-950 shadow-xl transition-colors hover:bg-jungle-200"
          >
            {t('Empezar ahora')}
            <ChevronRight size={20} />
          </Link>
        </div>

        {/* Progreso */}
        <div className="absolute bottom-2 left-1/2 z-20 h-0.5 w-28 -translate-x-1/2 rounded bg-white/25">
          <div ref={refProg} className="h-full origin-left scale-x-0 rounded bg-jungle-300" />
        </div>
      </div>
    </section>
  );
}
