// ============================================================
// useLLM — Hook que maneja el ciclo de vida del LLM offline
// ============================================================
// Encapsula: detección de soporte, carga del modelo (con progreso),
// y la respuesta en streaming. Si el LLM no está listo, la app cae
// limpiamente al motor de reglas de siempre.
// ============================================================

import { useState, useCallback } from 'react';
import type { MensajeChat, PreferenciasUsuario } from '../lib/chatbot';
import {
  soportaWebGPU,
  inicializarLLM,
  responderConLLMStream,
  limpiarMarkdown,
  MODELO_DEFECTO,
} from '../lib/llm';

export type EstadoLLM =
  | 'inactivo'     // soportado pero aún no descargado
  | 'cargando'     // descargando/compilando el modelo
  | 'listo'        // corriendo, puede responder
  | 'sin_soporte'  // el dispositivo no tiene WebGPU
  | 'error';

export function useLLM() {
  const [estado, setEstado] = useState<EstadoLLM>(
    soportaWebGPU() ? 'inactivo' : 'sin_soporte'
  );
  // 0..1 — para una barra de progreso durante la descarga
  const [progreso, setProgreso] = useState(0);

  // Dispara la descarga del modelo. Devuelve true si quedó listo.
  // (Devolver el booleano evita leer estado de React desactualizado
  //  justo después del await.)
  const activar = useCallback(
    async (modelo: string = MODELO_DEFECTO): Promise<boolean> => {
      if (!soportaWebGPU()) {
        setEstado('sin_soporte');
        return false;
      }
      setEstado('cargando');
      setProgreso(0);
      try {
        await inicializarLLM(({ progreso }) => setProgreso(progreso), modelo);
        setEstado('listo');
        return true;
      } catch (e) {
        setEstado(String(e).includes('SIN_WEBGPU') ? 'sin_soporte' : 'error');
        return false;
      }
    },
    []
  );

  // Responde en streaming: llama onToken con el texto ACUMULADO (ya
  // limpio de markdown) en cada fragmento, para pintarlo en vivo.
  const responder = useCallback(
    async (
      texto: string,
      historial: MensajeChat[],
      onToken: (acumulado: string) => void,
      prefs?: Partial<PreferenciasUsuario>
    ): Promise<string> => {
      let acc = '';
      for await (const frag of responderConLLMStream(texto, historial, prefs)) {
        acc += frag;
        onToken(limpiarMarkdown(acc));
      }
      return limpiarMarkdown(acc);
    },
    []
  );

  return {
    estado,
    progreso,
    activar,
    responder,
    listo: estado === 'listo',
  };
}
