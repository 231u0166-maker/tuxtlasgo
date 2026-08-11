// ============================================================
// MODAL DE RESERVACIÓN — turista solicita, sin pago todavía
// ============================================================
// Dónde/Cuándo/Viajero/Presupuesto, como se describió en el plan de
// reservaciones. A propósito no cobra nada aquí — solo crea la
// solicitud; el prestador la confirma o rechaza desde su panel. El
// pago se conecta en la siguiente pieza, reusando lo que ya
// construimos en Mercado Pago (pieza 1).
// ============================================================

import { useEffect, useState } from 'react';
import { X, Calendar, Users, DollarSign, MapPin, Loader2, CheckCircle2 } from 'lucide-react';
import { getToken, getUsuarioLocal } from '../lib/auth';
import type { Lugar } from '../data/lugares';

export default function ModalReservacion({ lugar, onCerrar }: { lugar: Lugar; onCerrar: () => void }) {
  const usuario = getUsuarioLocal();
  const [fecha, setFecha] = useState('');
  const [nombreViajero, setNombreViajero] = useState(usuario?.nombre ?? '');
  const [numeroPersonas, setNumeroPersonas] = useState(2);
  const [presupuesto, setPresupuesto] = useState('');
  const [notas, setNotas] = useState('');
  const [disponibilidad, setDisponibilidad] = useState<'sin_checar' | 'checando' | 'disponible' | 'no_disponible'>('sin_checar');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  useEffect(() => {
    if (!fecha || !lugar.servicioId) { setDisponibilidad('sin_checar'); return; }
    setDisponibilidad('checando');
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/reservaciones?disponibilidad=1&servicio_id=${lugar.servicioId}&fecha=${fecha}`);
        const data = await res.json();
        setDisponibilidad(data.ok && data.disponible ? 'disponible' : 'no_disponible');
      } catch {
        setDisponibilidad('sin_checar');
      }
    }, 300);
    return () => clearTimeout(t);
  }, [fecha, lugar.servicioId]);

  async function enviar() {
    if (!usuario) {
      setError('Inicia sesión para reservar.');
      return;
    }
    if (!fecha || !nombreViajero.trim()) {
      setError('Falta la fecha o el nombre del viajero.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const res = await fetch('/api/reservaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          servicio_id: lugar.servicioId,
          fecha,
          nombre_viajero: nombreViajero.trim(),
          numero_personas: numeroPersonas,
          presupuesto: presupuesto || undefined,
          notas: notas || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setEnviado(true);
      } else {
        setError(data.error ?? 'No se pudo enviar la solicitud');
      }
    } catch {
      setError('Sin conexión. Verifica tu internet.');
    }
    setEnviando(false);
  }

  return (
    <div className="fixed inset-0 z-[90] bg-obsidiana-950/50 flex items-end sm:items-center justify-center" onClick={onCerrar}>
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white/95 backdrop-blur px-5 pt-5 pb-1 flex items-center justify-between">
          <h2 className="font-display font-bold text-jungle-950">Reservar</h2>
          <button onClick={onCerrar} className="text-jungle-400 hover:text-jungle-700 p-1"><X size={20} /></button>
        </div>

        {enviado ? (
          <div className="px-5 pb-8 pt-6 text-center">
            <CheckCircle2 size={48} className="mx-auto text-green-500 mb-3" />
            <p className="font-display font-bold text-lg text-jungle-950 mb-1.5">Solicitud enviada</p>
            <p className="text-sm text-jungle-500 mb-6">
              {lugar.nombre} va a revisar tu solicitud y te avisamos cuando la confirme. Puedes ver el estado en Mis lugares → Reservas.
            </p>
            <button onClick={onCerrar} className="w-full bg-jungle-700 hover:bg-jungle-800 text-white py-3 rounded-xl text-sm font-semibold">
              Entendido
            </button>
          </div>
        ) : (
          <div className="px-5 pb-6 pt-3 space-y-4">
            {/* Dónde — fijo, es este lugar */}
            <div>
              <p className="text-xs font-semibold text-jungle-500 mb-1.5 flex items-center gap-1"><MapPin size={12} /> Dónde</p>
              <div className="bg-jungle-50 rounded-xl px-3.5 py-3 text-sm font-semibold text-jungle-900">{lugar.nombre}</div>
            </div>

            {/* Cuándo */}
            <div>
              <p className="text-xs font-semibold text-jungle-500 mb-1.5 flex items-center gap-1"><Calendar size={12} /> Cuándo</p>
              <input
                type="date"
                min={manana}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full bg-jungle-50 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
              />
              {disponibilidad === 'checando' && (
                <p className="text-xs text-jungle-400 mt-1.5 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Revisando disponibilidad…</p>
              )}
              {disponibilidad === 'disponible' && (
                <p className="text-xs text-green-600 font-semibold mt-1.5">✓ Disponible</p>
              )}
              {disponibilidad === 'no_disponible' && (
                <p className="text-xs text-red-600 font-semibold mt-1.5">No disponible esa fecha — elige otra</p>
              )}
            </div>

            {/* Viajero */}
            <div>
              <p className="text-xs font-semibold text-jungle-500 mb-1.5 flex items-center gap-1"><Users size={12} /> Viajero</p>
              <input
                value={nombreViajero}
                onChange={(e) => setNombreViajero(e.target.value)}
                placeholder="Tu nombre"
                className="w-full bg-jungle-50 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 mb-2"
              />
              <div className="flex items-center gap-3">
                <span className="text-xs text-jungle-500">Personas</span>
                <button onClick={() => setNumeroPersonas((n) => Math.max(1, n - 1))} className="w-8 h-8 rounded-full bg-jungle-100 text-jungle-700 font-bold">−</button>
                <span className="text-sm font-semibold w-6 text-center">{numeroPersonas}</span>
                <button onClick={() => setNumeroPersonas((n) => n + 1)} className="w-8 h-8 rounded-full bg-jungle-100 text-jungle-700 font-bold">+</button>
              </div>
            </div>

            {/* Presupuesto */}
            <div>
              <p className="text-xs font-semibold text-jungle-500 mb-1.5 flex items-center gap-1"><DollarSign size={12} /> Presupuesto (opcional)</p>
              <input
                value={presupuesto}
                onChange={(e) => setPresupuesto(e.target.value)}
                placeholder="ej: $500 - $800 MXN por persona"
                className="w-full bg-jungle-50 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
              />
            </div>

            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas para el prestador (opcional)"
              rows={2}
              className="w-full bg-jungle-50 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 resize-none"
            />

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={enviar}
              disabled={enviando || !fecha || disponibilidad === 'no_disponible'}
              className="w-full flex items-center justify-center gap-2 bg-jungle-700 hover:bg-jungle-800 disabled:opacity-40 text-white py-3.5 rounded-xl text-sm font-semibold"
            >
              {enviando ? <Loader2 size={16} className="animate-spin" /> : null}
              Enviar solicitud de reservación
            </button>
            <p className="text-[11px] text-jungle-400 text-center">
              Sin cargo por ahora — solo se envía tu solicitud, el prestador la confirma.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
