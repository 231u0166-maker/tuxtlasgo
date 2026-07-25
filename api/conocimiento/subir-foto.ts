// api/conocimiento/subir-foto.ts
// POST /api/conocimiento/subir-foto
// ============================================================
// Sube una foto a Cloudinary desde el panel de admin (Base de
// Conocimiento → Registrar servicio). Distinto de api/servicios/
// fotos.ts a propósito: ese endpoint exige un token de sesión de
// PRESTADOR y que el servicio YA esté aprobado — justo lo que no
// tenemos aquí, porque el equipo está dando de alta el servicio por
// primera vez. Este usa la misma contraseña de admin que el resto
// del panel, y las MISMAS credenciales de Cloudinary ya configuradas
// (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET) — ninguna cuenta ni
// configuración nueva que crear.
//
// Las fotos así subidas quedan automáticamente disponibles offline
// después: ya existe una regla de caché (runtimeCaching en
// vite.config.ts) para res.cloudinary.com.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? 'din6nzl1s',
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

function cors(res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Admin-Password');
}

// Fotos de buena calidad pesan más que el límite default de Vercel —
// se sube el tope para no rechazar imágenes reales de cámara/celular.
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const adminPwd = process.env.ADMIN_PASSWORD ?? 'tuxtlasgo2026';
    if (req.headers['x-admin-password'] !== adminPwd) {
        return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    try {
        const { imagenBase64 } = req.body as { imagenBase64?: string };
        if (!imagenBase64?.startsWith('data:image/')) {
            return res.status(400).json({ error: 'Se requiere una imagen en base64 (data:image/...)' });
        }

        const resultado = await cloudinary.uploader.upload(imagenBase64, {
            folder: 'tuxtlasgo/lugares',
            // Cloudinary sirve la versión óptima según el dispositivo que
            // la pida — no se pierde calidad al guardar, se optimiza al
            // entregar, que es lo que de verdad importa para offline.
            quality: 'auto:good',
        });

        return res.status(200).json({
            ok: true,
            url: resultado.secure_url,
            publicId: resultado.public_id,
        });
    } catch (err) {
        console.error('[subir-foto]', err);
        return res.status(500).json({ error: 'Error subiendo la foto: ' + String(err) });
    }
}