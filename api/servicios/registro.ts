import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

function getPool() { return new Pool({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 }); }
function generarCodigo(p='TGO'){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<8;i++)s+=c[Math.floor(Math.random()*c.length)];return `${p}-${s}`;}
function cors(res: VercelResponse){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');}
function getToken(req: VercelRequest){const a=req.headers['authorization']??'';return typeof a==='string'&&a.startsWith('Bearer ')?a.slice(7):null;}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const pool = getPool();
  try {
    if (req.method === 'GET') {
      const codigo = req.query.codigo as string;
      if (!codigo) return res.status(400).json({ error: 'Se requiere código' });
      const r = await pool.query('SELECT nombre, categoria, municipio, estado, codigo_seguimiento, motivo_rechazo, creado_en FROM servicios WHERE codigo_seguimiento=$1', [codigo.toUpperCase().trim()]);
      if (r.rows.length === 0) return res.status(404).json({ error: 'Código no encontrado' });
      return res.status(200).json({ ok: true, servicio: r.rows[0] });
    }
    if (req.method === 'POST') {
      const token = getToken(req);
      if (!token) return res.status(401).json({ error: 'No autenticado' });
      const sess = await pool.query('SELECT u.id, u.tipo FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token=$1 AND s.expira_en>NOW()', [token]);
      if (sess.rows.length === 0) return res.status(401).json({ error: 'Sesión inválida' });
      const usuario = sess.rows[0];
      // Hallazgo real de campo: antes esto exigía tipo === 'prestador'
      // desde el registro de cuenta — pero ahora el signup es simple
      // para todos, y "convertirse en prestador" pasa justo AQUÍ, al
      // enviar su primer servicio (doc MEJORAS DISEÑO PANEL PRESTADOR).
      if (usuario.tipo === 'admin') return res.status(403).json({ error: 'No aplica para administradores' });
      const { nombre, categoria, municipio, descripcion, precio, contacto, lat, lng, foto_verificacion } = req.body;
      // Hallazgo real de campo: antes categoría y municipio se
      // guardaban tal cual llegaran, SIN comparar contra la lista
      // real — cualquiera que mandara la petición directo a esta API
      // (sin pasar por el formulario) podía meter cualquier texto.
      // Mismo problema con el nombre (aceptaba puros números/símbolos)
      // y el contacto (sin ninguna forma exigida).
      const NOMBRE_NEGOCIO_VALIDO = /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/; // al menos una palabra real de 2+ letras en algún lado
      const CATEGORIAS_VALIDAS = ['Gastronomia', 'Naturaleza', 'Aventura', 'Hospedaje', 'Comercio', 'Cooperativa', 'Otro'];
      const MUNICIPIOS_VALIDOS = ['Catemaco', 'San Andrés Tuxtla', 'Santiago Tuxtla'];
      const TELEFONO_VALIDO = /^\+?[\d\s-]{10,15}$/;
      // Caja delimitadora de Los Tuxtlas (con margen), para descartar
      // coordenadas claramente equivocadas (0,0; otro país; etc.) —
      // mismos límites que usa el mapa principal, con algo de margen.
      const DENTRO_DE_TUXTLAS = (la: number, ln: number) => la >= 18.2 && la <= 18.85 && ln >= -95.65 && ln <= -94.8;

      if (!nombre?.trim() || nombre.trim().length < 3 || !NOMBRE_NEGOCIO_VALIDO.test(nombre.trim())) {
        return res.status(400).json({ error: 'Escribe el nombre real de tu negocio (no solo números o símbolos)' });
      }
      if (!CATEGORIAS_VALIDAS.includes(categoria)) {
        return res.status(400).json({ error: 'Categoría no válida' });
      }
      if (!MUNICIPIOS_VALIDOS.includes(municipio)) {
        return res.status(400).json({ error: 'Municipio no válido' });
      }
      if (!descripcion?.trim() || descripcion.trim().length < 20) return res.status(400).json({ error: 'Descripción mínimo 20 caracteres' });
      if (contacto?.trim() && !TELEFONO_VALIDO.test(contacto.trim())) {
        return res.status(400).json({ error: 'El contacto debe ser un número de teléfono (10 dígitos)' });
      }
      if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng) || !DENTRO_DE_TUXTLAS(lat, lng)) {
        return res.status(400).json({ error: 'La ubicación marcada está fuera de Los Tuxtlas — verifica el mapa' });
      }
      // Sin esto el admin no tiene forma de verificar que quien se
      // registra es una persona real antes de aprobar el servicio.
      if (typeof foto_verificacion !== 'string' || !foto_verificacion.startsWith('https://')) {
        return res.status(400).json({ error: 'Sube una foto de verificación de identidad para continuar' });
      }
      const ya = await pool.query("SELECT id FROM servicios WHERE usuario_id=$1 AND estado!='rechazado'", [usuario.id]);
      if (ya.rows.length > 0) return res.status(409).json({ error: 'Ya tienes un servicio activo' });
      const codigo = generarCodigo('TGO');
      const r = await pool.query('INSERT INTO servicios (usuario_id,nombre,categoria,municipio,descripcion,precio,contacto,lat,lng,codigo_seguimiento,foto_verificacion) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,nombre,categoria,municipio,estado,codigo_seguimiento,creado_en', [usuario.id,nombre.trim(),categoria,municipio,descripcion.trim(),precio??null,contacto??null,lat??null,lng??null,codigo,foto_verificacion]);
      // Esta solicitud es la que convierte al usuario en prestador —
      // si todavía era 'turista', se actualiza aquí para que el resto
      // de la app (Mi Perfil, /prestador) lo reconozca correctamente.
      if (usuario.tipo !== 'prestador') {
        await pool.query("UPDATE usuarios SET tipo = 'prestador' WHERE id = $1", [usuario.id]);
      }
      return res.status(200).json({ ok: true, servicio: r.rows[0], mensaje: `Tu código: ${codigo}`, tipoUsuario: 'prestador' });
    }
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    return res.status(500).json({ error: 'Error: ' + String(err) });
  } finally { await pool.end(); }
}