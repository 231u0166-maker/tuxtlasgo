import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, RotateCcw } from 'lucide-react';
import {
  mensajeBienvenida,
  mensajeIntereses,
  mensajePresupuesto,
  mensajeGrupo,
  generarRuta,
  responderTextoLibre,
  type MensajeChat,
  type EstadoChat,
  type PreferenciasUsuario,
  type Dias,
  type GrupoViaje,
} from '../lib/chatbot';
import { CATEGORIAS, type Categoria, type Presupuesto, type Lugar } from '../data/lugares';
import PlaceCard from './PlaceCard';
import { db } from '../lib/db';

interface Props {
  onVerLugar: (lugar: Lugar) => void;
}

export default function ChatAssistant({ onVerLugar }: Props) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([mensajeBienvenida()]);
  const [estado, setEstado] = useState<EstadoChat>('preguntando_dias');
  const [prefs, setPrefs] = useState<Partial<PreferenciasUsuario>>({ intereses: [] });
  const [input, setInput] = useState('');
  const [escribiendo, setEscribiendo] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, escribiendo]);

  const agregarMensajeBot = (m: MensajeChat, delayMs = 700) => {
    setEscribiendo(true);
    setTimeout(() => {
      setEscribiendo(false);
      setMensajes((prev) => [...prev, m]);
    }, delayMs);
  };

  const agregarMensajeUsuario = (texto: string) => {
    setMensajes((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        texto,
        timestamp: Date.now(),
      },
    ]);
  };

  const handleOpcion = (valor: string, label: string) => {
    agregarMensajeUsuario(label);

    // === Estado: días ===
    if (estado === 'preguntando_dias') {
      const dias = parseInt(valor, 10) as Dias;
      setPrefs((p) => ({ ...p, dias }));
      setEstado('preguntando_intereses');
      agregarMensajeBot(mensajeIntereses());
      return;
    }

    // === Estado: intereses (multi-select) ===
    if (estado === 'preguntando_intereses') {
      if (valor === '__done__') {
        if (!prefs.intereses || prefs.intereses.length === 0) {
          agregarMensajeBot({
            id: crypto.randomUUID(),
            role: 'bot',
            texto: 'Necesito que escojas al menos un interés para armar tu ruta 😊',
            timestamp: Date.now(),
          });
          // Re-mostrar opciones
          setTimeout(() => agregarMensajeBot(mensajeIntereses(), 400), 1200);
          return;
        }
        setEstado('preguntando_presupuesto');
        agregarMensajeBot(mensajePresupuesto());
        return;
      }
      // Toggle del interés
      const cat = valor as Categoria;
      const yaEsta = prefs.intereses?.includes(cat);
      const nuevos = yaEsta
        ? (prefs.intereses || []).filter((c) => c !== cat)
        : [...(prefs.intereses || []), cat];
      setPrefs((p) => ({ ...p, intereses: nuevos }));
      agregarMensajeBot(
        {
          id: crypto.randomUUID(),
          role: 'bot',
          texto: yaEsta
            ? `Quito "${cat}". Tus intereses: ${nuevos.join(', ') || 'ninguno'}.`
            : `Anoté "${cat}". Tus intereses: ${nuevos.join(', ')}. ¿Algo más? Cuando termines toca "Listo".`,
          opciones: [
            ...CATEGORIAS.filter((c) => !nuevos.includes(c.id)).map((c) => ({
              label: `${c.emoji} ${c.id}`,
              valor: c.id,
            })),
            { label: '✅ Listo, ya escogí', valor: '__done__' },
          ],
          timestamp: Date.now(),
        },
        400
      );
      return;
    }

    // === Estado: presupuesto ===
    if (estado === 'preguntando_presupuesto') {
      setPrefs((p) => ({ ...p, presupuesto: valor as Presupuesto }));
      setEstado('preguntando_grupo');
      agregarMensajeBot(mensajeGrupo());
      return;
    }

    // === Estado: grupo (genera ruta) ===
    if (estado === 'preguntando_grupo') {
      const grupo = valor as GrupoViaje;
      const prefsFinales: PreferenciasUsuario = {
        intereses: prefs.intereses || [],
        presupuesto: prefs.presupuesto || 'medio',
        grupo,
        dias: prefs.dias || 1,
      };
      setPrefs(prefsFinales);
      setEstado('generando');

      agregarMensajeBot(
        {
          id: crypto.randomUUID(),
          role: 'bot',
          texto: '¡Listo! Déjame procesar tus respuestas y armar tu ruta...',
          timestamp: Date.now(),
        },
        500
      );

      setTimeout(() => {
        const ruta = generarRuta(prefsFinales);
        if (ruta.length === 0) {
          agregarMensajeBot(
            {
              id: crypto.randomUUID(),
              role: 'bot',
              texto:
                'No encontré coincidencias con esos filtros. Prueba relajando el presupuesto o ampliando intereses.',
              opciones: [{ label: '🔄 Empezar de nuevo', valor: '__restart__' }],
              timestamp: Date.now(),
            },
            1500
          );
          setEstado('libre');
          return;
        }

        const intro: MensajeChat = {
          id: crypto.randomUUID(),
          role: 'bot',
          texto: `Aquí está tu ruta de ${prefsFinales.dias} día${prefsFinales.dias > 1 ? 's' : ''} en Los Tuxtlas, hecha para ti 🌿`,
          timestamp: Date.now(),
        };
        const mensajesRuta: MensajeChat[] = ruta.map((dia) => ({
          id: crypto.randomUUID(),
          role: 'bot',
          texto: dia.resumen,
          rutaDia: dia,
          lugares: dia.lugares,
          timestamp: Date.now(),
        }));
        // Guardar la ruta en IndexedDB
        db.rutas.add({
          nombre: `Ruta ${prefsFinales.dias}d · ${new Date().toLocaleDateString('es-MX')}`,
          creadaEn: Date.now(),
          dias: ruta.map((d) => ({
            dia: d.dia,
            lugaresIds: d.lugares.map((l) => l.id),
            resumen: d.resumen,
          })),
          prefsJson: JSON.stringify(prefsFinales),
        });

        agregarMensajeBot(intro, 1500);
        mensajesRuta.forEach((m, idx) => {
          setTimeout(() => {
            setMensajes((prev) => [...prev, m]);
          }, 2200 + idx * 600);
        });

        setTimeout(() => {
          agregarMensajeBot(
            {
              id: crypto.randomUUID(),
              role: 'bot',
              texto:
                'Tu ruta quedó guardada en favoritos. ¿Quieres preguntarme algo más? Puedes pedirme "donde comer", "playas cerca" o armar otra ruta.',
              opciones: [{ label: '🔄 Armar otra ruta', valor: '__restart__' }],
              timestamp: Date.now(),
            },
            2200 + mensajesRuta.length * 600 + 500
          );
          setEstado('libre');
        }, 2200 + mensajesRuta.length * 600 + 200);
      }, 1300);
      return;
    }

    // === Estado: libre ===
    if (estado === 'libre') {
      if (valor === '__restart__') {
        setMensajes([mensajeBienvenida()]);
        setEstado('preguntando_dias');
        setPrefs({ intereses: [] });
        return;
      }
      const resp = responderTextoLibre(valor, prefs as PreferenciasUsuario);
      agregarMensajeBot(resp);
    }
  };

  const handleEnviarTexto = () => {
    if (!input.trim()) return;
    const txt = input.trim();
    setInput('');
    agregarMensajeUsuario(txt);

    if (estado === 'libre') {
      const resp = responderTextoLibre(txt, prefs as PreferenciasUsuario);
      agregarMensajeBot(resp);
    } else {
      // Si está en flujo guiado, redirigir a usar botones
      agregarMensajeBot({
        id: crypto.randomUUID(),
        role: 'bot',
        texto: 'Para esta pregunta es más fácil si tocas una de las opciones de arriba 👆',
        timestamp: Date.now(),
      });
    }
  };

  const reiniciar = () => {
    setMensajes([mensajeBienvenida()]);
    setEstado('preguntando_dias');
    setPrefs({ intereses: [] });
  };

  return (
    <div className="flex flex-col h-full bg-jungle-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-jungle-700 to-jungle-800 text-white px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
            <Sparkles className="text-white" size={20} />
          </div>
          <div>
            <div className="font-display font-bold text-lg leading-none">
              Guía TuxtlasGO
            </div>
            <div className="text-xs text-jungle-100 leading-none mt-1">
              ● Asistente offline
            </div>
          </div>
        </div>
        <button
          onClick={reiniciar}
          className="text-xs flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full backdrop-blur"
          title="Reiniciar conversación"
        >
          <RotateCcw size={12} /> Reiniciar
        </button>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {mensajes.map((m) => (
          <div key={m.id}>
            {m.role === 'user' ? (
              <div className="flex justify-end">
                <div className="max-w-[80%] bg-jungle-700 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
                  {m.texto}
                </div>
              </div>
            ) : (
              <div className="flex justify-start">
                <div className="max-w-[90%] space-y-2">
                  <div className="bg-white text-jungle-950 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm shadow-sm">
                    {m.texto}
                  </div>
                  {m.opciones && (
                    <div className="flex flex-wrap gap-2 pl-1">
                      {m.opciones.map((op, i) => (
                        <button
                          key={i}
                          onClick={() => handleOpcion(op.valor, op.label)}
                          className="bg-white border-2 border-jungle-200 hover:border-jungle-400 hover:bg-jungle-50 text-jungle-900 text-sm font-medium px-3 py-2 rounded-xl transition-colors"
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {m.lugares && m.lugares.length > 0 && (
                    <div className="space-y-2 pl-1 pt-1">
                      {m.lugares.map((l) => (
                        <PlaceCard
                          key={l.id}
                          lugar={l}
                          compact
                          onClick={() => onVerLugar(l)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {escribiendo && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-1">
              <span className="typing-dot w-2 h-2 bg-jungle-500 rounded-full inline-block" />
              <span className="typing-dot w-2 h-2 bg-jungle-500 rounded-full inline-block" />
              <span className="typing-dot w-2 h-2 bg-jungle-500 rounded-full inline-block" />
            </div>
          </div>
        )}
        <div ref={finRef} />
      </div>

      {/* Input */}
      <div
        className="bg-white border-t border-jungle-100 p-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0) + 12px)' }}
      >
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEnviarTexto()}
            placeholder={
              estado === 'libre'
                ? 'Pregúntame lo que quieras...'
                : 'Usa los botones arriba 👆'
            }
            className="flex-1 bg-jungle-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 border-0"
            disabled={estado !== 'libre'}
          />
          <button
            onClick={handleEnviarTexto}
            disabled={!input.trim() || estado !== 'libre'}
            className="w-11 h-11 rounded-xl bg-jungle-700 hover:bg-jungle-800 disabled:bg-jungle-200 text-white flex items-center justify-center transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
