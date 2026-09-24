import { Crown } from 'lucide-react';
import type { Lugar } from '../data/lugares';
import { getCatalogoActivo } from '../lib/chatbot';
import PlaceCard from './PlaceCard';

// ============================================================
// PATROCINADOS — pestaña propia, separada de "Destacados"
// ============================================================
// "Destacados" es curaduría nuestra (rating/calidad, sin dinero de
// por medio). Esto es pauta pagada (Plan Premium, $89 MXN/mes) — a
// propósito vive en su propio módulo del menú, nunca mezclado con
// "Destacados" ni con el mismo badge (ver PlaceCard: "Patrocinado"
// es morado, distinto del "Destacado" ámbar) — así el turista
// siempre sabe qué es curaduría y qué es pauta, y "Destacados" no
// pierde credibilidad por ser pay-to-play.
// ============================================================

interface Props {
  onVerLugar: (lugar: Lugar) => void;
}

export default function PatrocinadosScreen({ onVerLugar }: Props) {
  const patrocinados = getCatalogoActivo().filter((l) => l.premium);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 lg:px-8 pt-6 pb-2">
        <div className="flex items-center gap-2">
          <Crown size={22} className="text-violet-600" />
          <h1 className="font-display font-extrabold text-2xl text-obsidiana-900">
            Patrocinados
          </h1>
        </div>
        <p className="text-sm text-obsidiana-800/60 mt-1">
          Prestadores con Plan Premium activo ($89 MXN/mes) — pauta pagada, separada de nuestra curaduría en Destacados.
        </p>
      </div>

      <div className="px-4 lg:px-8 mt-5 pb-8">
        {patrocinados.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {patrocinados.map((l) => (
              <PlaceCard key={l.id} lugar={l} onClick={() => onVerLugar(l)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-16 px-4">
            <Crown size={40} className="text-jungle-200 mb-3" />
            <p className="font-semibold text-obsidiana-900">Todavía no hay prestadores Premium</p>
            <p className="text-sm text-obsidiana-800/50 mt-1 max-w-xs">
              Cuando un prestador active su Plan Premium, aparecerá aquí.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
