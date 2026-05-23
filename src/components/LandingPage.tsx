import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { type UsuarioSesion } from '../lib/auth';
import {
  MapPin,
  WifiOff,
  Sparkles,
  Compass,
  Users,
  ChevronRight,
  Download,
} from 'lucide-react';
import OfflineIndicator from './OfflineIndicator';

interface LandingProps {
  usuario?: UsuarioSesion | null;
  onUsuario?: (u: UsuarioSesion) => void;
}

export default function LandingPage({ usuario = null }: LandingProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-jungle-50 via-white to-jungle-50">
      <OfflineIndicator />

      {/* NAV */}
      <header className="bg-white/80 backdrop-blur-md border-b border-jungle-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <img
            src="/logo-tuxtlasgo.png"
            alt="TuxtlasGO"
            className="h-10 w-auto object-contain"
          />
          <div className="flex items-center gap-3">
            <Link
              to="/prestador"
              className="text-xs sm:text-sm text-jungle-700 hover:text-jungle-900 font-medium border border-jungle-300 sm:border-0 px-3 py-1.5 rounded-full sm:px-0 sm:py-0 sm:rounded-none"
            >
              Soy prestador
            </Link>
            <Link
              to="/app"
              className="bg-jungle-700 hover:bg-jungle-800 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1"
            >
              Abrir App
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 sm:pt-20 sm:pb-24">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="space-y-6 animate-slide-up">
            <div className="inline-flex items-center gap-2 bg-jungle-100 text-jungle-800 px-3 py-1.5 rounded-full text-xs font-semibold">
              <Sparkles size={14} />
              Plataforma turística inteligente
            </div>
            <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl text-jungle-950 leading-tight">
              Tu guÍA 
              <br />
              Los Tuxtlas,
              <br />
              <span className="text-jungle-700">incluso sin internet.</span>
            </h1>
            <p className="text-lg text-jungle-800/80 max-w-md">
              Rutas personalizadas con IA, mapa offline y prestadores locales
              verificados.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/app"
                className="bg-jungle-700 hover:bg-jungle-800 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-jungle-700/20"
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
                className="bg-white border-2 border-jungle-200 text-jungle-800 px-6 py-3 rounded-xl font-semibold flex items-center gap-2 hover:border-jungle-400"
              >
                <Download size={18} />
                Instalar en mi celular
              </button>
            </div>
          </div>

          <CarruselHero />
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="bg-white py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-jungle-950 mb-3">
              Pensada para Los Tuxtlas
            </h2>
            <p className="text-jungle-800/70">
              Resolvemos los tres problemas que enfrenta el turismo en la región:
              conectividad, información dispersa y baja visibilidad de los prestadores
              locales.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: WifiOff,
                title: 'Funciona sin internet',
                desc: 'Service Worker + IndexedDB cachea el mapa, los lugares y el asistente. Una vez cargada, sigue funcionando aunque pierdas señal.',
              },
              {
                icon: Sparkles,
                title: 'Asistente con IA',
                desc: 'Te pregunta tus gustos, días disponibles y presupuesto. Te arma una ruta personalizada en segundos, sin enviar datos a la nube.',
              },
              {
                icon: Compass,
                title: 'Mapa interactivo',
                desc: 'Visualiza los 18+ lugares principales de Catemaco, San Andrés y Santiago Tuxtla. Coordenadas reales, sin depender de Google.',
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
                className="bg-jungle-50 hover:bg-white rounded-2xl p-6 border-2 border-transparent hover:border-jungle-200 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-jungle-700 flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-display font-bold text-lg text-jungle-950 mb-2">
                  {f.title}
                </h3>
                <p className="text-sm text-jungle-800/80 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-jungle-950 mb-4">
            Listo para descubrir Los Tuxtlas
          </h2>
          <p className="text-jungle-800/80 mb-8">
            La aplicación es gratuita. Tus datos no salen de tu dispositivo.
          </p>
          <Link
            to="/app"
            className="inline-flex items-center gap-2 bg-jungle-700 hover:bg-jungle-800 text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-xl shadow-jungle-700/30 transition-colors"
          >
            Empezar ahora
            <ChevronRight size={20} />
          </Link>
        </div>
      </section>

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
    </div>
  );
}

// ─── Carrusel ────────────────────────────────────────────────
function CarruselHero() {
  const [actual, setActual] = useState(0);
  const total = 18;
  const slides = Array.from({ length: total }, (_, i) =>
    `/img/slide_${String(i + 1).padStart(2, '0')}.jpg`
  );

  useEffect(() => {
    const t = setInterval(() => setActual(p => (p + 1) % total), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative">
      <div className="aspect-[4/5] rounded-3xl shadow-2xl shadow-jungle-700/20 overflow-hidden relative bg-jungle-200">
        {slides.map((src, i) => (
          <img key={i} src={src} alt={`Los Tuxtlas ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
            style={{ opacity: i === actual ? 1 : 0 }} />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-jungle-950/50 via-transparent to-transparent" />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {slides.map((_, i) => (
            <button key={i} onClick={() => setActual(i)}
              className={`rounded-full transition-all duration-300 ${i === actual ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50'}`} />
          ))}
        </div>
      </div>

    </div>
  );
}