// ============================================================
// ARRANQUE DE LA APP (catálogo, conocimiento, IA) — se carga bajo demanda
// ============================================================
// Antes todo esto vivía en App.tsx y viajaba en el JS inicial: la landing
// ("/") no puede pintarse hasta que se baje y ejecute TODO el bundle (chat,
// base de datos, motor de recomendación…), y Lighthouse medía un LCP de ~8 s.
// Ahora App.tsx es ligero y este módulo se importa solo cuando hace falta:
// al entrar a /app (o similares) y, en la landing, unos segundos después de
// pintar.
import { seedDemoSiVacio, limpiarPrestadoresDemoRetirados, listarServiciosAprobadosComoLugares, cachearCatalogoAprobado, listarCatalogoCacheado } from './lib/db';
import { setCatalogoExtendido, getCatalogoActivo } from './lib/chatbot';
// conocimiento se importa dinámicamente (ver abajo): es de lo más pesado y no hace falta para pintar.
const conocimiento = () => import('./lib/conocimiento');
import { anotarCarga, embeddingsListo, indexarCatalogo, indexarConocimiento, inicializarEmbeddings, fijarEstadoEmbeddings } from './lib/embeddings';
import { optimizarImagen, ANCHO_TARJETA, ANCHO_DETALLE, ANCHO_MINIATURA } from './lib/imagenOptimizada';

// Función global para recargar catálogo (usada por GestorFotos y ProviderPanel)
// Pre-cachea imágenes de Cloudinary para que estén disponibles offline
async function precachearImagenes(lugares: any[]) {
  if (!('caches' in window)) return;
  const cache = await caches.open('cloudinary-fotos');
  const urls: string[] = [];
  for (const l of lugares) {
    // Variante de tarjeta (640) y de detalle (1000) de cada foto — son las
    // que la UI pide, así que son las que deben estar disponibles offline.
    const originales: string[] = [];
    if (l.imagen && l.imagen.includes('cloudinary')) originales.push(l.imagen);
    if (l.imagenesExtra) originales.push(...l.imagenesExtra.filter((u: string) => u.includes('cloudinary')));
    for (const u of originales) urls.push(optimizarImagen(u, ANCHO_TARJETA), optimizarImagen(u, ANCHO_DETALLE), optimizarImagen(u, ANCHO_MINIATURA));
  }
  // Antes se pedían ~90 fotos de golpe al abrir la app y competían con la
  // propia página (Lighthouse: LCP de 15 s en la landing). Ahora se espera a que
  // la pantalla ya esté lista y se bajan de 4 en 4, ignorando errores sueltos.
  await new Promise<void>((r) => setTimeout(r, 20_000));
  for (let i = 0; i < urls.length; i += 4) {
    await Promise.allSettled(urls.slice(i, i + 4).map((url) => cache.add(url).catch(() => {})));
  }
}

// Hallazgo real de campo: antes, si `fetch` fallaba por completo (sin
// internet desde el arranque — el caso real de alguien capacitándose
// con datos limitados, no solo un servidor caído), TODO el cuerpo
// estaba dentro de un único try/catch y el catch solo hacía
// `return []` — ni siquiera se llamaba `setCatalogoExtendido` con lo
// que sí había disponible offline (prestadores registrados en este
// dispositivo). Y aunque el fetch sí funcionara, la respuesta de Neon
// nunca se guardaba en IndexedDB — solo quedaba en memoria
// (catalogoActivo, chatbot.ts) — así que la siguiente vez que se
// abriera la app sin conexión, el catálogo completo de prestadores de
// la plataforma se perdía, aunque el dispositivo sí se hubiera
// conectado antes. Ahora: (1) el fetch fallido siempre cae al
// catálogo cacheado en IndexedDB (mismo patrón que ya usa
// cargarConocimientoDinamico en conocimiento.ts), y (2) cada fetch
// exitoso se guarda de vuelta en esa caché para la próxima vez.
export async function recargarCatalogo() {
  const aprobadosLocal = await listarServiciosAprobadosComoLugares().catch(() => []);

  try {
    // Timeout corto: navigator.onLine puede decir "true" con señal a
    // medias (celular débil, wifi con portal cautivo) y sin esto el
    // fetch se queda colgado sin fallar, dejando la app entera en
    // pantalla en blanco (ver `if (!listo) return null` más abajo).
    const control = new AbortController();
    const avisoTiempo = setTimeout(() => control.abort(), 6_000);
    const res = await fetch('/api/servicios/aprobados', { signal: control.signal }).finally(() =>
      clearTimeout(avisoTiempo)
    );
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.lugares?.length > 0) {
        // Neon gana para IDs compartidos — sus datos son siempre más frescos
        // que los de IndexedDB local (que pueden estar desactualizados tras una edición).
        // Los de IndexedDB solo aportan servicios que Neon todavía no conoce (raro).
        const idsNeon = new Set(data.lugares.map((l: any) => l.id));
        const soloLocales = aprobadosLocal.filter((l: any) => !idsNeon.has(l.id));
        const todos = [...data.lugares, ...soloLocales];
        setCatalogoExtendido(todos);
        cachearCatalogoAprobado(data.lugares).catch(() => {});
        precachearImagenes(todos).catch(() => {});
        // Si la IA ya está activa en esta sesión, re-indexa en segundo
        // plano para que un prestador recién aprobado aparezca de
        // inmediato en la búsqueda semántica (no solo tras recargar).
        if (embeddingsListo()) indexarCatalogo(todos).catch(() => {});
        return todos;
      }
    }
  } catch {
    // sin internet o falló el fetch — cae al catálogo cacheado de abajo
  }

  // Sin internet (o Neon no devolvió datos válidos): usa el último
  // snapshot cacheado en IndexedDB + lo registrado en este mismo
  // dispositivo, con el mismo criterio "Neon gana" de arriba, para que
  // el comportamiento sea consistente con o sin conexión.
  const cacheado = await listarCatalogoCacheado().catch(() => []);
  const idsCacheados = new Set(cacheado.map((l) => l.id));
  const soloLocales = aprobadosLocal.filter((l) => !idsCacheados.has(l.id));
  const todosOffline = [...cacheado, ...soloLocales];
  setCatalogoExtendido(todosOffline);
  if (embeddingsListo()) indexarCatalogo(todosOffline).catch(() => {});
  return todosOffline;
}

