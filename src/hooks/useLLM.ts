// ============================================================
// useLLM — Hook que maneja el ciclo de vida del LLM offline
// ============================================================
// Encapsula: detección de soporte, carga del modelo (con progreso),
// y la respuesta en streaming. Si el LLM no está listo, la app cae
// limpiamente al motor de reglas de siempre.
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import type { MensajeChat, PreferenciasUsuario } from '../lib/chatbot';
import { getCatalogoActivo } from '../lib/chatbot';
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
import { inicializarEmbeddings, indexarCatalogo } from '../lib/embeddings';

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
  // (Devolver el booleano evita leer estado de React desactualizado
  //  justo después del await.)
  const activar = useCallback(
    async (modelo: string = MODELO_DEFECTO): Promise<boolean> => {
      if (!(await soportaWebGPU())) {
        setEstado('sin_soporte');
        return false;
      }
      setEstado('cargando');
      setProgreso(0);
      setSegundosTranscurridos(0);
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
      }, modelo);

      const marcarListo = () => {
        setEstado('listo');
        // Memoria semántica (embeddings): modelo ligero (~30MB) que corre
        // en WASM sin requerir WebGPU. Se carga e indexa en segundo plano
        // — si tarda o falla, el chat sigue funcionando solo con LLM +
        // reglas, no bloquea la conversación (ver embeddingsListo() en
        // llm.ts, que degrada con gracia si aún no está listo).
        inicializarEmbeddings()
          .then(() => indexarCatalogo(getCatalogoActivo()))
          .catch((e) => console.warn('Embeddings no disponibles:', e));
      };

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
        clearInterval(ticker);
        marcarListo();
        return true;
      } catch (e) {
        clearInterval(ticker);
        // Log explícito — antes este error se perdía en silencio y
        // parecía que "no pasaba nada" en vez de fallar de verdad.
        console.error('[TuxtlasGO IA] No se pudo activar el LLM a tiempo:', e);
        setEstado(String(e).includes('SIN_WEBGPU') ? 'sin_soporte' : 'error');
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
    activar,
    responder,
    responderNube,
    nubeDisponible,
    listo: estado === 'listo',
  };
}
