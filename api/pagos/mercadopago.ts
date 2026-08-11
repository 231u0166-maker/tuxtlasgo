// POST /api/pagos/mercadopago                  → crear preferencia de pago (requiere sesión)
// POST /api/pagos/mercadopago?accion=webhook   → Mercado Pago llama aquí cuando cambia un pago
//
// El dinero llega a la cuenta de Mercado Pago dueña del Access Token
// (MERCADOPAGO_ACCESS_TOKEN en Vercel) — no hay reparto ni "cuenta
// del prestador" aquí, es el prestador pagándole a la plataforma
// para desbloquear Premium, no un marketplace.
//
// Importante: el webhook es la ÚNICA fuente de verdad para activar
// Premium. Nunca se activa por lo que diga el navegador al volver
// del checkout — alguien podría manipular esa URL de regreso. El
// navegador solo redirige; quien realmente prende premium=true es
// este archivo, después de consultarle a Mercado Pago el estado
// real del pago.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

const PRECIO_PREMIUM_MXN = 89;
const DIAS_VIGENCIA = 30;

function getPool() {
  return new Pool({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
}
function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}
function getToken(req: VercelRequest) {
  const a = req.headers['authorization'] ?? '';
  return typeof a === 'string' && a.startsWith('Bearer ') ? a.slice(7) : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(503).json({ error: 'Los pagos todavía no están configurados. Falta MERCADOPAGO_ACCESS_TOKEN en Vercel.' });
  }

  const pool = getPool();
  try {
    // ── Webhook — Mercado Pago nos avisa que un pago cambió ───────
    if (req.query.accion === 'webhook') {
      // Mercado Pago manda el id del pago en el body (webhooks
      // nuevos) o en query (IPN viejo) — cubrimos ambos.
      const paymentId =
        req.body?.data?.id ??
        req.body?.id ??
        (typeof req.query['data.id'] === 'string' ? req.query['data.id'] : null) ??
        (typeof req.query.id === 'string' ? req.query.id : null);

      if (!paymentId) return res.status(200).json({ ok: true }); // notificación que no es de pago, ack y ya

      const pagoRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!pagoRes.ok) return res.status(200).json({ ok: true }); // no se pudo confirmar, MP reintentará
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

    // ── Crear preferencia — el prestador quiere pagar ─────────────
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

    const origen = `https://${req.headers.host}`;
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

    // Con credenciales de PRUEBA (TEST-...) hay que usar
    // sandbox_init_point; con las de producción, init_point.
    const esPrueba = accessToken.startsWith('TEST-');
    const url = esPrueba ? mpData.sandbox_init_point : mpData.init_point;

    return res.status(200).json({ ok: true, url });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  } finally {
    await pool.end();
  }
}
