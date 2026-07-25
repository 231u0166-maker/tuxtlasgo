// api/conocimiento/registrar-servicio.ts
// POST /api/conocimiento/registrar-servicio
// ============================================================
// Alta RÁPIDA de un servicio completo desde el panel de admin —
// el equipo de TuxtlasGO registra lugares reales directamente (sin
// pasar por el formulario público de prestadores), para llenar la
// plataforma con datos verificados en campo, mostrárselo a los
// dueños reales del negocio ("¿así se vería tu lugar en la app?"),
// y así facilitar que se sumen como prestadores después.
//
// DECISIÓN CLAVE: cada servicio en Neon exige un usuario_id válido
// (aprobados.ts hace JOIN con la tabla usuarios). Como todavía no
// existe una cuenta real del negocio, este endpoint crea/reutiliza
// UNA cuenta interna fija ("TuxtlasGO — equipo interno") la primera
// vez que se usa, y todos los registros del equipo quedan a nombre
// de esa cuenta — hasta que se hable con el dueño real y se
// transfiera el servicio a su propia cuenta de prestador (proceso
// manual, fuera de este endpoint por ahora).
//
// Entra directo como estado='aprobado' — a propósito, sin paso de
// revisión extra: es el propio equipo quien ya verificó el lugar en
// campo antes de registrarlo aquí, así que pedir "auto-aprobación"
// sería trabajo doble.
//
// Variables de entorno: mismas que el resto de endpoints de admin
// (NEON_DATABASE_URL/DATABASE_URL, ADMIN_PASSWORD).
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';

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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Admin-Password');
}

function generarCodigo(p = 'TGO') {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 8; i++) s += c[Math.floor(Math.random() * c.length)];
    return `${p}-${s}`;
}

const CORREO_EQUIPO = 'equipo@tuxtlasgo.interno';

// Obtiene el id de la cuenta interna "TuxtlasGO — equipo interno",
// creándola la primera vez que se necesite. La contraseña guardada es
// un hash aleatorio no reversible — esta cuenta NUNCA está pensada
// para iniciar sesión por la interfaz pública, solo sirve como
// "dueño" temporal de los servicios que el equipo da de alta
// directamente.
async function obtenerOCrearUsuarioEquipo(pool: Pool): Promise<number> {
    const existente = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [CORREO_EQUIPO]);
    if (existente.rows.length > 0) return existente.rows[0].id;

    const passwordNoUsable = createHash('sha256')
        .update(`cuenta-interna-sin-login-${Date.now()}-${Math.random()}`)
        .digest('hex');

    try {
        const r = await pool.query(
            `INSERT INTO usuarios (nombre, correo, password, tipo)
       VALUES ($1, $2, $3, 'prestador') RETURNING id`,
            ['TuxtlasGO (equipo interno)', CORREO_EQUIPO, passwordNoUsable]
        );
        return r.rows[0].id;
    } catch {
        // Carrera muy poco probable (dos peticiones casi simultáneas la
        // primera vez que se usa esto) — se vuelve a buscar en vez de
        // fallar la petición completa.
        const r2 = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [CORREO_EQUIPO]);
        if (r2.rows.length > 0) return r2.rows[0].id;
        throw new Error('No se pudo crear ni encontrar la cuenta interna del equipo');
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const adminPwd = process.env.ADMIN_PASSWORD ?? 'tuxtlasgo2026';
    if (req.headers['x-admin-password'] !== adminPwd) {
        return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    const pool = getPool();
    try {
        const {
            nombre, categoria, municipio, descripcion, precio, contacto,
            lat, lng, horario, diasAbierto, duracion, comoLlegar, tip,
            idealPara, fotos,
        } = req.body as {
            nombre?: string;
            categoria?: string;
            municipio?: string;
            descripcion?: string;
            precio?: string;
            contacto?: string;
            lat?: number;
            lng?: number;
            horario?: string;
            diasAbierto?: string;
            duracion?: string;
            comoLlegar?: string;
            tip?: string;
            idealPara?: string[];
            fotos?: string[];
        };

        if (!nombre?.trim() || nombre.trim().length < 3) {
            return res.status(400).json({ error: 'Nombre muy corto' });
        }
        if (!categoria) return res.status(400).json({ error: 'Falta categoría' });
        if (!municipio) return res.status(400).json({ error: 'Falta municipio' });
        if (!descripcion?.trim() || descripcion.trim().length < 10) {
            return res.status(400).json({ error: 'Descripción muy corta' });
        }

        const usuarioId = await obtenerOCrearUsuarioEquipo(pool);
        const codigo = generarCodigo('TGO');

        const r = await pool.query(
            `INSERT INTO servicios (
         usuario_id, nombre, categoria, municipio, descripcion, precio, contacto,
         lat, lng, codigo_seguimiento, estado,
         horario, dias_abierto, duracion, como_llegar, tip, ideal_para, fotos
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, 'aprobado',
         $11, $12, $13, $14, $15, $16, $17
       ) RETURNING id, nombre, categoria, municipio, estado, codigo_seguimiento, creado_en`,
            [
                usuarioId,
                nombre.trim(),
                categoria,
                municipio,
                descripcion.trim(),
                precio?.trim() || null,
                contacto?.trim() || null,
                lat ?? null,
                lng ?? null,
                codigo,
                horario?.trim() || null,
                diasAbierto?.trim() || null,
                duracion?.trim() || null,
                comoLlegar?.trim() || null,
                tip?.trim() || null,
                idealPara && idealPara.length > 0 ? JSON.stringify(idealPara) : null,
                fotos && fotos.length > 0 ? JSON.stringify(fotos) : null,
            ]
        );

        return res.status(200).json({ ok: true, servicio: r.rows[0] });
    } catch (err) {
        console.error('[registrar-servicio]', err);
        return res.status(500).json({ error: 'Error: ' + String(err) });
    } finally {
        await pool.end();
    }
}