// ============================================================
// BASE DE CONOCIMIENTO — Motor de PLN de TuxtlasGO
// ============================================================
// Información verificada directamente con los 10 establecimientos
// de Los Tuxtlas. La IA responde con estos datos cuando el turista
// pregunta sobre precios, horarios, cómo llegar, qué comer, etc.
// 100% offline — no consulta ninguna API en tiempo real.
//
// ESCALABILIDAD — dos capas, a propósito:
//  1) BASE_CONOCIMIENTO (este archivo): el set inicial, incluido en
//     el propio bundle de la app. Funciona desde el primer momento
//     que alguien abre TuxtlasGO, incluso si NUNCA ha tenido señal
//     (Caso B de la conversación sobre offline real).
//  2) Base dinámica (`conocimientoDinamico`, más abajo): fichas nuevas
//     agregadas desde el panel de admin sin tocar código ni
//     redesplegar — ver api/conocimiento/admin.ts y AdminPanel.tsx.
//     Sigue siendo CURADA por una persona a propósito (son datos
//     sensibles: precios, emergencias, que alguien debe verificar
//     antes de que la IA los repita como verdad) — lo que cambia es
//     que ahora es un formulario, no una tarea de programador. Se
//     descarga una vez con internet y se cachea para uso offline
//     después, igual que el catálogo de lugares y los embeddings.
// ============================================================

import { tokenizar, contarCoincidencias } from './pln';
import { db } from './db';
import { embeddingsListo, indexarConocimiento } from './embeddings';

export interface EntradaConocimiento {
  claves: string[];
  titulo: string;
  respuesta: string;
  // Prioridad opcional (default 0). Se usa para que información de
  // SEGURIDAD (hospitales, emergencias, policía) nunca pierda un
  // empate contra un dato general — ver el bug real que esto
  // corrigió: "cerca de Palapas Gorel hay hospitales" contiene tanto
  // "gorel" (matchea precios de Palapas Gorel) como "hospitales"
  // (matchea la ficha de emergencias), EMPATADOS en 1 coincidencia
  // cada uno. Sin prioridad, ganaba la entrada definida primero en
  // este archivo (precios), y la IA respondía "no tengo información
  // de hospitales" en vez de dar el 911 — silenciosamente perdía el
  // dato de seguridad. Con prioridad, la ficha de seguridad gana
  // siempre que matchee algo, sin importar el orden en el archivo.
  prioridad?: number;
  // IDs (ver data/lugares.ts) de los lugares REALES de los que habla
  // esta ficha — opcional, solo cuando la respuesta menciona uno o
  // varios lugares concretos (no aplica a fichas generales como
  // clima o emergencias).
  //
  // Hallazgo real de campo (QA): "Muéstrame hoteles con alberca y
  // estacionamiento" hacía match con la ficha de precios de "La
  // Jungla Balneario" (por la palabra "alberca") — pero La Jungla es
  // categoría Naturaleza, no Hospedaje. El texto de la respuesta SÍ
  // hablaba de La Jungla, pero la tarjeta mostrada era "Sirena
  // Olmeca" (el único lugar de categoría Hospedaje), porque el filtro
  // por categoría y la búsqueda de conocimiento son dos búsquedas
  // INDEPENDIENTES que pueden apuntar a lugares distintos. Con este
  // campo, la tarjeta mostrada coincide con el lugar del que
  // realmente habla el texto, en vez de un top-3 genérico por
  // categoría que puede ir por otro lado.
  lugares?: string[];
}

