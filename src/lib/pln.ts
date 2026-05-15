// ============================================================
// MÓDULO DE PROCESAMIENTO DE LENGUAJE NATURAL (PLN)
// ============================================================
// Utilidades de PLN local que permiten al asistente entender al
// usuario aunque escriba con errores ortográficos o variaciones.
// Todo se ejecuta en el dispositivo, sin conexión ni APIs.
//
// Técnicas implementadas:
//   • Normalización: minúsculas, sin acentos, sin signos.
//   • Tokenización: separa el texto en palabras.
//   • Distancia de edición (Damerau-Levenshtein): mide qué tan
//     parecidas son dos palabras para tolerar errores de dedo,
//     incluidas transposiciones ("cascda"/"comdia" se entienden).
//   • Coincidencia aproximada: decide si una palabra del usuario
//     corresponde a una palabra clave conocida.
//
// Este módulo es el que convierte una simple búsqueda de texto
// en un reconocimiento de intención tolerante a errores, que es
// lo que distingue a un chatbot conversacional con PLN.
// ============================================================

// Normaliza texto: minúsculas, sin acentos. Base de toda comparación.
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Separa el texto del usuario en palabras limpias (tokens).
export function tokenizar(texto: string): string[] {
  return normalizar(texto)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 0);
}

// Distancia de edición de Damerau-Levenshtein: número mínimo de
// operaciones (insertar, borrar, sustituir o TRANSPONER dos
// caracteres adyacentes) para transformar la cadena `a` en `b`.
// Es el algoritmo estándar para corregir errores de escritura;
// a diferencia de Levenshtein simple, cuenta una transposición
// como un solo error, que es el typo más común al teclear rápido.
//   distanciaEdicion('cascda','cascada')  = 1  (falta una letra)
//   distanciaEdicion('comdia','comida')   = 1  (transposición)
export function distanciaEdicion(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // matriz de programación dinámica
  const d: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // borrar un carácter
        d[i][j - 1] + 1, // insertar un carácter
        d[i - 1][j - 1] + costo // sustituir un carácter
      );
      // transposición de dos caracteres adyacentes (ej: "comdia")
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

// Quita el plural simple del español ("cascadas" -> "cascada",
// "miradores" -> "mirador"). Stemming básico para que singular y
// plural se reconozcan igual.
function quitarPlural(palabra: string): string {
  if (palabra.length > 4 && palabra.endsWith('es')) {
    return palabra.slice(0, -2);
  }
  if (palabra.length > 3 && palabra.endsWith('s')) {
    return palabra.slice(0, -1);
  }
  return palabra;
}

// La 'h' inicial es muda en español y se omite con muchísima
// frecuencia al escribir rápido ("ola" por hola, "ospedaje" por
// hospedaje, "ora" por hora). Se normaliza quitándola.
function quitarHInicial(palabra: string): string {
  return palabra.startsWith('h') ? palabra.slice(1) : palabra;
}

// ¿La palabra que escribió el usuario corresponde a esta clave?
// Reglas, pensadas para tolerar errores SIN crear falsos positivos:
//   • Coincidencia exacta → siempre cuenta.
//   • La clave aparece como raíz del término ("cascadas" → "cascada").
//   • Coincidencia aproximada según la longitud de la clave:
//       - 1-3 letras → solo exacta (palabras muy cortas son riesgosas)
//       - 4-7 letras → hasta 1 error de escritura
//       - 8+ letras  → hasta 2 errores de escritura
//   • La palabra del usuario debe tener al menos 4 letras para
//     arriesgar una coincidencia aproximada (evita que "sol"
//     se confunda con "solo", o "mar" con "mara").
//   • Se intenta también sin plural, para que "cascdas" (plural
//     mal escrito) llegue a "cascada".
export function palabraCoincide(
  palabraUsuario: string,
  clave: string
): boolean {
  if (palabraUsuario === clave) return true;
  if (clave.length >= 5 && palabraUsuario.includes(clave)) return true;

  // normaliza la 'h' muda inicial en ambos lados antes de comparar
  const u = quitarHInicial(palabraUsuario);
  const c = quitarHInicial(clave);
  if (u === c) return true;

  const umbral = clave.length <= 3 ? 0 : clave.length <= 7 ? 1 : 2;
  if (umbral === 0) return false;
  if (palabraUsuario.length < 4) return false;

  if (distanciaEdicion(u, c) <= umbral) return true;

  // segundo intento: quitando el plural del término del usuario
  const sinPlural = quitarPlural(u);
  if (sinPlural !== u && distanciaEdicion(sinPlural, c) <= umbral) {
    return true;
  }
  return false;
}

// ¿El texto del usuario contiene esta clave (una palabra o una
// frase de varias palabras), tolerando errores ortográficos?
// Recibe los tokens ya calculados para no repetir trabajo.
export function contieneClave(
  tokensUsuario: string[],
  clave: string
): boolean {
  const palabrasClave = normalizar(clave).split(' ').filter(Boolean);

  if (palabrasClave.length === 0) return false;

  // Clave de una sola palabra: ¿algún token del usuario coincide?
  if (palabrasClave.length === 1) {
    return tokensUsuario.some((t) => palabraCoincide(t, palabrasClave[0]));
  }

  // Clave de varias palabras: busca la secuencia completa,
  // permitiendo que cada palabra tenga su propio error de dedo.
  for (
    let i = 0;
    i <= tokensUsuario.length - palabrasClave.length;
    i++
  ) {
    let coincideTodo = true;
    for (let j = 0; j < palabrasClave.length; j++) {
      if (!palabraCoincide(tokensUsuario[i + j], palabrasClave[j])) {
        coincideTodo = false;
        break;
      }
    }
    if (coincideTodo) return true;
  }
  return false;
}

// Cuenta cuántas claves de una lista aparecen en el texto del
// usuario. Útil para dar un puntaje de relevancia a una intención
// o a una entrada de la base de conocimiento.
export function contarCoincidencias(
  tokensUsuario: string[],
  claves: string[]
): number {
  let total = 0;
  for (const clave of claves) {
    if (contieneClave(tokensUsuario, clave)) {
      // las claves de varias palabras son más específicas: valen más
      total += normalizar(clave).split(' ').filter(Boolean).length;
    }
  }
  return total;
}
