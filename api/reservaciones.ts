// GET    /api/reservaciones                                    → mis reservaciones (turista) o las de mi servicio (prestador), requiere sesión
// GET    /api/reservaciones?disponibilidad=1&servicio_id=X&fecha=YYYY-MM-DD → pública, sin sesión
// POST   /api/reservaciones                                    → crear solicitud (requiere sesión de turista)
// PATCH  /api/reservaciones                                    → confirmar/rechazar (prestador) o cancelar (cualquiera de los dos)
//
// A propósito sin nada de pagos aquí — eso es la siguiente pieza,
// una vez que esto funcione bien. El prestador solo puede activar
// acepta_reservaciones si su servicio ya es Premium (se revalida en
// api/servicios/editar.ts, no aquí — aquí solo se respeta lo que
// diga esa columna).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

function getPool() {
  return new Pool({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
}
function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}
function getToken(req: VercelRequest) {
  const a = req.headers['authorization'] ?? '';
  return typeof a === 'string' && a.startsWith('Bearer ') ? a.slice(7) : null;
}
async function usuarioDeSesion(pool: Pool, token: string): Promise<{ id: number; tipo: string } | null> {
  const sess = await pool.query(
    `SELECT u.id, u.tipo FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token = $1 AND s.expira_en > NOW()`,
    [token]
  );
  return sess.rows.length > 0 ? sess.rows[0] : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const pool = getPool();
  try {
    // ── GET disponibilidad — pública, la usa el modal de reservación ──
    if (req.method === 'GET' && req.query.disponibilidad === '1') {
      const servicioId = Number(req.query.servicio_id);
      const fecha = String(req.query.fecha ?? '');
      if (!servicioId || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return res.status(400).json({ error: 'Faltan servicio_id o fecha válidos' });
      }
      const srv = await pool.query(
        `SELECT acepta_reservaciones, fechas_bloqueadas FROM servicios WHERE id = $1`,
        [servicioId]
      );
      if (srv.rows.length === 0) return res.status(404).json({ error: 'Servicio no encontrado' });
      const s = srv.rows[0];
      if (!s.acepta_reservaciones) {
        return res.status(200).json({ ok: true, disponible: false, motivo: 'sin_reservas' });
      }
      const bloqueadas: string[] = s.fechas_bloqueadas ?? [];
      if (bloqueadas.includes(fecha)) {
        return res.status(200).json({ ok: true, disponible: false, motivo: 'bloqueada' });
      }
      return res.status(200).json({ ok: true, disponible: true });
    }

    // Todo lo demás requiere sesión
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar' });
    const usuario = await usuarioDeSesion(pool, token);
    if (!usuario) return res.status(401).json({ error: 'Sesión inválida' });

    // ── GET — mis reservaciones ────────────────────────────────
    if (req.method === 'GET') {
      if (usuario.tipo === 'prestador') {
        const filas = await pool.query(
          `SELECT r.id, r.fecha, r.nombre_viajero, r.numero_personas, r.presupuesto,
                  r.notas, r.estado, r.politica, r.creado_en,
                  u.nombre AS turista_nombre, u.correo AS turista_correo,
                  s.nombre AS servicio_nombre
           FROM reservaciones r
           JOIN servicios s ON s.id = r.servicio_id
           JOIN usuarios u ON u.id = r.turista_id
           WHERE s.usuario_id = $1
           ORDER BY r.fecha ASC, r.creado_en DESC`,
          [usuario.id]
        );
        return res.status(200).json({ ok: true, reservaciones: filas.rows });
      }

      const filas = await pool.query(
        `SELECT r.id, r.fecha, r.nombre_viajero, r.numero_personas, r.presupuesto,
                r.notas, r.estado, r.politica, r.creado_en,
                s.id AS servicio_id, s.nombre AS servicio_nombre, s.municipio, s.categoria
         FROM reservaciones r
         JOIN servicios s ON s.id = r.servicio_id
         WHERE r.turista_id = $1
         ORDER BY r.fecha ASC, r.creado_en DESC`,
        [usuario.id]
      );
      return res.status(200).json({ ok: true, reservaciones: filas.rows });
    }

    // ── POST — crear solicitud de reservación (turista) ────────
    if (req.method === 'POST') {
      if (usuario.tipo !== 'turista') return res.status(403).json({ error: 'Solo turistas pueden reservar' });

      const { servicio_id, fecha, nombre_viajero, numero_personas, presupuesto, notas } = req.body ?? {};
      if (!servicio_id || !fecha || !nombre_viajero?.trim()) {
        return res.status(400).json({ error: 'Faltan datos: servicio, fecha o nombre del viajero' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || new Date(fecha) < new Date(new Date().toDateString())) {
        return res.status(400).json({ error: 'Fecha inválida' });
      }

      const srv = await pool.query(
        `SELECT acepta_reservaciones, fechas_bloqueadas, politica_cancelacion FROM servicios WHERE id = $1`,
        [servicio_id]
      );
      if (srv.rows.length === 0) return res.status(404).json({ error: 'Servicio no encontrado' });
      const s = srv.rows[0];
      if (!s.acepta_reservaciones) return res.status(400).json({ error: 'Este servicio no acepta reservaciones' });
      const bloqueadas: string[] = s.fechas_bloqueadas ?? [];
      if (bloqueadas.includes(fecha)) return res.status(409).json({ error: 'Esa fecha ya no está disponible' });

      const insertado = await pool.query(
        `INSERT INTO reservaciones (servicio_id, turista_id, nombre_viajero, numero_personas, fecha, presupuesto, notas, politica)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, fecha, nombre_viajero, numero_personas, presupuesto, notas, estado, politica, creado_en`,
        [servicio_id, usuario.id, nombre_viajero.trim(), Number(numero_personas) || 1, fecha, presupuesto || null, notas || null, s.politica_cancelacion]
      );

      return res.status(200).json({ ok: true, reservacion: insertado.rows[0] });
    }

    // ── PATCH — confirmar/rechazar (prestador) o cancelar (cualquiera) ──
    if (req.method === 'PATCH') {
      const { id, accion } = req.body ?? {};
      if (!id || !['confirmar', 'rechazar', 'cancelar'].includes(accion)) {
        return res.status(400).json({ error: 'Faltan id o accion válida' });
      }

      const fila = await pool.query(
        `SELECT r.id, r.turista_id, r.estado, s.usuario_id AS prestador_usuario_id
         FROM reservaciones r JOIN servicios s ON s.id = r.servicio_id
         WHERE r.id = $1`,
        [id]
      );
      if (fila.rows.length === 0) return res.status(404).json({ error: 'Reservación no encontrada' });
      const r = fila.rows[0];

      const esPrestadorDueno = usuario.tipo === 'prestador' && usuario.id === r.prestador_usuario_id;
      const esTuristaDueno = usuario.tipo === 'turista' && usuario.id === r.turista_id;

      if ((accion === 'confirmar' || accion === 'rechazar') && !esPrestadorDueno) {
        return res.status(403).json({ error: 'Solo el prestador puede confirmar o rechazar' });
      }
      if (accion === 'cancelar' && !esPrestadorDueno && !esTuristaDueno) {
        return res.status(403).json({ error: 'No puedes cancelar esta reservación' });
      }
      if (r.estado !== 'pendiente' && accion !== 'cancelar') {
        return res.status(409).json({ error: 'Esta reservación ya fue procesada' });
      }

      const nuevoEstado = accion === 'confirmar' ? 'confirmada' : accion === 'rechazar' ? 'rechazada' : 'cancelada';
      await pool.query(
        `UPDATE reservaciones SET estado = $1, actualizado_en = NOW() WHERE id = $2`,
        [nuevoEstado, id]
      );

      return res.status(200).json({ ok: true, estado: nuevoEstado });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  } finally {
    await pool.end();
  }
}
