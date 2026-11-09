import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, WifiOff, Sparkles, Compass, Users, MapPin, Download } from 'lucide-react';
import { useT } from '../lib/i18n';

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

const FOTOS = [
  '/img/slide_01.jpg',
  '/lugares/eyipantla_1.jpg',
  '/img/slide_09.jpg',
  '/lugares/nanciyaga_1.jpg',
  '/img/slide_05.jpg',
  '/lugares/hechizo-amor_1.jpg',
  '/img/slide_13.jpg',
  '/lugares/jungla-balneario_1.jpg',
  '/lugares/cerro-venado_1.jpg',
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

const N = FOTOS.length;
const COLA = 2 + 3.5; // pasos extra para que las fotos salgan
const TOTAL = N + COLA;

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));

// Cada foto tiene su propia curva y giro, alternando de lado.
const RUTAS = FOTOS.map((_, i) => ({
  lado: i % 2 === 0 ? 1 : -1,
  curva: 45 + (i % 3) * 15,
  giro: (i % 2 === 0 ? 1 : -1) * (8 + (i % 4) * 3),
}));

function movimiento(p0: number, ruta: (typeof RUTAS)[number]) {
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

export default function RecorridoCartas() {
  const t = useT();
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
      const pos = Math.min(FEATURES.length - 1, Math.max(0, (paso / N) * FEATURES.length - 0.5));
      let activa = 0;
      FEATURES.forEach((_, i) => {
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
      if (refNum.current) refNum.current.textContent = `0${activa + 1} / 0${FEATURES.length}`;

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
  }, []);

  return (
    <section
      id="features"
      ref={refSec}
      className="relative h-[1100vh]"
      aria-label={t('Por qué TuxtlasGO')}
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
          {FOTOS.map((src, i) => (
            <div
              key={src}
              ref={(el) => {
                refCartas.current[i] = el;
              }}
              className="absolute aspect-[13/18] w-[min(40vw,15rem)] rounded-2xl border border-white/80 bg-white p-2 shadow-[0_16px_40px_rgba(0,0,0,0.35)] will-change-transform sm:p-2.5 lg:w-[min(22vw,19rem)]"
              style={{ zIndex: i + 1, opacity: 0 }}
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                draggable={false}
                className="h-full w-full select-none rounded-xl object-cover"
              />
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
            {t('Por qué TuxtlasGO')}
          </span>
          <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            {t('Pensada para Los Tuxtlas')}
          </h2>
          <div className="relative mt-4 h-48 lg:mt-6 lg:h-52">
            {FEATURES.map((f, i) => (
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
            {FEATURES.map((_, i) => (
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
              {t('Listo para descubrir Los Tuxtlas')}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-white/80">
              {t('La aplicación es gratuita. Tus datos no salen de tu dispositivo.')}
            </p>
            <Link
              to="/app"
              className="pointer-events-auto mt-7 inline-flex items-center gap-2 rounded-full bg-jungle-300 px-8 py-4 text-lg font-semibold text-jungle-950 shadow-xl transition-colors hover:bg-jungle-200"
            >
              {t('Empezar ahora')}
              <ChevronRight size={20} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
