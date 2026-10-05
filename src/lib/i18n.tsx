import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { EN } from './i18n-en';

// i18n mínimo, sin dependencias y 100% offline.
//
// La CLAVE es el texto en español tal cual aparece en pantalla:
//   t('Explorar')                      -> "Explorar" | "Explore"
//   t('Hola, {nombre}', { nombre })    -> interpolación con {llave}
// Si una frase no tiene traducción en i18n-en.ts, se muestra el español
// (nunca una llave rota). Así se puede traducir por fases: lo que falte
// simplemente queda en español en lugar de romper la pantalla.
//
// Alcance deliberado: solo la interfaz. El contenido que viene de la BD
// (descripciones de lugares, reseñas, nombres de prestadores) y las
// respuestas del asistente siguen en español.

export type Idioma = 'es' | 'en';

const CLAVE = 'tuxtlasgo:idioma';

function idiomaInicial(): Idioma {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === 'es' || guardado === 'en') return guardado;
  } catch { /* localStorage puede no estar disponible */ }
  // Primera visita: respetar el idioma del dispositivo. Un extranjero
  // con el teléfono en inglés ve la app en inglés sin tocar nada.
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'es';
  return nav.toLowerCase().startsWith('es') ? 'es' : 'en';
}

// Orden importa: las frases largas van antes que las palabras sueltas.
const PATRONES_DATO: [RegExp, string][] = [
  [/Todos los días/gi, 'Every day'],
  [/Lunes a domingo/gi, 'Monday to Sunday'],
  [/Lunes a viernes/gi, 'Monday to Friday'],
  [/Lunes a sábado/gi, 'Monday to Saturday'],
  [/Fines de semana/gi, 'Weekends'],
  [/Día completo o pernocta/gi, 'Full day or overnight'],
  [/Día completo/gi, 'Full day'],
  [/\(o pernocta\)/gi, '(or overnight)'],
  [/Recomendado de/gi, 'Recommended from'],
  [/Acceso libre/gi, 'Free entry'],
  [/Consultar precio/gi, 'Ask for price'],
  [/Entrada general/gi, 'General admission'],
  [/Entrada/gi, 'Entry'],
  [/Restaurante:/gi, 'Restaurant:'],
  [/Hospedaje:/gi, 'Lodging:'],
  [/Camping desde/gi, 'Camping from'],
  [/Gratis/gi, 'Free'],
  [/por persona/gi, 'per person'],
  [/por noche/gi, 'per night'],
  [/desde/gi, 'from'],
  [/horas/gi, 'hours'],
  [/hora\b/gi, 'hour'],
  [/Variable/g, 'Varies'],
];

interface Ctx {
  idioma: Idioma;
  setIdioma: (i: Idioma) => void;
  t: (es: string, vars?: Record<string, string | number>) => string;
  // Para datos de lugares escritos por prestadores (horario, duración,
  // costo, días). Traduce solo las frases comunes que reconoce; lo demás
  // se deja tal cual (nunca se inventa una traducción).
  td: (valor: string) => string;
}

const I18nContext = createContext<Ctx>({
  idioma: 'es',
  setIdioma: () => {},
  t: (es) => es,
  td: (v) => v,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [idioma, setIdiomaState] = useState<Idioma>(idiomaInicial);

  useEffect(() => {
    document.documentElement.lang = idioma === 'en' ? 'en' : 'es-MX';
  }, [idioma]);

  const setIdioma = useCallback((i: Idioma) => {
    setIdiomaState(i);
    try { localStorage.setItem(CLAVE, i); } catch { /* ignorar */ }
  }, []);

  const t = useCallback(
    (es: string, vars?: Record<string, string | number>) => {
      let texto = idioma === 'en' ? (EN[es] ?? es) : es;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          texto = texto.split(`{${k}}`).join(String(v));
        }
      }
      return texto;
    },
    [idioma]
  );

  const td = useCallback(
    (valor: string) => {
      if (idioma !== 'en' || !valor) return valor;
      let out = valor;
      for (const [re, en] of PATRONES_DATO) out = out.replace(re, en);
      return out;
    },
    [idioma]
  );

  const valor = useMemo(() => ({ idioma, setIdioma, t, td }), [idioma, setIdioma, t, td]);
  return <I18nContext.Provider value={valor}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function useT() {
  return useContext(I18nContext).t;
}

export function useTd() {
  return useContext(I18nContext).td;
}
