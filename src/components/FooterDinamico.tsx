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

      <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-10 sm:px-6 sm:pt-20">
        <div ref={refCols} className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4 lg:col-span-2" style={entra}>
            <p className="max-w-xs text-sm leading-relaxed text-jungle-100/70">
              {t('Plataforma turística inteligente de Los Tuxtlas, Veracruz. Rutas con IA, mapa offline y prestadores locales verificados.')}
            </p>
            <div className="flex items-center gap-3 pt-1">
              <a
                href="https://www.facebook.com/share/1KnrBQAX1T/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('Facebook de TuxtlasGO')}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1877F2] text-white transition-transform duration-300 hover:-translate-y-1 hover:scale-110"
              >
                <Facebook size={18} />
              </a>
              <a
                href="https://www.instagram.com/tuxtlas_go"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('Instagram de TuxtlasGO')}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white transition-transform duration-300 hover:-translate-y-1 hover:scale-110"
              >
                <Instagram size={18} />
              </a>
              <a
                href="https://www.tiktok.com/@tuxtlasgo"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('TikTok de TuxtlasGO')}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white ring-1 ring-white/20 transition-transform duration-300 hover:-translate-y-1 hover:scale-110"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M19.6 6.7a4.8 4.8 0 0 1-3.8-4.2V2h-3.4v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.2a6.3 6.3 0 1 0 5.4 6.2V9a8.2 8.2 0 0 0 4.8 1.5V7.1a4.8 4.8 0 0 1-1-.4Z" />
                </svg>
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
