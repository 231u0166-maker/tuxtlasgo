import { Home, Compass, MessageCircle, Heart, User } from 'lucide-react';

export type Tab = 'inicio' | 'explorar' | 'mapa' | 'chat' | 'favoritos' | 'perfil';

interface Props {
  activa: Tab;
  onChange: (t: Tab) => void;
}

// "mapa" ya no aparece aquí a propósito — dejó de ser una pestaña.
// Sigue siendo un valor válido de Tab (se usa para el peek de mapa a
// pantalla completa en móvil, ver AppShell.tsx), pero se llega a él
// desde el botón flotante "Ver mapa", no desde esta barra.
const tabs: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: 'inicio', label: 'Inicio', icon: Home },
  { id: 'explorar', label: 'Explorar', icon: Compass },
  { id: 'chat', label: 'Asistente', icon: MessageCircle },
  { id: 'favoritos', label: 'Mis lugares', icon: Heart },
  { id: 'perfil', label: "Mi Perfil", icon: User } // nuevo para el perfil
];

// Barra con las esquinas superiores "talladas" (una recta, no las dos
// redondas) para que se sienta cortada de una sola pieza en vez del
// rectángulo blanco genérico de cualquier tab bar. El estado activo ya
// no es una rayita arriba del ícono — es una ficha tallada llena, el
// mismo lenguaje de forma que los botones y las tarjetas.
export default function BottomNav({ activa, onChange }: Props) {
  return (
    <nav
      className="flex-shrink-0 bg-amate-50 border-t border-jungle-100 z-30"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 8,
        boxShadow: '0 -10px 28px -12px rgba(28,25,23,0.28)',
      }}
    >
      <div className="flex max-w-2xl mx-auto px-1.5 pt-1.5">
        {tabs.map((t) => {
          const Icon = t.icon;
          const activo = t.id === activa;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className="relative flex-1 flex flex-col items-center justify-center gap-1 py-2 group"
            >
              <span
                className={`flex items-center justify-center w-10 h-8 carve-sm transition-all ${
                  activo
                    ? 'bg-jungle-700 shadow-carve'
                    : 'bg-transparent group-hover:bg-jungle-100'
                }`}
              >
                <Icon
                  size={19}
                  strokeWidth={activo ? 2.25 : 1.75}
                  className={activo ? 'text-white' : 'text-jungle-500 group-hover:text-jungle-700'}
                />
              </span>
              <span
                className={`text-[10px] leading-none ${
                  activo ? 'font-bold text-jungle-800' : 'font-medium text-jungle-500'
                }`}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
