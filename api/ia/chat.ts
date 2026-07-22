import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';

// ============================================================
// IA EN LA NUBE — respaldo del modo offline (WebLLM)
// ============================================================
// Se llama SOLO cuando el dispositivo del usuario no tiene un
// adaptador WebGPU real (ver soportaWebGPU() en src/lib/llm.ts) pero
// SÍ hay conexión a internet — típicamente una laptop de escritorio
// con gráficos integrados bloqueados por Chrome, que es exactamente
// el escenario detectado en pruebas de campo. El cliente ya hizo
// todo el trabajo de RECUPERACIÓN (motor de reglas + búsqueda
// semántica) y solo nos manda el texto a REDACTAR — este endpoint
// nunca inventa datos de lugares, solo redacta con lo que ya viene
// en el contexto armado por el cliente.
//
// Proveedores: Groq primero, Gemini como respaldo automático si Groq
// falla (saturado, caído, o límite diario de SU capa gratuita
// alcanzado — cosas fuera de nuestro control). Ambos son APIs
// "compatibles con OpenAI" (mismo formato de mensajes), así que el
// respaldo es literalmente la misma función con otra URL/clave —
// verificado que Gemini expone este mismo formato en
// generativelanguage.googleapis.com/v1beta/openai/.
//
// CACHÉ DE RESPUESTAS: antes de gastar un token real, se revisa si
// esta MISMA pregunta (con el MISMO contexto — precios, lugares,
// etc.) ya se respondió recientemente para CUALQUIER usuario, no solo
// para este. Si varias personas preguntan lo mismo durante una
// demo (ej. "cuánto cuesta ir a la cascada"), solo la PRIMERA
// realmente consume Groq — el resto recibe la respuesta cacheada al
// instante, gratis, y SIN contar contra el límite diario. El caché
// vive en la misma base de datos (Neon), no en memoria del servidor
// — Vercel apaga y prende las funciones todo el tiempo, así que un
// caché en memoria se perdería solo y no serviría entre usuarios
// distintos. TTL corto (6 horas): suficiente para atrapar preguntas
// repetidas durante una sesión de prueba/demo, sin arriesgar servir
// un precio/horario desactualizado por días.
//
// IMPORTANTE sobre el "$0.01 USD" que a veces aparece en el panel de
// Groq: es un estimado de lo que costaría SI se usara el plan de
// pago — en el plan gratuito (sin tarjeta registrada) es IMPOSIBLE
// que cobren nada; los límites del free tier son un tope duro (error
// 429), no facturación. Ver console.groq.com/docs/billing-faqs.
//
// Variables de entorno requeridas en Vercel:
//   GROQ_API_KEY             (obligatoria — créala en console.groq.com)
//   GROQ_MODEL               (opcional, default abajo)
//   GEMINI_API_KEY           (opcional — si no está, simplemente no
//                             hay respaldo y el comportamiento es
//                             igual al de antes de este cambio)
//   GEMINI_MODEL             (opcional, default abajo)
//   IA_NUBE_LIMITE_DIARIO    (opcional, default 150 llamadas/día)
//   IA_CACHE_TTL_SEGUNDOS    (opcional, default 21600 = 6 horas)
//
// El tope diario es un techo DURO de gasto: no importa cuánta gente
// prueba la demo a la vez — pasado el límite, este endpoint responde
// con error y el cliente ya sabe caer solo al motor de reglas (ver
// ChatAssistant.tsx), así que la app sigue funcionando, solo deja de
// usar la nube por el resto del día.
// ============================================================

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Modelo rápido y ligero — bueno para respuestas cortas de chat.
// Si Groq lo retira o cambia de nombre, revisa los modelos vigentes
// en console.groq.com/docs/models y ajusta vía la variable de
// entorno GROQ_MODEL sin tocar este archivo.
const MODELO_DEFECTO = 'llama-3.1-8b-instant';

