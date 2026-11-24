import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Loader2, MapPin } from 'lucide-react';
import { useT } from '../lib/i18n';
import { useOffline } from '../hooks/useOffline';
import type { Lugar } from '../data/lugares';
import { buscarEnCatalogo, buscarEnOsm, type ResultadoBusqueda } from '../lib/buscarLugares';

// ============================================================
// Buscador del mapa (estilo Google Maps)
// ============================================================
// Escribes y ves al instante los lugares de TuxtlasGO; con Enter (o la lupa) busca también
// en OpenStreetMap, solo en Puebla, Tabasco y Veracruz (incluye Los Tuxtlas). Al elegir un
// resultado el mapa vuela ahí y sale la tarjeta «Cómo llegar» (el flujo de siempre).
// ============================================================

export default function BuscadorMapa({ lugares, onElegir }: { lugares: Lugar[]; onElegir: (r: ResultadoBusqueda) => void }) {
  const t = useT();
  const sinInternet = useOffline();
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [osm, setOsm] = useState<ResultadoBusqueda[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buscado, setBuscado] = useState('');
  const control = useRef<AbortController | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  // Lo del catálogo se filtra mientras escribes (es local, no pega a ningún servidor)
  const locales = useMemo(() => buscarEnCatalogo(texto, lugares), [texto, lugares]);

  // Al cambiar el texto, lo encontrado en OpenStreetMap de la búsqueda anterior ya no aplica
  useEffect(() => { if (texto.trim() !== buscado) setOsm(null); }, [texto, buscado]);

  // Clic fuera: cierra la lista
  useEffect(() => {
    const fuera = (e: PointerEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, []);
  useEffect(() => () => control.current?.abort(), []);

  const buscarOsm = async () => {
    const q = texto.trim();
    if (q.length < 3 || cargando) return; // ≥3 letras y una a la vez (política de Nominatim: 1 por segundo)
    control.current?.abort();
    const ctl = new AbortController();
    control.current = ctl;
    setCargando(true);
    setError(null);
    setAbierto(true);
    try {
      const r = await buscarEnOsm(q, ctl.signal);
      setOsm(r);
      setBuscado(q);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(t('No se pudo buscar en OpenStreetMap. Revisa tu conexión e intenta de nuevo.'));
    } finally {
      if (control.current === ctl) setCargando(false);
    }
  };

  const elegir = (r: ResultadoBusqueda) => {
    setAbierto(false);
    setTexto(r.nombre);
    setBuscado(r.nombre);
    onElegir(r);
  };

  const hayTexto = texto.trim().length > 0;
  const mostrar = abierto && hayTexto;
  // Avisa a los anuncios flotantes (p. ej. el de descarga) para que no tapen la lista de resultados
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('buscador-mapa-abierto', { detail: mostrar }));
    return () => { window.dispatchEvent(new CustomEvent('buscador-mapa-abierto', { detail: false })); };
  }, [mostrar]);
  const sinNada = mostrar && !cargando && !error && locales.length === 0 && osm !== null && osm.length === 0;

  const fila = (r: ResultadoBusqueda) => (
    <li key={r.id}>
      <button
        type="button"
        onClick={() => elegir(r)}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-jungle-50 focus-visible:bg-jungle-50 outline-none"
      >
        <span className="w-9 h-9 rounded-xl bg-jungle-50 border border-jungle-100 flex items-center justify-center text-lg flex-none" aria-hidden="true">{r.emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-jungle-950 truncate">{r.nombre}</span>
          <span className="block text-[11px] text-jungle-600 truncate">{[r.etiqueta, r.detalle].filter(Boolean).join(' · ')}</span>
        </span>
      </button>
    </li>
  );

  return (
    <div ref={raiz} className="absolute top-3 left-16 right-3 sm:right-auto sm:w-[400px] z-30">
      <form
        role="search"
        onSubmit={(e) => { e.preventDefault(); void buscarOsm(); }}
        className="flex items-center gap-1 rounded-2xl bg-white/90 backdrop-blur-xl backdrop-saturate-150 shadow-lg border border-white/60 pl-3.5 pr-1.5 h-11"
      >
        <Search size={17} className="text-jungle-600 flex-none" aria-hidden="true" />
        <input
          type="search"
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
          onKeyDown={(e) => { if (e.key === 'Escape') setAbierto(false); }}
          placeholder={t('Buscar lugar, calle o colonia…')}
          aria-label={t('Buscar en el mapa')}
          autoComplete="off"
          enterKeyHint="search"
          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-jungle-950 placeholder:text-jungle-500 [&::-webkit-search-cancel-button]:hidden"
        />
        {hayTexto && (
          <button
            type="button"
            onClick={() => { setTexto(''); setOsm(null); setError(null); setAbierto(false); }}
            className="w-8 h-8 rounded-full text-jungle-600 hover:bg-jungle-100 flex items-center justify-center flex-none"
            aria-label={t('Borrar búsqueda')}
          >
            <X size={16} />
          </button>
        )}
        <button
          type="submit"
          disabled={texto.trim().length < 3 || cargando || sinInternet}
          className="h-8 px-3 rounded-xl bg-jungle-700 hover:bg-jungle-800 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1 flex-none"
        >
          {cargando ? <Loader2 size={14} className="animate-spin" /> : t('Buscar')}
        </button>
      </form>

      {mostrar && (
        <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-2xl bg-white/95 backdrop-blur-xl shadow-2xl border border-white/60 py-1.5">
          {locales.length > 0 && (
            <>
              <p className="px-3.5 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-jungle-500">{t('En TuxtlasGO')}</p>
              <ul>{locales.map(fila)}</ul>
            </>
          )}

          {osm && osm.length > 0 && (
            <>
              <p className="px-3.5 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-jungle-500">{t('En el mapa (OpenStreetMap)')}</p>
              <ul>{osm.map(fila)}</ul>
            </>
          )}

          {cargando && (
            <p role="status" className="px-3.5 py-3 text-xs text-jungle-700 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> {t('Buscando en el mapa…')}
            </p>
          )}
          {error && <p role="alert" className="px-3.5 py-3 text-xs font-semibold text-red-700">{error}</p>}
          {sinNada && (
            <p className="px-3.5 py-3 text-xs text-jungle-700 flex items-center gap-2">
              <MapPin size={14} /> {t('No encontré ese lugar en Puebla, Tabasco o Veracruz. Prueba con el nombre completo de la calle y la ciudad (ej. Calle Carranza Catemaco).')}
            </p>
          )}

          {/* Invitación a buscar en el mapa mientras todavía no se ha hecho */}
          {!cargando && osm === null && !error && (
            <p className="px-3.5 py-2.5 text-[11px] text-jungle-600 border-t border-jungle-100 mt-1">
              {sinInternet
                ? t('Sin internet: solo se buscan los lugares de TuxtlasGO.')
                : texto.trim().length < 3
                  ? t('Escribe al menos 3 letras para buscar en el mapa.')
                  : t('Pulsa Enter o «Buscar» para buscar también en el mapa de Puebla, Tabasco y Veracruz.')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
