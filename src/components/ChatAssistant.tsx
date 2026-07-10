import { useState, useRef, useEffect } from 'react';
import { Send, RotateCcw, MapPin, BookmarkPlus, CheckCircle2 } from 'lucide-react';
import type { useLLM } from '../hooks/useLLM';
import type { Lugar } from '../data/lugares';
import type { Categoria, Presupuesto } from '../data/lugares';
import {
  type MensajeChat,
  type EstadoChat,
  type PreferenciasUsuario,
  type GrupoViaje,
  type Dias,
  mensajeBienvenida,
  mensajeIntereses,
  mensajePresupuesto,
  mensajeGrupo,
  generarRuta,
  responderTextoLibre,
} from '../lib/chatbot';

import { guardarRuta, mapaDescargado } from '../lib/db';
// ============================================================
// PANTALLA DEL ASISTENTE — interfaz del motor local de IA
// ============================================================
// Conversa con el usuario en dos modos:
//  - Flujo guiado: pregunta días, intereses, presupuesto, grupo
//    y arma una ruta personalizada explicando su razonamiento.
//  - Texto libre: responde preguntas sueltas. Si el dispositivo
//    soporta IA (WebGPU), usa el LLM offline; si no, cae al motor
//    de reglas de lib/chatbot.ts. Ambos funcionan sin internet.
// ============================================================

interface Props {
  onVerLugar: (lugar: Lugar) => void;
  // Cuando el usuario quiere ver una ruta del día sobre el mapa.
  // El padre (AppShell) calcula el trazado por carretera y cambia
  // al tab del mapa con la polyline visible.
  onVerRutaEnMapa?: (lugares: Lugar[]) => void;
  // Instancia COMPARTIDA del hook de IA — vive en AppShell (no aquí)
  // para que la descarga siga corriendo aunque el usuario cambie de
  // tab, y para que el aviso de descarga (DescargaIABanner) sea
  // visible en toda la app, no solo dentro del chat.
  llm: ReturnType<typeof useLLM>;
}

