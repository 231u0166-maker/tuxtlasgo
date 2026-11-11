import { useEffect, useRef, useState } from 'react';
import { Smile, List, AlignJustify, Type, Maximize2, Minimize2 } from 'lucide-react';

// Bloc de notas para la descripción del negocio: papel con renglones, emojis,
// viñetas, espacio entre líneas y tamaño de letra ajustables. El botón de
// expandir lo lleva a pantalla completa (en el celular, toda la pantalla para
// escribir cómodo). Es UN solo árbol: al expandir solo cambia el contenedor, así
// el cursor y el teclado no se pierden.

const EMOJIS: Record<string, string[]> = {
  'Comida y bebida': '🥥 🍹 🍺 🍷 🍸 🥤 ☕ 🍤 🦐 🐟 🍽️ 🌮 🍗 🥩 🥗 🍰 🍦 🍍 🍋 🍌 🥭 🍊 🌶️ 🥑'.split(' '),
  'Lugar y viaje': '🌴 🌿 🌊 ⛰️ 🏞️ 🌅 🌄 🛶 🚤 🏡 🛏️ ⛺ 🚗 🗺️ 📍 🧭 🏖️ 🦜 🐒 🦋 🌺 🌞 🌧️ 🔥'.split(' '),
  'Símbolos': '⭐ ✨ ❤️ 👍 👌 🙌 😊 😍 🎉 💚 ✅ ➡️ 📞 💬 📷 🕐 💵 💳 🅿️ 📶 🐾 🚫 ⚠️ 🔝'.split(' '),
};
const INTERLINEADOS = [
  { nombre: 'Compacto', valor: 1.5 },
  { nombre: 'Cómodo', valor: 1.85 },
  { nombre: 'Amplio', valor: 2.25 },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  max?: number;
  placeholder?: string;
}

