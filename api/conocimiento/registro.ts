import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';

function getPool() {
    return new Pool({
        connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 1,
    });
}

function generarCodigo(p = 'TGO') { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 8; i++)s += c[Math.floor(Math.random() * c.length)]; return `${p}-${s}`; }
function cors(res: VercelResponse) { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization'); }

export default async function handler(req: VercelRequest, res: VercelResponse) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    const pool = getPool();
    try {
        const { nombre, correo, password, tipo = 'turista' } = req.body;
        // Hallazgo real de campo: la validación anterior solo pedía 2+
        // caracteres para el nombre y CUALQUIER texto con un "@" para el
        // correo — dejaba pasar cosas como "Alfredo Martinez 121312" o
        // "a@a". Un nombre de persona no debería tener dígitos ni
        // símbolos raros; un correo debe tener forma de correo real.
        const NOMBRE_VALIDO = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'\- ]{1,59}$/;
        const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!nombre?.trim() || !NOMBRE_VALIDO.test(nombre.trim())) {
            return res.status(400).json({ error: 'Escribe un nombre real (solo letras y espacios, 2-60 caracteres)' });
        }
        if (!correo?.trim() || !CORREO_VALIDO.test(correo.trim())) {
            return res.status(400).json({ error: 'Escribe un correo válido (ej. nombre@dominio.com)' });
        }
        if (!password || password.length < 6) return res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });

        const existe = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [correo.toLowerCase().trim()]);
        if (existe.rows.length > 0) return res.status(409).json({ error: 'Este correo ya está registrado' });

        const hash = await bcrypt.hash(password, 10);
        const codigoRecuperacion = generarCodigo('REC');
        const ins = await pool.query('INSERT INTO usuarios (nombre, correo, password, tipo, codigo_recuperacion) VALUES ($1,$2,$3,$4,$5) RETURNING id, nombre, correo, tipo', [nombre.trim(), correo.toLowerCase().trim(), hash, tipo, codigoRecuperacion]);

        const token = generarCodigo('SES') + '-' + Date.now().toString(36);
        const expira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await pool.query('INSERT INTO sesiones (usuario_id, token, expira_en) VALUES ($1,$2,$3)', [ins.rows[0].id, token, expira]);

        return res.status(200).json({ ok: true, token, usuario: ins.rows[0], codigoRecuperacion, mensaje: `Bienvenido ${nombre.trim().split(' ')[0]}` });
    } catch (err) {
        console.error('[registro]', err);
        return res.status(500).json({ error: 'Error: ' + String(err) });
    } finally {
        await pool.end();
    }
}