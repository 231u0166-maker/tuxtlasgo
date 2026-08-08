import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import PlaceCard from './PlaceCard';
import type { Lugar } from '../data/lugares';
import { getCatalogoActivo } from '../lib/chatbot';

// ============================================================
// INICIO — pantalla nueva (no existía)
// ============================================================
// Instrucciones: "mostrará todo los servicios y de extra: para ti en
// la ubicación seleccionada, imágenes de los sitios registrados, el
// chat, consulta rápida". El chat de aquí NO es una segunda
// implementación — al enviar, se le pasa el mensaje al chat real de
// SIEMPRE (ChatAssistant, vía AppShell) y se cambia a esa pestaña,
// para no mantener dos motores de conversación distintos.

const SUGERENCIAS_RAPIDAS = [
  '¿Qué hacer en Catemaco?',
  'Arma una ruta de 2 días',
  'Comida típica de la región',
  'Lugares para ir con niños',
];

interface Props {
  onVerLugar: (lugar: Lugar) => void;
  onPreguntar: (texto: string) => void;
  ubicacion?: string;
}

export default function InicioScreen({ onVerLugar, onPreguntar, ubicacion }: Props) {
  const [texto, setTexto] = useState('');
  const destacados = getCatalogoActivo().filter((l) => l.destacado).slice(0, 6);

  // Mismo comportamiento que el textarea de la pestaña Asistente —
  // crece con el texto hasta un tope, y no pierde de vista el cursor
  // al pasar ese tope. Ver la nota completa en ChatAssistant.tsx.
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    el.scrollTop = el.scrollHeight;
  }, [texto]);

  const enviar = () => {
    const limpio = texto.trim();
    if (!limpio) return;
    onPreguntar(limpio);
    setTexto('');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 lg:px-8 pt-6 pb-2">
          <h1 className="font-display font-extrabold text-2xl text-obsidiana-900">
            ¿A dónde vamos hoy?
          </h1>
          <p className="text-sm text-obsidiana-800/60 mt-1">
            Pregúntame lo que quieras, o mira lo que tenemos para ti.
          </p>
        </div>

        {/* Para ti en [ubicación] — refleja lo que haya puesto la
            persona en "Dónde" (barra de filtros); si no ha puesto
            nada, cae a "Los Tuxtlas" en general. */}
        <section className="px-4 lg:px-8 mt-5">
          <h2 className="font-display font-bold text-lg text-obsidiana-900 mb-3">
            Para ti en {ubicacion?.trim() || 'Los Tuxtlas'}
          </h2>
          {destacados.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {destacados.map((l) => (
                <PlaceCard key={l.id} lugar={l} onClick={() => onVerLugar(l)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-obsidiana-800/40">
              Todavía no hay lugares destacados en el catálogo.
            </p>
          )}
        </section>

        {/* Consulta rápida */}
        <section className="px-4 lg:px-8 mt-6 mb-6">
          <h2 className="font-display font-bold text-lg text-obsidiana-900 mb-3">
            Consulta rápida
          </h2>
          <div className="flex flex-wrap gap-2">
            {SUGERENCIAS_RAPIDAS.map((s) => (
              <button
                key={s}
                onClick={() => onPreguntar(s)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-jungle-50 text-jungle-800 text-sm font-medium hover:bg-jungle-100 transition-colors"
              >
                <Sparkles size={13} className="text-sun-600 flex-shrink-0" />
                {s}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* El chat, directo aquí — mismo estilo de entrada que el de la
          pestaña Asistente, pero enviar te lleva allá con la
          pregunta ya en camino. */}
      <div
        className="flex-shrink-0 border-t border-jungle-100 px-3 pt-3 bg-white"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            placeholder="Escribir un mensaje..."
            rows={1}
            className="flex-1 min-w-0 bg-white border border-jungle-200 rounded-2xl px-4 py-3 text-base text-jungle-950 leading-snug resize-none overflow-y-auto max-h-[160px] focus:outline-none focus:ring-2 focus:ring-jungle-300 focus:border-jungle-400 placeholder:text-jungle-400 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          />
          <button
            onClick={enviar}
            disabled={!texto.trim()}
            className="w-11 h-11 rounded-full bg-jungle-700 disabled:bg-jungle-200 text-white flex items-center justify-center flex-shrink-0 transition-colors"
            aria-label="Enviar"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
