import { useEffect, useState } from 'react';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import { Overlay, Modal } from './FiltrosViaje';
import { listarChats, eliminarChat, type ChatGuardado } from '../lib/db';

// ============================================================
// HISTORIAL DE CHATS
// ============================================================
// Reusa el mismo modal (Overlay + Modal) que ya se estableció en
// FiltrosViaje.tsx como el estándar — mismo look en toda la app, no
// una ventana nueva reinventada para esto.

function tiempoRelativo(ms: number): string {
  const seg = Math.floor((Date.now() - ms) / 1000);
  if (seg < 60) return 'Justo ahora';
  const min = Math.floor(seg / 60);
  if (min < 60) return `Hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  return new Date(ms).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

interface Props {
  onCerrar: () => void;
  onAbrirChat: (chat: ChatGuardado) => void;
  onNuevoChat: () => void;
  chatActivoId: string;
}

export default function HistorialChats({ onCerrar, onAbrirChat, onNuevoChat, chatActivoId }: Props) {
  const [chats, setChats] = useState<ChatGuardado[] | null>(null);

  useEffect(() => {
    listarChats().then(setChats);
  }, []);

  const eliminar = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await eliminarChat(id);
    setChats((prev) => prev?.filter((c) => c.id !== id) ?? null);
  };

  return (
    <Overlay onCerrar={onCerrar}>
      <Modal titulo="Historial de chats" onCerrar={onCerrar}>
        <button
          onClick={() => { onNuevoChat(); onCerrar(); }}
          className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-xl bg-jungle-50 text-jungle-800 font-semibold text-sm hover:bg-jungle-100 transition-colors mb-3"
        >
          <Plus size={16} />
          Nuevo chat
        </button>

        <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1 space-y-1">
          {chats === null && (
            <p className="text-sm text-obsidiana-800/40 text-center py-6">Cargando…</p>
          )}

          {chats !== null && chats.length === 0 && (
            <p className="text-sm text-obsidiana-800/40 text-center py-6">
              Todavía no tienes conversaciones guardadas.
            </p>
          )}

          {chats?.map((c) => (
            <button
              key={c.id}
              onClick={() => { onAbrirChat(c); onCerrar(); }}
              className={`w-full flex items-center gap-2.5 py-2.5 px-3 rounded-xl text-left transition-colors ${c.id === chatActivoId ? 'bg-jungle-50' : 'hover:bg-obsidiana-900/5'
                }`}
            >
              <MessageSquare size={16} className="text-jungle-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-obsidiana-900 truncate">{c.titulo}</div>
                <div className="text-xs text-obsidiana-800/40">{tiempoRelativo(c.actualizadoEn)}</div>
              </div>
              <span
                role="button"
                onClick={(e) => eliminar(c.id, e)}
                className="text-obsidiana-800/30 hover:text-red-500 transition-colors p-1 flex-shrink-0"
                aria-label="Eliminar conversación"
              >
                <Trash2 size={14} />
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </Overlay>
  );
}
