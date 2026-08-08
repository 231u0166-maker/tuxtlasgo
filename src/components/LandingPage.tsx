import { useState } from 'react';
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
} from 'lucide-react';
import OfflineIndicator from './OfflineIndicator';
import NavbarLanding, { type ModoLanding } from './NavbarLanding';
import AuthModal from './AuthModal';

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
export default function LandingPage({ usuario = null, onUsuario }: LandingProps) {
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

      <footer className="bg-jungle-950 text-jungle-100 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center text-sm space-y-2">
          <img src="/logo-tuxtlasgo.png" alt="TuxtlasGO" className="h-8 w-auto object-contain brightness-0 invert" />
          <div className="opacity-70">
            Proyecto InnovaTecNM 2026 · ITSSAT · Folio 68894-17
          </div>
          <div className="opacity-50 text-xs">
            Bienes de Consumo Final · Soluciones y Productos Digitales
          </div>
        </div>
      </footer>

      {mostrarAuth && (
        <AuthModal
          onClose={() => setMostrarAuth(false)}
          onSuccess={(u) => {
            onUsuario?.(u);
            setMostrarAuth(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Modo turista — contenido existente, sin cambios de copy ───
function SeccionesTurista() {
  return (
    <>
      {/* HERO — collage tipo mood-board, gradiente suave detrás */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-40 right-0 w-[36rem] h-[36rem] rounded-full opacity-70 blur-3xl"
          style={{ background: 'radial-gradient(circle, #fcd34d 0%, transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute top-40 -right-32 w-96 h-96 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, #67e8f9 0%, transparent 70%)' }}
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-20 sm:pt-20 sm:pb-28">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 bg-white text-obsidiana-800 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-sm border border-obsidiana-900/5">
                <Sparkles size={13} className="text-sun-600" />
                Guía turística con IA — 100% offline
              </div>
              <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-[3.5rem] text-obsidiana-900 leading-[1.05] tracking-tight">
                Tu guía de
                <br />
                Los Tuxtlas,
                <br />
                <span className="text-jungle-700">sin límites.</span>
              </h1>
              <p className="text-lg text-obsidiana-800/70 max-w-md leading-relaxed">
                Rutas personalizadas con IA, mapa offline y prestadores locales
                verificados. Sin cuenta, sin anuncios, sin depender de señal.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Link
                  to="/app"
                  className="bg-jungle-700 hover:bg-jungle-800 text-white px-6 py-3.5 rounded-full font-semibold flex items-center gap-2 shadow-lg shadow-jungle-700/25 transition-colors"
                >
                  Empezar a explorar
                  <ChevronRight size={18} />
                </Link>
                <button
                  onClick={() => {
                    alert(
                      'Para instalar en tu celular: ábrela en Chrome o Safari y elige "Agregar a pantalla de inicio".'
                    );
                  }}
                  className="bg-white border border-jungle-200 text-jungle-800 px-6 py-3.5 rounded-full font-semibold flex items-center gap-2 hover:border-jungle-400 transition-colors"
                >
                  <Download size={18} />
                  Instalar en mi celular
                </button>
              </div>
            </div>

            <PhotoCollage />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="bg-white py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl mb-12">
            <p className="text-sun-700 text-sm font-semibold uppercase tracking-wide mb-2">
              Por qué TuxtlasGO
            </p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-obsidiana-900 mb-3 tracking-tight">
              Pensada para Los Tuxtlas
            </h2>
            <p className="text-obsidiana-800/60 text-[15px] leading-relaxed">
              Resolvemos los tres problemas que enfrenta el turismo en la región:
              conectividad, información dispersa y baja visibilidad de los prestadores
              locales.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
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
            ].map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl p-6 border border-obsidiana-900/8 hover:border-jungle-300 hover:shadow-[0_12px_32px_-16px_rgba(20,25,20,0.15)] transition-all bg-white"
              >
                <div className="w-11 h-11 rounded-xl bg-jungle-50 group-hover:bg-jungle-700 flex items-center justify-center mb-4 transition-colors">
                  <f.icon className="w-5 h-5 text-jungle-700 group-hover:text-white transition-colors" />
                </div>
                <h3 className="font-display font-bold text-base text-obsidiana-900 mb-1.5">
                  {f.title}
                </h3>
                <p className="text-sm text-obsidiana-800/60 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-16 sm:py-24 bg-jungle-50">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <div className="w-12 h-12 mx-auto mb-5 rounded-2xl bg-jungle-700 flex items-center justify-center">
            <ShieldCheck className="text-white" size={22} />
          </div>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-obsidiana-900 mb-3 tracking-tight">
            Listo para descubrir Los Tuxtlas
          </h2>
          <p className="text-obsidiana-800/60 mb-8">
            La aplicación es gratuita. Tus datos no salen de tu dispositivo.
          </p>
          <Link
            to="/app"
            className="inline-flex items-center gap-2 bg-jungle-700 hover:bg-jungle-800 text-white px-8 py-4 rounded-full font-semibold text-lg shadow-xl shadow-jungle-700/25 transition-colors"
          >
            Empezar ahora
            <ChevronRight size={20} />
          </Link>
        </div>
      </section>
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
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-40 right-0 w-[36rem] h-[36rem] rounded-full opacity-70 blur-3xl"
          style={{ background: 'radial-gradient(circle, #67e8f9 0%, transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute top-40 -right-32 w-96 h-96 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, #fcd34d 0%, transparent 70%)' }}
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-20 sm:pt-20 sm:pb-28">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 bg-white text-obsidiana-800 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-sm border border-obsidiana-900/5">
                <Percent size={13} className="text-sun-600" />
                Sin comisiones abusivas
              </div>
              <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-[3.5rem] text-obsidiana-900 leading-[1.05] tracking-tight">
                Tu servicio,
                <br />
                frente a quien
                <br />
                <span className="text-jungle-700">ya viene para acá.</span>
              </h1>
              <p className="text-lg text-obsidiana-800/70 max-w-md leading-relaxed">
                Regístrate en minutos y aparece ante turistas que están
                planeando su viaje a Los Tuxtlas en este momento — con o sin
                contenido previo en redes sociales.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Link
                  to="/prestador"
                  className="bg-jungle-700 hover:bg-jungle-800 text-white px-6 py-3.5 rounded-full font-semibold flex items-center gap-2 shadow-lg shadow-jungle-700/25 transition-colors"
                >
                  Únete ahora
                  <ChevronRight size={18} />
                </Link>
              </div>
            </div>

            <PhotoCollage />
          </div>
        </div>
      </section>

      <section id="features" className="bg-white py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl mb-12">
            <p className="text-sun-700 text-sm font-semibold uppercase tracking-wide mb-2">
              Por qué registrarte en TuxtlasGO
            </p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-obsidiana-900 mb-3 tracking-tight">
              Hecho para prestadores locales
            </h2>
            <p className="text-obsidiana-800/60 text-[15px] leading-relaxed">
              Sin intermediarios, sin depender de tener ya una presencia
              armada en redes — empiezas con lo que tengas.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
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
            ].map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl p-6 border border-obsidiana-900/8 hover:border-jungle-300 hover:shadow-[0_12px_32px_-16px_rgba(20,25,20,0.15)] transition-all bg-white"
              >
                <div className="w-11 h-11 rounded-xl bg-jungle-50 group-hover:bg-jungle-700 flex items-center justify-center mb-4 transition-colors">
                  <f.icon className="w-5 h-5 text-jungle-700 group-hover:text-white transition-colors" />
                </div>
                <h3 className="font-display font-bold text-base text-obsidiana-900 mb-1.5">
                  {f.title}
                </h3>
                <p className="text-sm text-obsidiana-800/60 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 bg-jungle-50">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <div className="w-12 h-12 mx-auto mb-5 rounded-2xl bg-jungle-700 flex items-center justify-center">
            <Percent className="text-white" size={22} />
          </div>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-obsidiana-900 mb-3 tracking-tight">
            Súmate a los prestadores de Los Tuxtlas
          </h2>
          <p className="text-obsidiana-800/60 mb-8">
            Registrar tu servicio es gratis. Tú decides qué información compartes.
          </p>
          <Link
            to="/prestador"
            className="inline-flex items-center gap-2 bg-jungle-700 hover:bg-jungle-800 text-white px-8 py-4 rounded-full font-semibold text-lg shadow-xl shadow-jungle-700/25 transition-colors"
          >
            Únete ahora
            <ChevronRight size={20} />
          </Link>
        </div>
      </section>
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
  return (
    <div className={`absolute rounded-3xl shadow-xl shadow-obsidiana-900/15 ${className}`}>
      <div className={`relative w-full h-full rounded-3xl overflow-hidden ${animacion}`}>
        <img
          src={fotoA}
          alt="Los Tuxtlas"
          className="absolute inset-0 w-full h-full object-cover animate-crossfade-a"
          loading="eager"
        />
        <img
          src={fotoB}
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
        fotoA="/img/slide_01.jpg"
        fotoB="/img/slide_02.jpg"
        className="top-0 left-4 w-[58%] h-[62%] -rotate-2"
        animacion="animate-float"
      />
      <TarjetaCollage
        fotoA="/img/slide_05.jpg"
        fotoB="/img/slide_06.jpg"
        className="top-6 right-0 w-[42%] h-[46%] rotate-3"
        animacion="animate-float-delayed"
      />
      <TarjetaCollage
        fotoA="/img/slide_09.jpg"
        fotoB="/img/slide_10.jpg"
        className="bottom-6 right-6 w-[46%] h-[42%] -rotate-3"
        animacion="animate-float-slow"
      />
      <TarjetaCollage
        fotoA="/img/slide_13.jpg"
        fotoB="/img/slide_14.jpg"
        className="bottom-0 left-0 w-[38%] h-[32%] rotate-2"
        animacion="animate-float"
      />
    </div>
  );
}