// Catálogo que ya hay en este dispositivo (último de la API + registros locales),
// sin tocar la red. Mismo criterio "Neon gana" que recargarCatalogo.
async function aplicarCatalogoLocal() {
  const aprobadosLocal = await listarServiciosAprobadosComoLugares().catch(() => []);
  const cacheado = await listarCatalogoCacheado().catch(() => []);
  const ids = new Set(cacheado.map((l) => l.id));
  setCatalogoExtendido([...cacheado, ...aprobadosLocal.filter((l) => !ids.has(l.id))]);
}

// Lo LOCAL (limpieza, datos demo, catálogo guardado en el dispositivo). Es lo único
// que debe esperar una pantalla que lee la base de datos. Se ejecuta una sola vez.
let preparado: Promise<void> | null = null;
export function prepararLocal(): Promise<void> {
  if (!preparado) {
    preparado = (async () => {
      try {
        await limpiarPrestadoresDemoRetirados();
        await seedDemoSiVacio();
        await aplicarCatalogoLocal();
      } catch (err) {
        console.error('[TuxtlasGO] Error inicializando:', err);
      }
    })();
  }
  return preparado;
}

// Red e IA, en segundo plano y una sola vez por sesión.
let enSegundoPlano = false;
export function arrancarSegundoPlano(): void {
  if (enSegundoPlano) return;
  enSegundoPlano = true;
  void prepararLocal().then(() => {
    // Al terminar, setCatalogoExtendido avisa y la UI se actualiza.
    recargarCatalogo().catch((e) => console.warn('[TuxtlasGO] Catálogo:', e));
    conocimiento().then((m) => m.cargarConocimientoDinamico()).catch((e) => console.warn('[TuxtlasGO] Conocimiento:', e));
  });
    const arrancarEmbeddings = (reintentoTardio = false) => {
      const inicioEmbeddings = Date.now();
      fijarEstadoEmbeddings({ fase: 'descargando', progreso: 0 });
      inicializarEmbeddings(({ progreso }) => fijarEstadoEmbeddings({ fase: 'descargando', progreso }))
        .then(async () => {
          fijarEstadoEmbeddings({ fase: 'indexando' });
          // Primero las fichas del banco de respuestas (traen su vector ya
          // calculado): con eso ya se puede contestar. LISTO se marca aquí.
          await indexarConocimiento((await conocimiento()).obtenerFichasParaIndexar());
          fijarEstadoEmbeddings({ fase: 'listo', ms: Date.now() - inicioEmbeddings });
          // Los lugares (cuyo texto sí hay que vectorizar en el dispositivo) se
          // indexan después, en segundo plano, sin bloquear nada.
          indexarCatalogo(getCatalogoActivo()).catch((e) =>
            console.warn('[TuxtlasGO] No se pudo indexar el catálogo:', e)
          );
        })
        .catch((e) => {
          // Si el modelo SÍ quedó cargado (algo posterior falló, no la carga), el
          // estado no debe decir ERROR y apagar la etiqueta "IA: listo".
          if (embeddingsListo()) {
            fijarEstadoEmbeddings({ fase: 'listo', ms: Date.now() - inicioEmbeddings });
            console.warn('[TuxtlasGO] Un paso posterior a la carga del modelo falló, pero el modelo está listo:', e);
            return;
          }
          const mensaje = String(e?.message ?? e);
          const omitido = mensaje.startsWith('EMBEDDINGS_MEMORIA') || mensaje.startsWith('EMBEDDINGS_AHORRO');
          fijarEstadoEmbeddings({ fase: omitido ? 'omitido' : 'error', detalle: mensaje.slice(0, 300) });
          console.warn('[TuxtlasGO] Embeddings no disponibles:', e);
          if (!omitido && !reintentoTardio) {
            window.setTimeout(() => arrancarEmbeddings(true), 90_000);
          }
        });
    };
    // Prueba en un Galaxy A13: el modelo falla casi siempre al RECARGAR la página
    // (la página anterior aún no libera su memoria) y casi nunca al abrirla en
    // una pestaña nueva. Si la navegación es una recarga o un regreso atrás, se
    // espera más antes de pedir la memoria del modelo.
    let esperaInicial = 25_000;
    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (nav && (nav.type === 'reload' || nav.type === 'back_forward')) {
        esperaInicial = 35_000;
        anotarCarga('recarga detectada: el modelo arranca en 35 s para dejar que se libere la memoria');
      }
    } catch { /* sin Performance API: se usa la espera normal */ }
    // Los buscadores (Googlebot…) no necesitan el modelo de IA: bajarlo
    // (~113 MB desde Hugging Face) solo les gasta presupuesto de rastreo y
    // les llena el informe de recursos con errores. A ellos no se les arranca.
    const esRobot = /bot|crawl|spider|slurp|lighthouse|facebookexternalhit/i.test(navigator.userAgent);
    if (!esRobot) window.setTimeout(() => arrancarEmbeddings(), esperaInicial);
}
