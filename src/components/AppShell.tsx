// ============================================================
// BURBUJA DE NOTIFICACIONES — flotante, arrastrable, en TODA la app
// ============================================================
// Vive en App.tsx (no dentro de AppShell) para que aparezca en
// cualquier pantalla — /app, /comunidad, /galeria, la landing, donde
// sea — mientras haya sesión iniciada. Se puede arrastrar a
// cualquier parte de la pantalla; la posición se recuerda entre
// visitas (localStorage). Un arrastre real no cuenta como clic —
// solo abre/cierra el panel si el dedo no se movió casi nada.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, X, Clock, ChevronRight, Users } from 'lucide-react';
import { getToken, getUsuarioLocal } from '../lib/auth';

const CLAVE_POSICION = 'tuxtlasgo-burbuja-pos';
const TAMANO_BOTON = 56;

interface ResumenReserva {
  id: number;
  fecha: string;
  estado: string;
  mensajes_no_leidos?: number;
  titulo: string;
}

export default function NotificacionesBurbuja() {
  const usuario = getUsuarioLocal();
  const navigate = useNavigate();
  const [abierta, setAbierta] = useState(false);
  const [resumen, setResumen] = useState<ResumenReserva[]>([]);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const movioRef = useRef(false);

  // Posición guardada — si nunca se arrastró, usa la esquina
  // inferior derecha por default (vía className, no vía pos).
  useEffect(() => {
    try {
      const guardada = localStorage.getItem(CLAVE_POSICION);
      if (guardada) setPos(JSON.parse(guardada));
    } catch { /* valor corrupto, se ignora */ }
  }, []);

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
    const intervalo = setInterval(cargar, 8000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function irAReservas() {
    if (!usuario) return;
    navigate(usuario.tipo === 'prestador' ? '/app?tab=perfil' : '/app?tab=favoritos');
  }

  function iniciarArrastre(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    const rectInicial = e.currentTarget.getBoundingClientRect();
    const posInicial = pos ?? { x: rectInicial.left, y: rectInicial.top };
    const puntoInicioX = e.clientX;
    const puntoInicioY = e.clientY;
    movioRef.current = false;
    setArrastrando(true);

    function mover(ev: PointerEvent) {
      const dx = ev.clientX - puntoInicioX;
      const dy = ev.clientY - puntoInicioY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) movioRef.current = true;
      const maxX = window.innerWidth - TAMANO_BOTON - 8;
      const maxY = window.innerHeight - TAMANO_BOTON - 8;
      setPos({
        x: Math.min(Math.max(posInicial.x + dx, 8), maxX),
        y: Math.min(Math.max(posInicial.y + dy, 8), maxY),
      });
    }
    function soltar() {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      setArrastrando(false);
      setPos((actual) => {
        if (actual) {
          try { localStorage.setItem(CLAVE_POSICION, JSON.stringify(actual)); } catch { /* sin espacio, no crítico */ }
        }
        return actual;
      });
    }
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar, { once: true });
  }

  function alSoltarBoton() {
    if (movioRef.current) return; // fue arrastre, no clic
    setAbierta((v) => !v);
  }

  if (!usuario) return null;

  const pendientes = usuario.tipo === 'prestador' ? resumen.filter((r) => r.estado === 'pendiente') : [];
  const conMensajes = resumen.filter((r) => (r.mensajes_no_leidos ?? 0) > 0);
  const total = pendientes.length + conMensajes.length;

  if (total === 0 && !abierta) return null;

  // El panel se abre hacia el lado con más espacio, para que no se
  // salga de la pantalla sin importar a dónde se arrastró la burbuja.
  const enMitadInferior = pos ? pos.y > window.innerHeight / 2 : true;
  const enMitadDerecha = pos ? pos.x > window.innerWidth / 2 : true;

  const estiloBoton = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : undefined;

  return (
    <div
      className={`fixed z-[70] ${pos ? '' : 'right-4 sm:right-6 bottom-20 lg:bottom-6'}`}
      style={estiloBoton}
    >
      {abierta && (
        <div
          className={`absolute w-80 max-w-[85vw] bg-white rounded-2xl shadow-2xl border border-jungle-100 overflow-hidden ${enMitadInferior ? 'bottom-full mb-3' : 'top-full mt-3'
            } ${enMitadDerecha ? 'right-0' : 'left-0'}`}
        >
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
                    onClick={() => { setAbierta(false); irAReservas(); }}
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
                    onClick={() => { setAbierta(false); irAReservas(); }}
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
              en lo que llega — así no se siente como estar esperando
              sin más. Funciona desde cualquier pantalla, no solo /app. */}
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
        onPointerDown={iniciarArrastre}
        onPointerUp={alSoltarBoton}
        className={`relative w-14 h-14 rounded-full bg-jungle-700 hover:bg-jungle-800 text-white shadow-xl flex items-center justify-center touch-none select-none ${arrastrando ? 'cursor-grabbing scale-105' : 'cursor-grab transition-colors'
          }`}
        aria-label="Notificaciones — mantén presionado para mover"
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