export default function EditorDescripcion({ value, onChange, max = 1200, placeholder }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const zonaEmojisRef = useRef<HTMLDivElement>(null);
  const [expandido, setExpandido] = useState(false);
  const [verEmojis, setVerEmojis] = useState(false);
  const [lhIdx, setLhIdx] = useState(1);
  const [fs, setFs] = useState(16);

  const lh = INTERLINEADOS[lhIdx].valor;

  // El selector se cierra al tocar fuera de él, SIN tragarse ese toque
  // (por eso es un listener y no una capa invisible encima de todo).
  useEffect(() => {
    if (!verEmojis) return;
    const fuera = (e: PointerEvent) => {
      if (zonaEmojisRef.current && !zonaEmojisRef.current.contains(e.target as Node)) setVerEmojis(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [verEmojis]);

  function poner(nuevo: string, cursor: number) {
    if (nuevo.length > max) return;
    onChange(nuevo);
    requestAnimationFrame(() => {
      const t = ref.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(cursor, cursor);
    });
  }

  function insertar(txt: string) {
    const t = ref.current;
    const a = t?.selectionStart ?? value.length;
    const b = t?.selectionEnd ?? value.length;
    poner(value.slice(0, a) + txt + value.slice(b), a + txt.length);
  }

  function viñeta() {
    const t = ref.current;
    const pos = t?.selectionStart ?? value.length;
    const ini = value.lastIndexOf('\n', pos - 1) + 1;
    poner(value.slice(0, ini) + '• ' + value.slice(ini), pos + 2);
  }

  const estiloPapel = {
    fontSize: `${fs}px`,
    lineHeight: lh,
    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent calc(${lh * fs}px - 1px), rgba(22,101,52,0.09) calc(${lh * fs}px - 1px), rgba(22,101,52,0.09) ${lh * fs}px)`,
    backgroundAttachment: 'local',
  } as React.CSSProperties;

  const boton = 'h-10 min-w-10 px-2.5 rounded-xl flex items-center justify-center gap-1.5 text-[13px] font-bold text-jungle-800 hover:bg-jungle-100 transition-colors';

  return (
    <div
      className={
        expandido
          ? 'fixed inset-0 z-[10001] flex flex-col bg-[#fffdf6] animate-fade-in'
          : 'relative flex flex-col flex-1 min-h-[340px] lg:min-h-0 rounded-2xl border-[1.5px] border-jungle-100 bg-[#fffdf6] overflow-hidden focus-within:border-jungle-600 focus-within:ring-4 focus-within:ring-jungle-600/10 transition-shadow'
      }
      onKeyDown={(e) => { if (e.key === 'Escape' && expandido) { e.stopPropagation(); setExpandido(false); } }}
    >
      {expandido && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-jungle-100 bg-white/80 backdrop-blur-xl">
          <span className="font-display font-bold text-jungle-950">Descripción</span>
          <button type="button" onClick={() => setExpandido(false)}
            className="ml-auto h-10 px-4 rounded-xl bg-jungle-700 text-white text-sm font-bold flex items-center gap-1.5">
            <Minimize2 size={16} /> Listo
          </button>
        </div>
      )}

      <div ref={zonaEmojisRef} className="relative flex items-center gap-0.5 px-2 py-1.5 border-b border-jungle-100 bg-white/70 backdrop-blur-md flex-wrap">
        <button type="button" onClick={() => setVerEmojis((v) => !v)} aria-label="Emojis" aria-expanded={verEmojis}
          className={`${boton} ${verEmojis ? 'bg-jungle-100' : ''}`}>
          <Smile size={18} /> <span className="hidden sm:inline">Emojis</span>
        </button>
        <button type="button" onClick={viñeta} aria-label="Lista con viñetas" className={boton}><List size={18} /></button>
        <span className="w-px h-5 bg-jungle-100 mx-1" />
        <button type="button" onClick={() => setLhIdx((i) => (i + 1) % INTERLINEADOS.length)} aria-label="Espacio entre líneas" className={boton}>
          <AlignJustify size={18} /> <span className="hidden sm:inline">{INTERLINEADOS[lhIdx].nombre}</span>
        </button>
        <button type="button" onClick={() => setFs((f) => Math.max(14, f - 1))} aria-label="Letra más pequeña" className={boton}><Type size={14} />−</button>
        <button type="button" onClick={() => setFs((f) => Math.min(22, f + 1))} aria-label="Letra más grande" className={boton}><Type size={19} />+</button>
        {!expandido && (
          <button type="button" onClick={() => { setVerEmojis(false); setExpandido(true); }} aria-label="Expandir para escribir en pantalla completa"
            className="ml-auto h-10 pl-3 pr-3.5 rounded-xl bg-jungle-50 text-jungle-800 text-[13px] font-bold flex items-center gap-1.5 hover:bg-jungle-100">
            <Maximize2 size={16} /> Expandir
          </button>
        )}

        {verEmojis && (
          <>
            <div className="absolute left-2 top-full mt-1 z-20 w-[min(330px,calc(100%-16px))] max-h-72 overflow-y-auto bg-white border border-jungle-100 rounded-2xl shadow-2xl p-2.5">
              {Object.entries(EMOJIS).map(([titulo, lista]) => (
                <div key={titulo}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-jungle-400 px-1 pt-1.5 pb-1">{titulo}</p>
                  <div className="grid grid-cols-8">
                    {lista.map((em) => (
                      <button key={em} type="button" onClick={() => insertar(em)}
                        className="h-9 text-[22px] rounded-lg hover:bg-jungle-50">{em}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <textarea
        ref={ref}
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Escribe aquí… puedes dar saltos de línea, listas y emojis.'}
        style={estiloPapel}
        className="flex-1 min-h-0 w-full resize-none border-0 outline-none bg-transparent px-4 pt-3.5 pb-6 text-stone-800 placeholder:text-stone-400 whitespace-pre-wrap [overflow-wrap:anywhere]"
      />
      <span className="pointer-events-none absolute bottom-2 right-3.5 text-[11px] text-jungle-500 bg-[#fffdf6]/90 rounded px-1.5">{value.length} / {max}</span>
      {expandido && <div style={{ height: 'env(safe-area-inset-bottom)' }} />}
    </div>
  );
}
