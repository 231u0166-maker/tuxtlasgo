import { MapPin, Compass, Quote } from 'lucide-react';
import type { BloqueContenido } from '../lib/bloquesGuia';

// Vista de solo lectura de la Información adicional — la usa tanto
// la Vista previa del editor del prestador como la ficha que ve el
// turista en PlaceDetail.tsx. Un único lugar para el "cómo se ve".
export default function RenderBloques({ bloques }: { bloques: BloqueContenido[] }) {
  if (!bloques || bloques.length === 0) return null;

  return (
    <div className="space-y-4">
      {bloques.map((b) => {
        switch (b.tipo) {
          case 'titulo_grande':
            return b.texto ? (
              <h3 key={b.id} className="font-display font-extrabold text-2xl text-jungle-950">{b.texto}</h3>
            ) : null;
          case 'titulo_mediano':
            return b.texto ? (
              <h4 key={b.id} className="font-display font-bold text-xl text-jungle-950">{b.texto}</h4>
            ) : null;
          case 'titulo_normal':
            return b.texto ? (
              <h5 key={b.id} className="font-display font-bold text-base text-jungle-900">{b.texto}</h5>
            ) : null;
          case 'texto':
            return b.texto ? (
              <p key={b.id} className="text-sm text-jungle-800 leading-relaxed whitespace-pre-wrap">{b.texto}</p>
            ) : null;
          case 'imagen':
            return b.url ? (
              <img key={b.id} src={b.url} alt={b.detalle || ''} className="w-full rounded-xl object-cover max-h-72" />
            ) : null;
          case 'separador':
            return <hr key={b.id} className="border-jungle-100" />;
          case 'enlace':
            return b.url ? (
              <a key={b.id} href={b.url} target="_blank" rel="noreferrer"
                className="block bg-jungle-50 hover:bg-jungle-100 rounded-xl p-3 text-sm font-semibold text-jungle-700 underline break-all">
                {b.texto || b.url}
              </a>
            ) : null;
          case 'cita':
            return b.texto ? (
              <div key={b.id} className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <Quote size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-900 italic leading-relaxed">{b.texto}</p>
              </div>
            ) : null;
          case 'actividad':
            return b.texto ? (
              <div key={b.id} className="flex items-start gap-2.5 bg-jungle-50 rounded-xl p-3">
                <Compass size={16} className="text-jungle-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-jungle-900">{b.texto}</p>
                  {b.detalle && <p className="text-xs text-jungle-600 mt-0.5">{b.detalle}</p>}
                </div>
              </div>
            ) : null;
          case 'lugar':
            return b.texto ? (
              <div key={b.id} className="flex items-start gap-2.5 bg-jungle-50 rounded-xl p-3">
                <MapPin size={16} className="text-jungle-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-jungle-900">{b.texto}</p>
                  {b.detalle && <p className="text-xs text-jungle-600 mt-0.5">{b.detalle}</p>}
                </div>
              </div>
            ) : null;
          default:
            return null;
        }
      })}
    </div>
  );
}
