// ADMIN — visitas al sitio (todos los dominios que apuntan a este despliegue:
// tuxtlas.xyz, go.tuxtlas.xyz…). Cuenta IPs distintas (guardadas como hash).
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { adminPwd } from '../lib/adminPwd';

interface Resumen {
  dias: number;
  visitas: number;
  ipsDistintas: number;
  visitantesDistintos: number;
  ipsUltimas24h: number;
  porDominio: { host: string; visitas: number; ips: number }[];
  porDia: { dia: string; visitas: number; ips: number }[];
  porPais: { pais: string; ips: number }[];
}

interface Visitante {
  ip: string; visitas: number; primera: string; ultima: string; host: string | null;
  pais: string | null; ciudad: string | null; dispositivo: string | null; cuenta: string | null; correo: string | null;
}
const fecha = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

export default function AdminVisitas() {
  const [lista, setLista] = useState<Visitante[]>([]);
  const [totalIps, setTotalIps] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [busca, setBusca] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    let vivo = true;
    fetch(`/api/servicios/aprobados?recurso=visitantes_sitio&pagina=${pagina}&q=${encodeURIComponent(q)}`, { headers: { 'X-Admin-Password': adminPwd() } })
      .then((r) => r.json())
      .then((d) => { if (vivo && d.ok) { setLista(d.visitantes); setTotalIps(d.total); } })
      .catch(() => {});
    return () => { vivo = false; };
  }, [pagina, q]);

  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError('');
    fetch(`/api/servicios/aprobados?recurso=visitas_sitio&dias=${dias}`, { headers: { 'X-Admin-Password': adminPwd() } })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudieron cargar las visitas.');
        if (vivo) setDatos(d);
      })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'Error al cargar.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [dias]);

  const maxIps = Math.max(1, ...(datos?.porDia.map((d) => d.ips) ?? [1]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display font-bold text-lg text-jungle-950">Visitas al sitio</h2>
        <select
          value={dias}
          onChange={(e) => setDias(Number(e.target.value))}
          aria-label="Periodo"
          className="text-sm border border-jungle-200 rounded-lg px-2 py-1.5 bg-white"
        >
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
        </select>
      </div>

      {cargando && <p role="status" className="text-sm text-jungle-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando…</p>}
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

      {datos && !cargando && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              ['IPs distintas', datos.ipsDistintas],
              ['IPs últimas 24 h', datos.ipsUltimas24h],
              ['Visitas totales', datos.visitas],
              ['Navegadores distintos', datos.visitantesDistintos],
            ].map(([t, v]) => (
              <div key={t as string} className="bg-white rounded-2xl border border-jungle-100 p-4">
                <p className="text-2xl font-bold text-jungle-950">{v}</p>
                <p className="text-xs text-jungle-600 mt-0.5">{t}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-jungle-100 p-4">
            <h3 className="font-semibold text-jungle-950 text-sm mb-2">Por dominio</h3>
            {datos.porDominio.length === 0 && <p className="text-sm text-jungle-500">Aún no hay visitas registradas.</p>}
            <ul className="divide-y divide-jungle-50">
              {datos.porDominio.map((d) => (
                <li key={d.host} className="flex justify-between py-1.5 text-sm">
                  <span className="text-jungle-800">{d.host || '(sin dominio)'}</span>
                  <span className="text-jungle-600">{d.ips} IPs · {d.visitas} visitas</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl border border-jungle-100 p-4">
            <h3 className="font-semibold text-jungle-950 text-sm mb-2">IPs distintas por día</h3>
            <ul className="space-y-1">
              {datos.porDia.map((d) => (
                <li key={d.dia} className="flex items-center gap-2 text-xs">
                  <span className="w-20 text-jungle-600 tabular-nums">{d.dia.slice(5)}</span>
                  <span className="h-3 rounded bg-jungle-600" style={{ width: `${(d.ips / maxIps) * 100}%`, minWidth: 2 }} />
                  <span className="text-jungle-800 tabular-nums">{d.ips}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl border border-jungle-100 p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="font-semibold text-jungle-950 text-sm">Quién ha entrado ({totalIps} IPs)</h3>
              <form onSubmit={(e) => { e.preventDefault(); setPagina(0); setQ(busca.trim()); }}>
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar IP…" aria-label="Buscar IP"
                  className="text-xs border border-jungle-200 rounded-lg px-2 py-1.5 w-36" />
              </form>
            </div>
            {lista.length === 0 && <p className="text-sm text-jungle-500">Aún no hay IPs registradas.</p>}
            <ul className="divide-y divide-jungle-50">
              {lista.map((v) => (
                <li key={v.ip} className="py-2 text-xs text-jungle-800">
                  <div className="flex justify-between gap-2">
                    <span className="font-mono font-semibold">{v.ip}</span>
                    <span className="text-jungle-600">{v.visitas} visita{v.visitas === 1 ? '' : 's'}</span>
                  </div>
                  <p className="text-jungle-600">
                    {[v.ciudad, v.pais].filter(Boolean).join(', ') || 'Ubicación desconocida'} · {v.dispositivo ?? '—'} · {v.host ?? '—'}
                  </p>
                  <p className="text-jungle-500">Primera: {fecha(v.primera)} · Última: {fecha(v.ultima)}</p>
                  {v.cuenta && <p className="text-jungle-700">Cuenta: {v.cuenta} ({v.correo})</p>}
                </li>
              ))}
            </ul>
            {totalIps > 100 && (
              <div className="flex justify-between mt-3 text-xs">
                <button disabled={pagina === 0} onClick={() => setPagina(pagina - 1)} className="px-3 py-1.5 rounded-lg border border-jungle-200 disabled:opacity-40">Anterior</button>
                <button disabled={(pagina + 1) * 100 >= totalIps} onClick={() => setPagina(pagina + 1)} className="px-3 py-1.5 rounded-lg border border-jungle-200 disabled:opacity-40">Siguiente</button>
              </div>
            )}
          </div>

          {datos.porPais.length > 0 && (
            <div className="bg-white rounded-2xl border border-jungle-100 p-4">
              <h3 className="font-semibold text-jungle-950 text-sm mb-2">Por país (IPs)</h3>
              <p className="text-sm text-jungle-700">{datos.porPais.map((p) => `${p.pais}: ${p.ips}`).join(' · ')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
