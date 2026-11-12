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
import { MessageCircle, X, Clock, ChevronRight, Users, Bell, Check, Loader2 } from 'lucide-react';
import { getToken, getUsuarioLocal } from '../lib/auth';
import { useT } from '../lib/i18n';
import { recargarCatalogo } from '../arranque';

const CLAVE_POSICION = 'tuxtlasgo-burbuja-pos';
const TAMANO_BOTON = 56;

interface ResumenReserva {
  id: number;
  fecha: string;
  estado: string;
  mensajes_no_leidos?: number;
  titulo: string;
  personas?: number;
}

interface Notificacion {
  id: number;
  titulo: string;
  mensaje: string;
  leida: boolean;
  creado_en: string;
}

// Dónde vive el botón:
//  - 'flotante':    la burbuja arrastrable de siempre (páginas fuera del shell).
//  - 'barra':       un elemento más de la barra lateral de escritorio.
//  - 'barra-movil': ícono compacto de la barra superior en celular.
// El panel y los datos son los mismos en las tres.
interface Props {
  variante?: 'flotante' | 'barra' | 'barra-movil';
  colapsado?: boolean; // solo 'barra': sidebar en modo riel (solo íconos)
  onIrATab?: (tab: 'perfil' | 'favoritos' | 'comunidad') => void;
}

// "2026-11-14" → "14 nov" (sin desfase de zona horaria).
function fechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '');
}

