// GET    /api/reservaciones                                    → mis reservaciones (turista) o las de mi servicio (prestador), requiere sesión
// GET    /api/reservaciones?disponibilidad=1&servicio_id=X&fecha=YYYY-MM-DD → pública, sin sesión
// POST   /api/reservaciones                                    → crear solicitud (requiere sesión de turista)
// PATCH  /api/reservaciones                                    → confirmar/rechazar (prestador) o cancelar (cualquiera de los dos)
// DELETE /api/reservaciones                                    → quitar del panel y de la bd (solo rechazada/cancelada, solo el dueño)
// GET    /api/reservaciones?recurso=mensajes&reservacion_id=X  → historial de la conversación de esa reservación
// POST   /api/reservaciones?recurso=mensajes                   → enviar mensaje/foto en esa conversación
// GET    /api/reservaciones?recurso=notificaciones              → avisos del usuario (ej. cancelaciones), marca como leídos al pedirlos
//
// Los mensajes viven aquí (no en un archivo aparte) para no pasarnos
// del límite de 12 funciones serverless del plan Hobby de Vercel.
// Cada conversación está ligada a UNA reservación — no es un chat
// abierto, solo entre quien reservó y el prestador de esa reserva.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Pool } from 'pg';
import { getPool } from './_lib/db.js';

