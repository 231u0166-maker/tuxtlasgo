// ============================================================
// EDITOR — Información adicional del servicio (Módulo 2)
// ============================================================
// Antes "editar" era el mismo formulario largo de Mi Servicio otra
// vez — se sentía duplicado. Esto es harina de otro costal: un
// lienzo aparte para contenido libre y reordenable (fotos, citas,
// actividades cercanas, texto). Se llama "Información adicional",
// no "guía" — es contenido de UN servicio, no un itinerario.
//
// Diseño: el "sendero" — una línea vertical con puntos de parada,
// como las rutas que ya traza la app en el mapa (OSRM). Arrastrar
// un bloque es literalmente moverlo a otro punto del sendero. El
// lienzo es oscuro (obsidiana) a propósito: distingue "modo
// construcción" del resto de la app, que es clara y turística.
// ============================================================

import { useState } from 'react';
import {
  X, Plus, GripVertical, Trash2, Sparkles, Loader2,
  PenLine, Link2, FileImage, Eye, EyeOff, Check,
  Heading1, Heading2, Heading3, AlignLeft, Quote, ImageIcon,
  Minus, Compass, MapPin,
} from 'lucide-react';
import {
  type BloqueContenido, type TipoBloque, type EstadoInfoAdicional,
  TIPOS_BLOQUE, bloqueVacio, nuevoBloqueId,
} from '../lib/bloquesGuia';
import { subirFoto, type ProgresoSubida } from '../lib/cloudinary';
import { useArrastreReordenable } from '../lib/useArrastreReordenable';
import RenderBloques from './RenderBloques';

interface Props {
  nombreServicio: string;
  municipio: string;
  codigoServicio: string;
  bloquesIniciales: BloqueContenido[];
  estadoInicial: EstadoInfoAdicional;
  onCerrar: () => void;
  onGuardar: (bloques: BloqueContenido[], estado: EstadoInfoAdicional) => Promise<boolean>;
}

const ICONO_BLOQUE: Record<TipoBloque, typeof Heading1> = {
  titulo_grande: Heading1,
  titulo_mediano: Heading2,
  titulo_normal: Heading3,
  texto: AlignLeft,
  imagen: ImageIcon,
  separador: Minus,
  enlace: Link2,
  cita: Quote,
  actividad: Compass,
  lugar: MapPin,
};

const GRUPOS: { id: string; etiqueta: string }[] = [
  { id: 'texto', etiqueta: 'Texto' },
  { id: 'medio', etiqueta: 'Multimedia' },
  { id: 'estructura', etiqueta: 'Estructura' },
  { id: 'referencia', etiqueta: 'Referencias' },
];

type Vista = 'elegir' | 'editor';

