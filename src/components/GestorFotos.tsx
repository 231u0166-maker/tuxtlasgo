// GestorFotos.tsx — subida y gestión de fotos para prestadores aprobados
// Usa Firebase Storage para subir, Neon para guardar las URLs
import { useState, useRef, useCallback } from 'react';
import { Upload, X, ImagePlus, CheckCircle2, AlertCircle, Loader2, GripVertical } from 'lucide-react';
import { subirFoto } from '../lib/cloudinary';
import { getToken } from '../lib/auth';

interface Props {
  codigoSeguimiento: string;
  fotosIniciales?: string[];
  onFotosActualizadas?: (fotos: string[]) => void;
}

interface FotoLocal {
  id: string;
  url?: string;           // URL de Cloudinary (cuando está subida)
  publicId?: string;      // public_id de Cloudinary (para borrar)
  preview?: string;       // URL local (mientras sube)
  progreso: number;       // 0-100
  error?: string;
  subiendo: boolean;
  cancelar?: () => void;
}

export default function GestorFotos({ codigoSeguimiento, fotosIniciales = [], onFotosActualizadas }: Props) {
  const [fotos, setFotos] = useState<FotoLocal[]>(
    fotosIniciales.map((url, i) => ({
      id: `saved-${i}`,
      url,
      progreso: 100,
      subiendo: false,
    }))
  );
  const [arrastrandoSobre, setArrastrandoSobre] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fotasSubidas = fotos.filter((f) => f.url && !f.error);

  // ── Guardar URL en Neon ──
  async function guardarUrlEnNeon(url: string): Promise<boolean> {
    try {
      const res = await fetch('/api/servicios/fotos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.ok) {
        onFotosActualizadas?.(data.fotos);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ── Eliminar URL de Neon ──
  async function eliminarUrlDeNeon(url: string, publicId?: string): Promise<boolean> {
    try {
      const res = await fetch('/api/servicios/fotos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ url, publicId }),
      });
      const data = await res.json();
      return data.ok;
    } catch {
      return false;
    }
  }

  // ── Procesar archivos seleccionados ──
  const procesarArchivos = useCallback(async (archivos: FileList | File[]) => {
    const lista = Array.from(archivos).filter((f) => f.type.startsWith('image/'));
    if (lista.length === 0) return;

    const espacioDisponible = 8 - fotasSubidas.length;
    const aSubir = lista.slice(0, espacioDisponible);

    for (const archivo of aSubir) {
      if (archivo.size > 5 * 1024 * 1024) {
        alert(`"${archivo.name}" supera los 5 MB. Elige una imagen más pequeña.`);
        continue;
      }

      const id = `upload-${Date.now()}-${Math.random()}`;
      const preview = URL.createObjectURL(archivo);

      // Agregar placeholder
      setFotos((prev) => [
        ...prev,
        { id, preview, progreso: 0, subiendo: true },
      ]);

      // Subir a Firebase
      const cancelar = subirFoto(archivo, codigoSeguimiento, async ({ porcentaje, url, publicId, error }) => {
        if (error) {
          setFotos((prev) =>
            prev.map((f) => (f.id === id ? { ...f, subiendo: false, error } : f))
          );
          return;
        }

        setFotos((prev) =>
          prev.map((f) => (f.id === id ? { ...f, progreso: porcentaje } : f))
        );

        if (url) {
          const ok = await guardarUrlEnNeon(url);
          setFotos((prev) =>
            prev.map((f) =>
              f.id === id
                ? { ...f, url, publicId: publicId ?? undefined, preview: undefined, subiendo: false, progreso: 100, error: ok ? undefined : 'Error al guardar en base de datos' }
                : f
            )
          );
          URL.revokeObjectURL(preview);
        }
      });

      setFotos((prev) => prev.map((f) => (f.id === id ? { ...f, cancelar } : f)));
    }
  }, [fotasSubidas.length, codigoSeguimiento]);

  // ── Eliminar foto ──
  async function eliminarFotoLocal(foto: FotoLocal) {
    if (foto.subiendo) {
      foto.cancelar?.();
    }
    if (foto.url) {
      await eliminarUrlDeNeon(foto.url, foto.publicId);
      onFotosActualizadas?.(fotasSubidas.filter((f) => f.url !== foto.url).map((f) => f.url!));
    }
    setFotos((prev) => prev.filter((f) => f.id !== foto.id));
  }

  // ── Drag & Drop ──
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setArrastrandoSobre(false);
    procesarArchivos(e.dataTransfer.files);
  }, [procesarArchivos]);

  const puedeSeguirSubiendo = fotasSubidas.length < 8;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-jungle-950">Fotos de tu servicio</h3>
          <p className="text-xs text-jungle-600 mt-0.5">
            Sube hasta 8 fotos. La primera será la imagen principal.
          </p>
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${fotasSubidas.length >= 8 ? 'bg-amber-100 text-amber-700' : 'bg-jungle-100 text-jungle-700'}`}>
          {fotasSubidas.length}/8
        </span>
      </div>

      {/* Grid de fotos */}
      {fotos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {fotos.map((foto, i) => (
            <div key={foto.id} className="relative aspect-square rounded-xl overflow-hidden bg-jungle-100 group">
              {/* Badge primera foto */}
              {i === 0 && foto.url && (
                <div className="absolute top-1 left-1 z-10 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                  PRINCIPAL
                </div>
              )}

              {/* Imagen */}
              {(foto.url || foto.preview) && (
                <img
                  src={foto.url ?? foto.preview}
                  alt={`Foto ${i + 1}`}
                  className={`w-full h-full object-cover transition-opacity ${foto.subiendo ? 'opacity-50' : 'opacity-100'}`}
                />
              )}

              {/* Overlay progreso */}
              {foto.subiendo && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
                  <Loader2 size={22} className="text-white animate-spin mb-1" />
                  <span className="text-white text-xs font-bold">{foto.progreso}%</span>
                  <div className="w-3/4 h-1 bg-white/30 rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full transition-all"
                      style={{ width: `${foto.progreso}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {foto.error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/80 p-1">
                  <AlertCircle size={18} className="text-red-200 mb-1" />
                  <span className="text-red-100 text-[9px] text-center leading-tight">{foto.error}</span>
                </div>
              )}

              {/* Éxito */}
              {!foto.subiendo && !foto.error && foto.url && (
                <div className="absolute bottom-1 right-1">
                  <CheckCircle2 size={14} className="text-green-400 drop-shadow" />
                </div>
              )}

              {/* Botón eliminar */}
              <button
                onClick={() => eliminarFotoLocal(foto)}
                className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Eliminar foto"
              >
                <X size={11} />
              </button>
            </div>
          ))}

          {/* Botón agregar más (dentro del grid) */}
          {puedeSeguirSubiendo && (
            <button
              onClick={() => inputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-jungle-300 hover:border-jungle-500 flex flex-col items-center justify-center gap-1 text-jungle-400 hover:text-jungle-600 transition-colors"
            >
              <ImagePlus size={22} />
              <span className="text-[10px] font-semibold">Agregar</span>
            </button>
          )}
        </div>
      )}

      {/* Zona de drop (solo si no hay fotos) */}
      {fotos.length === 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastrandoSobre(true); }}
          onDragLeave={() => setArrastrandoSobre(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            arrastrandoSobre
              ? 'border-jungle-500 bg-jungle-50 scale-[1.01]'
              : 'border-jungle-300 hover:border-jungle-400 hover:bg-jungle-50/50'
          }`}
        >
          <Upload size={32} className="mx-auto text-jungle-400 mb-2" />
          <p className="font-semibold text-jungle-700 text-sm">Arrastra tus fotos aquí</p>
          <p className="text-xs text-jungle-500 mt-1">o haz clic para seleccionarlas</p>
          <p className="text-[11px] text-jungle-400 mt-2">JPG, PNG o WebP · Máx. 5 MB cada una · Hasta 8 fotos</p>
        </div>
      )}

      {/* Input oculto */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && procesarArchivos(e.target.files)}
      />

      {/* Tip */}
      {fotasSubidas.length > 0 && fotasSubidas.length < 3 && (
        <p className="text-xs text-jungle-500 bg-jungle-50 rounded-xl px-3 py-2">
          💡 Los servicios con 3 o más fotos reciben un 40% más de visitas. ¡Agrega más!
        </p>
      )}
    </div>
  );
}