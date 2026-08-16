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

export type TipoEventoServicio = 'vista' | 'like' | 'ia_recomendacion';

export function registrarEventoServicio(servicioId: number | undefined | null, tipo: TipoEventoServicio) {
  if (!servicioId) return;
  try {
    fetch('/api/servicios/aprobados?recurso=evento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servicio_id: servicioId, tipo }),
    }).catch(() => { /* sin conexión — no es crítico */ });
  } catch { /* entornos donde fetch pueda fallar de forma síncrona (raro) */ }
}
