import { useState, useRef, useEffect, useMemo } from 'react';
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
  extraerPreferenciasLibres,
  pareceSolicitudDeRuta,
  pareceSolicitudDeDistancia,
  esSolicitudInapropiada,
  detectarMunicipio,
  buscarLugarPorNombre,
  getCatalogoActivo,
  extraerPresupuestoLiteral,
  estimarPrecioMXN,
  formatearMXN,
  extraerGrupoLiteral,
  grupoTextoLegible,
} from '../lib/chatbot';

import { guardarRuta, mapaDescargado } from '../lib/db';
import { buscarRespuestaVerificada } from '../lib/embeddings';
import {
  obtenerUbicacionGPS,
  obtenerRutaPorCarretera,
  formatearDuracion,
  formatearDistancia,
} from '../lib/routing';
import { useOffline } from '../hooks/useOffline';
import MiniMapaChat from './MiniMapaChat';
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
  // para que cualquier pestaña use el mismo estado de la nube.
  llm: ReturnType<typeof useLLM>;
}

export default function ChatAssistant({ onVerLugar, onVerRutaEnMapa, llm }: Props) {
  // Se usa para decidir si intentar el cálculo de distancia/tiempo en
  // vivo desde la ubicación del turista — ver nota junto a
  // pareceSolicitudDeDistancia más abajo: ese cálculo SIEMPRE necesita
  // internet (GPS + una llamada real de ruteo), a propósito.
  const offline = useOffline();

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
  // Hallazgo real de campo GRAVE: antes se usaba mensajes.indexOf(msg)
  // (la POSICIÓN del mensaje en el arreglo) como identificador de "esta
  // ruta ya se guardó" — pero las posiciones se REPITEN después de
  // reiniciar la conversación (el chat nunca se desmonta, así que este
  // estado sobrevivía entre resets), y reiniciar() nunca lo limpiaba.
  // Resultado: si se guardó una ruta en la posición 5 alguna vez, la
  // siguiente conversación mostraba "ya guardada" en esa MISMA
  // posición sin haberla guardado de verdad — y como el botón real de
  // guardar nunca aparecía, el guardado real en la base de datos
  // tampoco ocurría nunca. Se usa el `id` (UUID) propio de cada
  // mensaje, que nunca se repite entre conversaciones.
  const [rutasGuardadas, setRutasGuardadas] = useState<Set<string>>(new Set());
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
  // Mientras se espera que el turista elija cuál de varios lugares
  // ambiguos quiso decir — se guarda el texto ORIGINAL (para revisar
  // si además pedía distancia/tiempo) y las opciones que se le
  // mostraron (para poder recordar su elección después).
  const [ambiguedadPendiente, setAmbiguedadPendiente] = useState<{
    texto: string;
    opciones: Lugar[];
  } | null>(null);
  // Memoria de desambiguaciones YA resueltas en ESTA conversación —
  // hallazgo real de campo: sin esto, preguntar por "la bicicleta" dos
  // veces en el mismo chat hacía la MISMA pregunta de "¿cuál?" dos
  // veces, aunque ya se hubiera aclarado la primera vez. La clave es
  // el conjunto de IDs empatados (orden fijo, join simple) — así que
  // funciona igual para cualquier futuro empate, no solo este caso.
  const [eleccionesDesambiguadas, setEleccionesDesambiguadas] = useState<
    Record<string, string>
  >({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ─────────── Ventana de "mapas vivos" (WebGL) ───────────
  // Antes solo el ÚLTIMO mensaje del chat tenía mini-mapa. Eso se
  // rompía con las rutas de varios días: cada día se manda como un
  // mensaje NUEVO y separado (ver generarYMostrarRuta), así que en
  // cuanto llegaba el mensaje del Día 2, el mapa del Día 1 se
  // desmontaba de golpe — se veía como una animación que "aparece y
  // se borra sola", pero en realidad el mapa se estaba quitando de
  // verdad.
  //
  // Corrección: en vez de "solo el último mensaje", se mantienen
  // vivos los mapas de los últimos 3 mensajes que traen lugares o
  // rutaDia — 3 porque ese es el máximo de días que puede tener una
  // ruta (Dias = 1 | 2 | 3). Así, TODOS los días de una ruta recién
  // generada quedan con su mapa visible a la vez, sin parpadeos. El
  // límite sigue existiendo (para no acumular contextos WebGL sin
  // fin en una conversación larga) — solo se van "apagando" mapas
  // viejos cuando aparece contenido nuevo con mapa más adelante
  // (otra ruta, otra búsqueda), no en cada mensaje de texto suelto.
  const mapasVivos = useMemo(() => {
    const idsConMapa = mensajes
      .filter((m) => (m.lugares && m.lugares.length > 0) || m.rutaDia)
      .map((m) => m.id);
    return new Set(idsConMapa.slice(-3));
  }, [mensajes]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [mensajes, escribiendo]);

  // Un <input> normal nunca hace salto de línea, solo se desborda
  // horizontalmente sin importar el CSS que se le ponga — por eso se
  // cambió a <textarea>. Esto la hace crecer sola conforme el texto
  // ocupa más líneas, hasta un tope (120px) — después de eso, se
  // vuelve desplazable en vez de seguir creciendo sin límite.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);
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

  // Ya se sabe EXACTAMENTE de qué lugar se trata (sea porque
  // buscarLugarPorNombre lo resolvió directo, o porque el turista
  // acaba de elegir entre opciones ambiguas) — decide si lo que
  // preguntó originalmente era "cuánto tiempo/distancia desde mi
  // ubicación" o simplemente "cuéntame de este lugar".
  async function responderSobreLugar(lugar: Lugar, textoOriginal: string) {
    if (pareceSolicitudDeDistancia(textoOriginal)) {
      if (offline) {
        responderBot(
          {
            id: crypto.randomUUID(),
            role: 'bot',
            texto: `Para calcularte el tiempo y la distancia exactos hasta ${lugar.nombre} necesito internet (uso tu ubicación y calculo la ruta real). Conéctate un momento, o revisa "Cómo llegar" desde su ficha en el mapa.`,
            lugares: [lugar],
            timestamp: Date.now(),
          },
          300
        );
        return;
      }

      responderBot(
        {
          id: crypto.randomUUID(),
          role: 'bot',
          texto: 'Dame un momento, calculando desde tu ubicación...',
          timestamp: Date.now(),
        },
        200
      );

      const miUbicacion = await obtenerUbicacionGPS().catch(() => null);
      if (!miUbicacion) {
        responderBot(
          {
            id: crypto.randomUUID(),
            role: 'bot',
            texto: `No pude obtener tu ubicación — revisa que le hayas dado permiso al navegador. Mientras tanto, aquí tienes ${lugar.nombre}:`,
            lugares: [lugar],
            timestamp: Date.now(),
          },
          400
        );
        return;
      }

      try {
        const ruta = await obtenerRutaPorCarretera([miUbicacion.coord, lugar.coords]);
        responderBot(
          {
            id: crypto.randomUUID(),
            role: 'bot',
            texto: `Desde tu ubicación actual hasta ${lugar.nombre} hay ${formatearDistancia(ruta.distanciaMetros)} — unos ${formatearDuracion(ruta.duracionSegundos)} en coche.`,
            lugares: [lugar],
            ubicacionUsuario: miUbicacion.coord,
            rutaGeometria: ruta.geometria,
            timestamp: Date.now(),
          },
          400
        );
      } catch {
        responderBot(
          {
            id: crypto.randomUUID(),
            role: 'bot',
            texto: `No pude calcular la ruta ahora mismo. Aquí tienes ${lugar.nombre} — puedes intentar "Cómo llegar" desde su ficha en el mapa.`,
            lugares: [lugar],
            timestamp: Date.now(),
          },
          400
        );
      }
      return;
    }

    // Hallazgo real de campo: una vez que se identificaba el lugar
    // por nombre, CUALQUIER otra cosa que preguntaran sobre él en el
    // mismo mensaje se ignoraba por completo — "con 400 pesos qué me
    // alcanza en la Sirena Olmeca" o "qué actividades con mis hijos
    // en Sirena Olmeca" solo mostraban la tarjeta genérica, sin
    // responder nada, una y otra vez. Se reusa la MISMA lógica ya
    // construida para presupuesto/grupo (antes solo se usaba para
    // listas de varios lugares), aplicada aquí a este único lugar.

    const presupuestoPregunta = extraerPresupuestoLiteral(textoOriginal, 1);
    if (presupuestoPregunta) {
      const estimado = estimarPrecioMXN(lugar.precioMxn);
      let texto: string;
      if (estimado === null) {
        texto = `${lugar.nombre} tiene varios conceptos de precio distintos (revisa su ficha) — no tengo un número único para comparar contra ${formatearMXN(presupuestoPregunta.monto)}, así que no te puedo confirmar con certeza si alcanza.`;
      } else if (estimado <= presupuestoPregunta.monto) {
        texto = `Sí — ${lugar.nombre} ronda ${formatearMXN(estimado)}, así que con ${formatearMXN(presupuestoPregunta.monto)} te alcanza.`;
      } else {
        texto = `Con ${formatearMXN(presupuestoPregunta.monto)} no te alcanza — ${lugar.nombre} ronda ${formatearMXN(estimado)}.`;
      }
      responderBot(
        { id: crypto.randomUUID(), role: 'bot', texto, lugares: [lugar], timestamp: Date.now() },
        300
      );
      return;
    }

    const grupoPregunta = extraerGrupoLiteral(textoOriginal);
    if (grupoPregunta) {
      const texto = lugar.ideal.includes(grupoPregunta)
        ? `Sí — ${lugar.nombre} está marcado como una buena opción para ${grupoTextoLegible(grupoPregunta)}. ${lugar.descripcion}`
        : `${lugar.nombre} no está marcado específicamente como ideal para ${grupoTextoLegible(grupoPregunta)} — no tengo el detalle exacto para confirmarte si aplica, revisa su ficha completa antes de decidir. Lo que sí tengo: ${lugar.descripcionCorta}`;
      responderBot(
        { id: crypto.randomUUID(), role: 'bot', texto, lugares: [lugar], timestamp: Date.now() },
        300
      );
      return;
    }

    // Ni distancia, ni presupuesto, ni grupo detectado — pero el
    // mensaje puede seguir teniendo una pregunta real más allá de
    // solo nombrar el lugar (ej. "es mejor como hotel o restaurante",
    // "es peligroso para mis hijos"). En vez de mostrar siempre el
    // blurb corto de la tarjeta (que no responde nada), si el mensaje
    // tiene bastante más contenido que un simple "dame info de X", se
    // usa la descripción COMPLETA — no siempre va a responder
    // exactamente lo preguntado (no tenemos NLU para comparaciones
    // libres), pero da mucha más información real que el blurb corto,
    // y nunca es peor que lo que había antes.
    const palabras = textoOriginal.trim().split(/\s+/).filter(Boolean);
    if (palabras.length > 6) {
      responderBot(
        {
          id: crypto.randomUUID(),
          role: 'bot',
          texto: `${lugar.nombre}: ${lugar.descripcion}${lugar.tip ? ` 💡 ${lugar.tip}` : ''}`,
          lugares: [lugar],
          timestamp: Date.now(),
        },
        300
      );
      return;
    }

    const intros = [
      `Esto es lo que tengo de ${lugar.nombre}:`,
      `${lugar.nombre} — aquí tienes los detalles:`,
      `Mira, esto es ${lugar.nombre}:`,
    ];
    responderBot(
      {
        id: crypto.randomUUID(),
        role: 'bot',
        texto: intros[Math.floor(Math.random() * intros.length)],
        lugares: [lugar],
        timestamp: Date.now(),
      },
      300
    );
  }

  // Reinicia toda la conversación
  function reiniciar() {
    setMensajes([mensajeBienvenida()]);
    try { sessionStorage.removeItem('tuxtlasgo-chat'); sessionStorage.removeItem('tuxtlasgo-chat-estado'); } catch { /* ok */ }
    setEstado('preguntando_dias');
    setPrefsParcial({});
    setInteresesTemp([]);
    setRutasGuardadas(new Set());
  }

  // ─────────── Manejo de opciones tocadas (botones) ───────────
  function manejarOpcion(valor: string, label: string) {
    // Casos especiales
    if (valor === '__restart__') {
      agregarUsuario(label);
      reiniciar();
      return;
    }

    // El turista eligió cuál de los lugares ambiguos quiso decir
    // (ver 'ambiguo' en buscarLugarPorNombre). Se usa el texto
    // ORIGINAL guardado para saber si además pedía distancia/tiempo,
    // y se RECUERDA la elección para no volver a preguntar si el
    // mismo empate aparece de nuevo en esta misma conversación.
    if (valor.startsWith('desambiguar_lugar:')) {
      agregarUsuario(label);
      const id = valor.slice('desambiguar_lugar:'.length);
      const lugar = getCatalogoActivo().find((l) => l.id === id);
      const pendiente = ambiguedadPendiente;
      setAmbiguedadPendiente(null);
      if (lugar && pendiente) {
        const clave = pendiente.opciones.map((o) => o.id).sort().join(',');
        setEleccionesDesambiguadas((prev) => ({ ...prev, [clave]: lugar.id }));
        responderSobreLugar(lugar, pendiente.texto);
      }
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
    // Hallazgo real de campo (QA): "quiero un recorrido de aventura de
    // 2 días" con un solo lugar de categoría Aventura registrado
    // generaba una ruta de 1 solo día, EN SILENCIO — el mensaje solo
    // mencionaba el número de días que sí se lograron armar, sin decir
    // nunca que se quedó corto contra lo pedido. Eso se siente como
    // que la IA "no entendió cuántos días pedí" cuando en realidad es
    // que el catálogo de esa categoría todavía es chico. Se avisa la
    // diferencia explícitamente, igual que ya se hace con los
    // "supuestos" cuando no quedó claro algo del mensaje.
    const diasIncompletos = dias.length < prefs.dias;
    responderBot(
      {
        id: crypto.randomUUID(),
        role: 'bot',
        texto: diasIncompletos
          ? `Con lo que tengo registrado por ahora, solo pude armarte ${dias.length} ${dias.length === 1 ? 'día completo' : 'días completos'} (pediste ${prefs.dias}) — no tengo más lugares de esa categoría o presupuesto todavía. Aquí va lo que sí tengo, día por día:`
          : `¡Listo! Te armé una ruta de ${dias.length} ${dias.length === 1 ? 'día' : 'días'
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
  // ─────────── Envío de texto libre ───────────
  // El texto libre SIEMPRE intenta una respuesta inteligente sin
  // importar en qué paso del flujo guiado estemos — los botones
  // siguen ahí como atajo, pero ya no son la única puerta. Orden de
  // intentos, de más a menos confiable:
  //   1) Banco de respuestas verificado (embeddings semánticos) — si
  //      hay coincidencia fuerte, responde con texto ya redactado y
  //      aprobado por una persona. Cero riesgo de alucinación.
  //   2) ¿Suena a pedir una ruta? Se extraen días/presupuesto/grupo/
  //      intereses del propio texto libre (ver extraerPreferenciasLibres
  //      en chatbot.ts) y se genera la ruta directo, sin esperar a que
  //      toquen los botones uno por uno.
  //   3) Nube (Groq), si hay internet — mismo contexto recuperado,
  //      redactado por un modelo en la nube, con la misma validación
  //      anti-alucinación.
  //   4) Motor de reglas — siempre disponible, sin excepción.
  async function enviarTexto() {
    const texto = input.trim();
    if (!texto || generandoIA) return; // no encimar mientras genera
    agregarUsuario(texto);
    setInput('');
    setGenerandoIA(true);

    try {
      // 0) Filtro de seguridad — SIEMPRE lo primero, antes de
      // CUALQUIER otra cosa (banco de respuestas, nombre de lugar,
      // generador de rutas, nube). Ver el hallazgo real de campo
      // grave junto a esSolicitudInapropiada() en chatbot.ts.
      if (esSolicitudInapropiada(texto)) {
        responderBot(
          {
            id: crypto.randomUUID(),
            role: 'bot',
            texto: 'No puedo ayudarte con eso. Soy un asistente turístico de Los Tuxtlas — puedo ayudarte a armar rutas, recomendarte dónde comer, dónde hospedarte o qué conocer en la región.',
            timestamp: Date.now(),
          },
          200
        );
        return;
      }

      // 1) Banco de respuestas primero — sin generar nada, sin GPU,
      // sin internet, funciona en cualquier dispositivo.
      const coincidencia = await buscarRespuestaVerificada(texto).catch(() => null);
      if (coincidencia) {
        responderBot(
          {
            id: crypto.randomUUID(),
            role: 'bot',
            texto: coincidencia.texto,
            timestamp: Date.now(),
          },
          300
        );
        return;
      }

      // 2) ¿Está preguntando por UN lugar específico por nombre? (ej.
      // "quiero ir a Margiros", "qué hay en Nanciyaga"). A diferencia
      // de una categoría general ("un restaurante"), aquí sí sabemos
      // EXACTAMENTE de cuál lugar habla — así que se resuelve directo
      // a su tarjeta (imagen + descripción real), sin pasar por nube
      // ni por reglas genéricas. Cero riesgo de alucinación (son sus
      // datos reales del catálogo) y funciona sin internet.
      const resultadoNombre = buscarLugarPorNombre(texto, getCatalogoActivo());

      if (resultadoNombre.tipo === 'unico') {
        await responderSobreLugar(resultadoNombre.lugar, texto);
        return;
      }

      // Hallazgo real de campo: "bicicleta" empata entre "La
      // Bicicleta Café" (San Andrés Tuxtla) y "Bicicleta nueva
      // sucursal" (Catemaco) — dos negocios reales distintos. Antes,
      // este empate se trataba como "no encontré nada" y el mensaje
      // caía en silencio hacia la nube, que sin ubicación real ni
      // motor de rutas terminaba INVENTANDO distancias y hasta el
      // municipio del lugar. Ahora se pregunta directo, con botones —
      // y si ese MISMO empate ya se aclaró antes en esta conversación,
      // no se vuelve a preguntar: se usa la elección de la vez pasada.
      if (resultadoNombre.tipo === 'ambiguo') {
        const clave = resultadoNombre.opciones.map((l) => l.id).sort().join(',');
        const idRecordado = eleccionesDesambiguadas[clave];
        const lugarRecordado = idRecordado
          ? resultadoNombre.opciones.find((l) => l.id === idRecordado)
          : undefined;

        if (lugarRecordado) {
          await responderSobreLugar(lugarRecordado, texto);
          return;
        }

        setAmbiguedadPendiente({ texto, opciones: resultadoNombre.opciones });
        responderBot(
          {
            id: crypto.randomUUID(),
            role: 'bot',
            texto: 'Tengo más de un lugar que podría ser ese — ¿a cuál te refieres?',
            opciones: resultadoNombre.opciones.map((l) => ({
              label: `${l.nombre} (${l.municipio})`,
              valor: `desambiguar_lugar:${l.id}`,
            })),
            timestamp: Date.now(),
          },
          300
        );
        return;
      }

      // 2) ¿Suena a pedir una ruta? Dos señales, cualquiera activa:
      // (a) palabras clave explícitas ("arma una ruta"), o
      // (b) se detectaron DÍAS (la señal ancla de "esto es un viaje de
      // varios días") junto con al menos otra preferencia (grupo o
      // presupuesto) — esto es lo que de verdad hace falta para el
      // caso real que motivó esto: "quiero un fin de semana tranquilo,
      // gastando poco, con mi pareja" no usa NINGUNA palabra como
      // "ruta" o "recomiéndame", así que depender solo de palabras
      // clave lo dejaba pasar de largo.
      //
      // Hallazgo real de campo: antes bastaba con CUALQUIER 3 campos
      // extraídos, sin importar cuáles — y como categoría+presupuesto
      // se extraen casi de cualquier pregunta con un peso mencionado,
      // "¿hay un hotel en Catemaco que no supere los $3,000?" (una
      // pregunta de sí/no, no un pedido de viaje) también disparaba el
      // generador de rutas de varios días. Ahora `dias` es la señal
      // OBLIGATORIA — sin un día (o "fin de semana"/"una semana", vía
      // los ejemplos semánticos) detectado, no hay ruta, sin importar
      // cuántos otros campos se hayan extraído.
      const extraidas = await extraerPreferenciasLibres(texto).catch(
        () => ({} as Partial<PreferenciasUsuario>)
      );
      const otrasSenalesDeViaje = [
        extraidas.grupo !== undefined,
        extraidas.presupuesto !== undefined,
      ].filter(Boolean).length;
      const sueneAViajeCompleto =
        extraidas.dias !== undefined && otrasSenalesDeViaje >= 1;

      if (pareceSolicitudDeRuta(texto) || sueneAViajeCompleto) {
        const diasFinal = extraidas.dias ?? prefsParcial.dias ?? 2;
        const interesesFinal = extraidas.intereses ?? prefsParcial.intereses ?? ['Naturaleza'];
        const presupuestoFinal = extraidas.presupuesto ?? prefsParcial.presupuesto ?? 'medio';
        const grupoFinal = extraidas.grupo ?? prefsParcial.grupo ?? 'pareja';
        // Municipio: detección por palabra clave ya existente (no
        // necesita el modelo de embeddings) — tolerante a errores de
        // escritura vía pln.ts. Es opcional a propósito: si no se
        // menciona ninguno, la ruta sigue repartiendo entre varios
        // municipios como siempre.
        const municipioDetectado = detectarMunicipio(texto) ?? undefined;

        const prefsCompletas: PreferenciasUsuario = {
          dias: diasFinal,
          intereses: interesesFinal,
          presupuesto: presupuestoFinal,
          grupo: grupoFinal,
          municipio: municipioDetectado,
          // Hallazgo real de campo: los otros campos (días, intereses,
          // presupuesto, grupo) sí se heredaban del mensaje anterior si
          // no se repetían — pero este no, así que "3 días, $6,000" y
          // luego "ahora en pareja" perdía el monto exacto en pesos
          // aunque sí recordaba los días. Ahora es consistente con los
          // demás: si no se menciona de nuevo, se usa el de antes.
          montoTotalPesos: extraidas.montoTotalPesos ?? prefsParcial.montoTotalPesos,
        };

        // Transparencia: hallazgo real de campo — "quisiera solo una
        // ruta en catemaco, para comer en un restaurante solo" dio una
        // ruta "en pareja" sin avisar nada, porque esos campos no se
        // extrajeron con confianza y se completaron con un valor por
        // default EN SILENCIO. Un supuesto equivocado sin avisar se
        // siente como que el sistema "no entendió nada" — avisando
        // qué se asumió, el turista lo ve de inmediato y lo corrige
        // en el siguiente mensaje, en vez de quedarse con la duda.
        const supuestos: string[] = [];
        if (extraidas.dias === undefined && prefsParcial.dias === undefined) {
          supuestos.push(`${diasFinal} día${diasFinal > 1 ? 's' : ''}`);
        }
        if (extraidas.intereses === undefined && prefsParcial.intereses === undefined) {
          supuestos.push(`interés en ${interesesFinal.join(', ').toLowerCase()}`);
        }
        if (extraidas.presupuesto === undefined && prefsParcial.presupuesto === undefined) {
          supuestos.push(`presupuesto ${presupuestoFinal}`);
        }
        if (extraidas.grupo === undefined && prefsParcial.grupo === undefined) {
          supuestos.push(`que viajas ${grupoFinal}`);
        }

        setPrefsParcial(prefsCompletas);
        setEstado('generando');

        if (supuestos.length > 0) {
          responderBot(
            {
              id: crypto.randomUUID(),
              role: 'bot',
              texto: `No me quedó claro todo de tu mensaje, así que asumí: ${supuestos.join(' · ')}. Si algo no es correcto, dime y ajusto la ruta.`,
              timestamp: Date.now(),
            },
            200
          );
        }

        generarYMostrarRuta(prefsCompletas);
        return;
      }

      // 3) Nube si hay internet — mismo contexto, modelo distinto.
      if (llm.nubeDisponible()) {
        setEscribiendo(true);
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
            // La nube también puede alucinar (menos seguido, pero
            // pasa) — si la validación la descarta, no dejamos una
            // burbuja vacía: caemos al motor de reglas para ESTE
            // mensaje, que nunca inventa datos.
            console.warn('[TuxtlasGO IA] Respuesta de nube descartada por posible alucinación');
            responderBot(responderTextoLibre(texto, null), 200);
          }
        } catch (e) {
          console.error('[TuxtlasGO IA] Nube falló, cae a reglas:', e);
          setEscribiendo(false);
          responderBot(responderTextoLibre(texto, null), 300);
        }
        return;
      }

      // 4) Sin internet → motor de reglas, siempre disponible.
      responderBot(responderTextoLibre(texto, null), 400);
    } catch (err) {
      // Si algo truena a media respuesta, no dejamos la burbuja a medias:
      // caemos al motor de reglas.
      console.error('Error generando respuesta:', err);
      setEscribiendo(false);
      responderBot(responderTextoLibre(texto, null), 200);
    } finally {
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
            mapaVivo={mapasVivos.has(msg.id)}
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
              setRutasGuardadas(prev => new Set([...prev, msg.id]));
            }}
            rutaYaGuardada={rutasGuardadas.has(msg.id)}
          />
        ))}

        {escribiendo && (
          <div className="flex flex-col gap-1.5 px-4 py-3 bg-white rounded-2xl rounded-tl-sm w-fit min-w-[180px] border border-jungle-100">
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
      <div
        className="px-3 pt-3 bg-white border-t border-jungle-100 flex-shrink-0 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía; Shift+Enter inserta un salto de línea —
              // mismo patrón que WhatsApp/Telegram, para no perder la
              // posibilidad de escribir párrafos largos.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enviarTexto();
              }
            }}
            placeholder={generandoIA ? 'Pensando…' : 'Escribe tu pregunta...'}
            disabled={generandoIA}
            rows={1}
            inputMode="text"
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="on"
            autoCapitalize="sentences"
            className="flex-1 min-w-0 bg-jungle-50 rounded-2xl px-4 py-3 text-base leading-snug resize-none overflow-y-auto max-h-[120px] focus:outline-none focus:ring-2 focus:ring-jungle-400 border-0 disabled:opacity-60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
  mapaVivo,
  onOpcion,
  onVerLugar,
  onVerRutaEnMapa,
  onGuardarRuta,
  rutaYaGuardada,
}: {
  mensaje: MensajeChat;
  interesesTemp: Categoria[];
  estado: EstadoChat;
  // true si este mensaje está dentro de la ventana de "mapas vivos"
  // (últimos 3 mensajes con lugares/rutaDia) — ver nota de
  // rendimiento en MiniMapaChat.tsx y en ChatAssistant.tsx.
  mapaVivo: boolean;
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
            {mapaVivo && (
              <MiniMapaChat
                lugares={mensaje.lugares}
                origen={mensaje.ubicacionUsuario}
                rutaReal={mensaje.rutaGeometria}
                onVerLugar={onVerLugar}
              />
            )}
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
            {mapaVivo && (
              <div className="px-2 pt-2">
                <MiniMapaChat
                  lugares={mensaje.rutaDia.lugares}
                  numerado
                  onVerLugar={onVerLugar}
                />
              </div>
            )}
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