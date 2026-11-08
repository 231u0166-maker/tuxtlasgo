import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import {
  buscarRespuestaVerificada,
  estadoEmbeddings,
  suscribirEstadoEmbeddings,
  type EstadoEmbeddings,
} from '../lib/embeddings';

// Panel de diagnóstico del modelo de lenguaje — SOLO aparece si se abre la
// app con ?diag=1 (se recuerda en este navegador hasta abrirla con ?diag=0).
// Existe para probar en un celular real, donde no hay consola: dice si el
// modelo se descargó, cuánto tardó, cuántos vectores hay y cuánta memoria
// reporta el dispositivo. Para cualquier otra persona no se ve ni se carga.

const CLAVE = 'tuxtlasgo-diag';

function diagnosticoActivo(): boolean {
  try {
    const parametro = new URLSearchParams(window.location.search).get('diag');
    if (parametro === '1') localStorage.setItem(CLAVE, '1');
    if (parametro === '0') localStorage.removeItem(CLAVE);
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

const TEXTO_FASE: Record<EstadoEmbeddings['fase'], string> = {
  inactivo: 'sin iniciar',
  descargando: 'descargando modelo…',
  indexando: 'indexando lugares y fichas…',
  listo: 'LISTO',
  omitido: 'OMITIDO (este dispositivo no lo carga)',
  error: 'ERROR',
};

export default function DiagnosticoIA() {
  const [activo] = useState(diagnosticoActivo);
  const [visible, setVisible] = useState(true);
  const [estado, setEstado] = useState<EstadoEmbeddings>(estadoEmbeddings());
  const [vectores, setVectores] = useState<{ lugares: number; fichas: number } | null>(null);
  const [prueba, setPrueba] = useState('');

  useEffect(() => {
    if (!activo) return;
    return suscribirEstadoEmbeddings(setEstado);
  }, [activo]);

  useEffect(() => {
    if (!activo) return;
    const leer = async () => {
      try {
        setVectores({ lugares: await db.vectores.count(), fichas: await db.vectoresConocimiento.count() });
      } catch { /* sin base local */ }
    };
    leer();
    const id = window.setInterval(leer, 2500);
    return () => window.clearInterval(id);
  }, [activo]);

  if (!activo) return null;

  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const memoriaJS = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;

  async function probar(texto: string) {
    setPrueba('probando…');
    try {
      const r = await buscarRespuestaVerificada(texto, 0, -1);
      setPrueba(r ? `${r.titulo} · similitud ${r.similitud.toFixed(3)}` : 'sin modelo cargado todavía');
    } catch (e) {
      setPrueba('error: ' + String(e).slice(0, 80));
    }
  }

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="fixed bottom-20 left-2 z-[9999] bg-black/80 text-white text-[11px] font-mono px-2 py-1 rounded"
      >
        IA: {estado.fase}
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 left-2 right-2 sm:right-auto sm:w-80 z-[9999] bg-black/85 text-white text-[11px] font-mono rounded-xl p-3 space-y-1 leading-snug">
      <div className="flex items-center justify-between">
        <b>Diagnóstico del modelo de lenguaje</b>
        <button onClick={() => setVisible(false)} className="px-2" aria-label="Minimizar">—</button>
      </div>
      <div>Estado: <b>{TEXTO_FASE[estado.fase]}</b>
        {estado.fase === 'descargando' && estado.progreso !== undefined && ` ${Math.round(estado.progreso * 100)} %`}
        {estado.ms !== undefined && ` · ${(estado.ms / 1000).toFixed(1)} s`}
      </div>
      {estado.detalle && <div className="text-amber-300 break-words">{estado.detalle}</div>}
      <div>Vectores: {vectores ? `${vectores.lugares} lugares · ${vectores.fichas} fichas` : '…'}</div>
      <div>
        RAM que reporta el navegador: {nav.deviceMemory ?? 'no la reporta'} GB · núcleos: {navigator.hardwareConcurrency ?? '?'}
        {nav.connection?.saveData ? ' · ahorro de datos ACTIVO' : ''}
      </div>
      {memoriaJS !== undefined && <div>Memoria JS en uso: {Math.round(memoriaJS / 1048576)} MB</div>}
      <div className="pt-1 flex flex-wrap gap-1">
        <button onClick={() => probar('¿Cuál es la mejor época para visitar Los Tuxtlas?')} className="bg-white/15 rounded px-2 py-1">
          Probar: mejor época
        </button>
        <button onClick={() => probar('¿cómo llego desde la Ciudad de México?')} className="bg-white/15 rounded px-2 py-1">
          Probar: cómo llegar
        </button>
      </div>
      {prueba && <div className="break-words">→ {prueba}</div>}
    </div>
  );
}
