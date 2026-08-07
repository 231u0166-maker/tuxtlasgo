import { Sparkles } from 'lucide-react';
import PlaceCard from './PlaceCard';
import type { Lugar } from '../data/lugares';
import { getCatalogoActivo } from '../lib/chatbot';

// ============================================================
// SUGERENCIAS DEL CHAT — estado "nada preguntado todavía"
// ============================================================
// Corrige un error real de la pasada anterior: puse el mapa al lado
// del chat SIEMPRE, incluso antes de escribir algo (imagen 2 de la
// referencia = mal). Lo real (imagen 1) es: sin preguntar nada, el
// panel derecho muestra lugares sugeridos — el mapa solo aparece
// cuando ya hay una ruta o resultado que mostrar (ver AppShell.tsx,
// se decide con `rutaVisible`).
//
// Con datos reales del catálogo (`destacado: true`), no contenido de
// relleno — no existen los conceptos de mindtrip "Continuar donde lo
// dejaste" (historial de chats) ni "Inspírate" (contenido editorial
// externo), así que no se simulan.

interface Props {
  onVerLugar: (lugar: Lugar) => void;
}

export default function SugerenciasChat({ onVerLugar }: Props) {
  const destacados = getCatalogoActivo().filter((l) => l.destacado).slice(0, 6);

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={16} className="text-sun-600" />
        <h2 className="font-display font-bold text-[15px] text-obsidiana-900">
          Para ti en Los Tuxtlas
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {destacados.map((l) => (
          <PlaceCard key={l.id} lugar={l} onClick={() => onVerLugar(l)} />
        ))}
      </div>
      {destacados.length === 0 && (
        <p className="text-sm text-obsidiana-800/50">
          Todavía no hay lugares destacados en el catálogo.
        </p>
      )}
    </div>
  );
}
