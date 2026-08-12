import { useEffect, useState } from 'react';
import { Heart, Route, Trash2, Calendar, MapPin, BookmarkCheck, Clock, X, Loader2, MessageCircle } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { LUGARES, type Lugar } from '../data/lugares';
import PlaceCard from './PlaceCard';
import { getToken, getUsuarioLocal } from '../lib/auth';
import ChatReservacion from './ChatReservacion';

interface Props {
  onVerLugar: (lugar: Lugar) => void;
  onVerRutaEnMapa?: (lugares: Lugar[]) => void;
}

interface ReservacionTurista {
  id: number;
  fecha: string;
  nombre_viajero: string;
  numero_personas: number;
  presupuesto?: string;
  notas?: string;
  estado: 'pendiente' | 'confirmada' | 'rechazada' | 'cancelada';
  politica: 'flexible' | 'no_reembolsable';
  pago_estado: 'sin_pagar' | 'pendiente' | 'pagado';
  pago_vencimiento?: string | null;
  servicio_id: number;
  servicio_nombre: string;
  municipio: string;
  categoria: string;
  monto_minimo?: number | null;
  mostrar_usd_reservacion?: boolean;
  mensajes_no_leidos?: number;
}

export default function FavoritesScreen({ onVerLugar, onVerRutaEnMapa }: Props) {
  const [tab, setTab] = useState<'favoritos' | 'rutas' | 'reservaciones'>('favoritos');
  const usuario = getUsuarioLocal();

  const favoritos = useLiveQuery(async () => {
    const favs = await db.favoritos.orderBy('agregadoEn').reverse().toArray();
    const ids = new Set(favs.map((f) => f.id));
    return LUGARES.filter((l) => ids.has(l.id));
  }, []);

  const rutas = useLiveQuery(
    () => db.rutas.orderBy('creadaEn').reverse().toArray(),
    []
  );

  const [reservaciones, setReservaciones] = useState<ReservacionTurista[] | null>(null);
  const [cargandoReservas, setCargandoReservas] = useState(false);

  async function cargarReservaciones() {
    if (!usuario || usuario.tipo !== 'turista') return;
    setCargandoReservas(true);
    try {
      const res = await fetch('/api/reservaciones', { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.ok) setReservaciones(data.reservaciones);
    } catch { /* sin conexión */ }
    setCargandoReservas(false);
  }

  useEffect(() => {
    if (tab === 'reservaciones') cargarReservaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const [chatAbierto, setChatAbierto] = useState<{ id: number; nombre: string } | null>(null);
  const [pagando, setPagando] = useState<number | null>(null);
  const [mensajePago, setMensajePago] = useState<{ tipo: 'exito' | 'error' | 'pendiente'; texto: string } | null>(null);

  async function pagarAnticipo(id: number) {
    setPagando(id);
    try {
      const res = await fetch('/api/pagos/mercadopago?accion=pagar_reservacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ reservacion_id: id }),
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url; // al checkout de Mercado Pago del prestador
      } else {
        alert(data.error ?? 'No se pudo iniciar el pago');
        setPagando(null);
      }
    } catch {
      alert('Sin conexión. Verifica tu internet.');
      setPagando(null);
    }
  }

  // Regreso del checkout (?reserva_pago=exito|error|pendiente). El
  // webhook es quien de verdad marca "pagado" — esto solo avisa y
  // refresca por si ya llegó.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resultado = params.get('reserva_pago');
    if (!resultado) return;
    if (resultado === 'exito') setMensajePago({ tipo: 'exito', texto: 'Pago recibido — confirmando con el prestador…' });
    else if (resultado === 'pendiente') setMensajePago({ tipo: 'pendiente', texto: 'Tu pago está pendiente de confirmación (normal con SPEI/OXXO).' });
    else if (resultado === 'error') setMensajePago({ tipo: 'error', texto: 'El pago no se completó. Puedes intentarlo de nuevo.' });
    params.delete('reserva_pago');
    window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`);
    if (resultado === 'exito') setTimeout(cargarReservaciones, 2500);
    setTab('reservaciones');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cancelarReservacion(id: number) {
    if (!confirm('¿Cancelar esta reservación?')) return;
    try {
      const res = await fetch('/api/reservaciones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ id, accion: 'cancelar' }),
      });
      const data = await res.json();
      if (data.ok) setReservaciones((prev) => prev?.map((r) => (r.id === id ? { ...r, estado: 'cancelada' } : r)) ?? null);
      else alert(data.error ?? 'No se pudo cancelar');
    } catch {
      alert('Sin conexión. Verifica tu internet.');
    }
  }

  const eliminarRuta = async (id: number) => {
    if (confirm('¿Eliminar esta ruta?')) {
      await db.rutas.delete(id);
    }
  };

  return (
    <div className="pb-24 lg:pb-6">
      <header className="bg-gradient-to-br from-jungle-700 to-jungle-900 text-white px-4 pt-6 pb-5 rounded-b-3xl">
        <h1 className="font-display font-extrabold text-2xl">Mis lugares</h1>
        <p className="text-sm text-jungle-100 opacity-90 mb-4">
          Todo se guarda en tu dispositivo, incluso sin conexión.
        </p>

        <div className="flex bg-white/15 backdrop-blur rounded-xl p-1">
          <button
            onClick={() => setTab('favoritos')}
            className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === 'favoritos' ? 'bg-white text-jungle-900' : 'text-white'
              }`}
          >
            <Heart size={14} /> Favoritos ({favoritos?.length || 0})
          </button>
          <button
            onClick={() => setTab('rutas')}
            className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === 'rutas' ? 'bg-white text-jungle-900' : 'text-white'
              }`}
          >
            <Route size={14} /> Rutas ({rutas?.length || 0})
          </button>
          {usuario?.tipo === 'turista' && (
            <button
              onClick={() => setTab('reservaciones')}
              className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === 'reservaciones' ? 'bg-white text-jungle-900' : 'text-white'
                }`}
            >
              <BookmarkCheck size={14} /> Reservas
            </button>
          )}
        </div>
      </header>

      <div className="px-4 mt-5">
        {tab === 'favoritos' && (
          <>
            {!favoritos || favoritos.length === 0 ? (
              <EmptyState
                icon={Heart}
                titulo="Aún no tienes favoritos"
                texto='Toca el ❤️ en cualquier lugar para guardarlo aquí.'
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {favoritos.map((l) => (
                  <PlaceCard key={l.id} lugar={l} onClick={() => onVerLugar(l)} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'rutas' && (
          <>
            {!rutas || rutas.length === 0 ? (
              <EmptyState
                icon={Route}
                titulo="No tienes rutas guardadas"
                texto='Habla con el asistente y arma una ruta personalizada.'
              />
            ) : (
              <div className="space-y-4">
                {rutas.map((r) => (
                  <div
                    key={r.id}
                    className="bg-white rounded-2xl p-4 border border-jungle-100 shadow-sm"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-display font-bold text-jungle-950">
                          {r.nombre}
                        </div>
                        <div className="text-xs text-jungle-600 flex items-center gap-1 mt-0.5">
                          <Calendar size={11} />
                          {new Date(r.creadaEn).toLocaleDateString('es-MX', {
                            day: 'numeric',
                            month: 'long',
                          })}{' '}
                          · {r.dias.length} día{r.dias.length > 1 ? 's' : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => r.id && eliminarRuta(r.id)}
                        className="text-jungle-400 hover:text-red-500 p-1"
                        aria-label="Eliminar ruta"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {/* Botón Ver en mapa — muestra todos los lugares de la ruta */}
                    {onVerRutaEnMapa && (() => {
                      const todosLugares = r.dias.flatMap(d =>
                        d.lugaresIds.map(id => LUGARES.find(l => l.id === id)).filter(Boolean) as Lugar[]
                      );
                      return todosLugares.length >= 2 ? (
                        <button
                          onClick={() => onVerRutaEnMapa(todosLugares)}
                          className="w-full bg-jungle-700 hover:bg-jungle-800 text-white text-xs font-semibold py-2 flex items-center justify-center gap-1.5 rounded-xl mb-2 transition-colors"
                        >
                          <MapPin size={12} />
                          Ver ruta en el mapa
                        </button>
                      ) : null;
                    })()}
                    {r.dias.map((d) => {
                      const lugaresDia = d.lugaresIds
                        .map((id) => LUGARES.find((l) => l.id === id))
                        .filter(Boolean) as Lugar[];
                      return (
                        <div
                          key={d.dia}
                          className="border-t border-jungle-100 pt-3 mt-3"
                        >
                          <div className="text-xs font-bold text-jungle-700 uppercase tracking-wide mb-2">
                            Día {d.dia}
                          </div>
                          <div className="space-y-1.5">
                            {lugaresDia.map((l) => (
                              <button
                                key={l.id}
                                onClick={() => onVerLugar(l)}
                                className="w-full text-left flex items-center gap-2 text-sm text-jungle-900 hover:text-jungle-700 py-1"
                              >
                                <span className="w-1.5 h-1.5 bg-jungle-500 rounded-full" />
                                {l.nombre}
                                <span className="text-xs text-jungle-500 ml-auto">
                                  {l.duracionSugerida}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'reservaciones' && (
          <>
            {mensajePago && (
              <div className={`rounded-xl p-3 mb-3 text-sm flex items-start gap-2 ${mensajePago.tipo === 'exito' ? 'bg-green-50 text-green-800 border border-green-200'
                  : mensajePago.tipo === 'pendiente' ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                <span className="flex-1">{mensajePago.texto}</span>
                <button onClick={() => setMensajePago(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
              </div>
            )}
            {cargandoReservas && (
              <div className="text-center py-10 text-jungle-400">
                <Loader2 size={26} className="animate-spin mx-auto mb-2" />
                <p className="text-sm">Cargando tus reservaciones…</p>
              </div>
            )}
            {!cargandoReservas && (!reservaciones || reservaciones.length === 0) && (
              <EmptyState
                icon={BookmarkCheck}
                titulo="No tienes reservaciones"
                texto="Cuando reserves un servicio, aparecerá aquí."
              />
            )}
            {!cargandoReservas && reservaciones && reservaciones.length > 0 && (
              <div className="space-y-3">
                {reservaciones.map((r) => (
                  <div key={r.id} className="bg-white rounded-2xl p-4 border border-jungle-100 shadow-sm">
                    <div>
                      <p className="font-display font-bold text-jungle-950">{r.servicio_nombre}</p>
                      <p className="text-xs text-jungle-500 flex items-center gap-1 mt-0.5">
                        <MapPin size={11} /> {r.municipio}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <EtiquetaEstado estado={r.estado} />
                      {r.estado === 'confirmada' && r.pago_estado === 'pagado' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800 flex items-center gap-1">
                          ✓ Pagado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-jungle-600 mt-2">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <span>{r.numero_personas} persona{r.numero_personas > 1 ? 's' : ''}</span>
                    </div>
                    {r.estado === 'confirmada' && r.pago_estado !== 'pagado' && !!r.monto_minimo && (
                      <>
                        {r.pago_vencimiento && (
                          <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 mt-2 text-center">
                            Paga antes del {new Date(r.pago_vencimiento).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} a las {new Date(r.pago_vencimiento).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })} o se libera tu lugar
                          </p>
                        )}
                        <button
                          onClick={() => pagarAnticipo(r.id)}
                          disabled={pagando === r.id}
                          className="w-full mt-2 bg-jungle-700 hover:bg-jungle-800 disabled:opacity-60 text-white text-xs font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1.5"
                        >
                          {pagando === r.id ? 'Abriendo Mercado Pago…' : `Pagar anticipo — $${r.monto_minimo} MXN${r.mostrar_usd_reservacion ? ` (≈$${Math.round(r.monto_minimo / 17.1)} USD)` : ''}`}
                        </button>
                      </>
                    )}
                    {(r.estado === 'pendiente' || r.estado === 'confirmada') && (
                      <div className="flex items-center gap-3 mt-3">
                        <button
                          onClick={() => setChatAbierto({ id: r.id, nombre: r.servicio_nombre })}
                          className="relative text-xs font-semibold text-jungle-700 hover:text-jungle-900 flex items-center gap-1"
                        >
                          <MessageCircle size={13} /> Mensajes
                          {!!r.mensajes_no_leidos && (
                            <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                              {r.mensajes_no_leidos}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => cancelarReservacion(r.id)}
                          className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1"
                        >
                          <X size={12} /> Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {chatAbierto && (
        <ChatReservacion
          reservacionId={chatAbierto.id}
          nombreOtro={chatAbierto.nombre}
          onCerrar={() => { setChatAbierto(null); cargarReservaciones(); }}
        />
      )}
    </div>
  );
}

function EtiquetaEstado({ estado }: { estado: ReservacionTurista['estado'] }) {
  const estilos: Record<string, string> = {
    pendiente: 'bg-amber-100 text-amber-800',
    confirmada: 'bg-green-100 text-green-800',
    rechazada: 'bg-red-100 text-red-800',
    cancelada: 'bg-jungle-100 text-jungle-500',
  };
  const etiquetas: Record<string, string> = {
    pendiente: 'Pendiente',
    confirmada: 'Confirmada',
    rechazada: 'Rechazada',
    cancelada: 'Cancelada',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 ${estilos[estado]}`}>
      <Clock size={10} /> {etiquetas[estado]}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  titulo,
  texto,
}: {
  icon: typeof Heart;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="text-center py-16 text-jungle-700">
      <Icon className="mx-auto mb-4 opacity-30" size={48} />
      <p className="font-semibold text-jungle-900">{titulo}</p>
      <p className="text-sm opacity-70 mt-1">{texto}</p>
    </div>
  );
}