export const BASE_CONOCIMIENTO: EntradaConocimiento[] = [
  // ─── PRECIOS POR LUGAR ────────────────────────────────────
  {
    claves: ['margiros', 'precio margiros', 'cuesta margiros', 'cuanto margiros'],
    titulo: 'Precios Restaurante Margiros',
    respuesta:
      'Restaurante Margiros tiene precios de $100 a $300 por persona. Abre todos los días de 8 am a 8 pm. Ambiente relajado, ideal para desayunos, almuerzos y cenas. Acepta familias con niños.',
    lugares: ['margiros'],
  },
  {
    claves: ['palapas gorel', 'gorel', 'precio gorel', 'cuanto gorel'],
    titulo: 'Precios Palapas Gorel',
    respuesta:
      'Palapas Gorel tiene precios de $100 a $200 por persona. Abre de 9 am a 6 pm. Tiene espacios al aire libre, buen café, cócteles y acepta tarjetas. Accesible para personas en silla de ruedas.',
    lugares: ['palapas-gorel'],
  },
  {
    claves: ['bicicleta cafe', 'bicicleta', 'precio bicicleta', 'cafe san andres'],
    titulo: 'Precios La Bicicleta Café',
    respuesta:
      'La Bicicleta Café tiene precios de $100 a $200 por persona. Abre de 7 am a 11 pm, con servicio hasta la madrugada. Tiene Wi-Fi gratis, postres, vinos y cervezas. También hace entregas a domicilio.',
    lugares: ['bicicleta-cafe'],
  },
  {
    claves: ['moyotera', 'precio moyotera', 'cuanto moyotera', 'restaurant bar'],
    titulo: 'Precios La Moyotera',
    respuesta:
      'La Moyotera tiene precios de $200 a $300 por persona. Abre de 9 am a 9 pm. Especialidades: pulpo a la parrilla, mojarra al chilpaya y la Torta Moyotera. Vistas al atardecer sobre la laguna de Catemaco desde sus terrazas.',
    lugares: ['moyotera'],
  },
  {
    claves: ['hechizo', 'hechizo de amor', 'precio hechizo', 'rooftop', 'bar catemaco'],
    titulo: 'Precios Hechizo de Amor',
    respuesta:
      'Hechizo de Amor tiene precios de $200 a $300 por persona. Abre de 12 pm a 11 pm. Es un rooftop bar con vistas al lago de Catemaco. Hacen licores artesanales con chagalapoli, un fruto endémico de Los Tuxtlas. Perfecto para parejas al atardecer.',
    lugares: ['hechizo-amor'],
  },
  {
    claves: ['nanciyaga', 'precio nanciyaga', 'cuanto nanciyaga', 'reserva ecologica'],
    titulo: 'Precios Nanciyaga',
    respuesta:
      'Nanciyaga: entrada general $80 por persona. Hospedaje desde $1,600 hasta $2,200 por noche. Abre de 9 am a 7 pm. Incluye senderos de selva, kayak hacia islas con monos, aplicación de barro mineral y rituales con chamanes. Fue escenario de la película Apocalypto.',
    lugares: ['nanciyaga'],
  },
  {
    claves: ['sirena olmeca', 'sirena', 'cabanas catemaco', 'precio sirena'],
    titulo: 'Precios Sirena Olmeca',
    respuesta:
      'Sirena Olmeca: restaurante $150 a $350 por persona. Hospedaje $800 a $1,200 por noche. Abre de 9 am a 6 pm. Está a 45 minutos de Catemaco, donde el mar abierto se junta con la laguna. Ideal para desconectarse totalmente.',
    lugares: ['sirena-olmeca'],
  },
  {
    claves: ['jungla', 'balneario', 'la jungla', 'precio jungla', 'alberca'],
    titulo: 'Precios La Jungla Balneario',
    respuesta:
      'La Jungla Balneario: entrada $60 por persona. Camping desde $100 por noche. Abre de 8 am a 6 pm todos los días. Tiene albercas de agua de manantial natural (muy fría), tobogán entre los árboles, muelle al lago y vistas panorámicas. Perfecto para familias.',
    lugares: ['jungla-balneario'],
  },
  {
    claves: ['eyipantla', 'cascada', 'salto', 'precio eyipantla', 'entrada cascada'],
    titulo: 'Precio Eyipantla',
    respuesta:
      'La Cascada El Salto de Eyipantla tiene una entrada de aproximadamente $50 por persona. Abre de 7 am a 7 pm. Es una de las cascadas más impresionantes de Veracruz, rodeada de selva tropical. Ideal para fotos y caminatas.',
    lugares: ['eyipantla'],
  },
  {
    claves: ['cerro venado', 'cerro del venado', 'precio cerro', 'caminata'],
    titulo: 'Cerro del Venado',
    respuesta:
      'El Cerro del Venado tiene acceso libre (gratuito). Ofrece vistas panorámicas únicas de San Andrés Tuxtla. Ideal para caminatas y fotografías. Lleva agua y calzado cómodo. El ascenso toma aproximadamente 1 hora.',
    lugares: ['cerro-venado'],
  },

  // ─── DÓNDE COMER ─────────────────────────────────────────
  {
    claves: ['donde comer', 'que comer', 'restaurante', 'comida', 'cenar', 'desayunar', 'almorzar'],
    titulo: 'Dónde comer en Los Tuxtlas',
    respuesta:
      'En Catemaco tienes varias opciones: La Moyotera (mariscos y vistas a la laguna, $200-300), Palapas Gorel (ambiente al aire libre, $100-200), Restaurante Margiros (cocina variada, $100-300) y Hechizo de Amor (rooftop bar, $200-300). En San Andrés Tuxtla está La Bicicleta Café (café y cenas hasta la madrugada, $100-200). ¿Buscas algo específico o tienes un presupuesto en mente?',
    lugares: ['moyotera', 'palapas-gorel', 'margiros', 'hechizo-amor', 'bicicleta-cafe'],
  },
  {
    claves: ['mariscos', 'pescado', 'mojarra', 'pulpo', 'camarones'],
    titulo: 'Mariscos en Los Tuxtlas',
    respuesta:
      'Para mariscos la mejor opción es La Moyotera en Catemaco — especialistas en pulpo a la parrilla, mojarra al chilpaya y tienen vistas al lago ($200-300). También puedes encontrar mariscos frescos en Palapas Gorel ($100-200).',
    lugares: ['moyotera', 'palapas-gorel'],
  },
  {
    claves: ['cafe', 'cafetería', 'postres', 'desayuno'],
    titulo: 'Cafeterías y desayunos',
    respuesta:
      'La Bicicleta Café en San Andrés Tuxtla es la mejor opción para café de especialidad, postres y desayunos ($100-200, abre 7am). En Catemaco, Palapas Gorel y Restaurante Margiros también sirven buenos desayunos desde las 8-9 am.',
    lugares: ['bicicleta-cafe', 'palapas-gorel', 'margiros'],
  },

  // ─── HOSPEDAJE ───────────────────────────────────────────
  {
    claves: ['donde dormir', 'hotel', 'hospedaje', 'cabaña', 'cabana', 'pernoctar', 'donde quedarme'],
    titulo: 'Hospedaje en Los Tuxtlas',
    respuesta:
      'Para hospedarte tienes dos opciones naturales: Nanciyaga ($1,600-$2,200/noche), reserva ecológica con cabañas en plena selva, kayak y ritales con chamanes. O Sirena Olmeca ($800-$1,200/noche), complejo rústico donde el mar se junta con la laguna, ideal para desconectarse. La Jungla Balneario también tiene camping desde $100/noche.',
    lugares: ['nanciyaga', 'sirena-olmeca', 'jungla-balneario'],
  },
  {
    claves: ['camping', 'acampar', 'tienda', 'carpa'],
    titulo: 'Camping en Los Tuxtlas',
    respuesta:
      'La Jungla Balneario tiene área de camping desde $100 por noche, con acceso a sus albercas naturales, muelle y vistas al lago. Es la opción más económica para quedarte en la naturaleza de Catemaco.',
    lugares: ['jungla-balneario'],
  },

  // ─── NATURALEZA Y AVENTURA ───────────────────────────────
  {
    claves: ['naturaleza', 'selva', 'aventura', 'ecoturismo', 'senderismo', 'sendero'],
    titulo: 'Naturaleza y aventura en Los Tuxtlas',
    respuesta:
      'Para naturaleza y aventura tienes: La Cascada de Eyipantla (50 metros de caída, $50 entrada), Nanciyaga (4 hectáreas de selva, kayak, monos, $80 entrada), La Jungla Balneario (albercas de manantial, tobogán en selva, $60 entrada) y el Cerro del Venado (vistas panorámicas, acceso libre). Todos están en los alrededores de Catemaco y San Andrés Tuxtla.',
    lugares: ['eyipantla', 'nanciyaga', 'jungla-balneario', 'cerro-venado'],
  },
  {
    claves: ['monos', 'macacos', 'kayak', 'lancha', 'laguna'],
    titulo: 'Monos y actividades en la laguna',
    respuesta:
      'Para ver los monos macacos en la laguna de Catemaco, lo mejor es ir a Nanciyaga — hacen paseos en kayak hacia las islas donde viven los monos (incluido en la entrada de $80). También puedes contratar lanchas desde el malecón de Catemaco.',
    lugares: ['nanciyaga'],
  },
  {
    claves: ['cascada', 'waterfall', 'salto de agua'],
    titulo: 'La cascada de Eyipantla',
    respuesta:
      'El Salto de Eyipantla es la cascada más impresionante de la región — 50 metros de caída libre en plena selva. Entrada ~$50, abre de 7am a 7pm. A 14 km de San Andrés Tuxtla. Ve en la mañana para mejor luz en las fotos.',
    lugares: ['eyipantla'],
  },

  // ─── HORARIOS ────────────────────────────────────────────
  {
    claves: ['horario', 'a que hora', 'cuando abre', 'cuando cierra', 'que hora'],
    titulo: 'Horarios en Los Tuxtlas',
    respuesta:
      'Horarios de los principales lugares: Margiros 8am-8pm • Palapas Gorel 9am-6pm • Bicicleta Café 7am-11pm • Moyotera 9am-9pm • Hechizo de Amor 12pm-11pm • Nanciyaga 9am-7pm • Jungla Balneario 8am-6pm • Sirena Olmeca 9am-6pm • Eyipantla 7am-7pm. ¿De cuál quieres saber más?',
  },

  // ─── CÓMO LLEGAR ─────────────────────────────────────────
  {
    claves: ['como llegar', 'como llego', 'transporte', 'autobus', 'desde veracruz', 'desde cdmx'],
    titulo: 'Cómo llegar a Los Tuxtlas',
    respuesta:
      'Desde el puerto de Veracruz son unas 2.5 horas por la carretera federal 180 hacia San Andrés Tuxtla y Catemaco. Hay autobuses ADO que salen seguido. Desde la CDMX son unas 7-8 horas en auto o puedes volar a Veracruz/Minatitlán y luego tomar carretera.',
  },

  // ─── CLIMA ───────────────────────────────────────────────
  {
    claves: ['clima', 'calor', 'lluvia', 'temperatura', 'frio', 'cuando ir'],
    titulo: 'Clima de Los Tuxtlas',
    respuesta:
      'Los Tuxtlas tiene clima tropical húmedo, caluroso casi todo el año (22-32°C). Llueve más de junio a octubre. La mejor época para visitar es de noviembre a abril — menos lluvia, caminos en mejor estado y cascadas con buen caudal. Lleva siempre repelente de insectos.',
  },

  // ─── QUÉ LLEVAR ──────────────────────────────────────────
  {
    claves: ['que llevar', 'que traer', 'que empacar', 'ropa', 'equipaje'],
    titulo: 'Qué llevar a Los Tuxtlas',
    respuesta:
      'Lleva ropa ligera, calzado cómodo para caminar, gorra o sombrero, bloqueador solar y repelente de insectos (la selva tiene moscos). Para la cascada de Eyipantla y la Jungla Balneario lleva ropa de baño y toalla. Para Nanciyaga puedes ir en ropa cómoda — te prestarán lo necesario para el barro mineral.',
  },

  // ─── RESERVACIONES ───────────────────────────────────────
  {
    claves: ['reservar', 'reservacion', 'apartar', 'mesa', 'cupo', 'disponibilidad'],
    titulo: 'Cómo reservar en Los Tuxtlas',
    respuesta:
      'Para reservar puedes contactar directamente a los establecimientos. Nanciyaga y Sirena Olmeca convienen reservarlos con anticipación si quieres hospedarte. Hechizo de Amor es recomendable llegar antes de las 6pm para asegurar mesa en el atardecer. Los demás restaurantes generalmente no requieren reservación previa.',
    lugares: ['nanciyaga', 'sirena-olmeca', 'hechizo-amor'],
  },

  // ─── BEBIDAS ARTESANALES ─────────────────────────────────
  {
    claves: ['licor', 'gin', 'artesanal', 'bebida', 'chagalapoli', 'vermut', 'coctel'],
    titulo: 'Bebidas artesanales',
    respuesta:
      'Hechizo de Amor en Catemaco es famoso por sus licores artesanales — ginebras, vermuts y cócteles saborizados con frutas de la región, incluyendo el chagalapoli, un fruto silvestre endémico de Los Tuxtlas parecido al arándano. Es el lugar ideal para probar algo único que no encontrarás en otro lado.',
    lugares: ['hechizo-amor'],
  },

  // ─── CHAMANES Y RITUALES ─────────────────────────────────
  {
    claves: ['chaman', 'ritual', 'limpia', 'brujo', 'magia', 'espiritual'],
    titulo: 'Chamanes y rituales',
    respuesta:
      'Para experiencias con chamanes y rituales de sanación, Nanciyaga es el lugar indicado — tienen chamanes locales y rituales auténticos incluidos en la visita. También ofrecen la aplicación de barro mineral, que es una experiencia única de bienestar. La reserva está a 7 km de Catemaco.',
    lugares: ['nanciyaga'],
  },

  // ─── SEGURIDAD Y EMERGENCIAS ──────────────────────────────
  // El 911 es el número nacional de emergencias de México (dato
  // oficial, verificado) y SIEMPRE va primero en ambas respuestas de
  // abajo — eso no cambia nunca.
  //
  // Los nombres, direcciones y teléfonos de hospitales/clínicas/Cruz
  // Roja y comandancias POR MUNICIPIO de abajo se llenaron (sept.
  // 2026) a partir de búsqueda en línea — NO verificación en campo.
  // Se decidió así explícitamente con el dueño del proyecto: mejor
  // esto (marcado como "pendiente de confirmar en campo" en el propio
  // texto que lee el turista) que el vacío de antes, pero sin fingir
  // una certeza que no tenemos. Cada dato viene de agregadores/
  // directorios (clinicasimss.com, farmaciascerca.com, Cruz Roja
  // Veracruz, directorios de presidencias municipales), no del sitio
  // oficial de cada dependencia verificado uno por uno — pueden estar
  // desactualizados. Antes de la presentación regional, sigue
  // pendiente una verificación en campo real (llamar o visitar).
  //
  // DECISIÓN DE DISEÑO — por qué esto NO se separó en una ficha por
  // municipio (aunque se consideró): separar requeriría meter el
  // nombre del municipio ('catemaco', 'san andres', 'santiago') en
  // `claves` para que el motor sepa a cuál responder — pero eso
  // reproduce EXACTAMENTE el bug ya documentado arriba en este mismo
  // archivo (ver el comentario de `prioridad` en la interfaz): con
  // prioridad 10, CUALQUIER mensaje que solo mencione "Catemaco" sin
  // hablar de emergencias («cómo llego a Catemaco», «qué hay en
  // Catemaco») le ganaría por prioridad a la ficha correcta (p. ej.
  // "Cómo llegar"), silenciando información que no tiene nada que ver
  // con seguridad. El nombre de un municipio es demasiado común en
  // preguntas turísticas normales para ponerlo en una ficha de
  // prioridad máxima. En vez de eso, ambas respuestas listan los tres
  // municipios organizados con viñetas — el turista encuentra el suyo
  // leyendo, sin arriesgar que el motor enrute mal.
  //
  // HUECOS CONOCIDOS (no se inventó nada para llenarlos, ver reporte):
  // Catemaco no tiene comandancia de policía ni delegación de Cruz
  // Roja con dirección publicada que se haya podido confirmar.
  {
    claves: [
      'hospital', 'hospitales', 'emergencia', 'emergencias', 'accidente',
      'me lastime', 'me lastimé', 'clinica', 'clínica', 'centro de salud',
      'ambulancia', 'me corte', 'me corté', 'me cai', 'me caí', 'urgencias',
      'primeros auxilios', 'me pico', 'me picó', 'mordida', 'veneno',
      'farmacia', 'farmacias', 'medicamento', 'medicamentos',
    ],
    titulo: 'Emergencias médicas y farmacias en Los Tuxtlas',
    prioridad: 10,
    respuesta:
      'Si es una emergencia médica, marca 911 primero — es el número nacional de emergencias de México, funciona desde cualquier compañía telefónica incluso sin saldo ni plan. Da tu ubicación lo más precisa posible: municipio (Catemaco, San Andrés Tuxtla o Santiago Tuxtla) y el punto de referencia más cercano. Mientras llega ayuda, esto es lo que encontramos en búsqueda en línea sobre clínicas y hospitales por municipio (pendiente de confirmar en campo por el equipo de TuxtlasGO — verifica nombre y ubicación exacta al llegar, los datos de agregadores en línea pueden estar desactualizados): • Catemaco: IMSS UMF 34, Calle Venustiano Carranza s/n, Col. El Rodeo. • San Andrés Tuxtla: Hospital General de Zona 33 IMSS, Carretera Federal del Golfo s/n, Col. 3 de Mayo; y la delegación de Cruz Roja Mexicana en Francisco González Bocanegra #242, Col. Centro (tel. 294 942 4995), con servicio de ambulancias. • Santiago Tuxtla: Hospital General de Santiago Tuxtla, Carretera Santiago Tuxtla-Isla km 1.5; y el Centro de Salud en calle Maestro Eneas Rivas Castellanos. No encontramos una delegación de Cruz Roja propia en Catemaco ni en Santiago Tuxtla — la más cercana confirmada es la de San Andrés Tuxtla, así que en una urgencia real sigue siendo más rápido y seguro marcar 911 en vez de buscar transporte propio. Para medicamentos hay farmacias en el centro de los tres municipios (en San Andrés Tuxtla, Farmacias del Ahorro tiene sucursal con servicio 24 horas); pregunta en tu hospedaje cuál está más cerca y abierta a esa hora.',
  },
  {
    claves: [
      'policia', 'policía', 'comisaria', 'comisaría', 'robo', 'inseguridad',
      'denunciar', 'me robaron', 'perdi mis cosas', 'perdí mis cosas',
      'asalto', 'asaltaron', 'guardia nacional',
    ],
    titulo: 'Seguridad, policía y comisarías en Los Tuxtlas',
    prioridad: 10,
    respuesta:
      'Para reportar un robo o cualquier incidente de seguridad, marca 911 primero — es gratuito desde cualquier operador y conecta directo con la policía y/o la Guardia Nacional de turno en la región. Como punto de referencia en tierra (según búsqueda en línea, pendiente de confirmar en campo por el equipo de TuxtlasGO — las comandancias de policía municipal no siempre publican su dirección exacta): • San Andrés Tuxtla: Presidencia Municipal en Francisco I. Madero #1, Col. Centro, C.P. 95700. • Santiago Tuxtla: Presidencia Municipal en Circuito Ángel Carvajal s/n, C.P. 95830, tel. 294 947 0283. • Catemaco: no encontramos una dirección exacta publicada de la comandancia — el punto de referencia es el centro del pueblo, cerca del malecón; ante un robo real, marca 911 o pregunta directamente ahí en vez de guiarte por una dirección que no pudimos confirmar. La Guardia Nacional también tiene presencia sobre la carretera federal 180, que cruza los tres municipios.',
  },
];