export default function ChatAssistant({ onVerLugar, onVerRutaEnMapa, llm }: Props) {
  // El chat persiste entre cambios de tab usando sessionStorage.
  // Se limpia al cerrar/recargar la app, pero sobrevive mientras
  // la PWA esté abierta — el turista puede ir al mapa y volver
  // sin perder su conversación.
  const [mensajes, setMensajes] = useState<MensajeChat[]>(() => {
    try {
      const guardado = sessionStorage.getItem('tuxtlasgo-chat');
      if (guardado) {
        const parsed = JSON.parse(guardado) as MensajeChat[];
        if (parsed.length > 0) return parsed;
      }
    } catch { /* sessionStorage no disponible */ }
    return [mensajeBienvenida()];
  });
  const [estado, setEstado] = useState<EstadoChat>(() => {
    try {
      const e = sessionStorage.getItem('tuxtlasgo-chat-estado');
      if (e) return e as EstadoChat;
    } catch { /* ok */ }
    return 'preguntando_dias';
  });
  const [input, setInput] = useState('');
  const [escribiendo, setEscribiendo] = useState(false);
  // Mientras el LLM genera, bloqueamos el envío para no encimar streams
  const [generandoIA, setGenerandoIA] = useState(false);
  // Set de índices de mensajes cuya ruta ya fue guardada
  const [rutasGuardadas, setRutasGuardadas] = useState<Set<number>>(new Set());
  // Si el mapa NO está descargado, mostramos un aviso al ver la ruta
  const [mostrarAvisoMapa, setMostrarAvisoMapa] = useState(false);
  // Para avisar UNA sola vez por sesión que se está usando el modo
  // clásico (sin LLM) — nunca a media conversación en cada mensaje.
  const avisoModoClasicoMostrado = useRef(false);
  // Para confirmar UNA sola vez que la IA avanzada SÍ sigue funcionando
  // aunque no haya internet — sin esto, el usuario solo ve el banner
  // nativo de "Sin conexión" del navegador y duda si la app funciona.
  const avisoOfflineConIAMostrado = useRef(false);

  // El LLM offline (detección + carga + streaming) ahora vive en
  // AppShell y llega por props — ver interfaz Props arriba.

  // Preferencias que se van armando durante el flujo guiado
  const [prefsParcial, setPrefsParcial] = useState<Partial<PreferenciasUsuario>>(
    {}
  );
  // Intereses seleccionados (multi-selección)
  const [interesesTemp, setInteresesTemp] = useState<Categoria[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [mensajes, escribiendo]);

  // Agrega un mensaje del bot con un pequeño retardo (sensación de "escribiendo")
  function responderBot(msg: MensajeChat, delay = 500) {
    setEscribiendo(true);
    setTimeout(() => {
      setMensajes((prev) => [...prev, msg]);
      setEscribiendo(false);
    }, delay);
  }

  function agregarUsuario(texto: string) {
    setMensajes((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        texto,
        timestamp: Date.now(),
      },
    ]);
  }

  // Reinicia toda la conversación
  function reiniciar() {
    setMensajes([mensajeBienvenida()]);
    try { sessionStorage.removeItem('tuxtlasgo-chat'); sessionStorage.removeItem('tuxtlasgo-chat-estado'); } catch { /* ok */ }
    setEstado('preguntando_dias');
    setPrefsParcial({});
    setInteresesTemp([]);
  }

  // ─────────── Manejo de opciones tocadas (botones) ───────────
  function manejarOpcion(valor: string, label: string) {
    // Casos especiales
    if (valor === '__restart__') {
      agregarUsuario(label);
      reiniciar();
      return;
    }

    if (estado === 'preguntando_dias') {
      agregarUsuario(label);
      const dias = parseInt(valor) as Dias;
      setPrefsParcial({ dias });
      setEstado('preguntando_intereses');
      responderBot(mensajeIntereses());
      return;
    }

    if (estado === 'preguntando_intereses') {
      // Multi-selección de intereses
      if (valor === '__done__') {
        if (interesesTemp.length === 0) {
          responderBot(
            {
              id: crypto.randomUUID(),
              role: 'bot',
              texto:
                'Elige al menos un interés para poder recomendarte bien 🙂',
              timestamp: Date.now(),
            },
            300
          );
          return;
        }
        agregarUsuario(`Me interesa: ${interesesTemp.join(', ')}`);
        setPrefsParcial((p) => ({ ...p, intereses: interesesTemp }));
        setEstado('preguntando_presupuesto');
        responderBot(mensajePresupuesto());
        return;
      }
      // Toggle de un interés
      const cat = valor as Categoria;
      setInteresesTemp((prev) =>
        prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
      );
      return;
    }

    if (estado === 'preguntando_presupuesto') {
      agregarUsuario(label);
      setPrefsParcial((p) => ({ ...p, presupuesto: valor as Presupuesto }));
      setEstado('preguntando_grupo');
      responderBot(mensajeGrupo());
      return;
    }

    if (estado === 'preguntando_grupo') {
      agregarUsuario(label);
      const prefsCompletas: PreferenciasUsuario = {
        dias: prefsParcial.dias ?? 2,
        intereses: prefsParcial.intereses ?? ['Naturaleza'],
        presupuesto: prefsParcial.presupuesto ?? 'medio',
        grupo: valor as GrupoViaje,
      };
      setPrefsParcial(prefsCompletas);
      setEstado('generando');
      generarYMostrarRuta(prefsCompletas);
      return;
    }
  }

  // ─────────── Genera la ruta y la muestra día por día ───────────
  function generarYMostrarRuta(prefs: PreferenciasUsuario) {
    const dias = generarRuta(prefs);

    if (dias.length === 0) {
      responderBot({
        id: crypto.randomUUID(),
        role: 'bot',
        texto:
          'Mmm, con esas preferencias no encontré suficientes lugares. ¿Probamos de nuevo con otros intereses?',
        opciones: [{ label: '🔄 Intentar de nuevo', valor: '__restart__' }],
        timestamp: Date.now(),
      });
      setEstado('libre');
      return;
    }

    // Mensaje introductorio
    responderBot(
      {
        id: crypto.randomUUID(),
        role: 'bot',
        texto: `¡Listo! Te armé una ruta de ${dias.length} ${dias.length === 1 ? 'día' : 'días'
          } pensada para ti. Aquí va, día por día:`,
        timestamp: Date.now(),
      },
      600
    );

    // Un mensaje por cada día (escalonados)
    dias.forEach((dia, i) => {
      setTimeout(() => {
        setMensajes((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'bot',
            texto: `${dia.resumen}\n\n💡 ${dia.razonamiento}`,
            rutaDia: {
              dia: dia.dia,
              lugares: dia.lugares,
              resumen: dia.resumen,
            },
            timestamp: Date.now(),
          },
        ]);
      }, 1200 + i * 900);
    });

    // Mensaje final con opción de reiniciar
    setTimeout(() => {
      setMensajes((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'bot',
          texto:
            '¿Qué te parece la ruta? Puedes tocar cualquier lugar para ver sus detalles. Si quieres, también puedo responderte dudas sueltas: cómo llegar, qué llevar, dónde comer, la mejor época para visitar...',
          opciones: [{ label: '🔄 Armar otra ruta', valor: '__restart__' }],
          timestamp: Date.now(),
        },
      ]);
      setEstado('libre');
    }, 1200 + dias.length * 900 + 400);
  }

  // ─────────── Envío de texto libre ───────────
  // IMPORTANTE: antes, si el usuario escribía texto libre MIENTRAS el
  // flujo guiado esperaba un botón (días/intereses/presupuesto/grupo),
  // el mensaje se iba SIEMPRE al motor de reglas y el LLM nunca se
  // llegaba a activar — porque solo se intentaba cuando `estado` ya
  // era 'libre'. Como en una conversación real casi nadie empieza
  // tocando botones (la gente escribe), esto hacía que el LLM pareciera
  // "no arrancar" y además producía respuestas duplicadas idénticas
  // (la plantilla fija de "no entendí" + el aviso de botones, una y
  // otra vez). Ahora el texto libre SIEMPRE intenta LLM (o reglas como
  // respaldo) sin importar en qué paso del flujo guiado estemos — los
  // botones siguen ahí como atajo, pero ya no son la única puerta.
  async function enviarTexto() {
    const texto = input.trim();
    if (!texto || generandoIA) return; // no encimar mientras genera
    agregarUsuario(texto);
    setInput('');

    setGenerandoIA(true);
    try {
      // ¿Podemos usar el LLM? Si está soportado pero aún no cargado,
      // lo preparamos AHORA (la primera vez descarga el modelo).
      let puedeUsarIA = llm.listo;
      if (llm.estado === 'inactivo' || llm.estado === 'verificando') {
        setEscribiendo(true);
        puedeUsarIA = await llm.activar(); // usamos el booleano, no el estado viejo
      }

      if (puedeUsarIA) {
        // Streaming: mostramos los puntitos hasta el primer token,
        // luego creamos la burbuja y la vamos llenando en vivo.
        setEscribiendo(true);
        let primerToken = true;
        let msgId = '';
        await llm.responder(
          texto,
          mensajes,
          (acc) => {
            if (primerToken) {
              primerToken = false;
              setEscribiendo(false);
              msgId = crypto.randomUUID();
              setMensajes((prev) => [
                ...prev,
                { id: msgId, role: 'bot', texto: acc, timestamp: Date.now() },
              ]);
            } else {
              setMensajes((prev) =>
                prev.map((m) => (m.id === msgId ? { ...m, texto: acc } : m))
              );
            }
          },
          prefsParcial
        );

        // Confirmación única: "sí funciona sin internet" — se muestra
        // la primera vez que se detecta esta combinación (IA local
        // lista + sin conexión), para que no quede la duda que se vio
        // en pruebas de campo real.
        if (
          !avisoOfflineConIAMostrado.current &&
          typeof navigator !== 'undefined' &&
          !navigator.onLine
        ) {
          avisoOfflineConIAMostrado.current = true;
          setTimeout(() => {
            setMensajes((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: 'bot',
                texto:
                  '🌐 Sin conexión a internet, pero la IA avanzada (guIA) sigue funcionando en tu dispositivo sin problema — no necesita señal.',
                timestamp: Date.now(),
              },
            ]);
          }, 700);
        }
      } else if (llm.nubeDisponible()) {
        // Sin WebGPU usable, pero SÍ hay internet: exactamente el caso
        // de una PC con GPU bloqueada mostrado en pruebas de campo.
        // En vez de resignarnos al motor de reglas, usamos el mismo
        // contexto recuperado con un modelo en la nube (ver llm.ts).
        // No streaming aquí (v1): más simple y confiable; los puntitos
        // cubren la espera.
        try {
          const { texto: textoNube, valida } = await llm.responderNube(
            texto,
            mensajes,
            prefsParcial
          );
          setEscribiendo(false);
          if (valida) {
            setMensajes((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: 'bot', texto: textoNube, timestamp: Date.now() },
            ]);
          } else {
            // La nube también puede alucinar (menos seguido que el
            // modelo local, pero pasa) — si la validación la descarta,
            // no dejamos una burbuja vacía: caemos al motor de reglas
            // para ESTE mensaje, que nunca inventa datos.
            console.warn('[TuxtlasGO IA] Respuesta de nube descartada por posible alucinación');
            responderBot(responderTextoLibre(texto, null), 200);
          }
          if (!avisoModoClasicoMostrado.current) {
            avisoModoClasicoMostrado.current = true;
            setTimeout(() => {
              setMensajes((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  role: 'bot',
                  texto:
                    '💡 Este dispositivo no soporta IA local (WebGPU) — como hay conexión, estoy usando el asistente en la nube. Sin internet, uso el modo clásico offline.',
                  timestamp: Date.now(),
                },
              ]);
            }, 700);
          }
        } catch (e) {
          console.error('[TuxtlasGO IA] Nube falló, cae a reglas:', e);
          setEscribiendo(false);
          responderBot(responderTextoLibre(texto, null), 300);
        }
      } else {
        // Sin adaptador WebGPU real, sin internet, o error al cargar
        // → motor de reglas. Avisamos UNA vez por sesión (no en cada
        // mensaje) para que quede claro que se está en modo clásico y
        // no parezca que "no pasó nada".
        setEscribiendo(false);
        responderBot(responderTextoLibre(texto, null), 400);
        if (!avisoModoClasicoMostrado.current && (llm.estado === 'sin_soporte' || llm.estado === 'error')) {
          avisoModoClasicoMostrado.current = true;
          setTimeout(() => {
            setMensajes((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: 'bot',
                texto:
                  llm.estado === 'sin_soporte'
                    ? '💡 Este dispositivo no tiene soporte de IA avanzada (WebGPU) ni conexión a internet — sigo funcionando con el asistente clásico offline, sin problema.'
                    : '💡 La IA avanzada tardó demasiado en cargar (¿señal lenta?) — sigo funcionando con el asistente clásico offline. Si la descarga termina en segundo plano, la uso en tu próximo mensaje.',
                timestamp: Date.now(),
              },
            ]);
          }, 900);
        }
      }
    } catch (err) {
      // Si algo truena a media respuesta, no dejamos la burbuja a medias:
      // caemos al motor de reglas.
      console.error('Error generando con LLM:', err);
      setEscribiendo(false);
      responderBot(responderTextoLibre(texto, null), 200);
    } finally {
      setEscribiendo(false);
      setGenerandoIA(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-jungle-50">
      {/* Aviso: descarga el mapa antes de seguir la ruta */}
      {mostrarAvisoMapa && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-50 border border-amber-300 rounded-2xl shadow-xl px-4 py-3 max-w-xs w-[90vw] text-center animate-fade-in">
          <p className="text-sm font-semibold text-amber-900 mb-1">📡 Descarga el mapa primero</p>
          <p className="text-xs text-amber-700 mb-3">
            Para seguir esta ruta sin internet, ve al Mapa y toca "Descargar mapa" una vez con Wi-Fi.
          </p>
          <button
            onClick={() => setMostrarAvisoMapa(false)}
            className="bg-amber-600 text-white text-xs font-bold px-4 py-1.5 rounded-full"
          >
            Entendido
          </button>
        </div>
      )}
      {/* Header */}
      <div className="bg-gradient-to-br from-jungle-800 to-jungle-950 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <img
            src="/logo-tuxtlasgo.png"
            alt="TuxtlasGO"
            className="h-8 w-auto object-contain brightness-0 invert"
          />
          <div>
            <div className="font-display font-bold leading-tight">
              Guía TuxtlasGO
            </div>
            <div className="text-[11px] text-jungle-200 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              Funciona sin internet
            </div>
          </div>
        </div>
        <button
          onClick={reiniciar}
          className="text-jungle-200 hover:text-white p-2"
          aria-label="Reiniciar conversación"
          title="Reiniciar"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Nota: antes había aquí una barra de progreso de descarga del
          modelo. Se quitó a propósito — el indicador de "escribiendo"
          (los tres puntitos de abajo) ya cubre la espera de forma más
          discreta, sin números de porcentaje que puedan confundir. */}

      {/* Mensajes */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-3">
        {mensajes.map((msg) => (
          <Burbuja
            key={msg.id}
            mensaje={msg}
            interesesTemp={interesesTemp}
            estado={estado}
            onOpcion={manejarOpcion}
            onVerLugar={onVerLugar}
            onVerRutaEnMapa={(lugares) => {
              // Si el mapa no está descargado, avisamos antes de mostrar la ruta
              if (!mapaDescargado()) {
                setMostrarAvisoMapa(true);
              }
              onVerRutaEnMapa?.(lugares);
            }}
            onGuardarRuta={async (diaRuta) => {
              // Busca si ya hay una ruta guardada con este mensaje
              // para nombrarla automáticamente
              const nombre = `Ruta ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} — Día ${diaRuta.dia}`;
              await guardarRuta(
                nombre,
                [{ dia: diaRuta.dia, lugaresIds: diaRuta.lugares.map(l => l.id), resumen: diaRuta.resumen }],
                {}
              );
              setRutasGuardadas(prev => new Set([...prev, mensajes.indexOf(msg)]));
            }}
            rutaYaGuardada={rutasGuardadas.has(mensajes.indexOf(msg))}
          />
        ))}

        {escribiendo && (
          <div className="flex flex-col gap-1.5 px-4 py-3 bg-white rounded-2xl rounded-tl-sm w-fit min-w-[180px] border border-jungle-100">
            {llm.estado === 'cargando' && (
              <>
                <div className="flex items-center justify-between gap-3 text-xs text-jungle-600">
                  <span className="font-medium">Preparando guIA…</span>
                  <span className="font-semibold text-jungle-700">
                    {Math.round(llm.progreso * 100)}% · {llm.segundosTranscurridos}s
                  </span>
                </div>
                <div className="w-full h-1.5 bg-jungle-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-jungle-600 transition-all duration-300"
                    style={{ width: `${Math.round(llm.progreso * 100)}%` }}
                  />
                </div>
              </>
            )}
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 bg-jungle-400 rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-2 h-2 bg-jungle-400 rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-2 h-2 bg-jungle-400 rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Input de texto libre */}
      <div className="px-3 py-3 bg-white border-t border-jungle-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && enviarTexto()}
            placeholder={generandoIA ? 'Pensando…' : 'Escribe tu pregunta...'}
            disabled={generandoIA}
            inputMode="text"
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="on"
            autoCapitalize="sentences"
            className="flex-1 bg-jungle-50 rounded-full px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-jungle-400 border-0 disabled:opacity-60"
          />
          <button
            onClick={enviarTexto}
            disabled={!input.trim() || generandoIA}
            className="w-10 h-10 rounded-full bg-jungle-700 hover:bg-jungle-800 disabled:opacity-40 text-white flex items-center justify-center flex-shrink-0"
            aria-label="Enviar"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────── BURBUJA DE MENSAJE ───────────────
function Burbuja({
  mensaje,
  interesesTemp,
  estado,
  onOpcion,
  onVerLugar,
  onVerRutaEnMapa,
  onGuardarRuta,
  rutaYaGuardada,
}: {
  mensaje: MensajeChat;
  interesesTemp: Categoria[];
  estado: EstadoChat;
  onOpcion: (valor: string, label: string) => void;
  onVerLugar: (lugar: Lugar) => void;
  onVerRutaEnMapa?: (lugares: Lugar[]) => void;
  onGuardarRuta?: (dia: { dia: number; lugares: Lugar[]; resumen: string }) => void;
  rutaYaGuardada?: boolean;
}) {
  const esBot = mensaje.role === 'bot';

  return (
    <div className={`flex ${esBot ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[85%] ${esBot ? '' : 'items-end'}`}>
        {/* Texto del mensaje */}
        <div
          className={`px-4 py-2.5 text-sm whitespace-pre-line ${esBot
            ? 'bg-white text-jungle-900 rounded-2xl rounded-tl-sm border border-jungle-100'
            : 'bg-jungle-700 text-white rounded-2xl rounded-tr-sm'
            }`}
        >
          {mensaje.texto}
        </div>

        {/* Opciones (botones) */}
        {mensaje.opciones && mensaje.opciones.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {mensaje.opciones.map((op) => {
              const seleccionado =
                estado === 'preguntando_intereses' &&
                interesesTemp.includes(op.valor as Categoria);
              const esDone = op.valor === '__done__';
              return (
                <button
                  key={op.valor}
                  onClick={() => onOpcion(op.valor, op.label)}
                  className={`text-sm px-3 py-2 rounded-xl font-medium transition-colors border ${esDone
                    ? 'bg-jungle-700 text-white border-jungle-700 hover:bg-jungle-800'
                    : seleccionado
                      ? 'bg-jungle-600 text-white border-jungle-600'
                      : 'bg-white text-jungle-800 border-jungle-200 hover:bg-jungle-50'
                    }`}
                >
                  {seleccionado ? '✓ ' : ''}
                  {op.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Lugares sueltos recomendados */}
        {mensaje.lugares && mensaje.lugares.length > 0 && (
          <div className="mt-2 space-y-2">
            {mensaje.lugares.map((lugar) => (
              <TarjetaLugarChat
                key={lugar.id}
                lugar={lugar}
                onClick={() => onVerLugar(lugar)}
              />
            ))}
          </div>
        )}

        {/* Ruta de un día */}
        {mensaje.rutaDia && (
          <div className="mt-2 bg-white rounded-2xl border border-jungle-100 overflow-hidden">
            <div className="bg-jungle-100 px-3 py-2 font-display font-bold text-jungle-900 text-sm">
              Día {mensaje.rutaDia.dia}
            </div>
            <div className="p-2 space-y-2">
              {mensaje.rutaDia.lugares.map((lugar, i) => (
                <div key={lugar.id} className="flex gap-2">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-6 h-6 rounded-full bg-jungle-700 text-white text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </div>
                    {i < mensaje.rutaDia!.lugares.length - 1 && (
                      <div className="w-0.5 flex-1 bg-jungle-200 my-1" />
                    )}
                  </div>
                  <button
                    onClick={() => onVerLugar(lugar)}
                    className="flex-1 text-left bg-jungle-50 hover:bg-jungle-100 rounded-lg p-2 transition-colors mb-1"
                  >
                    <div className="font-semibold text-jungle-950 text-sm leading-tight">
                      {lugar.nombre}
                    </div>
                    <div className="text-xs text-jungle-600 mt-0.5 flex items-center gap-1">
                      <MapPin size={10} />
                      {lugar.municipio} · {lugar.duracionSugerida}
                    </div>
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-jungle-100 mt-2 pt-2 space-y-1.5">
              {onVerRutaEnMapa && mensaje.rutaDia.lugares.length >= 2 && (
                <button
                  onClick={() => onVerRutaEnMapa(mensaje.rutaDia!.lugares)}
                  className="w-full bg-jungle-700 hover:bg-jungle-800 text-white text-sm font-semibold py-2.5 flex items-center justify-center gap-2 transition-colors rounded-b-xl"
                >
                  <MapPin size={14} />
                  Ver ruta en el mapa
                </button>
              )}
              {onGuardarRuta && (
                rutaYaGuardada ? (
                  <div className="w-full flex items-center justify-center gap-2 text-xs text-jungle-600 py-1.5">
                    <CheckCircle2 size={13} />
                    Ruta guardada en Mis lugares
                  </div>
                ) : (
                  <button
                    onClick={() => onGuardarRuta(mensaje.rutaDia!)}
                    className="w-full border border-jungle-300 text-jungle-700 hover:bg-jungle-50 text-xs font-semibold py-2 flex items-center justify-center gap-1.5 transition-colors rounded-xl"
                  >
                    <BookmarkPlus size={13} />
                    Guardar esta ruta en Mis lugares
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Tarjeta compacta de lugar dentro del chat
function TarjetaLugarChat({
  lugar,
  onClick,
}: {
  lugar: Lugar;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex gap-3 bg-white rounded-xl p-2.5 hover:bg-jungle-50 transition-colors text-left border border-jungle-100"
    >
      <img
        src={lugar.imagen}
        alt={lugar.nombre}
        className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-jungle-950 text-sm leading-tight">
          {lugar.nombre}
        </div>
        <div className="text-xs text-jungle-600 mt-0.5 line-clamp-2">
          {lugar.descripcionCorta}
        </div>
        <div className="text-xs text-jungle-500 mt-1 flex items-center gap-1">
          <MapPin size={10} />
          {lugar.municipio}
          {lugar.rating > 0 && <span>· ⭐ {lugar.rating}</span>}
        </div>
      </div>
    </button>
  );
}