// ============================================================
// CHAT DE RESERVACIÓN — pieza 3
// ============================================================
// Una conversación por reservación, no un chat abierto. Todo dentro
// de la plataforma a propósito — como se pidió: "para no enredarnos
// con APIs de WhatsApp... si pagó o hizo todo dentro de la app
// cualquier cosa va por nuestra solución". Se usa tanto del lado del
// turista como del prestador — mismo componente, cambia solo quién
// ve sus mensajes a la derecha.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { X, Send, ImagePlus, Loader2 } from 'lucide-react';
import { getToken } from '../lib/auth';
import { subirFotoMensaje, type ProgresoSubida } from '../lib/cloudinary';

interface Mensaje {
  id: number;
  remitente_id: number;
  texto: string | null;
  imagen_url: string | null;
  creado_en: string;
  remitente_nombre: string;
}

export default function ChatReservacion({
  reservacionId, nombreOtro, onCerrar,
}: {
  reservacionId: number;
  nombreOtro: string;
  onCerrar: () => void;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null);
  const [propioId, setPropioId] = useState<number | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  async function cargar() {
    try {
      const res = await fetch(`/api/reservaciones?recurso=mensajes&reservacion_id=${reservacionId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.ok) {
        setMensajes(data.mensajes);
        setPropioId(data.propioId);
      }
    } catch { /* sin conexión — se reintenta en el próximo poll */ }
  }

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 4000); // poll — sin websockets, así de simple funciona bien para este volumen
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservacionId]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes?.length]);

  async function enviarMensaje(imagenUrl?: string) {
    if (!texto.trim() && !imagenUrl) return;
    setEnviando(true);
    try {
      const res = await fetch('/api/reservaciones?recurso=mensajes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ reservacion_id: reservacionId, texto: texto.trim() || undefined, imagen_url: imagenUrl }),
      });
      const data = await res.json();
      if (data.ok) {
        setMensajes((prev) => [...(prev ?? []), { ...data.mensaje, remitente_nombre: 'Tú' }]);
        setTexto('');
      }
    } catch { /* se reintenta al reabrir */ }
    setEnviando(false);
  }

  function subirFoto(file: File) {
    setSubiendoFoto(true);
    subirFotoMensaje(file, reservacionId, (p: ProgresoSubida) => {
      if (p.url) { enviarMensaje(p.url); setSubiendoFoto(false); }
      if (p.error) { alert(p.error); setSubiendoFoto(false); }
    });
  }

  return (
    <div className="fixed inset-0 z-[95] bg-obsidiana-950/50 flex items-end sm:items-center justify-center" onClick={onCerrar}>
      <div
        className="bg-amate-50 w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl h-[85vh] sm:h-[75vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-jungle-800 text-white px-4 py-3.5 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="font-display font-bold text-sm">{nombreOtro}</p>
            <p className="text-[11px] text-jungle-200">Sobre tu reservación</p>
          </div>
          <button onClick={onCerrar} className="text-jungle-200 hover:text-white p-1"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
          {mensajes === null && (
            <div className="text-center py-10 text-jungle-400">
              <Loader2 size={22} className="animate-spin mx-auto" />
            </div>
          )}
          {mensajes?.length === 0 && (
            <p className="text-center text-xs text-jungle-400 py-10">
              Aún no hay mensajes — pregunta lo que necesites sobre tu reservación.
            </p>
          )}
          {mensajes?.map((m) => {
            const esPropio = m.remitente_id === propioId;
            return (
              <div key={m.id} className={`flex ${esPropio ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl overflow-hidden ${esPropio ? 'bg-jungle-700 text-white' : 'bg-white text-jungle-900 border border-jungle-100'}`}>
                  {m.imagen_url && <img src={m.imagen_url} alt="" className="w-full max-h-56 object-cover" />}
                  {m.texto && <p className="text-sm px-3 py-2 whitespace-pre-wrap">{m.texto}</p>}
                </div>
              </div>
            );
          })}
          <div ref={finRef} />
        </div>

        <div className="border-t border-jungle-100 bg-white p-3 flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => inputFotoRef.current?.click()}
            disabled={subiendoFoto}
            className="text-jungle-500 hover:text-jungle-700 p-2 flex-shrink-0 disabled:opacity-40"
          >
            {subiendoFoto ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
          </button>
          <input ref={inputFotoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={(e) => e.target.files?.[0] && subirFoto(e.target.files[0])} />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && enviarMensaje()}
            placeholder="Escribe un mensaje…"
            className="flex-1 bg-jungle-50 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
          />
          <button
            onClick={() => enviarMensaje()}
            disabled={enviando || !texto.trim()}
            className="bg-jungle-700 hover:bg-jungle-800 disabled:opacity-40 text-white w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
