// ============================================================
// GALERÍA — fotos reales de Los Tuxtlas
// ============================================================
// Activamos el link "Galería" del navbar (antes inerte). Nada de
// fotos de stock: cada imagen viene de LUGARES (src/data/lugares.ts)
// — las mismas fotos reales que ya usa el explorador y las tarjetas
// de servicio, aquí reunidas en un solo mosaico navegable.
//
// Mosaico con columnas CSS (sin librería, sin medir alturas en JS)
// en vez de la grilla uniforme que ya usa Explorar — le da a esta
// página su propia identidad de "álbum de fotos" en vez de sentirse
// como el mismo catálogo otra vez.
// ============================================================

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, MapPin, ChevronRight } from 'lucide-react';
import { LUGARES, CATEGORIAS, type Categoria } from '../data/lugares';
import SubNavPublica from './SubNavPublica';

interface FotoGaleria {
  url: string;
  lugarId: string;
  lugarNombre: string;
  categoria: Categoria;
  municipio: string;
}

const FOTOS: FotoGaleria[] = LUGARES.flatMap((l) => {
  const urls = [l.imagen, ...(l.imagenesExtra ?? [])];
  return urls.map((url) => ({
    url,
    lugarId: l.id,
    lugarNombre: l.nombre,
    categoria: l.categoria,
    municipio: l.municipio,
  }));
});

export default function GaleriaPage() {
  const [filtro, setFiltro] = useState<Categoria | 'Todas'>('Todas');
  const [fotoActiva, setFotoActiva] = useState<FotoGaleria | null>(null);

  const fotosFiltradas = useMemo(
    () => (filtro === 'Todas' ? FOTOS : FOTOS.filter((f) => f.categoria === filtro)),
    [filtro]
  );

  const categoriasConFotos = CATEGORIAS.filter((c) => FOTOS.some((f) => f.categoria === c.id));

  return (
    <div className="min-h-screen bg-amate-50">
      <SubNavPublica activa="galeria" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-6">
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-obsidiana-900">
          Galería de Los Tuxtlas
        </h1>
        <p className="text-obsidiana-800/60 mt-2 max-w-xl">
          {FOTOS.length} fotos reales de los {LUGARES.length} lugares y servicios verificados
          de la región — sin bancos de imágenes, todo tomado en campo.
        </p>

        {/* Filtros */}
        <div className="flex gap-2 overflow-x-auto pb-1 mt-6 -mx-4 px-4 sm:mx-0 sm:px-0">
          <button
            onClick={() => setFiltro('Todas')}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              filtro === 'Todas' ? 'bg-jungle-900 text-white' : 'bg-white text-obsidiana-800 border border-obsidiana-900/8 hover:border-jungle-300'
            }`}
          >
            Todas
          </button>
          {categoriasConFotos.map((c) => (
            <button
              key={c.id}
              onClick={() => setFiltro(c.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                filtro === c.id ? 'bg-jungle-900 text-white' : 'bg-white text-obsidiana-800 border border-obsidiana-900/8 hover:border-jungle-300'
              }`}
            >
              {c.emoji} {c.id}
            </button>
          ))}
        </div>
      </div>

      {/* Mosaico — columnas CSS, cada foto rompe donde le toca */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 [column-fill:_balance]">
          {fotosFiltradas.map((f, i) => (
            <button
              key={`${f.url}-${i}`}
              onClick={() => setFotoActiva(f)}
              className="block w-full mb-3 break-inside-avoid relative group rounded-2xl overflow-hidden bg-jungle-100"
            >
              <img
                src={f.url}
                alt={f.lugarNombre}
                loading="lazy"
                className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-obsidiana-950/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                <div className="text-left">
                  <p className="text-white text-sm font-display font-bold leading-tight">{f.lugarNombre}</p>
                  <p className="text-white/70 text-xs flex items-center gap-1 mt-0.5">
                    <MapPin size={10} /> {f.municipio}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {fotoActiva && (
        <div
          className="fixed inset-0 z-[70] bg-obsidiana-950/95 flex items-center justify-center p-4 sm:p-8"
          onClick={() => setFotoActiva(null)}
        >
          <button
            onClick={() => setFotoActiva(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
          <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={fotoActiva.url} alt={fotoActiva.lugarNombre} className="w-full max-h-[75vh] object-contain rounded-2xl" />
            <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
              <div>
                <p className="text-white font-display font-bold text-lg">{fotoActiva.lugarNombre}</p>
                <p className="text-white/60 text-sm flex items-center gap-1 mt-0.5">
                  <MapPin size={12} /> {fotoActiva.municipio} · {CATEGORIAS.find((c) => c.id === fotoActiva.categoria)?.emoji} {fotoActiva.categoria}
                </p>
              </div>
              <Link
                to="/app?tab=explorar"
                className="inline-flex items-center gap-1.5 bg-white text-obsidiana-900 px-4 py-2.5 rounded-full text-sm font-semibold hover:bg-white/90"
              >
                Explorar en la app <ChevronRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
