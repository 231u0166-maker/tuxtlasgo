// ============================================================
// useLLM — Hook que maneja el ciclo de vida del LLM offline
// ============================================================
// Encapsula: detección de soporte, carga del modelo (con progreso),
// y la respuesta en streaming. Si el LLM no está listo, la app cae
// limpiamente al motor de reglas de siempre.
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import type { MensajeChat, PreferenciasUsuario } from '../lib/chatbot';
import {
  soportaWebGPU,
  inicializarLLM,
  responderConLLMStream,
  responderConNube,
  nubeDisponible,
  recuperarContexto,
  pareceInventada,
  limpiarMarkdown,
  MODELO_DEFECTO,
} from '../lib/llm';

export type EstadoLLM =
  | 'verificando'  // aún no sabemos si el dispositivo soporta IA avanzada
  | 'inactivo'     // soportado pero aún no descargado
  | 'cargando'     // descargando/compilando el modelo
  | 'listo'        // corriendo, puede responder
  | 'sin_soporte'  // el dispositivo no tiene un adaptador WebGPU real
  | 'error';

// Si la descarga del modelo local no progresa razonablemente rápido
// (señal débil, dispositivo limitado), no tiene sentido dejar al
// usuario esperando media conversación — eso es justo lo que se vio
// en pruebas de campo: 13 minutos antes de caer a reglas. Con este
// tope, a los 25s se da por vencido el intento ACTUAL y se sigue con
// nube/reglas, pero si la descarga termina sola después, se aprovecha
// para el siguiente mensaje (no se cancela ni se tira a la basura).
const TIMEOUT_CARGA_MS = 25_000;

// ─────────────── NOTIFICACIÓN NATIVA DEL TELÉFONO ───────────────
// Para la descarga "sin prisa" (la que dispara el botón del banner):
// puede tardar varios minutos, y si el usuario cambia de pestaña o
// apaga la pantalla, un aviso solo dentro de la página no sirve de
// nada. Usa la Web Notifications API para que el progreso se vea
// como notificación real del sistema — se actualiza in-place usando
// el mismo `tag` (no se acumulan notificaciones nuevas cada vez).
//
// Nota honesta: en iOS/Safari esto requiere que la PWA esté instalada
// a la pantalla de inicio (iOS 16.4+) — en el navegador normal de
// iPhone no funciona, es una limitación de Apple, no de este código.
// En Android funciona directo desde el navegador.
const TAG_NOTIFICACION = 'tuxtlasgo-ia-descarga';
let ultimoPorcentajeNotificado = -1;

async function pedirPermisoNotificaciones(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const resultado = await Notification.requestPermission();
    return resultado === 'granted';
  } catch {
    return false;
  }
}

function notificarProgreso(porcentaje: number) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  // Throttle: solo notifica si avanzó al menos 5 puntos — si no, una
  // descarga con muchos shards pequeños generaría demasiadas
  // actualizaciones de notificación en poco tiempo.
  if (porcentaje < ultimoPorcentajeNotificado + 5 && porcentaje < 100) return;
  ultimoPorcentajeNotificado = porcentaje;
  try {
    new Notification('Preparando guIA…', {
      body: `Descargando IA para uso sin internet — ${porcentaje}%`,
      tag: TAG_NOTIFICACION,
      icon: '/icons/icon-192.png',
      silent: true, // que no truene sonido en cada actualización
    });
  } catch {
    // algunos navegadores restringen crear Notification si la pestaña
    // no tiene foco en ese instante exacto — no es crítico, se pierde
    // solo esa actualización puntual, no rompe la descarga en sí.
  }
}

function notificarFinal(exito: boolean) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(
      exito ? '✅ guIA lista' : '❌ No se pudo descargar guIA',
      {
        body: exito
          ? 'La IA avanzada ya funciona sin necesidad de internet.'
          : 'Vuelve a intentarlo desde la app cuando quieras.',
        tag: TAG_NOTIFICACION,
        icon: '/icons/icon-192.png',
      }
    );
  } catch {
    /* no crítico */
  }
}

