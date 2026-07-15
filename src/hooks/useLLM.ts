// ============================================================
// useLLM — Hook de generación (nube), tras retirar el LLM local
// ============================================================
// Antes este hook manejaba todo el ciclo de vida del LLM local en
// navegador (detección de WebGPU, descarga, streaming, notificaciones
// de progreso). Se retiró por completo tras confirmar en pruebas de
// campo reales que fallaba en TODOS los dispositivos móviles
// probados — ver la nota grande en src/lib/llm.ts para el detalle
// completo de la evidencia. Lo que queda aquí es exactamente lo que
// sí demostró funcionar en cualquier dispositivo: la nube.
// ============================================================

import { useCallback } from 'react';
import type { MensajeChat, PreferenciasUsuario } from '../lib/chatbot';
import { responderConNube, nubeDisponible } from '../lib/llm';

export function useLLM() {
  // Respaldo en la nube: mismo contexto recuperado (ver
  // recuperarContexto en llm.ts), redactado por un modelo en la nube.
  // Pasa por la validación anti-alucinación antes de devolver texto.
  const responderNube = useCallback(
    (texto: string, historial: MensajeChat[], prefs?: Partial<PreferenciasUsuario>) =>
      responderConNube(texto, historial, prefs),
    []
  );

  return {
    responderNube,
    nubeDisponible,
  };
}