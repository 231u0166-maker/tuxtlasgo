import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Menu, X, MessageCircle, Compass, TreePine } from 'lucide-react';
import { type UsuarioSesion } from '../lib/auth';

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
  usuario?: UsuarioSesion | null;
  onCerrarSesion: () => void;
}

export default function NavbarLanding({
  modo,
  onCambiarModo,
  onIniciarSesion,
  usuario,
  onCerrarSesion,
}: Props) {
  const esTurista = modo === 'turista';
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
          {usuario ? (
            <button
              onClick={onCerrarSesion}
              className="hidden sm:block text-sm text-obsidiana-800/70 hover:text-obsidiana-900 font-medium px-4 py-2 rounded-full hover:bg-obsidiana-900/5 transition-colors"
            >
              Cerrar sesión
            </button>
          ) : (
            <button
              onClick={onIniciarSesion}
              className="hidden sm:block text-sm text-obsidiana-800/70 hover:text-obsidiana-900 font-medium px-4 py-2 rounded-full hover:bg-obsidiana-900/5 transition-colors"
            >
              Inicio sesión
            </button>
          )}
          <Link
            to={esTurista ? '/app' : '/prestador'}
            className="bg-jungle-700 hover:bg-jungle-800 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-colors flex items-center gap-1"
          >
            Reservar
            <ChevronRight size={16} />
          </Link>

          {/* Hamburguesa — solo móvil */}
          <button
            onClick={() => setMenuMovil(true)}
            className="md:hidden w-9 h-9 flex items-center justify-center text-obsidiana-800 rounded-full hover:bg-obsidiana-900/5 transition-colors flex-shrink-0"
            aria-label="Menú"
            aria-expanded={menuMovil}
          >
            <Menu size={20} />
          </button>
        </div>
      </div>

      {/* Panel completo — mismo patrón que la referencia (mindtrip):
          tapa toda la pantalla, no un dropdown chico. El fondo se
          desvanece; el panel blanco entra deslizándose y SIEMPRE
          sólido — antes los dos usaban el mismo fade de opacidad, así
          que el panel también se volvía transparente durante esos
          0.3s de entrada y se veía el contenido de atrás mezclado con
          los links (justo lo que se ve en la captura). */}
      {menuMovil && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-obsidiana-950/40 animate-fade-in"
            onClick={() => setMenuMovil(false)}
            aria-hidden="true"
          />
          <div
            className="absolute inset-y-0 left-0 w-[85vw] max-w-sm shadow-2xl flex flex-col animate-slide-in-left"
            style={{ backgroundColor: '#ffffff' }}
          >
            <div className="flex items-center justify-between px-5 py-5 border-b border-obsidiana-900/5 flex-shrink-0">
              <span className="flex items-center gap-2 font-display font-extrabold text-lg text-obsidiana-900">
                <TreePine size={20} className="text-jungle-700" />
                TuxtlasGO
              </span>
              <button
                onClick={() => setMenuMovil(false)}
                className="w-9 h-9 flex items-center justify-center text-obsidiana-800 rounded-full hover:bg-obsidiana-900/5"
                aria-label="Cerrar menú"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              <ItemMenu
                icon={MessageCircle}
                label="Empezar a chatear"
                to="/app?tab=chat"
                onClick={() => setMenuMovil(false)}
              />
              <ItemMenu
                icon={Compass}
                label="Explorar"
                to="/app?tab=explorar"
                onClick={() => setMenuMovil(false)}
              />

              <div className="h-px bg-obsidiana-900/5 my-2" />

              <ItemMenu
                label="Para turistas"
                activo={esTurista}
                onClick={() => { onCambiarModo('turista'); setMenuMovil(false); }}
              />
              <ItemMenu
                label="Para prestadores"
                activo={!esTurista}
                onClick={() => { onCambiarModo('prestador'); setMenuMovil(false); }}
              />
              <ItemMenu label="Galería" inerte />
              <ItemMenu label="Comunidad" inerte />

              <div className="h-px bg-obsidiana-900/5 my-2" />

              {/* Sin páginas propias de políticas todavía — se dejan
                  inertes, mismo trato que Galería/Comunidad, en vez de
                  apuntar a un link que no existe. */}
              <ItemMenu label="Política de privacidad" inerte compacto />
              <ItemMenu label="Condiciones de uso" inerte compacto />
            </div>

            <div className="p-4 border-t border-obsidiana-900/5 flex-shrink-0">
              {usuario ? (
                <button
                  onClick={() => { onCerrarSesion(); setMenuMovil(false); }}
                  className="w-full text-center py-3 rounded-full border border-obsidiana-900/10 text-sm font-semibold text-obsidiana-800 hover:bg-obsidiana-900/5 transition-colors"
                >
                  Cerrar sesión
                </button>
              ) : (
                <button
                  onClick={() => { onIniciarSesion(); setMenuMovil(false); }}
                  className="w-full text-center py-3 rounded-full border border-obsidiana-900/10 text-sm font-semibold text-obsidiana-800 hover:bg-obsidiana-900/5 transition-colors"
                >
                  Inicio sesión
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function ItemMenu({
  icon: Icon,
  label,
  to,
  onClick,
  activo,
  inerte,
  compacto,
}: {
  icon?: typeof MessageCircle;
  label: string;
  to?: string;
  onClick?: () => void;
  activo?: boolean;
  inerte?: boolean;
  compacto?: boolean;
}) {
  const clases = `w-full flex items-center gap-3 text-left px-3 rounded-xl text-sm transition-colors ${compacto ? 'py-2 text-[13px]' : 'py-3'
    } ${inerte
      ? 'text-obsidiana-800/30 cursor-default select-none'
      : activo
        ? 'bg-jungle-50 text-jungle-800 font-semibold'
        : 'text-obsidiana-800/80 font-medium hover:bg-obsidiana-900/5'
    }`;

  const contenido = (
    <>
      {Icon && <Icon size={18} className="flex-shrink-0" />}
      {label}
    </>
  );

  if (inerte) {
    return <div className={clases}>{contenido}</div>;
  }

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={clases}>
        {contenido}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={clases}>
      {contenido}
    </button>
  );
}
