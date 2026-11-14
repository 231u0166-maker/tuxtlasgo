// ============================================================
// EVENTOS DE SERVICIO — tracking ligero para "Ganancias y
// estadísticas" del prestador
// ============================================================
// Antes ese panel mostraba $0.00 fijo y ninguna gráfica real —
// aquí se registran los 3 eventos que alimentan las métricas
// pedidas: quién vio el servicio, quién le dio like, y cuántas
// veces lo recomendó el asistente de IA.
//
// Fire-and-forget a propósito: nunca debe bloquear ni afectar la
// experiencia del turista si falla o si está sin conexión — perder
// un evento ocasional no es grave, pero sí lo sería si un fetch
// lento aquí hiciera esperar al usuario.
// ============================================================

import { getToken } from './auth';

// 'unlike' = el visitante quitó el favorito; el servidor le resta ese like.
export type TipoEventoServicio = 'vista' | 'like' | 'unlike' | 'ia_recomendacion';

// Id anónimo y aleatorio de este navegador (no es la cuenta ni dato
// personal). Sirve para que el servidor cuente UNA vista/like/recomendación
// por persona en vez de una por cada vez que se repite la acción.
function idVisitante(): string {
  try {
    let id = localStorage.getItem('tuxtlasgo-visitante');
    if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
      localStorage.setItem('tuxtlasgo-visitante', id);
    }
    return id;
  } catch {
    // Sin localStorage (modo privado estricto): un id por pestaña basta.
    return 'tmp-' + Math.random().toString(36).slice(2, 14);
  }
}

export function registrarEventoServicio(servicioId: number | undefined | null, tipo: TipoEventoServicio) {
  if (!servicioId) return;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Si hay sesión se manda para que el servidor no cuente al dueño del
    // servicio mirando o dando like a su propio negocio.
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    fetch('/api/servicios/aprobados?recurso=evento', {
      method: 'POST',
      headers,
      body: JSON.stringify({ servicio_id: servicioId, tipo, visitante: idVisitante() }),
    }).catch(() => { /* sin conexión — no es crítico */ });
  } catch { /* entornos donde fetch pueda fallar de forma síncrona (raro) */ }
}
