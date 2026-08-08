import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Menu, X } from 'lucide-react';

// ============================================================
// NAVBAR DE LANDING — modo turista / modo prestador
// ============================================================
// Base-visual SECTION-01. Un solo componente para los dos públicos
// (no dos navbars separados) para que un link que cambie no se
// desincronice entre versiones. El cambio de modo es local a la
// landing (no navega de ruta) — ver nota de ruteo en el spec.
export type ModoLanding = 'turista' | 'prestador';

interface Props {
  modo: ModoLanding;
  onCambiarModo: (modo: ModoLanding) => void;
  onIniciarSesion: () => void;
}

export default function NavbarLanding({ modo, onCambiarModo, onIniciarSesion }: Props) {
  const esTurista = modo === 'turista';
  // Hallazgo real: los links de arriba (incluido "Para prestadores")
  // y "Inicio sesión" estaban con `hidden md:flex` / `hidden sm:block`
  // — en móvil solo quedaban el logo y "Reservar". Eso dejaba sin
  // camino, desde el teléfono, a quien quiere registrarse como
  // prestador — justo el caso que más importa cubrir en un país
  // donde mucha gente entra a internet solo desde el celular.
  const [menuMovil, setMenuMovil] = useState(false);

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-obsidiana-900/5 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <button
          onClick={() => onCambiarModo('turista')}
          className="flex-shrink-0"
          aria-label="Ir al inicio"
        >
          <img
            src="/logo-tuxtlasgo.png"
            alt="TuxtlasGO"
            className="h-9 w-auto object-contain"
          />
        </button>

        {/* Links centrales — el set cambia según modo (PDF págs. 1-2 turista, 22-26 prestador) */}
        <nav className="hidden md:flex items-center gap-6 text-sm">
          {esTurista && (
            <span className="font-semibold text-obsidiana-900">Para turistas</span>
          )}
          <button
            onClick={() => onCambiarModo(esTurista ? 'prestador' : 'turista')}
            className={
              esTurista
                ? 'font-medium text-obsidiana-800/60 hover:text-obsidiana-900 transition-colors'
                : 'font-semibold text-obsidiana-900'
            }
          >
            Para prestadores
          </button>
          {/* Galería y Comunidad: sin sección propia todavía (no son
              parte de este módulo) — se dejan visibles por paridad con
              la referencia, pero inertes en vez de simular un link roto. */}
          <span className="font-medium text-obsidiana-800/30 cursor-default select-none">
            Galería
          </span>
          <span className="font-medium text-obsidiana-800/30 cursor-default select-none">
            Comunidad
          </span>
        </nav>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onIniciarSesion}
            className="hidden sm:block text-sm text-obsidiana-800/70 hover:text-obsidiana-900 font-medium px-4 py-2 rounded-full hover:bg-obsidiana-900/5 transition-colors"
          >
            Inicio sesión
          </button>
          <Link
            to={esTurista ? '/app' : '/prestador'}
            className="bg-jungle-700 hover:bg-jungle-800 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-colors flex items-center gap-1"
          >
            Reservar
            <ChevronRight size={16} />
          </Link>

          {/* Hamburguesa — solo móvil, es lo que faltaba */}
          <button
            onClick={() => setMenuMovil((v) => !v)}
            className="md:hidden w-9 h-9 flex items-center justify-center text-obsidiana-800 rounded-full hover:bg-obsidiana-900/5 transition-colors flex-shrink-0"
            aria-label="Menú"
            aria-expanded={menuMovil}
          >
            {menuMovil ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Panel móvil — mismos links que la barra de escritorio, nada
          nuevo inventado, solo el camino para llegar a ellos. */}
      {menuMovil && (
        <div className="md:hidden border-t border-obsidiana-900/5 bg-white px-4 py-3 space-y-1 animate-fade-in">
          <button
            onClick={() => { onCambiarModo('turista'); setMenuMovil(false); }}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${esTurista ? 'bg-jungle-50 text-jungle-800' : 'text-obsidiana-800/70 hover:bg-obsidiana-900/5'
              }`}
          >
            Para turistas
          </button>
          <button
            onClick={() => { onCambiarModo('prestador'); setMenuMovil(false); }}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${!esTurista ? 'bg-jungle-50 text-jungle-800' : 'text-obsidiana-800/70 hover:bg-obsidiana-900/5'
              }`}
          >
            Para prestadores
          </button>
          <span className="block px-3 py-2.5 text-sm font-medium text-obsidiana-800/30 select-none">
            Galería
          </span>
          <span className="block px-3 py-2.5 text-sm font-medium text-obsidiana-800/30 select-none">
            Comunidad
          </span>
          <div className="h-px bg-obsidiana-900/5 my-1" />
          <button
            onClick={() => { onIniciarSesion(); setMenuMovil(false); }}
            className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold text-obsidiana-800/70 hover:bg-obsidiana-900/5 transition-colors"
          >
            Inicio sesión
          </button>
        </div>
      )}
    </header>
  );
}
