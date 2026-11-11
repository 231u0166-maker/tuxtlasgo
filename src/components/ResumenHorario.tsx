import { etiquetaDias, gruposDeSemana, horaUI, type Semana } from '../lib/horario';

/** "Así lo verá el turista": días con el mismo horario agrupados. Liviano a propósito (sin dependencias). */
export default function ResumenHorario({ value }: { value: Semana }) {
  const grupos = gruposDeSemana(value);
  if (grupos.every((g) => g.tramos.length === 0)) {
    return <p className="text-sm text-jungle-500">Aún no marcas ningún horario.</p>;
  }
  return (
    <div className="space-y-1.5">
      {grupos.map((g) => (
        <div key={g.ini} className={`flex gap-3 items-baseline text-sm ${g.tramos.length ? '' : 'text-jungle-400'}`}>
          <b className="min-w-[74px] text-jungle-800">{etiquetaDias(g.ini, g.fin)}</b>
          <span>{g.tramos.length ? g.tramos.map(([a, b]) => `${horaUI(a)} – ${horaUI(b)}`).join(' y ') : 'Cerrado'}</span>
        </div>
      ))}
    </div>
  );
}