export default function EditorInfoAdicional({
  nombreServicio, municipio, codigoServicio,
  bloquesIniciales, estadoInicial, onCerrar, onGuardar,
}: Props) {
  const [vista, setVista] = useState<Vista>(bloquesIniciales.length > 0 ? 'editor' : 'elegir');
  const [bloques, setBloques] = useState<BloqueContenido[]>(bloquesIniciales);
  const [estado, setEstado] = useState<EstadoInfoAdicional>(estadoInicial);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [subiendoImg, setSubiendoImg] = useState<string | null>(null);
  const [generandoIA, setGenerandoIA] = useState<string | null>(null);
  const [huboExito, setHuboExito] = useState(false);
  const [enlaceInicial, setEnlaceInicial] = useState('');

  const { indiceArrastrando, indiceSobre, registrarNodo, iniciar } =
    useArrastreReordenable(bloques, setBloques, 'vertical');

  function agregarBloque(tipo: TipoBloque) {
    setBloques((b) => [...b, bloqueVacio(tipo)]);
    setMenuAbierto(false);
  }

  function actualizarBloque(id: string, cambios: Partial<BloqueContenido>) {
    setBloques((b) => b.map((x) => (x.id === id ? { ...x, ...cambios } : x)));
  }

  function eliminarBloque(id: string) {
    setBloques((b) => b.filter((x) => x.id !== id));
  }

  async function subirImagenBloque(id: string, file: File) {
    setSubiendoImg(id);
    try {
      const url = await new Promise<string>((resolve, reject) => {
        subirFoto(file, `info-${codigoServicio}`, (p: ProgresoSubida) => {
          if (p.url) resolve(p.url);
          if (p.error) reject(new Error(p.error));
        });
      });
      actualizarBloque(id, { url });
    } catch {
      alert('No se pudo subir la foto. Intenta de nuevo.');
    }
    setSubiendoImg(null);
  }

  async function generarConIA(id: string, tipo: TipoBloque, semilla: string) {
    setGenerandoIA(id);
    try {
      const r = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt:
            `Eres un redactor de contenido turístico para Los Tuxtlas, Veracruz. ` +
            `Ayudas a un prestador a redactar un bloque de tipo "${tipo === 'cita' ? 'cita/testimonio breve' : 'texto descriptivo'}" ` +
            `para la información adicional de su servicio "${nombreServicio}" en ${municipio}. ` +
            `Máximo 2-3 frases, cálido y natural, en español. NUNCA inventes datos específicos ` +
            `(precios, actividades, platillos) que no te den. Responde solo con el texto.`,
          mensajes: [{ role: 'user', content: semilla.trim() || `Escribe el bloque para "${nombreServicio}".` }],
        }),
      });
      const data = await r.json();
      if (r.ok && data.texto) actualizarBloque(id, { texto: data.texto.trim() });
      else alert('No se pudo generar el texto ahora — escríbelo tú, no hay problema.');
    } catch {
      alert('Necesitas internet para generar texto con IA.');
    }
    setGenerandoIA(null);
  }

  async function guardar(nuevoEstado: EstadoInfoAdicional) {
    setGuardando(true);
    const ok = await onGuardar(bloques, nuevoEstado);
    setGuardando(false);
    if (ok) {
      setEstado(nuevoEstado);
      setHuboExito(true);
      setTimeout(() => setHuboExito(false), 2200);
    } else {
      alert('No se pudo guardar. Verifica tu internet e intenta de nuevo.');
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-obsidiana-950 flex flex-col">
      {/* ── Header ── */}
      <div className="bg-obsidiana-900 border-b border-obsidiana-800 px-4 py-3 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onCerrar} className="text-amate-100/50 hover:text-amate-50 flex-shrink-0" aria-label="Cerrar">
            <X size={20} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-display font-bold text-sm text-amate-50 truncate">Información adicional</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                estado === 'publicado' ? 'bg-jungle-500/20 text-jungle-300' : 'bg-sun-500/20 text-sun-300'
              }`}>
                {estado === 'publicado' ? 'Publicado' : 'Borrador'}
              </span>
            </div>
            <p className="text-[11px] text-amate-100/40 truncate">{nombreServicio}</p>
          </div>
        </div>
        {vista === 'editor' && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setVistaPrevia((v) => !v)}
              className="text-xs font-semibold text-amate-100/70 border border-obsidiana-800 rounded-full px-3 py-1.5 flex items-center gap-1.5 hover:bg-obsidiana-800"
            >
              {vistaPrevia ? <EyeOff size={13} /> : <Eye size={13} />}
              {vistaPrevia ? 'Editar' : 'Vista previa'}
            </button>
            <button
              onClick={() => guardar(estado === 'publicado' ? 'borrador' : 'publicado')}
              disabled={guardando}
              className={`text-xs font-bold rounded-full px-4 py-1.5 flex items-center gap-1.5 disabled:opacity-50 ${
                estado === 'publicado'
                  ? 'bg-obsidiana-800 text-amate-100'
                  : 'bg-sun-500 text-obsidiana-950 hover:bg-sun-400'
              }`}
            >
              {guardando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {estado === 'publicado' ? 'Volver a borrador' : 'Publicar'}
            </button>
          </div>
        )}
      </div>

      {huboExito && (
        <div className="bg-jungle-500/10 border-b border-jungle-500/20 text-jungle-300 text-xs font-medium text-center py-1.5">
          Guardado — así lo verán los turistas en tu ficha.
        </div>
      )}

      {/* ── Cuerpo ── */}
      <div className="flex-1 overflow-y-auto">
        {vista === 'elegir' && (
          <PantallaElegirMetodo
            enlaceInicial={enlaceInicial}
            setEnlaceInicial={setEnlaceInicial}
            onEmpezarCero={() => setVista('editor')}
            onVincularEnlace={(url) => {
              setBloques([{ id: nuevoBloqueId(), tipo: 'enlace', texto: 'Síguenos en redes', url }]);
              setVista('editor');
            }}
            onSubirArchivo={async (file) => {
              setVista('editor');
              const idBloque = nuevoBloqueId();
              setBloques([{ id: idBloque, tipo: 'imagen' }]);
              await subirImagenBloque(idBloque, file);
            }}
          />
        )}

        {vista === 'editor' && vistaPrevia && (
          <div className="max-w-lg mx-auto px-4 py-8">
            <p className="text-xs text-amate-100/40 mb-3 text-center uppercase tracking-wide font-semibold">Así lo verá el turista</p>
            <div className="bg-amate-50 rounded-3xl shadow-2xl p-5">
              {bloques.length === 0 ? (
                <p className="text-sm text-jungle-400 text-center py-6">Aún no has añadido contenido.</p>
              ) : (
                <RenderBloques bloques={bloques} />
              )}
            </div>
          </div>
        )}

        {vista === 'editor' && !vistaPrevia && (
          <div className="max-w-lg mx-auto px-4 py-8">
            {bloques.length === 0 ? (
              <div className="border border-dashed border-obsidiana-700 rounded-2xl p-10 text-center text-amate-100/40 text-sm">
                Tu sendero está vacío. Toca el punto de abajo para añadir el primer bloque.
              </div>
            ) : (
              <div className="relative pl-8">
                {/* El sendero: línea vertical continua detrás de los puntos */}
                <div className="absolute left-[11px] top-3 bottom-3 w-px bg-obsidiana-700" aria-hidden />
                <div className="space-y-3">
                  {bloques.map((b, i) => (
                    <BloqueEditor
                      key={b.id}
                      bloque={b}
                      registrarNodo={(el) => registrarNodo(i, el)}
                      arrastrando={indiceArrastrando === i}
                      espectral={indiceArrastrando !== null && indiceSobre === i && indiceArrastrando !== i}
                      subiendo={subiendoImg === b.id}
                      generandoIA={generandoIA === b.id}
                      onCambiar={(cambios) => actualizarBloque(b.id, cambios)}
                      onEliminar={() => eliminarBloque(b.id)}
                      onSubirArchivo={(file) => subirImagenBloque(b.id, file)}
                      onIniciarArrastre={iniciar(i)}
                      onGenerarIA={(semilla) => generarConIA(b.id, b.tipo, semilla)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Continuación del sendero: nodo "+" para añadir */}
            <div className="relative pl-8 mt-3">
              <div className="absolute left-[11px] top-0 h-4 w-px border-l border-dashed border-obsidiana-700" aria-hidden />
              <button
                onClick={() => setMenuAbierto((v) => !v)}
                className="relative flex items-center gap-2.5 text-amate-100/60 hover:text-sun-400 text-sm font-semibold group"
              >
                <span className="absolute -left-8 w-[22px] h-[22px] rounded-full bg-obsidiana-900 border-2 border-obsidiana-700 group-hover:border-sun-500 flex items-center justify-center transition-colors">
                  <Plus size={12} />
                </span>
                Añadir contenido
              </button>

              {menuAbierto && (
                <div className="mt-3 bg-obsidiana-900 border border-obsidiana-800 rounded-2xl shadow-2xl overflow-hidden">
                  {GRUPOS.map((g) => {
                    const items = TIPOS_BLOQUE.filter((t) => t.grupo === g.id);
                    if (items.length === 0) return null;
                    return (
                      <div key={g.id} className="border-b border-obsidiana-800 last:border-0">
                        <p className="text-[10px] uppercase tracking-wide font-bold text-amate-100/30 px-4 pt-3 pb-1.5">
                          {g.etiqueta}
                        </p>
                        {items.map((t) => {
                          const Icono = ICONO_BLOQUE[t.tipo];
                          return (
                            <button
                              key={t.tipo}
                              onClick={() => agregarBloque(t.tipo)}
                              className="w-full flex items-center gap-3 text-left px-4 py-2.5 text-sm text-amate-100 hover:bg-obsidiana-800"
                            >
                              <Icono size={15} className="text-laguna-400 flex-shrink-0" />
                              {t.etiqueta}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={() => guardar(estado)}
              disabled={guardando}
              className="w-full mt-8 bg-obsidiana-900 border border-obsidiana-800 hover:border-obsidiana-700 text-amate-100 py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Guardar borrador'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────── PANTALLA: elegir método ───────────────
function PantallaElegirMetodo({
  onEmpezarCero, onVincularEnlace, onSubirArchivo, enlaceInicial, setEnlaceInicial,
}: {
  onEmpezarCero: () => void;
  onVincularEnlace: (url: string) => void;
  onSubirArchivo: (file: File) => void;
  enlaceInicial: string;
  setEnlaceInicial: (v: string) => void;
}) {
  const [mostrarEnlace, setMostrarEnlace] = useState(false);

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <h2 className="font-display font-extrabold text-2xl text-amate-50 text-center mb-1.5">Traza tu sendero</h2>
      <p className="text-sm text-amate-100/50 text-center mb-8">
        Contenido extra para tu servicio — fotos, redes, lo que ya tengas a la mano.
      </p>

      <div className="space-y-2.5">
        <button
          onClick={onEmpezarCero}
          className="w-full text-left bg-obsidiana-900 border border-obsidiana-800 hover:border-laguna-600 rounded-2xl p-4 flex items-center gap-4 transition-colors"
        >
          <div className="w-11 h-11 rounded-xl bg-obsidiana-800 flex items-center justify-center flex-shrink-0">
            <PenLine size={19} className="text-laguna-400" />
          </div>
          <div>
            <p className="font-display font-bold text-sm text-amate-50">Empieza de cero</p>
            <p className="text-xs text-amate-100/40 mt-0.5">Arma tu sendero bloque por bloque.</p>
          </div>
        </button>

        <div className="bg-obsidiana-900 border border-obsidiana-800 rounded-2xl p-4">
          <button onClick={() => setMostrarEnlace((v) => !v)} className="w-full text-left flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-obsidiana-800 flex items-center justify-center flex-shrink-0">
              <Link2 size={19} className="text-laguna-400" />
            </div>
            <div>
              <p className="font-display font-bold text-sm text-amate-50">Vincula lo que ya tienes</p>
              <p className="text-xs text-amate-100/40 mt-0.5">Tu Instagram, Facebook o publicación.</p>
            </div>
          </button>
          {mostrarEnlace && (
            <div className="mt-3 flex gap-2">
              <input
                value={enlaceInicial}
                onChange={(e) => setEnlaceInicial(e.target.value)}
                placeholder="https://instagram.com/tu_negocio"
                className="flex-1 bg-obsidiana-800 text-amate-50 placeholder:text-amate-100/30 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-laguna-500"
              />
              <button
                onClick={() => enlaceInicial.trim() && onVincularEnlace(enlaceInicial.trim())}
                disabled={!enlaceInicial.trim()}
                className="bg-sun-500 disabled:opacity-30 text-obsidiana-950 px-4 rounded-xl text-sm font-bold"
              >
                Usar
              </button>
            </div>
          )}
        </div>

        <label className="w-full text-left bg-obsidiana-900 border border-obsidiana-800 hover:border-laguna-600 rounded-2xl p-4 flex items-center gap-4 transition-colors cursor-pointer">
          <div className="w-11 h-11 rounded-xl bg-obsidiana-800 flex items-center justify-center flex-shrink-0">
            <FileImage size={19} className="text-laguna-400" />
          </div>
          <div>
            <p className="font-display font-bold text-sm text-amate-50">Sube una foto</p>
            <p className="text-xs text-amate-100/40 mt-0.5">Un volante o cartel de tu negocio.</p>
          </div>
          <input type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && onSubirArchivo(e.target.files[0])} />
        </label>
      </div>
    </div>
  );
}

// ─────────────── Editor de un bloque individual ───────────────
function BloqueEditor({
  bloque, registrarNodo, arrastrando, espectral, subiendo, generandoIA,
  onCambiar, onEliminar, onSubirArchivo, onIniciarArrastre, onGenerarIA,
}: {
  bloque: BloqueContenido;
  registrarNodo: (el: HTMLElement | null) => void;
  arrastrando: boolean;
  espectral: boolean;
  subiendo: boolean;
  generandoIA: boolean;
  onCambiar: (c: Partial<BloqueContenido>) => void;
  onEliminar: () => void;
  onSubirArchivo: (file: File) => void;
  onIniciarArrastre: (e: React.PointerEvent) => void;
  onGenerarIA: (semilla: string) => void;
}) {
  const info = TIPOS_BLOQUE.find((t) => t.tipo === bloque.tipo);
  const Icono = ICONO_BLOQUE[bloque.tipo];
  const permiteIA = bloque.tipo === 'texto' || bloque.tipo === 'cita';

  return (
    <div ref={registrarNodo} className="relative">
      {/* Punto de parada sobre el sendero */}
      <span className={`absolute -left-8 top-4 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center bg-obsidiana-950 transition-colors ${
        arrastrando ? 'border-sun-400' : 'border-laguna-600'
      }`}>
        <span className={`w-2 h-2 rounded-full ${arrastrando ? 'bg-sun-400' : 'bg-laguna-500'}`} />
      </span>

      <div
        className={`bg-obsidiana-900 border rounded-2xl p-3 transition-all ${
          arrastrando
            ? 'border-sun-500 shadow-2xl shadow-black/50 scale-[1.02] rotate-[0.5deg] z-10 relative'
            : espectral
              ? 'border-laguna-500 border-dashed'
              : 'border-obsidiana-800'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amate-100/35">
            <Icono size={11} /> {info?.etiqueta}
          </span>
          <div className="flex items-center gap-0.5">
            {permiteIA && (
              <button
                onClick={() => onGenerarIA(bloque.texto ?? '')}
                disabled={generandoIA}
                title="Generar con IA"
                className="text-amate-100/40 hover:text-sun-400 p-1.5 disabled:opacity-40"
              >
                {generandoIA ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              </button>
            )}
            <button onClick={onEliminar} className="text-amate-100/30 hover:text-red-400 p-1.5">
              <Trash2 size={14} />
            </button>
            <button
              onPointerDown={onIniciarArrastre}
              className="text-amate-100/30 hover:text-amate-50 p-1.5 cursor-grab active:cursor-grabbing touch-none"
              title="Arrastrar para reordenar"
            >
              <GripVertical size={15} />
            </button>
          </div>
        </div>

        {(bloque.tipo === 'titulo_grande' || bloque.tipo === 'titulo_mediano' || bloque.tipo === 'titulo_normal') && (
          <input
            value={bloque.texto ?? ''}
            onChange={(e) => onCambiar({ texto: e.target.value })}
            placeholder={info?.placeholder}
            className={`w-full bg-transparent text-amate-50 placeholder:text-amate-100/25 focus:outline-none font-display font-bold ${
              bloque.tipo === 'titulo_grande' ? 'text-xl' : bloque.tipo === 'titulo_mediano' ? 'text-lg' : 'text-base'
            }`}
          />
        )}

        {bloque.tipo === 'texto' && (
          <textarea
            value={bloque.texto ?? ''}
            onChange={(e) => onCambiar({ texto: e.target.value })}
            placeholder={info?.placeholder}
            rows={3}
            className="w-full bg-transparent text-amate-50 placeholder:text-amate-100/25 text-sm focus:outline-none resize-none leading-relaxed"
          />
        )}

        {bloque.tipo === 'cita' && (
          <textarea
            value={bloque.texto ?? ''}
            onChange={(e) => onCambiar({ texto: e.target.value })}
            placeholder={info?.placeholder}
            rows={2}
            className="w-full bg-transparent text-amate-50 placeholder:text-amate-100/25 text-sm italic focus:outline-none resize-none"
          />
        )}

        {bloque.tipo === 'separador' && (
          <div className="py-1.5"><hr className="border-obsidiana-700" /></div>
        )}

        {bloque.tipo === 'enlace' && (
          <div className="space-y-2">
            <input
              value={bloque.texto ?? ''}
              onChange={(e) => onCambiar({ texto: e.target.value })}
              placeholder="Texto visible (ej: Síguenos en Instagram)"
              className="w-full bg-obsidiana-800 rounded-lg px-3 py-2 text-sm text-amate-50 placeholder:text-amate-100/25 focus:outline-none focus:ring-1 focus:ring-laguna-500"
            />
            <input
              value={bloque.url ?? ''}
              onChange={(e) => onCambiar({ url: e.target.value })}
              placeholder={info?.placeholder}
              className="w-full bg-obsidiana-800 rounded-lg px-3 py-2 text-sm text-amate-50 placeholder:text-amate-100/25 focus:outline-none focus:ring-1 focus:ring-laguna-500"
            />
          </div>
        )}

        {(bloque.tipo === 'actividad' || bloque.tipo === 'lugar') && (
          <div className="space-y-2">
            <input
              value={bloque.texto ?? ''}
              onChange={(e) => onCambiar({ texto: e.target.value })}
              placeholder={info?.placeholder}
              className="w-full bg-obsidiana-800 rounded-lg px-3 py-2 text-sm text-amate-50 placeholder:text-amate-100/25 focus:outline-none focus:ring-1 focus:ring-laguna-500"
            />
            <input
              value={bloque.detalle ?? ''}
              onChange={(e) => onCambiar({ detalle: e.target.value })}
              placeholder="Descripción breve (opcional)"
              className="w-full bg-obsidiana-800 rounded-lg px-3 py-2 text-sm text-amate-50 placeholder:text-amate-100/25 focus:outline-none focus:ring-1 focus:ring-laguna-500"
            />
          </div>
        )}

        {bloque.tipo === 'imagen' && (
          <div>
            {bloque.url ? (
              <div className="relative">
                <img src={bloque.url} alt="" className="w-full rounded-xl max-h-56 object-cover" />
                <label className="absolute bottom-2 right-2 bg-obsidiana-950/90 text-amate-50 text-xs font-semibold px-3 py-1.5 rounded-full cursor-pointer">
                  Cambiar
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => e.target.files?.[0] && onSubirArchivo(e.target.files[0])} />
                </label>
              </div>
            ) : (
              <label className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-obsidiana-700 rounded-xl py-7 text-sm text-amate-100/40 cursor-pointer hover:border-laguna-600">
                {subiendo ? (
                  <><Loader2 size={16} className="animate-spin" /> Subiendo…</>
                ) : (
                  <><FileImage size={16} /> Toca para subir una foto</>
                )}
                <input type="file" accept="image/*" className="hidden" disabled={subiendo}
                  onChange={(e) => e.target.files?.[0] && onSubirArchivo(e.target.files[0])} />
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