export default function NotificacionesBurbuja({ variante = 'flotante', colapsado = false, onIrATab }: Props) {
  const t = useT();
  const botonRef = useRef<HTMLButtonElement>(null);
  const usuario = getUsuarioLocal();
  const navigate = useNavigate();
  const [abierta, setAbierta] = useState(false);
  const [resumen, setResumen] = useState<ResumenReserva[]>([]);
  const [avisos, setAvisos] = useState<Notificacion[]>([]);
  const [avisosSinLeerAlAbrir, setAvisosSinLeerAlAbrir] = useState(0);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const movioRef = useRef(false);
  // Responder una solicitud desde la campana (aceptar / rechazar).
  const [respondiendo, setRespondiendo] = useState<number | null>(null);
  const [resultado, setResultado] = useState<{ texto: string; error?: boolean } | null>(null);

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
        personas: r.numero_personas,
        titulo: usuario.tipo === 'prestador' ? r.nombre_viajero : r.servicio_nombre,
      }));
      setResumen(filas);
    } catch { /* sin conexión — se reintenta en el próximo ciclo */ }

    // ?marcar=0 — solo se asoma al contador, no apaga el punto rojo.
    // Se marcan como leídos de verdad solo cuando se abre el panel
    // (ver alSoltarBoton), así el usuario alcanza a verlos.
    try {
      const res = await fetch('/api/reservaciones?recurso=notificaciones&marcar=0', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.ok) {
        setAvisos(data.notificaciones);
        setAvisosSinLeerAlAbrir(data.notificaciones.filter((n: Notificacion) => !n.leida).length);
      }
    } catch { /* sin conexión */ }
  }

  useEffect(() => {
    if (!usuario) return;
    cargar();
    const intervalo = setInterval(cargar, 8000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al abrir el panel, ahora sí se marcan como leídos en el servidor
  // — el punto rojo se apaga porque el usuario realmente los vio.
  async function marcarAvisosLeidos() {
    if (avisosSinLeerAlAbrir === 0) return;
    setAvisosSinLeerAlAbrir(0);
    try {
      await fetch('/api/reservaciones?recurso=notificaciones', { headers: { Authorization: `Bearer ${getToken()}` } });
    } catch { /* se reintenta en el próximo ciclo */ }
  }

  // El prestador acepta o rechaza la solicitud ahí mismo, sin entrar a Mi Perfil.
  // Es la misma llamada que usa la tarjeta "Solicitudes" de Reservaciones.
  async function responder(id: number, accion: 'confirmar' | 'rechazar') {
    setRespondiendo(id);
    setResultado(null);
    try {
      const res = await fetch('/api/reservaciones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ id, accion }),
      });
      const data = await res.json();
      if (data.ok) {
        setResumen((prev) => prev.map((r) => (r.id === id ? { ...r, estado: data.estado } : r)));
        setResultado({ texto: accion === 'confirmar' ? 'Reservación aceptada' : 'Solicitud rechazada' });
        // Al confirmar se bloquea la fecha: el catálogo debe reflejarlo.
        if (accion === 'confirmar') recargarCatalogo().catch(() => {});
      } else {
        setResultado({ texto: data.error ?? 'No se pudo procesar. Intenta de nuevo.', error: true });
      }
    } catch {
      setResultado({ texto: 'Sin conexión. Verifica tu internet.', error: true });
    } finally {
      setRespondiendo(null);
      setTimeout(() => setResultado(null), 4000);
    }
  }

  function irAReservas() {
    if (!usuario) return;
    const tab = usuario.tipo === 'prestador' ? 'perfil' : 'favoritos';
    if (onIrATab) onIrATab(tab);
    else navigate(`/app?tab=${tab}`);
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
    setAbierta((v) => {
      const abriendo = !v;
      if (abriendo) marcarAvisosLeidos();
      return abriendo;
    });
  }

  if (!usuario) return null;

  const enBarra = variante !== 'flotante';

  function alAbrirCerrarBarra() {
    setAbierta((v) => {
      const abriendo = !v;
      if (abriendo) marcarAvisosLeidos();
      return abriendo;
    });
  }

  const pendientes = usuario.tipo === 'prestador' ? resumen.filter((r) => r.estado === 'pendiente') : [];
  const conMensajes = resumen.filter((r) => (r.mensajes_no_leidos ?? 0) > 0);
  const total = pendientes.length + conMensajes.length + avisosSinLeerAlAbrir;

  // Siempre visible mientras haya sesión — antes se escondía sin
  // notificaciones pendientes, pero así no se podía usar como acceso
  // rápido a Comunidad en cualquier momento.

  // El panel se abre hacia el lado con más espacio, para que no se
  // salga de la pantalla sin importar a dónde se arrastró la burbuja.
  const enMitadInferior = pos ? pos.y > window.innerHeight / 2 : true;
  const enMitadDerecha = pos ? pos.x > window.innerWidth / 2 : true;

  // Panel de notificaciones — el mismo contenido en las tres variantes;
  // solo cambia cómo se posiciona.
  const rectBoton = abierta && enBarra ? botonRef.current?.getBoundingClientRect() : undefined;
  const estiloPanelBarra: React.CSSProperties | undefined =
    variante === 'barra' && rectBoton
      ? { left: rectBoton.right + 8, top: Math.max(8, Math.min(rectBoton.top - 8, window.innerHeight - 440)) }
      : undefined;
  const clasePanel = !enBarra
    ? `absolute w-80 max-w-[85vw] bg-white rounded-2xl shadow-2xl border border-jungle-100 overflow-hidden ${
        enMitadInferior ? 'bottom-full mb-3' : 'top-full mt-3'
      } ${enMitadDerecha ? 'right-0' : 'left-0'}`
    : variante === 'barra'
      ? 'fixed z-[90] w-80 max-w-[85vw] bg-white rounded-2xl shadow-2xl border border-jungle-100 overflow-hidden'
      : 'fixed z-[90] right-3 top-14 w-80 max-w-[92vw] bg-white rounded-2xl shadow-2xl border border-jungle-100 overflow-hidden';

  const panel = abierta && (
    <>
      {enBarra && <div className="fixed inset-0 z-[85]" onClick={() => setAbierta(false)} aria-hidden="true" />}
      <div className={clasePanel} style={estiloPanelBarra}>
          <div className="bg-jungle-800 text-white px-4 py-3 flex items-center justify-between">
            <p className="font-display font-bold text-sm">{t('Notificaciones')}</p>
            <button onClick={() => setAbierta(false)} className="text-jungle-200 hover:text-white"><X size={16} /></button>
          </div>
          {resultado && (
            <p role="status" className={`px-4 py-2 text-xs font-semibold ${resultado.error ? 'bg-red-50 text-red-700' : 'bg-jungle-50 text-jungle-800'}`}>
              {resultado.error ? '' : '✓ '}{t(resultado.texto)}
            </p>
          )}
          <div className="max-h-80 overflow-y-auto">
            {total === 0 && avisos.length === 0 ? (
              <p className="text-xs text-jungle-400 text-center py-8">{t('Todo al día 🎉')}</p>
            ) : (
              <>
                {avisos.map((n) => (
                  <button
                    key={`n-${n.id}`}
                    onClick={() => { setAbierta(false); irAReservas(); }}
                    className="w-full text-left px-4 py-3 border-b border-jungle-50 hover:bg-jungle-50 flex items-start gap-2.5"
                  >
                    <Bell size={15} className="text-jungle-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-jungle-900">{t(n.titulo)}</p>
                      <p className="text-[11px] text-jungle-500 mt-0.5">{t(n.mensaje)}</p>
                    </div>
                  </button>
                ))}
                {pendientes.map((r) => (
                  <div key={`p-${r.id}`} className="px-4 py-3 border-b border-jungle-50">
                    <button
                      onClick={() => { setAbierta(false); irAReservas(); }}
                      className="w-full text-left flex items-center gap-2.5"
                    >
                      <Clock size={15} className="text-amber-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-jungle-900 truncate">{r.titulo}</p>
                        <p className="text-[11px] text-jungle-500">
                          {t('Nueva solicitud de reservación')} · {fechaCorta(r.fecha)}
                          {r.personas ? ` · ${r.personas} ${t(r.personas === 1 ? 'persona' : 'personas')}` : ''}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-jungle-300 flex-shrink-0" />
                    </button>
                    <div className="flex gap-2 mt-2.5 pl-[25px]">
                      <button
                        onClick={() => responder(r.id, 'rechazar')}
                        disabled={respondiendo !== null}
                        className="flex-1 h-9 rounded-lg border-[1.5px] border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 disabled:opacity-50"
                      >
                        {t('Rechazar')}
                      </button>
                      <button
                        onClick={() => responder(r.id, 'confirmar')}
                        disabled={respondiendo !== null}
                        className="flex-1 h-9 rounded-lg bg-jungle-700 hover:bg-jungle-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {respondiendo === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        {t('Aceptar')}
                      </button>
                    </div>
                  </div>
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
                      <p className="text-[11px] text-jungle-400">{(r.mensajes_no_leidos ?? 0) > 1 ? t('{n} mensajes nuevos', { n: r.mensajes_no_leidos ?? 0 }) : t('{n} mensaje nuevo', { n: r.mensajes_no_leidos ?? 0 })}</p>
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
          {onIrATab ? (
            <button
              onClick={() => { setAbierta(false); onIrATab('comunidad'); }}
              className="w-full flex items-center gap-2 px-4 py-3 bg-jungle-50 hover:bg-jungle-100 border-t border-jungle-100 text-xs font-semibold text-jungle-700 transition-colors text-left"
            >
              <Users size={14} /> {t('Mientras esperas, mira la Comunidad')}
              <ChevronRight size={13} className="ml-auto text-jungle-400" />
            </button>
          ) : (
            <Link
              to="/comunidad"
              onClick={() => setAbierta(false)}
              className="flex items-center gap-2 px-4 py-3 bg-jungle-50 hover:bg-jungle-100 border-t border-jungle-100 text-xs font-semibold text-jungle-700 transition-colors"
            >
              <Users size={14} /> {t('Mientras esperas, mira la Comunidad')}
              <ChevronRight size={13} className="ml-auto text-jungle-400" />
            </Link>
          )}
      </div>
    </>
  );

  const estiloBoton = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : undefined;

  if (variante === 'barra') {
    return (
      <>
        <button
          ref={botonRef}
          onClick={alAbrirCerrarBarra}
          title={colapsado ? t('Notificaciones') : undefined}
          aria-label={t('Notificaciones')}
          className={`relative w-full flex items-center gap-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            colapsado ? 'px-0 justify-center' : 'px-3'
          } ${abierta ? 'bg-jungle-700 text-white shadow-sm' : 'text-jungle-300 hover:bg-jungle-800 hover:text-white'}`}
        >
          <Bell size={18} strokeWidth={abierta ? 2.5 : 2} className="flex-shrink-0" />
          {!colapsado && t('Notificaciones')}
          {total > 0 && (
            colapsado ? (
              <span className="absolute top-1.5 right-3 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-jungle-900" />
            ) : (
              <span className="ml-auto bg-red-500 text-white text-[11px] font-bold min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center">
                {total}
              </span>
            )
          )}
        </button>
        {panel}
      </>
    );
  }

  if (variante === 'barra-movil') {
    return (
      <>
        <button
          ref={botonRef}
          onClick={alAbrirCerrarBarra}
          aria-label={t('Notificaciones')}
          className="relative w-10 h-10 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors"
        >
          <Bell size={20} />
          {total > 0 && (
            <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[10px] font-bold min-w-4 h-4 px-1 rounded-full flex items-center justify-center">
              {total}
            </span>
          )}
        </button>
        {panel}
      </>
    );
  }

  return (
    <div
      className={`fixed z-[70] ${pos ? '' : 'right-4 sm:right-6 bottom-20 lg:bottom-6'}`}
      style={estiloBoton}
    >
      {panel}

      <button
        onPointerDown={iniciarArrastre}
        onPointerUp={alSoltarBoton}
        className={`relative w-14 h-14 rounded-full bg-jungle-700 hover:bg-jungle-800 text-white shadow-xl flex items-center justify-center touch-none select-none ${
          arrastrando ? 'cursor-grabbing scale-105' : 'cursor-grab transition-colors'
        }`}
        aria-label={t('Notificaciones — mantén presionado para mover')}
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