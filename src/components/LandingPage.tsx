import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiLogout, type UsuarioSesion } from '../lib/auth';
import {
  MapPin,
  WifiOff,
  Sparkles,
  Compass,
  Users,
  ChevronRight,
  Download,
  ShieldCheck,
  Percent,
  TrendingUp,
  Camera,
  Facebook,
  Instagram,
} from 'lucide-react';
import OfflineIndicator from './OfflineIndicator';
import NavbarLanding, { type ModoLanding } from './NavbarLanding';
import HeroScroll from './HeroScroll';
import RecorridoCartas from './RecorridoCartas';
import FooterDinamico from './FooterDinamico';
import { useT } from '../lib/i18n';
import { useDespuesDeCarga } from '../lib/useDespuesDeCarga';

interface LandingProps {
  usuario?: UsuarioSesion | null;
  onUsuario?: (u: UsuarioSesion | null) => void;
}

// ============================================================
// LANDING PAGE — dirección visual tipo Mindtrip
// ============================================================
// Nada de librerías nuevas (GSAP/Lenis/Motion) — todo CSS +
// Tailwind, para no agregarle peso a una PWA que debe seguir siendo
// rápida en celular con señal débil. El collage de fotos reemplaza
// el carrusel con setInterval (menos JS corriendo todo el tiempo,
// no solo se ve mejor).
// Se descarga solo cuando alguien abre "Iniciar sesión / Registrarme".
const AuthModal = lazy(() => import('./AuthModal'));

export default function LandingPage({ usuario = null, onUsuario }: LandingProps) {
  const t = useT();
  // Base-visual SECTION-01: la landing tiene dos "modos" de contenido
  // (turista / prestador) que viven en el mismo componente y la misma
  // ruta "/" — no se navega a otra URL al cambiar, así el toggle del
  // navbar es instantáneo. "/prestador" sigue intacta, ver spec.
  const [modo, setModo] = useState<ModoLanding>('turista');
  const [mostrarAuth, setMostrarAuth] = useState(false);
  const esTurista = modo === 'turista';

  return (
    <div className="min-h-screen bg-amate-50">
      <OfflineIndicator />

      <NavbarLanding
        modo={modo}
        onCambiarModo={setModo}
        onIniciarSesion={() => setMostrarAuth(true)}
        usuario={usuario}
        onCerrarSesion={async () => { await apiLogout(); onUsuario?.(null); }}
      />

      {esTurista ? (
        <SeccionesTurista />
      ) : (
        <SeccionesPrestador />
      )}

      <FooterDinamico modo={modo} />

      {mostrarAuth && (
        <Suspense fallback={null}>
        <AuthModal
          onClose={() => setMostrarAuth(false)}
          onSuccess={(u) => {
            onUsuario?.(u);
            setMostrarAuth(false);
          }}
        />
        </Suspense>
      )}
    </div>
  );
}

// ─── Modo turista — contenido existente, sin cambios de copy ───
function SeccionesTurista() {
  const t = useT();
  return (
    <>
      {/* INICIO — historia que avanza con el scroll (HeroScroll.tsx) */}
      <HeroScroll />

      {/* RECORRIDO — fotos que vuelan + por qué TuxtlasGO + cierre (RecorridoCartas.tsx) */}
      <RecorridoCartas />
    </>
  );
}

// ─── Modo prestador — nuevo (PDF págs. 1-5, 21) ───
// Mismo esqueleto de secciones que el modo turista (hero + features +
// CTA) para no introducir un segundo layout, solo cambia el contenido:
// aquí se habla de alcance/comisiones/verificación, no de rutas.
function SeccionesPrestador() {
  return (
    <>
      {/* Misma historia que el modo turista, enfocada en el prestador */}
      <HeroScroll modo="prestador" />
      <RecorridoCartas modo="prestador" />
    </>
  );
}

// ─── Collage de fotos — animado, pero 100% CSS ──────────────
// Cada tarjeta flota suavemente (translateY) y alterna entre DOS
// fotos reales con un crossfade — se ve vivo como el carrusel
// anterior, pero sin ningún setInterval de JS corriendo en segundo
// plano (mejor para batería en celular, y el navegador puede pausarlo
// solo si la pestaña no está visible).
function TarjetaCollage({
  fotoA,
  fotoB,
  className,
  animacion,
}: {
  fotoA: string;
  fotoB: string;
  className: string;
  animacion: 'animate-float' | 'animate-float-delayed' | 'animate-float-slow';
}) {
  const listas = useDespuesDeCarga();
  return (
    <div className={`absolute rounded-3xl shadow-xl shadow-obsidiana-900/15 ${className}`}>
      <div className={`relative w-full h-full rounded-3xl overflow-hidden ${animacion}`}>
        <img
          src={listas ? fotoA : undefined}
          alt="Los Tuxtlas"
          className="absolute inset-0 w-full h-full object-cover animate-crossfade-a"
          loading="eager"
        />
        <img
          src={listas ? fotoB : undefined}
          alt="Los Tuxtlas"
          className="absolute inset-0 w-full h-full object-cover animate-crossfade-b"
          loading="lazy"
        />
      </div>
    </div>
  );
}

function PhotoCollage() {
  return (
    <div className="relative h-[420px] sm:h-[480px]">
      <TarjetaCollage
        fotoA="/img/slide_01.webp"
        fotoB="/img/slide_02.webp"
        className="top-0 left-4 w-[58%] h-[62%] -rotate-2"
        animacion="animate-float"
      />
      <TarjetaCollage
        fotoA="/img/slide_05.webp"
        fotoB="/img/slide_06.webp"
        className="top-6 right-0 w-[42%] h-[46%] rotate-3"
        animacion="animate-float-delayed"
      />
      <TarjetaCollage
        fotoA="/img/slide_09.webp"
        fotoB="/img/slide_10.webp"
        className="bottom-6 right-6 w-[46%] h-[42%] -rotate-3"
        animacion="animate-float-slow"
      />
      <TarjetaCollage
        fotoA="/img/slide_13.webp"
        fotoB="/img/slide_14.webp"
        className="bottom-0 left-0 w-[38%] h-[32%] rotate-2"
        animacion="animate-float"
      />
    </div>
  );
}