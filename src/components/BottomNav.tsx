import { Compass, Map, MessageCircle, Heart, User } from 'lucide-react';

export type Tab = 'explorar' | 'mapa' | 'chat' | 'favoritos' | 'perfil';

interface Props {
  activa: Tab;
  onChange: (t: Tab) => void;
}

// "mapa" ya no aparece aquí a propósito — dejó de ser una pestaña.
// Sigue siendo un valor válido de Tab (se usa para el peek de mapa a
// pantalla completa en móvil, ver AppShell.tsx), pero se llega a él
// desde el botón flotante "Ver mapa", no desde esta barra.
const tabs: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: 'explorar', label: 'Explorar', icon: Compass },
  { id: 'chat', label: 'Asistente', icon: MessageCircle },
  { id: 'favoritos', label: 'Mis lugares', icon: Heart },
  { id: 'perfil', label: "Mi Perfil", icon: User } // nuevo para el perfil
];

export default function BottomNav({ activa, onChange }: Props) {
  return (
    <nav
      className="flex-shrink-0 bg-white border-t border-jungle-100 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
    >
      <div className="flex max-w-2xl mx-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const activo = t.id === activa;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${activo ? 'text-jungle-700' : 'text-jungle-500 hover:text-jungle-700'
                }`}
            >
              <Icon
                size={22}
                strokeWidth={activo ? 2.5 : 2}
                className={activo ? 'scale-110 transition-transform' : ''}
              />
              <span className={`text-[10px] ${activo ? 'font-bold' : 'font-medium'}`}>
                {t.label}
              </span>
              {activo && (
                <span className="absolute top-0 w-8 h-0.5 bg-jungle-700 rounded-b" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