// Endpoint OpenAI-compatible de Gemini — mismo formato de mensajes
// (system + messages) que ya usa Groq, así que reutilizamos la misma
// función de llamada para ambos proveedores.
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
// "Flash-Lite" es el modelo con más peticiones/día en la capa
// gratuita de Gemini (verifica cifras vigentes en Google AI Studio,
// Google ha bajado cuotas gratis sin gran aviso en el pasado).
const MODELO_GEMINI_DEFECTO = 'gemini-2.5-flash-lite';

const LIMITE_DIARIO_DEFECTO = 150;
const CACHE_TTL_SEGUNDOS_DEFECTO = 60 * 60 * 6; // 6 horas

function getPool() {
  return new Pool({
    connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
}

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Incrementa el contador del día y devuelve si TODAVÍA se puede
// llamar a la API pagada hoy. Usa una tabla de una sola fila por
// fecha — crear la tabla si no existe es barato y evita un paso
// manual de migración.
async function dentroDelLimiteDiario(pool: Pool): Promise<{ ok: boolean; llamadasHoy: number; limite: number }> {
  const limite = parseInt(process.env.IA_NUBE_LIMITE_DIARIO || '', 10) || LIMITE_DIARIO_DEFECTO;
  const hoy = new Date().toISOString().slice(0, 10);

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ia_uso_diario (fecha DATE PRIMARY KEY, llamadas INT NOT NULL DEFAULT 0)`
  );
  const r = await pool.query(
    `INSERT INTO ia_uso_diario (fecha, llamadas) VALUES ($1, 1)
     ON CONFLICT (fecha) DO UPDATE SET llamadas = ia_uso_diario.llamadas + 1
     RETURNING llamadas`,
    [hoy]
  );
  const llamadasHoy = r.rows[0].llamadas as number;
  return { ok: llamadasHoy <= limite, llamadasHoy, limite };
}

// Clave de caché: hash del prompt de sistema + todos los mensajes tal
// cual se le mandarían al modelo. Si DOS peticiones (de cualquier
// usuario) llegan con exactamente el mismo contexto y la misma
// pregunta, es seguro reusar la respuesta — nada cambió de fondo.
function clavesCache(systemPrompt: string, mensajes: MensajeIA[]): string {
  const base = JSON.stringify({ systemPrompt, mensajes });
  return createHash('sha256').update(base).digest('hex');
}

async function buscarEnCache(
  pool: Pool,
  hash: string
): Promise<{ texto: string; proveedor: string } | null> {
  const ttl = parseInt(process.env.IA_CACHE_TTL_SEGUNDOS || '', 10) || CACHE_TTL_SEGUNDOS_DEFECTO;

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ia_respuestas_cache (
       hash TEXT PRIMARY KEY,
       texto TEXT NOT NULL,
       proveedor TEXT NOT NULL,
       creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  const r = await pool.query(
    `SELECT texto, proveedor FROM ia_respuestas_cache
     WHERE hash = $1 AND creado_en > NOW() - ($2::int * INTERVAL '1 second')`,
    [hash, ttl]
  );
  if (r.rows.length === 0) return null;
  return { texto: r.rows[0].texto as string, proveedor: r.rows[0].proveedor as string };
}

async function guardarEnCache(pool: Pool, hash: string, texto: string, proveedor: string): Promise<void> {
  // ON CONFLICT actualiza creado_en también — así una pregunta que
  // sigue siendo popular renueva su propio TTL en vez de expirar.
  await pool.query(
    `INSERT INTO ia_respuestas_cache (hash, texto, proveedor, creado_en)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (hash) DO UPDATE SET texto = $2, proveedor = $3, creado_en = NOW()`,
    [hash, texto, proveedor]
  );
}

interface MensajeIA {
  role: 'user' | 'assistant';
  content: string;
}

// Reutilizable para cualquier proveedor "compatible con OpenAI"
// (Groq, Gemini, y en el futuro Cerebras/OpenRouter si se agregan) —
// mismo formato de petición y de respuesta en los tres.
async function llamarProveedorOpenAICompatible(
  url: string,
  apiKey: string,
  modelo: string,
  systemPrompt: string,
  mensajes: MensajeIA[]
): Promise<string> {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 400,
      temperature: 0.3,
      messages: [{ role: 'system', content: systemPrompt }, ...mensajes],
    }),
  });

  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    throw new Error(`Proveedor respondió ${r.status}: ${detalle.slice(0, 200)}`);
  }

  const data = await r.json();
  const texto = data.choices?.[0]?.message?.content ?? '';
  if (!texto) throw new Error('Respuesta vacía del proveedor');
  return texto;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY; // opcional — sin esta, simplemente no hay respaldo
  if (!groqKey) {
    console.error('[IA nube] Falta GROQ_API_KEY en las variables de entorno de Vercel');
    return res.status(500).json({ error: 'IA en la nube no configurada' });
  }

  const pool = getPool();
  try {
    const { systemPrompt, mensajes } = req.body as {
      systemPrompt?: string;
      mensajes?: MensajeIA[];
    };

    if (!systemPrompt || !Array.isArray(mensajes) || mensajes.length === 0) {
      return res.status(400).json({ error: 'Faltan systemPrompt o mensajes' });
    }
    // Guardas básicas contra abuso/costos — un chat de asistencia
    // turística no necesita historiales largos ni prompts gigantes.
    if (mensajes.length > 20) {
      return res.status(400).json({ error: 'Conversación demasiado larga' });
    }
    const largoTotal = mensajes.reduce((acc, m) => acc + (m.content?.length ?? 0), 0);
    if (largoTotal > 8000 || systemPrompt.length > 4000) {
      return res.status(400).json({ error: 'Mensaje demasiado largo' });
    }

    // Caché ANTES del tope diario a propósito: un acierto de caché no
    // gasta ningún token real, así que tampoco debe contar contra el
    // límite del día — si diez personas preguntan lo mismo, solo la
    // primera consume presupuesto real.
    const hash = clavesCache(systemPrompt, mensajes);
    const enCache = await buscarEnCache(pool, hash);
    if (enCache) {
      return res.status(200).json({ texto: enCache.texto, proveedor: enCache.proveedor, desdeCache: true });
    }

    // Tope de gasto ANTES de gastar un solo token — esto es lo que
    // protege tu presupuesto sin importar si hay crédito gratis o no.
    const { ok, llamadasHoy, limite } = await dentroDelLimiteDiario(pool);
    if (!ok) {
      console.warn(`[IA nube] Límite diario alcanzado: ${llamadasHoy}/${limite}`);
      return res.status(429).json({ error: 'Límite diario de IA en la nube alcanzado' });
    }

    // 1) Groq primero — es el proveedor primario, más rápido y con
    // más margen diario en su capa gratuita.
    try {
      const texto = await llamarProveedorOpenAICompatible(
        GROQ_URL,
        groqKey,
        process.env.GROQ_MODEL || MODELO_DEFECTO,
        systemPrompt,
        mensajes
      );
      await guardarEnCache(pool, hash, texto, 'groq');
      return res.status(200).json({ texto, proveedor: 'groq' });
    } catch (errGroq) {
      console.warn('[IA nube] Groq falló, intentando respaldo:', errGroq);

      // 2) Gemini como respaldo — solo si hay clave configurada. Si
      // Groq está saturado/caído justo el día de la presentación,
      // esto evita que la app se quede sin nube (cae al motor de
      // reglas solo como último recurso, no como primer tropiezo).
      if (geminiKey) {
        try {
          const texto = await llamarProveedorOpenAICompatible(
            GEMINI_URL,
            geminiKey,
            process.env.GEMINI_MODEL || MODELO_GEMINI_DEFECTO,
            systemPrompt,
            mensajes
          );
          await guardarEnCache(pool, hash, texto, 'gemini');
          return res.status(200).json({ texto, proveedor: 'gemini' });
        } catch (errGemini) {
          console.error('[IA nube] Gemini (respaldo) también falló:', errGemini);
        }
      }

      return res.status(502).json({ error: 'IA en la nube no disponible en este momento' });
    }
  } catch (err) {
    console.error('[IA nube] Error interno:', err);
    return res.status(500).json({ error: 'Error interno' });
  } finally {
    await pool.end();
  }
}