export function useLLM() {
  const [estado, setEstado] = useState<EstadoLLM>('verificando');
  // 0..1 — se conserva por si algún día se quiere mostrar, pero la UI
  // actual ya no depende de esto (ver nota en ChatAssistant.tsx).
  const [progreso, setProgreso] = useState(0);
  // Segundos transcurridos desde que se pidió la descarga. WebLLM solo
  // reporta progreso por ARCHIVO COMPLETO descargado (no byte a byte),
  // así que en señal lenta el % puede quedarse legítimamente en 0 por
  // un buen rato mientras baja el primer bloque grande. Este contador
  // SIEMPRE avanza (lo controlamos nosotros con un timer, no WebLLM),
  // así el usuario nunca ve algo que parezca congelado — ver hallazgo
  // real de campo: "el 0% nunca se mueve".
  const [segundosTranscurridos, setSegundosTranscurridos] = useState(0);
  // Mensaje crudo del último fallo al activar — se expone para poder
  // mostrarlo directo en el chat en dispositivos donde no es práctico
  // abrir la consola del navegador (la mayoría de los celulares).
  const [ultimoError, setUltimoError] = useState<string | null>(null);

  // Verifica soporte real (requestAdapter, no solo 'gpu' in navigator)
  // apenas se monta el hook, para que el estado inicial ya sea correcto
  // y no dependamos de que el usuario escriba algo primero.
  useEffect(() => {
    let cancelado = false;
    soportaWebGPU().then((soportado) => {
      if (!cancelado) setEstado((e) => (e === 'verificando' ? (soportado ? 'inactivo' : 'sin_soporte') : e));
    });
    return () => { cancelado = true; };
  }, []);

  // Dispara la descarga del modelo. Devuelve true si quedó listo.
  //
  // opciones.sinPrisa: úsalo cuando el usuario pidió la descarga
  // EXPLÍCITAMENTE (el botón "Descargar ahora" del banner) — ahí no
  // hay ninguna urgencia, así que se espera lo que haga falta (se
  // ha visto hasta ~13 minutos en señal lenta en pruebas de campo
  // reales) mostrando progreso real todo el tiempo, SIN abortar a
  // los 25s. Sin esta bandera (el caso por default, disparado desde
  // el chat a media conversación) sí se usa el tope corto — ahí el
  // usuario está esperando una respuesta YA, no decidió esperar.
  //
  // Antes se usaba el mismo tope de 25s para ambos casos — eso hacía
  // que una descarga voluntaria desde el banner se diera por vencida
  // (para la interfaz) igual de rápido que una urgencia de chat, y
  // el banner desaparecía sin avisar nada — exactamente el bug real
  // reportado en campo.
  const activar = useCallback(
    async (modelo: string = MODELO_DEFECTO, opciones?: { sinPrisa?: boolean }): Promise<boolean> => {
      if (!(await soportaWebGPU())) {
        setEstado('sin_soporte');
        return false;
      }
      setEstado('cargando');
      setProgreso(0);
      setSegundosTranscurridos(0);
      setUltimoError(null);
      const inicioMs = Date.now();
      const ticker = setInterval(
        () => setSegundosTranscurridos(Math.round((Date.now() - inicioMs) / 1000)),
        1000
      );

      const cargaModelo = inicializarLLM(({ progreso, texto }) => {
        // Log crudo — si algún día vuelve a "parecer" congelado, esto
        // dice si de verdad no ha llegado ni un shard (progreso real
        // en 0) o si es un problema de la UI que no repinta.
        console.log(`[TuxtlasGO IA] progreso: ${Math.round(progreso * 100)}% — ${texto}`);
        setProgreso(progreso);
        notificarProgreso(Math.round(progreso * 100));
      }, modelo);

      const marcarListo = () => {
        clearInterval(ticker);
        setEstado('listo');
        notificarFinal(true);
        // La memoria semántica (embeddings) ya NO se inicializa aquí.
        // Se activa desde App.tsx al arrancar la app, sin depender de
        // si el LLM local llega a cargar — ver la nota grande en
        // App.tsx sobre por qué (en celular, el LLM local casi nunca
        // carga, y la búsqueda semántica debe funcionar igual ahí).
      };

      const marcarFallo = (e: unknown) => {
        clearInterval(ticker);
        console.error('[TuxtlasGO IA] No se pudo activar el LLM:', e);
        setUltimoError(String(e).slice(0, 200));
        setEstado(String(e).includes('SIN_WEBGPU') ? 'sin_soporte' : 'error');
        notificarFinal(false);
      };

      // ── Descarga sin prisa (banner) — se espera el resultado real ──
      if (opciones?.sinPrisa) {
        // Se pide permiso de notificación AQUÍ, atado al gesto
        // explícito de tocar "Descargar ahora" — nunca al abrir la
        // app, que sería intrusivo y sin contexto.
        await pedirPermisoNotificaciones();
        ultimoPorcentajeNotificado = -1;
        try {
          await cargaModelo;
          marcarListo();
          return true;
        } catch (e) {
          marcarFallo(e);
          return false;
        }
      }

      // ── Descarga con tope corto (disparada desde el chat) ──
      // Adopción tardía: si la descarga sigue en curso cuando el
      // timeout de abajo ya nos hizo seguir con nube/reglas, y MÁS
      // TARDE termina sola, la aprovechamos para el siguiente mensaje
      // en vez de descartarla — no cuesta nada dejarla terminar.
      cargaModelo.then(marcarListo, (e) =>
        console.warn('[TuxtlasGO IA] Carga de LLM en segundo plano falló:', e)
      );

      try {
        await Promise.race([
          cargaModelo,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT_CARGA_LLM')), TIMEOUT_CARGA_MS)
          ),
        ]);
        marcarListo();
        return true;
      } catch (e) {
        marcarFallo(e);
        return false;
      }
    },
    []
  );

  // Responde en streaming: llama onToken con el texto ACUMULADO (ya
  // limpio de markdown) en cada fragmento, para pintarlo en vivo.
  // Al terminar, valida contra los lugares reales del contexto — si
  // parece inventada (ver pareceInventada en llm.ts), CORRIGE la
  // burbuja ya mostrada en vez de dejar el dato falso en pantalla.
  const responder = useCallback(
    async (
      texto: string,
      historial: MensajeChat[],
      onToken: (acumulado: string) => void,
      prefs?: Partial<PreferenciasUsuario>
    ): Promise<string> => {
      // Se calcula en paralelo al streaming, no después — así no se sesga
      // el tiempo total de respuesta por la validación.
      const ctxPromise = recuperarContexto(texto, prefs);

      let acc = '';
      for await (const frag of responderConLLMStream(texto, historial, prefs)) {
        acc += frag;
        onToken(limpiarMarkdown(acc));
      }
      const limpio = limpiarMarkdown(acc);

      const ctx = await ctxPromise;
      if (pareceInventada(limpio, ctx.lugares)) {
        console.warn(
          '[TuxtlasGO IA] Posible alucinación (local) detectada y corregida:',
          limpio
        );
        const correccion =
          'No encontré un dato verificado exacto para eso en la plataforma. ¿Me lo preguntas de otra forma, o prefieres que te arme una ruta con lo que sí tengo confirmado?';
        onToken(correccion); // sobreescribe la burbuja ya mostrada
        return correccion;
      }
      return limpio;
    },
    []
  );

  // Respaldo en la nube: mismo contexto recuperado, redactado por un
  // modelo en la nube en vez del local. Solo tiene sentido intentarlo
  // cuando el LLM local no está disponible (ver ChatAssistant.tsx).
  // También pasa por la validación anti-alucinación (ver llm.ts).
  const responderNube = useCallback(
    (texto: string, historial: MensajeChat[], prefs?: Partial<PreferenciasUsuario>) =>
      responderConNube(texto, historial, prefs),
    []
  );

  return {
    estado,
    progreso,
    segundosTranscurridos,
    ultimoError,
    activar,
    responder,
    responderNube,
    nubeDisponible,
    listo: estado === 'listo',
  };
}