// ─────────────── CAPA DINÁMICA (administrable, ver arriba) ───────────────
// Vive en memoria durante la sesión; se llena desde Dexie (offline) y/o
// desde la API (online) al iniciar la app — ver cargarConocimientoDinamico().
let conocimientoDinamico: EntradaConocimiento[] = [];

function filaACacheAEntrada(fila: {
  claves: string;
  titulo: string;
  respuesta: string;
  prioridad: number;
}): EntradaConocimiento {
  return {
    claves: fila.claves.split(',').map((c) => c.trim()).filter(Boolean),
    titulo: fila.titulo,
    respuesta: fila.respuesta,
    prioridad: fila.prioridad,
  };
}

// Llamar una vez al iniciar la app (ver App.tsx). Intenta traer lo
// último de la API; si no hay internet, usa lo que ya quedó cacheado
// de una sesión anterior — así estas fichas también funcionan offline
// una vez que se descargaron al menos una vez (mismo patrón que el
// catálogo de lugares y los embeddings).
export async function cargarConocimientoDinamico(): Promise<void> {
  try {
    // Timeout corto: navigator.onLine puede decir "true" con señal a
    // medias (celular débil, wifi con portal cautivo) y sin esto el
    // fetch se queda colgado sin fallar, dejando la app entera en
    // pantalla en blanco (App.tsx espera este await antes de arrancar).
    const control = new AbortController();
    const avisoTiempo = setTimeout(() => control.abort(), 6_000);
    const r = await fetch('/api/conocimiento/admin', { signal: control.signal }).finally(() =>
      clearTimeout(avisoTiempo)
    );
    if (r.ok) {
      const data = await r.json();
      const filas: { id: number; claves: string; titulo: string; respuesta: string; prioridad: number }[] =
        data.entradas ?? [];
      await db.conocimientoCache.clear();
      if (filas.length > 0) await db.conocimientoCache.bulkPut(filas);
      conocimientoDinamico = filas.map(filaACacheAEntrada);
      return;
    }
  } catch {
    // sin internet o falló el fetch — cae al caché de abajo
  }
  const cacheadas = await db.conocimientoCache.toArray();
  conocimientoDinamico = cacheadas.map(filaACacheAEntrada);
}

