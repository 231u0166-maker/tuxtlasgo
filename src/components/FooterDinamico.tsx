import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Facebook, Instagram } from 'lucide-react';
import { useT } from '../lib/i18n';

// ============================================================
// PIE DE PÁGINA DINÁMICO — cierra la historia de la landing
// ============================================================
// Mismo lenguaje que el resto: verde profundo, cristal, movimiento
// ligado al scroll. Tres cosas se mueven:
//  1. Una cinta de texto grande que corre sola (CSS puro, dos filas en
//     sentidos contrarios).
//  2. Las columnas entran escalonadas cuando el pie aparece en pantalla.
//  3. La palabra gigante "TuxtlasGO" sube y se aclara con el scroll.
// El único JS es un IntersectionObserver + un rAF que solo corre con el
// pie a la vista. Respeta prefers-reduced-motion.

const CINTA = [
  'Catemaco',
  'San Andrés Tuxtla',
  'Cascadas',
  'Selva',
  'Lago',
  'Gastronomía',
  'Aventura',
  'Hospedaje',
  'Artesanías',
  'Cooperativas',
];

export default function FooterDinamico({ modo = 'turista' }: { modo?: 'turista' | 'prestador' }) {
  const t = useT();
  const prestador = modo === 'prestador';
  const refPie = useRef<HTMLElement>(null);
  const refCols = useRef<HTMLDivElement>(null);
  const refMarca = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pie = refPie.current;
    if (!pie) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let activo = false;
    let prog = 0;

    // Entrada escalonada de las columnas (una sola vez).
    const cols = Array.from(refCols.current?.children ?? []) as HTMLElement[];
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          cols.forEach((c, i) => {
            c.style.transitionDelay = reduce ? '0ms' : `${i * 110}ms`;
            c.style.opacity = '1';
            c.style.transform = 'translateY(0)';
          });
        }
        if (e.isIntersecting && !activo) {
          activo = true;
          raf = requestAnimationFrame(tick);
        } else if (!e.isIntersecting) {
          activo = false;
          cancelAnimationFrame(raf);
        }
      },
      { threshold: 0.05 }
    );
    io.observe(pie);

    // La palabra gigante sube y se aclara según cuánto del pie se ve.
    function tick() {
      const r = pie!.getBoundingClientRect();
      const visto = Math.max(0, Math.min(1, (window.innerHeight - r.top) / Math.max(1, r.height)));
      prog = reduce ? visto : prog + (visto - prog) * 0.08;
      if (refMarca.current) {
        refMarca.current.style.transform = `translate3d(0,${(1 - prog) * 40}%,0)`;
        refMarca.current.style.opacity = String(0.15 + prog * 0.85);
      }
      if (activo) raf = requestAnimationFrame(tick);
    }

    return () => {
      activo = false;
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  const fila = (clase: string) => (
    <div className="overflow-hidden">
      <div className={`flex w-max ${clase} motion-reduce:animate-none`}>
        {[...CINTA, ...CINTA].map((p, i) => (
          <span
            key={i}
            className="flex items-center whitespace-nowrap font-display text-5xl font-extrabold uppercase tracking-tight text-transparent [-webkit-text-stroke:1px_rgba(134,239,172,0.45)] sm:text-7xl"
          >
            {p}
            <span className="mx-6 text-jungle-300/60 [-webkit-text-stroke:0]">✦</span>
          </span>
        ))}
      </div>
    </div>
  );

  const entra = { opacity: 0, transform: 'translateY(28px)', transition: 'opacity 0.8s ease, transform 0.8s ease' };

  return (
    <footer ref={refPie} className="relative overflow-hidden bg-jungle-950 text-jungle-100">
      {/* Luces de fondo */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 15% 10%, rgba(74,222,128,0.16) 0%, transparent 70%),' +
            'radial-gradient(ellipse 60% 50% at 90% 60%, rgba(103,232,249,0.10) 0%, transparent 70%)',
        }}
      />

      {/* Cinta que corre sola */}
      <div className="relative space-y-2 border-b border-white/10 py-8" aria-hidden>
        {fila('animate-marquee-izq')}
        {fila('animate-marquee-der')}
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div ref={refCols} className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4 lg:col-span-2" style={entra}>
            <img src="/logo-tuxtlasgo.png" alt="TuxtlasGO" className="h-9 w-auto object-contain brightness-0 invert" />
            <p className="max-w-xs text-sm leading-relaxed text-jungle-100/70">
              {t('Plataforma turística inteligente de Los Tuxtlas, Veracruz. Rutas con IA, mapa offline y prestadores locales verificados.')}
            </p>
            <div className="flex items-center gap-3 pt-1">
              <a
                href="https://www.facebook.com/share/1RRL1HJ5jS/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('Facebook de TuxtlasGO')}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1877F2] text-white transition-transform duration-300 hover:-translate-y-1 hover:scale-110"
              >
                <Facebook size={18} />
              </a>
              <a
                href="https://www.instagram.com/tuxtlasgo?stkn=NnN6cTNicDI4bHFv"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('Instagram de TuxtlasGO')}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white transition-transform duration-300 hover:-translate-y-1 hover:scale-110"
              >
                <Instagram size={18} />
              </a>
            </div>
            <Link
              to={prestador ? '/prestador' : '/app'}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-jungle-300 px-6 py-3 text-sm font-semibold text-jungle-950 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-jungle-200"
            >
              {t(prestador ? 'Únete ahora' : 'Empezar a explorar')}
              <ChevronRight size={16} />
            </Link>
          </div>

          <div style={entra}>
            <h3 className="mb-4 font-display text-xs font-semibold uppercase tracking-wider text-white">{t('Explora')}</h3>
            <ul className="space-y-2.5 text-sm text-jungle-100/70">
              {[
                ['/app', 'Empezar a explorar'],
                ['/prestador', 'Para prestadores'],
                ['/comunidad', 'Comunidad'],
                ['/galeria', 'Galería'],
              ].map(([to, texto]) => (
                <li key={to}>
                  <Link to={to} className="inline-block transition-all duration-300 hover:translate-x-1 hover:text-jungle-300">
                    {t(texto)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div style={entra}>
            <h3 className="mb-4 font-display text-xs font-semibold uppercase tracking-wider text-white">{t('Legal')}</h3>
            <ul className="space-y-2.5 text-sm text-jungle-100/70">
              {[
                ['/terminos', 'Términos y condiciones'],
                ['/privacidad', 'Aviso de privacidad'],
                ['/copyright', '© Copyright'],
              ].map(([to, texto]) => (
                <li key={to}>
                  <Link to={to} className="inline-block transition-all duration-300 hover:translate-x-1 hover:text-jungle-300">
                    {texto.startsWith('©') ? texto : t(texto)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Palabra gigante que sube con el scroll */}
      <div className="relative -mb-[0.18em] select-none overflow-hidden text-center" aria-hidden>
        <div
          ref={refMarca}
          className="bg-gradient-to-b from-jungle-300 via-jungle-500/60 to-transparent bg-clip-text font-display font-extrabold leading-none tracking-tighter text-transparent will-change-transform"
          style={{ fontSize: 'clamp(4rem, 19vw, 17rem)', opacity: 0.15 }}
        >
          TuxtlasGO
        </div>
      </div>

      <div className="relative border-t border-white/10 px-4 py-5 text-center text-xs text-jungle-100/50 sm:px-6">
        © {new Date().getFullYear()} TuxtlasGO ·{' '}
        {t('Los Tuxtlas, Veracruz. Todos los derechos reservados. Prohibida su reproducción total o parcial sin autorización.')}
      </div>
    </footer>
  );
}
