// ============================================================
// BURBUJA DE NOTIFICACIONES — flotante, visible en toda la app
// ============================================================
// En vez de esconder los mensajes dentro de "Mis lugares → Reservas"
// o "Mi Servicio → Reservaciones" (donde no se descubren solos), una
// burbuja fija (como la de referencia) avisa: mensajes sin leer +
// solicitudes de reservación pendientes. Toca para ver el resumen y
// saltar directo a donde toca.
// ============================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, X, Clock, ChevronRight, Users } from 'lucide-react';
import { getToken, getUsuarioLocal } from '../lib/auth';

interface ResumenReserva {
  id: number;
  fecha: string;
  estado: string;
  mensajes_no_leidos?: number;
  titulo: string;
}

export default function NotificacionesBurbuja({ onIrAReservas, evitarChatInput }: { onIrAReservas: () => void; evitarChatInput?: boolean }) {
  const usuario = getUsuarioLocal();
  const [abierta, setAbierta] = useState(false);
  const [resumen, setResumen] = useState<ResumenReserva[]>([]);

  async function cargar() {
    if (!usuario) return;
    try {
      const res = await fetch('/api/reservaciones', { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (!data.ok) return;
      const filas = (data.reservaciones as any[]).map((r) => ({
        id: r.id,
        fecha: r.fecha,
        estado: r.estado,
        mensajes_no_leidos: r.mensajes_no_leidos,
        titulo: usuario.tipo === 'prestador' ? r.nombre_viajero : r.servicio_nombre,
      }));
      setResumen(filas);
    } catch { /* sin conexión — se reintenta en el próximo ciclo */ }
  }

  useEffect(() => {
    if (!usuario) return;
    cargar();
    const intervalo = setInterval(cargar, 8000); // antes 20s, se sentía lento — ahora 8s
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!usuario) return null;

  const pendientes = usuario.tipo === 'prestador' ? resumen.filter((r) => r.estado === 'pendiente') : [];
  const conMensajes = resumen.filter((r) => (r.mensajes_no_leidos ?? 0) > 0);
  const total = pendientes.length + conMensajes.length;

  if (total === 0 && !abierta) return null;

  return (
    <div className={`fixed right-4 sm:right-6 z-[70] ${evitarChatInput ? 'bottom-36 lg:bottom-24' : 'bottom-20 lg:bottom-6'}`}>
      {abierta && (
        <div className="mb-3 w-80 max-w-[85vw] bg-white rounded-2xl shadow-2xl border border-jungle-100 overflow-hidden">
          <div className="bg-jungle-800 text-white px-4 py-3 flex items-center justify-between">
            <p className="font-display font-bold text-sm">Notificaciones</p>
            <button onClick={() => setAbierta(false)} className="text-jungle-200 hover:text-white"><X size={16} /></button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {total === 0 ? (
              <p className="text-xs text-jungle-400 text-center py-8">Todo al día 🎉</p>
            ) : (
              <>
                {pendientes.map((r) => (
                  <button
                    key={`p-${r.id}`}
                    onClick={() => { setAbierta(false); onIrAReservas(); }}
                    className="w-full text-left px-4 py-3 border-b border-jungle-50 hover:bg-jungle-50 flex items-center gap-2.5"
                  >
                    <Clock size={15} className="text-amber-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-jungle-900 truncate">{r.titulo}</p>
                      <p className="text-[11px] text-jungle-400">Nueva solicitud de reservación</p>
                    </div>
                    <ChevronRight size={14} className="text-jungle-300 flex-shrink-0" />
                  </button>
                ))}
                {conMensajes.map((r) => (
                  <button
                    key={`m-${r.id}`}
                    onClick={() => { setAbierta(false); onIrAReservas(); }}
                    className="w-full text-left px-4 py-3 border-b border-jungle-50 hover:bg-jungle-50 flex items-center gap-2.5"
                  >
                    <MessageCircle size={15} className="text-jungle-600 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-jungle-900 truncate">{r.titulo}</p>
                      <p className="text-[11px] text-jungle-400">{r.mensajes_no_leidos} mensaje{(r.mensajes_no_leidos ?? 0) > 1 ? 's' : ''} nuevo{(r.mensajes_no_leidos ?? 0) > 1 ? 's' : ''}</p>
                    </div>
                    <ChevronRight size={14} className="text-jungle-300 flex-shrink-0" />
                  </button>
                ))}
              </>
            )}
          </div>
          {/* Mientras esperas confirmación/respuesta, algo que hacer
              en lo que llega — así no se siente como estar
              esperando sin más. */}
          <Link
            to="/comunidad"
            onClick={() => setAbierta(false)}
            className="flex items-center gap-2 px-4 py-3 bg-jungle-50 hover:bg-jungle-100 border-t border-jungle-100 text-xs font-semibold text-jungle-700 transition-colors"
          >
            <Users size={14} /> Mientras esperas, mira la Comunidad
            <ChevronRight size={13} className="ml-auto text-jungle-400" />
          </Link>
        </div>
      )}

      <button
        onClick={() => setAbierta((v) => !v)}
        className="relative w-14 h-14 rounded-full bg-jungle-700 hover:bg-jungle-800 text-white shadow-xl flex items-center justify-center transition-colors"
        aria-label="Notificaciones"
      >
        {abierta ? <X size={22} /> : <MessageCircle size={22} />}
        {!abierta && total > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
            {total}
          </span>
        )}
      </button>
    </div>
  );
}