// Usado por AdminPanel para agregar una ficha nueva sin tocar código.
export async function agregarConocimientoDinamico(
  entrada: { claves: string; titulo: string; respuesta: string; prioridad?: number },
  adminPassword: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch('/api/conocimiento/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
      body: JSON.stringify(entrada),
    });
    const data = await r.json();
    if (!r.ok) return { ok: false, error: data.error ?? 'Error desconocido' };
    await cargarConocimientoDinamico(); // refresca la copia local de inmediato
    // Si la memoria semántica ya está activa en esta sesión, indexa la
    // ficha nueva de inmediato — así el banco de respuestas la puede
    // usar sin esperar a que alguien recargue la app.
    if (embeddingsListo()) {
      indexarConocimiento(obtenerFichasParaIndexar()).catch(() => {});
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Junta todas las fichas activas (estáticas + dinámicas) en la forma
// que necesita indexarConocimiento() en embeddings.ts — usa el título
// como clave estable, ya que es el mismo en ambas capas y no cambia
// entre sesiones (a diferencia de un índice de arreglo, que sí puede
// correrse cuando se agrega o quita una ficha).
export function obtenerFichasParaIndexar(): { clave: string; texto: string }[] {
  return [...BASE_CONOCIMIENTO, ...conocimientoDinamico].map((entrada) => ({
    clave: entrada.titulo,
    texto: entrada.respuesta,
  }));
}

// Busca la entrada más relevante de la base de conocimiento
// (estática + dinámica) usando el módulo PLN para tolerar errores
// ortográficos.
export function buscarConocimiento(texto: string): EntradaConocimiento | null {
  const tokens = tokenizar(texto);
  let mejorEntrada: EntradaConocimiento | null = null;
  let mejorPuntaje = 0; // puntaje "real" de coincidencias (sin boost) — para exigir que sí haya un match genuino
  let mejorPuntajeEfectivo = 0; // puntaje + prioridad — el que decide el ganador

  for (const entrada of [...BASE_CONOCIMIENTO, ...conocimientoDinamico]) {
    const puntaje = contarCoincidencias(tokens, entrada.claves);
    if (puntaje === 0) continue; // sin match real, la prioridad no rescata nada

    const puntajeEfectivo = puntaje + (entrada.prioridad ?? 0);
    if (puntajeEfectivo > mejorPuntajeEfectivo) {
      mejorPuntajeEfectivo = puntajeEfectivo;
      mejorPuntaje = puntaje;
      mejorEntrada = entrada;
    }
  }

  return mejorPuntaje > 0 ? mejorEntrada : null;
}