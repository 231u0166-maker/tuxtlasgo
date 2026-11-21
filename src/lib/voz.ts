// ============================================================
// VOZ PARA LA NAVEGACIÓN — sin descargar nada
// ============================================================
// Usa las voces que ya trae el teléfono (Web Speech API). Las voces "locales"
// funcionan SIN internet y no suman peso a la app. Límite honesto: si el
// teléfono no tiene voz en español instalada, no se puede hablar bien; en ese
// caso la app lo avisa en vez de leer en español con acento de otro idioma.
// ============================================================

const CLAVE_SILENCIO = 'navegacion-voz-silenciada';

export function vozDisponible(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function vozSilenciada(): boolean {
  try { return localStorage.getItem(CLAVE_SILENCIO) === 'true'; } catch { return false; }
}
export function silenciarVoz(si: boolean) {
  try { localStorage.setItem(CLAVE_SILENCIO, String(si)); } catch { /* nada */ }
  if (si && vozDisponible()) window.speechSynthesis.cancel();
}

// Mejor voz en español disponible: primero es-MX, luego otras es-*, y
// prefiriendo las locales (sirven sin internet).
function elegirVoz(): SpeechSynthesisVoice | null {
  if (!vozDisponible()) return null;
  const voces = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'));
  if (voces.length === 0) return null;
  const puntaje = (v: SpeechSynthesisVoice) =>
    (v.lang.toLowerCase().replace('_', '-') === 'es-mx' ? 4 : 0) +
    (v.lang.toLowerCase().startsWith('es-us') ? 2 : 0) +
    (v.localService ? 3 : 0);
  return voces.sort((a, b) => puntaje(b) - puntaje(a))[0];
}

// Las voces cargan de forma asíncrona en algunos navegadores
export function precargarVoces(): Promise<boolean> {
  return new Promise((res) => {
    if (!vozDisponible()) return res(false);
    if (window.speechSynthesis.getVoices().length > 0) return res(elegirVoz() !== null);
    const fin = () => res(elegirVoz() !== null);
    window.speechSynthesis.addEventListener('voiceschanged', fin, { once: true });
    window.setTimeout(fin, 1500);
  });
}

export function hayVozEnEspanol(): boolean {
  return elegirVoz() !== null;
}

export function hablar(texto: string, opciones: { urgente?: boolean } = {}) {
  if (!vozDisponible() || vozSilenciada()) return;
  const voz = elegirVoz();
  if (!voz) return;
  const synth = window.speechSynthesis;
  // Lo urgente (giro inmediato, recálculo) interrumpe lo que esté sonando
  if (opciones.urgente) synth.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.voice = voz;
  u.lang = voz.lang;
  u.rate = 1;
  synth.speak(u);
}

export function detenerVoz() {
  if (vozDisponible()) window.speechSynthesis.cancel();
}

// "400 metros", "1.2 kilómetros" — para que se lea natural
export function distanciaHablada(m: number): string {
  if (m >= 950) {
    const km = Math.round(m / 100) / 10;
    return `${String(km).replace('.', ' punto ')} kilómetros`;
  }
  const r = m >= 100 ? Math.round(m / 50) * 50 : Math.round(m / 10) * 10;
  return `${r} metros`;
}
