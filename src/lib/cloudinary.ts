// ─── Cloudinary — subida directa desde el frontend ───
// Usa un upload preset "unsigned" para no exponer el API Secret
// Cloud name se lee de variable de entorno VITE_CLOUDINARY_CLOUD_NAME

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? 'din6nzl1s';
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET ?? 'tuxtlasgo_fotos';
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

export interface ProgresoSubida {
  porcentaje: number;
  url?: string;
  publicId?: string;
  error?: string;
}

/**
 * Sube una imagen a Cloudinary con progreso en tiempo real.
 * No requiere backend — usa upload preset unsigned.
 * La URL devuelta es HTTPS y se puede cachear en el Service Worker.
 */
export function subirFoto(
  file: File,
  codigoServicio: string,
  onProgreso: (p: ProgresoSubida) => void
): () => void {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();

  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', `servicios/${codigoServicio}`);
  // Transformación automática: redimensionar a máx 1200px, calidad auto
  formData.append('tags', `tuxtlasgo,servicio,${codigoServicio}`);

  // Progreso
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      onProgreso({ porcentaje: pct });
    }
  };

  // Éxito
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const data = JSON.parse(xhr.responseText);
        // URL con transformación WebP automática (mejor para PWA)
        const url = data.secure_url;
        onProgreso({ porcentaje: 100, url, publicId: data.public_id });
      } catch {
        onProgreso({ porcentaje: 0, error: 'Respuesta inválida del servidor' });
      }
    } else {
      try {
        const err = JSON.parse(xhr.responseText);
        onProgreso({ porcentaje: 0, error: err.error?.message ?? `Error ${xhr.status}` });
      } catch {
        onProgreso({ porcentaje: 0, error: `Error HTTP ${xhr.status}` });
      }
    }
  };

  // Error de red
  xhr.onerror = () => onProgreso({ porcentaje: 0, error: 'Sin conexión a internet' });
  xhr.onabort = () => onProgreso({ porcentaje: 0, error: 'Subida cancelada' });

  xhr.open('POST', UPLOAD_URL);
  xhr.send(formData);

  // Cancelar
  return () => xhr.abort();
}

/**
 * Elimina una imagen de Cloudinary.
 * Requiere el public_id (no la URL completa).
 * Se hace desde el backend para no exponer el API Secret.
 */
export async function eliminarFoto(publicId: string, token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/servicios/fotos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ publicId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Sube un video corto de Comunidad a Cloudinary (mismo mecanismo que
 * subirFotoComunidad, pero al endpoint de video). El cupo mensual se
 * valida server-side en api/comunidad/publicaciones.ts — esto solo
 * sube el archivo; el post se crea después con la URL resultante.
 */
export function subirVideoComunidad(
  file: File,
  usuarioId: number | string,
  onProgreso: (p: ProgresoSubida & { bytes?: number; duracionSeg?: number }) => void
): () => void {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  const UPLOAD_URL_VIDEO = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`;

  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', `comunidad-videos/${usuarioId}`);
  formData.append('tags', `tuxtlasgo,comunidad,video,usuario-${usuarioId}`);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      onProgreso({ porcentaje: pct });
    }
  };

  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const data = JSON.parse(xhr.responseText);
        onProgreso({
          porcentaje: 100,
          url: data.secure_url,
          publicId: data.public_id,
          bytes: data.bytes,
          duracionSeg: data.duration ? Math.round(data.duration) : undefined,
        });
      } catch {
        onProgreso({ porcentaje: 0, error: 'Respuesta inválida del servidor' });
      }
    } else {
      try {
        const err = JSON.parse(xhr.responseText);
        onProgreso({ porcentaje: 0, error: err.error?.message ?? `Error ${xhr.status}` });
      } catch {
        onProgreso({ porcentaje: 0, error: `Error HTTP ${xhr.status}` });
      }
    }
  };

  xhr.onerror = () => onProgreso({ porcentaje: 0, error: 'Sin conexión a internet' });
  xhr.onabort = () => onProgreso({ porcentaje: 0, error: 'Subida cancelada' });

  xhr.open('POST', UPLOAD_URL_VIDEO);
  xhr.send(formData);

  return () => xhr.abort();
}

/**
 * Lee la duración de un video ANTES de subirlo (evita gastar cupo /
 * datos móviles en un clip que de todos modos vamos a rechazar por
 * pasarse del minuto). Usa un <video> invisible, nunca se agrega al DOM.
 */
export function leerDuracionVideo(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('No se pudo leer el video'));
    };
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Sube una foto de una publicación de Comunidad. Misma mecánica que
 * subirFoto, carpeta distinta (comunidad/<usuarioId> en vez de
 * servicios/<código>) para no mezclarlas con las fotos de servicios.
 */
export function subirFotoComunidad(
  file: File,
  usuarioId: number | string,
  onProgreso: (p: ProgresoSubida) => void
): () => void {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();

  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', `comunidad/${usuarioId}`);
  formData.append('tags', `tuxtlasgo,comunidad,usuario-${usuarioId}`);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      onProgreso({ porcentaje: pct });
    }
  };

  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const data = JSON.parse(xhr.responseText);
        onProgreso({ porcentaje: 100, url: data.secure_url, publicId: data.public_id });
      } catch {
        onProgreso({ porcentaje: 0, error: 'Respuesta inválida del servidor' });
      }
    } else {
      try {
        const err = JSON.parse(xhr.responseText);
        onProgreso({ porcentaje: 0, error: err.error?.message ?? `Error ${xhr.status}` });
      } catch {
        onProgreso({ porcentaje: 0, error: `Error HTTP ${xhr.status}` });
      }
    }
  };

  xhr.onerror = () => onProgreso({ porcentaje: 0, error: 'Sin conexión a internet' });
  xhr.onabort = () => onProgreso({ porcentaje: 0, error: 'Subida cancelada' });

  xhr.open('POST', UPLOAD_URL);
  xhr.send(formData);

  return () => xhr.abort();
}

/**
 * Sube una foto dentro de la conversación de una reservación —
 * carpeta reservaciones/<reservacionId> para mantenerlas separadas
 * de las demás fotos.
 */
export function subirFotoMensaje(
  file: File,
  reservacionId: number | string,
  onProgreso: (p: ProgresoSubida) => void
): () => void {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();

  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', `reservaciones/${reservacionId}`);
  formData.append('tags', `tuxtlasgo,reservacion,reservacion-${reservacionId}`);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      onProgreso({ porcentaje: pct });
    }
  };

  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const data = JSON.parse(xhr.responseText);
        onProgreso({ porcentaje: 100, url: data.secure_url, publicId: data.public_id });
      } catch {
        onProgreso({ porcentaje: 0, error: 'Respuesta inválida del servidor' });
      }
    } else {
      try {
        const err = JSON.parse(xhr.responseText);
        onProgreso({ porcentaje: 0, error: err.error?.message ?? `Error ${xhr.status}` });
      } catch {
        onProgreso({ porcentaje: 0, error: `Error HTTP ${xhr.status}` });
      }
    }
  };

  xhr.onerror = () => onProgreso({ porcentaje: 0, error: 'Sin conexión a internet' });
  xhr.onabort = () => onProgreso({ porcentaje: 0, error: 'Subida cancelada' });

  xhr.open('POST', UPLOAD_URL);
  xhr.send(formData);

  return () => xhr.abort();
}