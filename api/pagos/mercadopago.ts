// GET  /api/pagos/mercadopago?accion=conectar         → arma la URL de autorización de MP (requiere sesión)
// GET  /api/pagos/mercadopago?accion=oauth_callback    → MP redirige aquí tras autorizar (público)
// POST /api/pagos/mercadopago                          → crear preferencia de Premium (requiere sesión)
// POST /api/pagos/mercadopago?accion=webhook           → MP avisa que un pago cambió (público)
//
// El dinero del Plan Premium ($89) llega a la cuenta dueña de
// MERCADOPAGO_ACCESS_TOKEN — eso no cambia. Lo que se agrega aquí es
// distinto: cuando un PRESTADOR conecta su propia cuenta (OAuth),
// queda autorizado para que, en cada reservación futura, el pago se
// reparta solo — 94% a él, 6% a la plataforma — sin que nadie tenga
// que hacer una transferencia manual. Ese reparto en sí (con
// marketplace_fee) se activa cuando exista el sistema de
// reservaciones — este archivo solo deja lista la autorización.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import { createHmac } from 'crypto';

const PRECIO_PREMIUM_MXN = 89;
const DIAS_VIGENCIA = 30;

function getPool() {
  return new Pool({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
}
function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}
function getToken(req: VercelRequest) {
  const a = req.headers['authorization'] ?? '';
  return typeof a === 'string' && a.startsWith('Bearer ') ? a.slice(7) : null;
}

// El "state" del OAuth va firmado con el Client Secret — así nadie
// puede armar un state falso y conectar su propia cuenta de Mercado
// Pago a un servicio de otro prestador.
function firmarEstado(servicioId: number): string {
  const secreto = process.env.MERCADOPAGO_CLIENT_SECRET ?? '';
  const firma = createHmac('sha256', secreto).update(String(servicioId)).digest('hex').slice(0, 20);
  return `${servicioId}.${firma}`;
}
function verificarEstado(state: string): number | null {
  const [idStr, firma] = String(state).split('.');
  if (!idStr || !firma) return null;
  const id = Number(idStr);
  if (!id) return null;
  return firmarEstado(id).split('.')[1] === firma ? id : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const clientId = process.env.MERCADOPAGO_CLIENT_ID;
  const clientSecret = process.env.MERCADOPAGO_CLIENT_SECRET;
  const accion = req.query.accion;
  const origen = `https://${req.headers.host}`;

  // ── GET: iniciar conexión OAuth (el prestador pidió conectar) ──
  if (req.method === 'GET' && accion === 'conectar') {
    if (!clientId) {
      return res.status(503).json({ error: 'Falta configurar MERCADOPAGO_CLIENT_ID en Vercel.' });
    }
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar' });

    const pool = getPool();
    try {
      const sess = await pool.query(
        `SELECT s.id AS servicio_id FROM sesiones ss
         JOIN usuarios u ON u.id = ss.usuario_id
         JOIN servicios s ON s.usuario_id = u.id
         WHERE ss.token = $1 AND ss.expira_en > NOW()
         ORDER BY s.creado_en DESC LIMIT 1`,
        [token]
      );
      if (sess.rows.length === 0) return res.status(401).json({ error: 'Sesión inválida o no tienes un servicio registrado' });
      const servicioId = sess.rows[0].servicio_id;

      const redirectUri = `${origen}/api/pagos/mercadopago?accion=oauth_callback`;
      const state = firmarEstado(servicioId);
      const url =
        `https://auth.mercadopago.com.mx/authorization?client_id=${encodeURIComponent(clientId)}` +
        `&response_type=code&platform_id=mp&state=${encodeURIComponent(state)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}`;

      return res.status(200).json({ ok: true, url });
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    } finally {
      await pool.end();
    }
  }

  // ── GET: Mercado Pago regresa aquí después de que el prestador
  // autorizó (o canceló) — este endpoint no lo llama nuestro
  // frontend, lo llama el navegador del prestador redirigido por MP.
  if (req.method === 'GET' && accion === 'oauth_callback') {
    const { code, state, error: errorMp } = req.query;

    if (errorMp || typeof code !== 'string' || typeof state !== 'string') {
      return res.redirect(302, `${origen}/app?mp_conectado=error`);
    }
    const servicioId = verificarEstado(state);
    if (!servicioId || !clientId || !clientSecret) {
      return res.redirect(302, `${origen}/app?mp_conectado=error`);
    }

    const pool = getPool();
    try {
      const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${origen}/api/pagos/mercadopago?accion=oauth_callback`,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return res.redirect(302, `${origen}/app?mp_conectado=error`);
      }

      await pool.query(
        `UPDATE servicios
         SET mp_conectado = TRUE, mp_user_id = $1, mp_access_token = $2,
             mp_refresh_token = $3, mp_conectado_en = NOW()
         WHERE id = $4`,
        [String(tokenData.user_id), tokenData.access_token, tokenData.refresh_token ?? null, servicioId]
      );

      return res.redirect(302, `${origen}/app?mp_conectado=exito`);
    } catch {
      return res.redirect(302, `${origen}/app?mp_conectado=error`);
    } finally {
      await pool.end();
    }
  }

  // ── POST: desconectar (el prestador ya no quiere tener la cuenta
  // ligada) — simple borrado local, no requiere avisarle a MP.
  if (req.method === 'POST' && accion === 'desconectar') {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar' });
    const pool = getPool();
    try {
      const sess = await pool.query(
        `SELECT s.id AS servicio_id FROM sesiones ss
         JOIN usuarios u ON u.id = ss.usuario_id
         JOIN servicios s ON s.usuario_id = u.id
         WHERE ss.token = $1 AND ss.expira_en > NOW()
         ORDER BY s.creado_en DESC LIMIT 1`,
        [token]
      );
      if (sess.rows.length === 0) return res.status(401).json({ error: 'Sesión inválida' });
      await pool.query(
        `UPDATE servicios SET mp_conectado = FALSE, mp_user_id = NULL,
         mp_access_token = NULL, mp_refresh_token = NULL WHERE id = $1`,
        [sess.rows[0].servicio_id]
      );
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    } finally {
      await pool.end();
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!accessToken) {
    return res.status(503).json({ error: 'Los pagos todavía no están configurados. Falta MERCADOPAGO_ACCESS_TOKEN en Vercel.' });
  }

  const pool = getPool();
  try {
    // ── Webhook — Mercado Pago nos avisa que un pago cambió ───────
    if (accion === 'webhook') {
      const paymentId =
        req.body?.data?.id ??
        req.body?.id ??
        (typeof req.query['data.id'] === 'string' ? req.query['data.id'] : null) ??
        (typeof req.query.id === 'string' ? req.query.id : null);

      if (!paymentId) return res.status(200).json({ ok: true });

      const pagoRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!pagoRes.ok) return res.status(200).json({ ok: true });
      const pago = await pagoRes.json();

      const servicioId = Number(pago.external_reference);
      if (!servicioId) return res.status(200).json({ ok: true });

      await pool.query(
        `INSERT INTO pagos_premium (servicio_id, mp_preference_id, mp_payment_id, estado, monto, actualizado_en)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (mp_payment_id) DO UPDATE
         SET estado = EXCLUDED.estado, actualizado_en = NOW()`,
        [servicioId, pago.order?.id ?? null, String(pago.id), pago.status === 'approved' ? 'aprobado' : pago.status, pago.transaction_amount]
      );

      if (pago.status === 'approved') {
        await pool.query(
          `UPDATE servicios
           SET premium = TRUE,
               premium_desde = NOW(),
               premium_hasta = NOW() + INTERVAL '${DIAS_VIGENCIA} days'
           WHERE id = $1`,
          [servicioId]
        );
      }

      return res.status(200).json({ ok: true });
    }

    // ── Crear preferencia — el prestador quiere pagar el Premium ──
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar' });

    const sess = await pool.query(
      `SELECT s.id AS servicio_id, u.correo FROM sesiones ss
       JOIN usuarios u ON u.id = ss.usuario_id
       JOIN servicios s ON s.usuario_id = u.id
       WHERE ss.token = $1 AND ss.expira_en > NOW()
       ORDER BY s.creado_en DESC LIMIT 1`,
      [token]
    );
    if (sess.rows.length === 0) {
      return res.status(401).json({ error: 'Sesión inválida o no tienes un servicio registrado' });
    }
    const { servicio_id: servicioId, correo } = sess.rows[0];

    const preferencia = {
      items: [{
        title: 'Plan Premium TuxtlasGO — 1 mes',
        quantity: 1,
        currency_id: 'MXN',
        unit_price: PRECIO_PREMIUM_MXN,
      }],
      payer: { email: correo },
      external_reference: String(servicioId),
      notification_url: `${origen}/api/pagos/mercadopago?accion=webhook`,
      back_urls: {
        success: `${origen}/app?premium=exito`,
        failure: `${origen}/app?premium=error`,
        pending: `${origen}/app?premium=pendiente`,
      },
      auto_return: 'approved',
    };

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(preferencia),
    });
    const mpData = await mpRes.json();
    if (!mpRes.ok) {
      return res.status(502).json({ error: mpData.message ?? 'Mercado Pago rechazó la solicitud' });
    }

    await pool.query(
      `INSERT INTO pagos_premium (servicio_id, mp_preference_id, estado, monto)
       VALUES ($1, $2, 'pendiente', $3)`,
      [servicioId, mpData.id, PRECIO_PREMIUM_MXN]
    );

    const esPrueba = accessToken.startsWith('TEST-');
    const url = esPrueba ? mpData.sandbox_init_point : mpData.init_point;

    return res.status(200).json({ ok: true, url });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  } finally {
    await pool.end();
  }
}
