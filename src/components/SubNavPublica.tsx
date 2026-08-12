// ============================================================
// SUB-NAV PÚBLICA — header compartido de Galería y Comunidad
// ============================================================
// NavbarLanding vive atado al estado "modo" de la landing (turista/
// prestador se cambian SIN navegar de ruta). Galería y Comunidad sí
// son rutas propias, así que necesitan un header que navegue de
// verdad — mismo lenguaje visual, mecánica distinta. Un componente
// aparte evita forzar a NavbarLanding a servir dos mecánicas a la vez.
// ============================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Menu, X } from 'lucide-react';

export type SeccionPublica = 'galeria' | 'comunidad';

export default function SubNavPublica({ activa }: { activa: SeccionPublica }) {
  const [menuMovil, setMenuMovil] = useState(false);

  const enlaces: { id: SeccionPublica | 'turistas' | 'prestadores'; label: string; to: string }[] = [
    { id: 'turistas', label: 'Para turistas', to: '/' },
    { id: 'prestadores', label: 'Para prestadores', to: '/prestador' },
    { id: 'galeria', label: 'Galería', to: '/galeria' },
    { id: 'comunidad', label: 'Comunidad', to: '/comunidad' },
  ];

  return (
    <header className="bg-white border-b border-obsidiana-900/5 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex-shrink-0" aria-label="Ir al inicio">
          <img src="/logo-tuxtlasgo.png" alt="TuxtlasGO" className="h-9 w-auto object-contain" />
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          {enlaces.map((e) => (
            <Link
              key={e.id}
              to={e.to}
              className={
                e.id === activa
                  ? 'font-semibold text-obsidiana-900'
                  : 'font-medium text-obsidiana-800/60 hover:text-obsidiana-900 transition-colors'
              }
            >
              {e.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            to="/app"
            className="bg-jungle-700 hover:bg-jungle-800 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-colors flex items-center gap-1"
          >
            Go
            <ChevronRight size={16} />
          </Link>

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

      {menuMovil && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-obsidiana-950/40 animate-fade-in"
            onClick={() => setMenuMovil(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-[80vw] max-w-xs bg-white shadow-2xl flex flex-col animate-slide-in-left">
            <div className="flex items-center justify-between px-5 py-5 border-b border-obsidiana-900/5">
              <span className="font-display font-extrabold text-obsidiana-900">TuxtlasGO</span>
              <button
                onClick={() => setMenuMovil(false)}
                className="w-9 h-9 flex items-center justify-center text-obsidiana-800 rounded-full hover:bg-obsidiana-900/5"
                aria-label="Cerrar menú"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 py-3 px-3">
              {enlaces.map((e) => (
                <Link
                  key={e.id}
                  to={e.to}
                  onClick={() => setMenuMovil(false)}
                  className={`block px-3 py-3 rounded-xl text-sm ${
                    e.id === activa ? 'bg-jungle-50 text-jungle-800 font-semibold' : 'text-obsidiana-800/80 font-medium hover:bg-obsidiana-900/5'
                  }`}
                >
                  {e.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}