// ── notificaciones — se auto-provisiona igual que otras tablas del
// proyecto (ver api/ia/chat.ts, api/conocimiento/admin.ts) para no
// depender de una migración manual aparte. Un aviso por evento
// relevante (por ahora: cancelaciones) — lo ve el OTRO participante
// de la reservación, no quien hizo la acción.
async function asegurarTablaNotificaciones(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notificaciones (
      id SERIAL PRIMARY KEY,
      usuario_id INT NOT NULL,
      reservacion_id INT,
      tipo TEXT NOT NULL DEFAULT 'info',
      titulo TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      leida BOOLEAN NOT NULL DEFAULT FALSE,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// Mensaje que le llega al otro participante cuando se cancela una
// reservación — el contenido cambia según la política de cancelación
// y si ya se había pagado el anticipo, que es justo lo que antes no
// se explicaba en ningún lado.
function mensajeCancelacion(opts: {
  politica: 'flexible' | 'no_reembolsable';
  pagoEstado: string;
  loCanceloElPrestador: boolean;
  servicioNombre: string;
}): { titulo: string; mensaje: string } {
  const { politica, pagoEstado, loCanceloElPrestador, servicioNombre } = opts;
  const titulo = loCanceloElPrestador ? 'El prestador canceló tu reservación' : 'Reservación cancelada';

  if (!loCanceloElPrestador) {
    // Notificamos al prestador de que el turista canceló — sin
    // lenguaje de reembolso, esa parte es entre el turista y su
    // propio pago.
    return { titulo: 'Un turista canceló su reservación', mensaje: `La reservación para "${servicioNombre}" fue cancelada por el turista. La fecha vuelve a estar disponible.` };
  }

  if (pagoEstado !== 'pagado') {
    return { titulo, mensaje: `"${servicioNombre}" canceló tu reservación. Como no habías pagado el anticipo, no se te cobró nada.` };
  }
  if (politica === 'flexible') {
    return { titulo, mensaje: `"${servicioNombre}" canceló tu reservación. Por su política flexible, tu anticipo se reembolsa por completo — contacta al prestador o a soporte si no ves el reembolso en unos días.` };
  }
  return { titulo, mensaje: `"${servicioNombre}" canceló tu reservación. Este servicio tiene política no reembolsable — escríbele al prestador desde Mensajes para resolver tu anticipo.` };
}

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
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
// Confirma que el usuario sea el turista que reservó o el prestador
// dueño del servicio de esa reservación — nadie más puede ver ni
// escribir en la conversación.
async function participanteDeReservacion(pool: Pool, reservacionId: number, usuario: { id: number; tipo: string }) {
  const fila = await pool.query(
    `SELECT r.turista_id, s.usuario_id AS prestador_usuario_id
     FROM reservaciones r JOIN servicios s ON s.id = r.servicio_id
     WHERE r.id = $1`,
    [reservacionId]
  );
  if (fila.rows.length === 0) return null;
  const { turista_id, prestador_usuario_id } = fila.rows[0];
  const esTurista = usuario.tipo === 'turista' && usuario.id === turista_id;
  const esPrestador = usuario.tipo === 'prestador' && usuario.id === prestador_usuario_id;
  if (!esTurista && !esPrestador) return null;
  return { esTurista, esPrestador };
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

    // ── ?recurso=mensajes — la conversación de una reservación ────
    if (req.query.recurso === 'mensajes') {
      const reservacionId = Number(req.method === 'GET' ? req.query.reservacion_id : req.body?.reservacion_id);
      if (!reservacionId) return res.status(400).json({ error: 'Falta reservacion_id' });

      const participante = await participanteDeReservacion(pool, reservacionId, usuario);
      if (!participante) return res.status(403).json({ error: 'No tienes acceso a esta conversación' });

      if (req.method === 'GET') {
        const mensajes = await pool.query(
          `SELECT m.id, m.remitente_id, m.texto, m.imagen_url, m.leido, m.creado_en,
                  u.nombre AS remitente_nombre
           FROM mensajes_reservacion m JOIN usuarios u ON u.id = m.remitente_id
           WHERE m.reservacion_id = $1
           ORDER BY m.creado_en ASC`,
          [reservacionId]
        );
        // Marca como leídos los mensajes del OTRO participante — los
        // propios nunca se marcan aquí, ya se sabe que se leyeron.
        await pool.query(
          `UPDATE mensajes_reservacion SET leido = TRUE
           WHERE reservacion_id = $1 AND remitente_id != $2 AND leido = FALSE`,
          [reservacionId, usuario.id]
        );
        return res.status(200).json({ ok: true, mensajes: mensajes.rows, propioId: usuario.id });
      }

      if (req.method === 'POST') {
        const { texto, imagen_url } = req.body ?? {};
        const textoLimpio = typeof texto === 'string' ? texto.trim().slice(0, 1000) : '';
        if (!textoLimpio && !imagen_url) return res.status(400).json({ error: 'Escribe algo o adjunta una foto' });

        const insertado = await pool.query(
          `INSERT INTO mensajes_reservacion (reservacion_id, remitente_id, texto, imagen_url)
           VALUES ($1, $2, $3, $4)
           RETURNING id, remitente_id, texto, imagen_url, leido, creado_en`,
          [reservacionId, usuario.id, textoLimpio || null, imagen_url || null]
        );
        return res.status(200).json({ ok: true, mensaje: insertado.rows[0] });
      }

      return res.status(405).json({ error: 'Método no permitido' });
    }

    // ── ?recurso=notificaciones — avisos del usuario (ej. cancelaciones) ──
    // Por default marca todo como leído al pedirlo (igual que los
    // mensajes), pero el polling de fondo de la burbuja pasa
    // ?marcar=0 para solo ASOMARSE al contador sin apagar el punto
    // rojo antes de que el usuario realmente abra el panel.
    if (req.method === 'GET' && req.query.recurso === 'notificaciones') {
      await asegurarTablaNotificaciones(pool);
      const filas = await pool.query(
        `SELECT id, reservacion_id, tipo, titulo, mensaje, leida, creado_en
         FROM notificaciones WHERE usuario_id = $1
         ORDER BY creado_en DESC LIMIT 30`,
        [usuario.id]
      );
      if (req.query.marcar !== '0') {
        await pool.query(
          `UPDATE notificaciones SET leida = TRUE WHERE usuario_id = $1 AND leida = FALSE`,
          [usuario.id]
        );
      }
      return res.status(200).json({ ok: true, notificaciones: filas.rows });
    }

    // ── GET — mis reservaciones (con contador de mensajes sin leer) ──
    if (req.method === 'GET') {
      // Vence sola una reservación confirmada que nadie pagó en 48h
      // — así el prestador no se queda con la fecha bloqueada por
      // alguien que nunca va a pagar. Se revisa aquí (al leer, no con
      // un cron aparte) porque es más simple y no necesita
      // infraestructura extra.
      const vencidas = await pool.query(
        `SELECT r.id, r.fecha, r.servicio_id FROM reservaciones r
         WHERE r.estado = 'confirmada' AND r.pago_estado != 'pagado'
           AND r.pago_vencimiento IS NOT NULL AND r.pago_vencimiento < NOW()`
      );
      for (const v of vencidas.rows) {
        const fechaStr = new Date(v.fecha).toISOString().slice(0, 10);
        await pool.query(`UPDATE reservaciones SET estado = 'cancelada', actualizado_en = NOW() WHERE id = $1`, [v.id]);
        await pool.query(
          `UPDATE servicios SET fechas_bloqueadas = (
             SELECT COALESCE(jsonb_agg(f), '[]'::jsonb)
             FROM jsonb_array_elements_text(fechas_bloqueadas) AS f
             WHERE f != $1
           ) WHERE id = $2`,
          [fechaStr, v.servicio_id]
        );
      }

      // `r.fecha` es DATE en Postgres — el driver `pg` lo entrega como
      // objeto Date de JS, y al pasar por JSON.stringify() se vuelve un
      // timestamp completo ("2026-08-16T00:00:00.000Z"). El frontend
      // esperaba un texto plano "YYYY-MM-DD" y le pegaba una hora
      // encima, resultando en "Invalid Date" — to_char() lo manda ya
      // como texto plano, sin ambigüedad para quien lo consuma.
      if (usuario.tipo === 'prestador') {
        const filas = await pool.query(
          `SELECT r.id, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, r.nombre_viajero, r.numero_personas, r.presupuesto,
                  r.notas, r.estado, r.politica, r.pago_estado, r.pago_vencimiento, r.creado_en,
                  u.nombre AS turista_nombre, u.correo AS turista_correo,
                  s.nombre AS servicio_nombre,
                  (SELECT COUNT(*) FROM mensajes_reservacion m
                   WHERE m.reservacion_id = r.id AND m.remitente_id != $1 AND m.leido = FALSE) AS mensajes_no_leidos
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
        `SELECT r.id, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, r.nombre_viajero, r.numero_personas, r.presupuesto,
                r.notas, r.estado, r.politica, r.pago_estado, r.pago_vencimiento, r.creado_en,
                s.id AS servicio_id, s.nombre AS servicio_nombre, s.municipio, s.categoria,
                s.monto_minimo, s.mostrar_usd_reservacion,
                (SELECT COUNT(*) FROM mensajes_reservacion m
                 WHERE m.reservacion_id = r.id AND m.remitente_id != $1 AND m.leido = FALSE) AS mensajes_no_leidos
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
        `SELECT r.id, r.turista_id, r.estado, r.fecha, r.servicio_id, r.politica, r.pago_estado,
                s.usuario_id AS prestador_usuario_id, s.nombre AS servicio_nombre
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
        accion === 'confirmar'
          ? `UPDATE reservaciones SET estado = $1, actualizado_en = NOW(), pago_vencimiento = NOW() + INTERVAL '48 hours' WHERE id = $2`
          : `UPDATE reservaciones SET estado = $1, actualizado_en = NOW() WHERE id = $2`,
        [nuevoEstado, id]
      );

      // Confirmar una reservación cierra esa fecha en automático —
      // así no se sigue mostrando "disponible" para alguien más. Si
      // luego se cancela una que ya estaba confirmada, se vuelve a
      // abrir (el hueco realmente quedó libre otra vez).
      const fechaStr = new Date(r.fecha).toISOString().slice(0, 10);
      if (accion === 'confirmar') {
        await pool.query(
          `UPDATE servicios SET fechas_bloqueadas =
             CASE WHEN fechas_bloqueadas @> to_jsonb($1::text)
                  THEN fechas_bloqueadas
                  ELSE fechas_bloqueadas || to_jsonb($1::text)
             END
           WHERE id = $2`,
          [fechaStr, r.servicio_id]
        );
      } else if (accion === 'cancelar' && r.estado === 'confirmada') {
        await pool.query(
          `UPDATE servicios SET fechas_bloqueadas = (
             SELECT COALESCE(jsonb_agg(f), '[]'::jsonb)
             FROM jsonb_array_elements_text(fechas_bloqueadas) AS f
             WHERE f != $1
           ) WHERE id = $2`,
          [fechaStr, r.servicio_id]
        );
      }

      // Avisar al OTRO participante — esto es lo que antes no
      // existía. Quien cancela ya sabe que canceló; el que se entera
      // por primera vez es el otro lado, y necesita saber qué pasa
      // con su pago según la política de cancelación del servicio.
      if (accion === 'cancelar') {
        await asegurarTablaNotificaciones(pool);
        const loCanceloElPrestador = esPrestadorDueno;
        const destinatarioId = loCanceloElPrestador ? r.turista_id : r.prestador_usuario_id;
        const { titulo, mensaje } = mensajeCancelacion({
          politica: r.politica ?? 'flexible',
          pagoEstado: r.pago_estado ?? 'sin_pagar',
          loCanceloElPrestador,
          servicioNombre: r.servicio_nombre,
        });
        await pool.query(
          `INSERT INTO notificaciones (usuario_id, reservacion_id, tipo, titulo, mensaje)
           VALUES ($1, $2, 'cancelacion', $3, $4)`,
          [destinatarioId, r.id, titulo, mensaje]
        );
      }

      return res.status(200).json({ ok: true, estado: nuevoEstado });
    }

    // ── DELETE — quitar del panel y de la bd ────────────────────
    // Solo para reservaciones ya resueltas (rechazada/cancelada) —
    // una pendiente o confirmada se cancela primero, no se borra a
    // la fuerza. Cualquiera de los dos participantes puede quitarla
    // de SU panel; borrar la fila no afecta al otro lado (ya vio su
    // notificación si aplicaba).
    if (req.method === 'DELETE') {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'Falta id' });

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
      if (!esPrestadorDueno && !esTuristaDueno) {
        return res.status(403).json({ error: 'No puedes quitar esta reservación' });
      }
      if (r.estado !== 'rechazada' && r.estado !== 'cancelada') {
        return res.status(409).json({ error: 'Solo puedes quitar reservaciones rechazadas o canceladas' });
      }

      await asegurarTablaNotificaciones(pool);
      await pool.query('DELETE FROM mensajes_reservacion WHERE reservacion_id = $1', [id]);
      await pool.query('DELETE FROM notificaciones WHERE reservacion_id = $1', [id]);
      await pool.query('DELETE FROM reservaciones WHERE id = $1', [id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  } finally {
    await pool.end();
  }
}