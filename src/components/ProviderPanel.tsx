import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  CheckCircle2,
  Store,
  Phone,
  MapPin,
  DollarSign,
  Trash2,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ServicioPrestador } from '../lib/db';
import { CATEGORIAS, LOS_TUXTLAS_CENTER } from '../data/lugares';
import OfflineIndicator from './OfflineIndicator';

export default function ProviderPanel() {
  const [showForm, setShowForm] = useState(false);
  const servicios = useLiveQuery(
    () => db.prestadores.orderBy('creadoEn').reverse().toArray(),
    []
  );

  const eliminar = async (id: number) => {
    if (confirm('¿Eliminar este servicio?')) {
      await db.prestadores.delete(id);
    }
  };

  return (
    <div className="min-h-screen bg-jungle-50">
      <OfflineIndicator />

      {/* Header */}
      <header className="bg-gradient-to-br from-jungle-800 to-jungle-950 text-white px-4 py-5">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <Link
              to="/"
              className="flex items-center gap-1 text-jungle-200 hover:text-white text-sm"
            >
              <ArrowLeft size={16} /> Inicio
            </Link>
            <div className="text-xs bg-amber-500 text-white px-2 py-1 rounded font-bold uppercase tracking-wide">
              Panel Prestador
            </div>
          </div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl">
            Tu negocio en TuxtlasGO
          </h1>
          <p className="text-sm text-jungle-100 opacity-90 mt-1">
            Registra tu servicio turístico sin intermediarios. Lo verán todos los
            turistas que usan la app, incluso sin internet.
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 pb-12">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <Stat
            label="Servicios"
            value={servicios?.length || 0}
            color="text-jungle-700"
          />
          <Stat
            label="Aprobados"
            value={servicios?.filter((s) => s.estado === 'aprobado').length || 0}
            color="text-green-600"
          />
          <Stat
            label="Pendientes"
            value={servicios?.filter((s) => s.estado === 'pendiente').length || 0}
            color="text-amber-600"
          />
        </div>

        {/* Botón crear */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-jungle-700 hover:bg-jungle-800 text-white py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-jungle-700/20 mb-6"
          >
            <Plus size={20} /> Registrar nuevo servicio
          </button>
        )}

        {showForm && <FormularioPrestador onCerrar={() => setShowForm(false)} />}

        {/* Lista */}
        <div className="space-y-3">
          <h2 className="font-display font-bold text-lg text-jungle-950 mt-6">
            Servicios registrados
          </h2>
          {!servicios || servicios.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-jungle-600">
              <Store size={40} className="mx-auto mb-2 opacity-30" />
              <p>Aún no hay servicios registrados.</p>
            </div>
          ) : (
            servicios.map((s) => (
              <article
                key={s.id}
                className="bg-white rounded-2xl p-4 border border-jungle-100 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-display font-bold text-jungle-950">
                        {s.nombreNegocio}
                      </h3>
                      {s.estado === 'aprobado' ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                          <CheckCircle2 size={11} /> Aprobado
                        </span>
                      ) : (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                          Pendiente
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-jungle-700 mb-2">
                      <span>{s.categoria}</span>
                      <span className="flex items-center gap-1">
                        <MapPin size={11} /> {s.municipio}
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign size={11} /> {s.precio}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone size={11} /> {s.contacto}
                      </span>
                    </div>
                    <p className="text-sm text-jungle-800 line-clamp-2">
                      {s.descripcion}
                    </p>
                  </div>
                  <button
                    onClick={() => s.id && eliminar(s.id)}
                    className="text-jungle-400 hover:text-red-500 p-1"
                    aria-label="Eliminar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-3 text-center shadow-sm border border-jungle-100">
      <div className={`font-display font-extrabold text-2xl ${color}`}>{value}</div>
      <div className="text-[11px] text-jungle-600 uppercase tracking-wide font-semibold">
        {label}
      </div>
    </div>
  );
}

function FormularioPrestador({ onCerrar }: { onCerrar: () => void }) {
  const [datos, setDatos] = useState<Omit<ServicioPrestador, 'id' | 'creadoEn' | 'estado'>>({
    nombreNegocio: '',
    categoria: 'Gastronomia',
    municipio: 'Catemaco',
    descripcion: '',
    precio: '',
    contacto: '',
    ubicacionLat: LOS_TUXTLAS_CENTER[0],
    ubicacionLng: LOS_TUXTLAS_CENTER[1],
  });
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async () => {
    if (!datos.nombreNegocio || !datos.descripcion || !datos.contacto) {
      alert('Por favor completa los campos obligatorios.');
      return;
    }
    setEnviando(true);
    await db.prestadores.add({
      ...datos,
      creadoEn: Date.now(),
      estado: 'pendiente',
    });
    setEnviando(false);
    setEnviado(true);
    setTimeout(() => {
      onCerrar();
    }, 1800);
  };

  if (enviado) {
    return (
      <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-6 text-center animate-fade-in">
        <CheckCircle2 className="mx-auto text-green-600 mb-2" size={48} />
        <h3 className="font-display font-bold text-green-900 text-lg">
          ¡Servicio registrado!
        </h3>
        <p className="text-sm text-green-700 mt-1">
          Será revisado y aparecerá en la app en menos de 24 horas.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-jungle-200 p-5 mb-6 animate-fade-in">
      <h2 className="font-display font-bold text-lg text-jungle-950 mb-4">
        Datos del servicio
      </h2>
      <div className="space-y-3">
        <Campo
          label="Nombre del negocio *"
          value={datos.nombreNegocio}
          onChange={(v) => setDatos({ ...datos, nombreNegocio: v })}
          placeholder="Ej: Lanchas Don Cheve"
        />
        <div className="grid grid-cols-2 gap-3">
          <CampoSelect
            label="Categoría *"
            value={datos.categoria}
            onChange={(v) => setDatos({ ...datos, categoria: v })}
            opciones={CATEGORIAS.map((c) => c.id)}
          />
          <CampoSelect
            label="Municipio *"
            value={datos.municipio}
            onChange={(v) => setDatos({ ...datos, municipio: v })}
            opciones={['Catemaco', 'San Andrés Tuxtla', 'Santiago Tuxtla']}
          />
        </div>
        <Campo
          label="Descripción *"
          value={datos.descripcion}
          onChange={(v) => setDatos({ ...datos, descripcion: v })}
          placeholder="¿Qué ofreces? ¿Qué te hace especial?"
          textarea
        />
        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="Precio aproximado *"
            value={datos.precio}
            onChange={(v) => setDatos({ ...datos, precio: v })}
            placeholder="$200 MXN por persona"
          />
          <Campo
            label="Contacto *"
            value={datos.contacto}
            onChange={(v) => setDatos({ ...datos, contacto: v })}
            placeholder="WhatsApp o correo"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onCerrar}
            className="flex-1 border-2 border-jungle-200 text-jungle-800 py-3 rounded-xl font-semibold hover:bg-jungle-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={enviando}
            className="flex-1 bg-jungle-700 hover:bg-jungle-800 text-white py-3 rounded-xl font-semibold disabled:opacity-60"
          >
            {enviando ? 'Guardando...' : 'Registrar servicio'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-jungle-700 uppercase tracking-wide mb-1">
        {label}
      </span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 border-0 resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 border-0"
        />
      )}
    </label>
  );
}

function CampoSelect({
  label,
  value,
  onChange,
  opciones,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opciones: string[];
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-jungle-700 uppercase tracking-wide mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-jungle-50 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 border-0"
      >
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
