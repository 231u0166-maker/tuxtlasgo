import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, RotateCcw, MapPin } from 'lucide-react';
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

// ============================================================
// PANTALLA DEL ASISTENTE — interfaz del motor local de IA
// ============================================================
// Conversa con el usuario en dos modos:
//  - Flujo guiado: pregunta días, intereses, presupuesto, grupo
//    y arma una ruta personalizada explicando su razonamiento.
//  - Texto libre: responde preguntas sueltas sobre lugares,
//    comida, transporte, clima, etc.
// Todo corre offline con el motor de lib/chatbot.ts
// ============================================================

interface Props {
  onVerLugar: (lugar: Lugar) => void;
}

export default function ChatAssistant({ onVerLugar }: Props) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([mensajeBienvenida()]);
  const [estado, setEstado] = useState<EstadoChat>('preguntando_dias');
  const [input, setInput] = useState('');
  const [escribiendo, setEscribiendo] = useState(false);

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
        texto: `¡Listo! Te armé una ruta de ${dias.length} ${
          dias.length === 1 ? 'día' : 'días'
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
  function enviarTexto() {
    const texto = input.trim();
    if (!texto) return;
    agregarUsuario(texto);
    setInput('');

    // Durante el flujo guiado, el texto libre se interpreta igual
    // pero damos prioridad a seguir el flujo si está a medias.
    if (estado === 'libre' || estado === 'generando') {
      const respuesta = responderTextoLibre(texto, null);
      responderBot(respuesta, 600);
    } else {
      // Si el usuario escribe en vez de tocar botones, lo guiamos
      const respuesta = responderTextoLibre(texto, null);
      responderBot(respuesta, 600);
      // Y le recordamos que puede usar los botones
      setTimeout(() => {
        setMensajes((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'bot',
            texto:
              'Por cierto, si quieres que te arme una ruta completa, puedes usar los botones de arriba para responderme. 🙂',
            timestamp: Date.now(),
          },
        ]);
      }, 1300);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-jungle-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-jungle-800 to-jungle-950 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
            <Sparkles size={18} />
          </div>
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
          />
        ))}

        {escribiendo && (
          <div className="flex items-center gap-1.5 px-4 py-3 bg-white rounded-2xl rounded-tl-sm w-fit border border-jungle-100">
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
            placeholder="Escribe tu pregunta..."
            inputMode="text"
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="on"
            autoCapitalize="sentences"
            className="flex-1 bg-jungle-50 rounded-full px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-jungle-400 border-0"
          />
          <button
            onClick={enviarTexto}
            disabled={!input.trim()}
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
}: {
  mensaje: MensajeChat;
  interesesTemp: Categoria[];
  estado: EstadoChat;
  onOpcion: (valor: string, label: string) => void;
  onVerLugar: (lugar: Lugar) => void;
}) {
  const esBot = mensaje.role === 'bot';

  return (
    <div className={`flex ${esBot ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[85%] ${esBot ? '' : 'items-end'}`}>
        {/* Texto del mensaje */}
        <div
          className={`px-4 py-2.5 text-sm whitespace-pre-line ${
            esBot
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
                  className={`text-sm px-3 py-2 rounded-xl font-medium transition-colors border ${
                    esDone
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
