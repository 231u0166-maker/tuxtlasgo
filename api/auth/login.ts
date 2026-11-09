// api/auth/login.ts — también atiende la recuperación de contraseña
// (?accion=recuperar), fusionado aquí para no pasarnos del límite de
// 12 funciones serverless del plan Hobby de Vercel.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { getPool } from '../_lib/db.js';

function generarCodigo(p='SES'){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<8;i++)s+=c[Math.floor(Math.random()*c.length)];return `${p}-${s}`;}
function cors(res: VercelResponse){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const pool = getPool();
  try {
    if (req.query.accion === 'recuperar') {
      const { correo, codigoRecuperacion, nuevaPassword } = req.body;
      if (!correo || !codigoRecuperacion || !nuevaPassword) return res.status(400).json({ error: 'Faltan datos' });
      if (nuevaPassword.length < 6) return res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });
      const r = await pool.query('SELECT id FROM usuarios WHERE correo = $1 AND codigo_recuperacion = $2', [correo.toLowerCase().trim(), codigoRecuperacion.toUpperCase().trim()]);
      if (r.rows.length === 0) return res.status(401).json({ error: 'Correo o código incorrectos' });
      const hash = await bcrypt.hash(nuevaPassword, 10);
      await pool.query('UPDATE usuarios SET password = $1, actualizado_en = NOW() WHERE id = $2', [hash, r.rows[0].id]);
      await pool.query('DELETE FROM sesiones WHERE usuario_id = $1', [r.rows[0].id]);
      return res.status(200).json({ ok: true, mensaje: 'Contraseña actualizada. Inicia sesión.' });
    }

    // ── Inicio de sesión con Google ──────────────────────────────
    // El navegador manda el "credential" (ID token) que le dio Google. Aquí
    // se verifica con Google (firma, vigencia), se comprueba que sea para
    // NUESTRA app (aud) y que el correo esté verificado. Si el correo ya
    // existe se entra a esa misma cuenta (turista o prestador); si no, se
    // crea una de turista. Ser prestador sigue siendo el trámite de siempre
    // (formulario + visto bueno del admin). La contraseña de estas cuentas
    // es un hash aleatorio que nadie conoce: solo entran con Google.
    if (req.query.accion === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) return res.status(503).json({ error: 'El inicio con Google aún no está configurado' });
      const credential = typeof req.body?.credential === 'string' ? req.body.credential : '';
      if (!credential) return res.status(400).json({ error: 'Falta la credencial de Google' });
      const g = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
      const info: any = await g.json().catch(() => ({}));
      const emisorOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
      const verificado = info.email_verified === true || info.email_verified === 'true';
      if (!g.ok || info.aud !== clientId || !emisorOk || !verificado || !info.email) {
        return res.status(401).json({ error: 'No pudimos verificar tu cuenta de Google' });
      }
      const correoG = String(info.email).toLowerCase().trim();
      const nombreG = String(info.name || correoG.split('@')[0]).trim().slice(0, 60) || 'Usuario';
      const fotoG = typeof info.picture === 'string' ? info.picture : null;
      let nuevo = false;
      let fila = (await pool.query('SELECT id, nombre, correo, tipo, foto_url FROM usuarios WHERE correo = $1', [correoG])).rows[0];
      if (!fila) {
        const hash = await bcrypt.hash(generarCodigo('GOO') + Math.random().toString(36), 10);
        fila = (
          await pool.query(
            "INSERT INTO usuarios (nombre, correo, password, tipo, foto_url) VALUES ($1,$2,$3,'turista',$4) RETURNING id, nombre, correo, tipo, foto_url",
            [nombreG, correoG, hash, fotoG]
          )
        ).rows[0];
        nuevo = true;
      } else if (!fila.foto_url && fotoG) {
        await pool.query('UPDATE usuarios SET foto_url = $1, actualizado_en = NOW() WHERE id = $2', [fotoG, fila.id]);
        fila.foto_url = fotoG;
      }
      const tokenG = generarCodigo('SES') + '-' + Date.now().toString(36);
      await pool.query('INSERT INTO sesiones (usuario_id, token, expira_en) VALUES ($1,$2,$3)', [fila.id, tokenG, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)]);
      return res.status(200).json({ ok: true, token: tokenG, nuevo, usuario: fila });
    }

    const { correo, password } = req.body;
    if (!correo || !password) return res.status(400).json({ error: 'Correo y contraseña requeridos' });
    const r = await pool.query('SELECT id, nombre, correo, password, tipo, foto_url FROM usuarios WHERE correo = $1', [correo.toLowerCase().trim()]);
    if (r.rows.length === 0) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    const u = r.rows[0];
    if (!await bcrypt.compare(password, u.password)) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    const token = generarCodigo('SES') + '-' + Date.now().toString(36);
    const expira = new Date(Date.now() + 30*24*60*60*1000);
    await pool.query('INSERT INTO sesiones (usuario_id, token, expira_en) VALUES ($1,$2,$3)', [u.id, token, expira]);
    return res.status(200).json({ ok: true, token, usuario: { id: u.id, nombre: u.nombre, correo: u.correo, tipo: u.tipo, foto_url: u.foto_url } });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + String(err) });
  } finally { await pool.end(); }
}