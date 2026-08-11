// ============================================================
// EDITOR DE GUÍA DEL SERVICIO — Módulo 2 (Prestador)
// ============================================================
// Sustituye el "editar = otro formulario" por un editor de bloques,
// como pide MEJORAS DISEÑO PANEL PRESTADOR. El prestador arma el
// contenido enriquecido de su servicio (más allá de los campos fijos
// de Mi Servicio) con bloques reordenables: títulos, texto, fotos,
// enlaces, citas, actividades y lugares cercanos.
//
// Vive como pantalla completa (overlay), igual que PlaceDetail — se
// abre desde el botón "Editar guía" en la pestaña Mi Servicio.
// ============================================================

import { useState } from 'react';
import {
  X, Plus, ChevronUp, ChevronDown, Trash2, Sparkles, Loader2,
  PenLine, Link2, FileImage, Eye, EyeOff, CheckCircle2,
} from 'lucide-react';
import {
  type BloqueContenido, type TipoBloque, type EstadoGuia,
  TIPOS_BLOQUE, bloqueVacio, nuevoBloqueId,
} from '../lib/bloquesGuia';
import { subirFoto, type ProgresoSubida } from '../lib/cloudinary';
import RenderBloques from './RenderBloques';

interface Props {
  nombreServicio: string;
  municipio: string;
  codigoServicio: string;
  bloquesIniciales: BloqueContenido[];
  estadoInicial: EstadoGuia;
  onCerrar: () => void;
  onGuardar: (bloques: BloqueContenido[], estado: EstadoGuia) => Promise<boolean>;
}

type Metodo = 'elegir' | 'cero' | 'editando';

export default function EditorGuiaServicio({
  nombreServicio, municipio, codigoServicio,
  bloquesIniciales, estadoInicial, onCerrar, onGuardar,
}: Props) {
  const [metodo, setMetodo] = useState<Metodo>(bloquesIniciales.length > 0 ? 'editando' : 'elegir');
  const [bloques, setBloques] = useState<BloqueContenido[]>(bloquesIniciales);
  const [estado, setEstado] = useState<EstadoGuia>(estadoInicial);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [subiendoImg, setSubiendoImg] = useState<string | null>(null); // id del bloque subiendo
  const [generandoIA, setGenerandoIA] = useState<string | null>(null); // id del bloque generando
  const [huboExito, setHuboExito] = useState(false);
  const [enlaceInicial, setEnlaceInicial] = useState('');

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

  function moverBloque(id: string, dir: -1 | 1) {
    setBloques((b) => {
      const i = b.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= b.length) return b;
      const copia = [...b];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  async function subirImagenBloque(id: string, file: File) {
    setSubiendoImg(id);
    try {
      const url = await new Promise<string>((resolve, reject) => {
        subirFoto(file, `guia-${codigoServicio}`, (p: ProgresoSubida) => {
          if (p.url) resolve(p.url);
          if (p.error) reject(new Error(p.error));
        });
      });
      actualizarBloque(id, { url });
    } catch {
      alert('No se pudo subir la imagen. Intenta de nuevo.');
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
            `Ayudas a un prestador de servicios a redactar un bloque de tipo "${tipo === 'cita' ? 'cita/testimonio breve' : 'texto descriptivo'}" ` +
            `para la guía de su servicio "${nombreServicio}" en ${municipio}. ` +
            `Máximo 2-3 frases, cálido y natural, en español. NUNCA inventes datos específicos ` +
            `(precios, actividades, platillos) que no te den — si el prestador no dio detalle, ` +
            `mantente genérico pero atractivo. Responde solo con el texto, sin comillas extra.`,
          mensajes: [{ role: 'user', content: semilla.trim() || `Escribe el bloque para "${nombreServicio}".` }],
        }),
      });
      const data = await r.json();
      if (r.ok && data.texto) actualizarBloque(id, { texto: data.texto.trim() });
      else alert('No se pudo generar el texto ahora mismo — escríbelo tú, no hay problema.');
    } catch {
      alert('Necesitas internet para generar texto con IA.');
    }
    setGenerandoIA(null);
  }

  async function guardar(nuevoEstado: EstadoGuia) {
    setGuardando(true);
    const ok = await onGuardar(bloques, nuevoEstado);
    setGuardando(false);
    if (ok) {
      setEstado(nuevoEstado);
      setHuboExito(true);
      setTimeout(() => setHuboExito(false), 2500);
    } else {
      alert('No se pudo guardar. Verifica tu internet e intenta de nuevo.');
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-jungle-50 flex flex-col">
      {/* ── Header ── */}
      <div className="bg-white border-b border-jungle-100 px-4 py-3 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onCerrar} className="text-jungle-500 hover:text-jungle-900 flex-shrink-0" aria-label="Cerrar">
            <X size={20} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-display font-bold text-sm text-jungle-950 truncate">{nombreServicio}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                estado === 'publicado' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {estado === 'publicado' ? 'Publicado' : 'Borrador'}
              </span>
            </div>
            <p className="text-[11px] text-jungle-400">Guía del servicio</p>
          </div>
        </div>
        {metodo === 'editando' && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setVistaPrevia((v) => !v)}
              className="text-xs font-semibold text-jungle-700 border border-jungle-200 rounded-full px-3 py-1.5 flex items-center gap-1.5 hover:bg-jungle-50"
            >
              {vistaPrevia ? <EyeOff size={13} /> : <Eye size={13} />}
              {vistaPrevia ? 'Editar' : 'Vista previa'}
            </button>
            <button
              onClick={() => guardar(estado === 'publicado' ? 'borrador' : 'publicado')}
              disabled={guardando}
              className={`text-xs font-bold rounded-full px-4 py-1.5 flex items-center gap-1.5 disabled:opacity-50 ${
                estado === 'publicado'
                  ? 'bg-jungle-100 text-jungle-700'
                  : 'bg-jungle-700 text-white hover:bg-jungle-800'
              }`}
            >
              {guardando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              {estado === 'publicado' ? 'Volver a borrador' : 'Publicar'}
            </button>
          </div>
        )}
      </div>

      {huboExito && (
        <div className="bg-green-50 border-b border-green-200 text-green-800 text-xs font-medium text-center py-1.5">
          Guardado ✓ — así lo verán los turistas en tu ficha.
        </div>
      )}

      {/* ── Cuerpo ── */}
      <div className="flex-1 overflow-y-auto">
        {metodo === 'elegir' && (
          <PantallaElegirMetodo
            enlaceInicial={enlaceInicial}
            setEnlaceInicial={setEnlaceInicial}
            onEmpezarCero={() => { setMetodo('editando'); }}
            onVincularEnlace={(url) => {
              setBloques([{ id: nuevoBloqueId(), tipo: 'enlace', texto: 'Síguenos en redes', url }]);
              setMetodo('editando');
            }}
            onSubirArchivo={async (file) => {
              setMetodo('editando');
              const idBloque = nuevoBloqueId();
              setBloques([{ id: idBloque, tipo: 'imagen' }]);
              await subirImagenBloque(idBloque, file);
            }}
          />
        )}

        {metodo === 'editando' && vistaPrevia && (
          <div className="max-w-lg mx-auto px-4 py-6">
            <p className="text-xs text-jungle-500 mb-3 text-center">Así verá el turista tu guía</p>
            <div className="bg-white rounded-2xl border border-jungle-100 p-4">
              {bloques.length === 0 ? (
                <p className="text-sm text-jungle-400 text-center py-6">Aún no has añadido contenido.</p>
              ) : (
                <RenderBloques bloques={bloques} />
              )}
            </div>
          </div>
        )}

        {metodo === 'editando' && !vistaPrevia && (
          <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
            {bloques.length === 0 && (
              <div className="bg-white border border-dashed border-jungle-200 rounded-2xl p-8 text-center text-jungle-400 text-sm">
                Aún no tienes bloques. Toca “Añadir bloque” para empezar a construir tu guía.
              </div>
            )}

            {bloques.map((b, i) => (
              <BloqueEditor
                key={b.id}
                bloque={b}
                esPrimero={i === 0}
                esUltimo={i === bloques.length - 1}
                subiendo={subiendoImg === b.id}
                generandoIA={generandoIA === b.id}
                onCambiar={(cambios) => actualizarBloque(b.id, cambios)}
                onEliminar={() => eliminarBloque(b.id)}
                onSubirArchivo={(file) => subirImagenBloque(b.id, file)}
                onMoverArriba={() => moverBloque(b.id, -1)}
                onMoverAbajo={() => moverBloque(b.id, 1)}
                onGenerarIA={(semilla) => generarConIA(b.id, b.tipo, semilla)}
              />
            ))}

            {/* Menú añadir bloque */}
            <div className="relative pt-2">
              <button
                onClick={() => setMenuAbierto((v) => !v)}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-jungle-200 hover:border-jungle-400 text-jungle-700 py-3 rounded-xl text-sm font-semibold transition-colors"
              >
                <Plus size={16} /> Añadir bloque
              </button>
              {menuAbierto && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-jungle-100 rounded-xl shadow-lg z-10 max-h-72 overflow-y-auto">
                  {TIPOS_BLOQUE.map((t) => (
                    <button
                      key={t.tipo}
                      onClick={() => agregarBloque(t.tipo)}
                      className="w-full text-left px-4 py-2.5 text-sm text-jungle-800 hover:bg-jungle-50 border-b border-jungle-50 last:border-0"
                    >
                      {t.etiqueta}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => guardar(estado)}
              disabled={guardando}
              className="w-full bg-jungle-100 hover:bg-jungle-200 text-jungle-700 py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
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
    <div className="max-w-lg mx-auto px-4 py-8">
      <h2 className="font-display font-extrabold text-xl text-jungle-950 text-center mb-1">Crea tu guía</h2>
      <p className="text-sm text-jungle-500 text-center mb-6">
        Contenido extra para que tu servicio se vea increíble — fotos, redes, lo que ya tengas.
      </p>

      <div className="space-y-3">
        <button
          onClick={onEmpezarCero}
          className="w-full text-left bg-white border border-jungle-100 hover:border-jungle-400 rounded-2xl p-4 flex items-center gap-4 transition-colors"
        >
          <div className="w-11 h-11 rounded-xl bg-jungle-50 flex items-center justify-center flex-shrink-0">
            <PenLine size={20} className="text-jungle-700" />
          </div>
          <div>
            <p className="font-display font-bold text-sm text-jungle-950">Empieza de cero</p>
            <p className="text-xs text-jungle-500 mt-0.5">Arma tu guía bloque por bloque.</p>
          </div>
        </button>

        <div className="bg-white border border-jungle-100 rounded-2xl p-4">
          <button
            onClick={() => setMostrarEnlace((v) => !v)}
            className="w-full text-left flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-xl bg-jungle-50 flex items-center justify-center flex-shrink-0">
              <Link2 size={20} className="text-jungle-700" />
            </div>
            <div>
              <p className="font-display font-bold text-sm text-jungle-950">Vincula contenido ya existente</p>
              <p className="text-xs text-jungle-500 mt-0.5">Tu Instagram, Facebook o publicación.</p>
            </div>
          </button>
          {mostrarEnlace && (
            <div className="mt-3 flex gap-2">
              <input
                value={enlaceInicial}
                onChange={(e) => setEnlaceInicial(e.target.value)}
                placeholder="https://instagram.com/tu_negocio"
                className="flex-1 bg-jungle-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
              />
              <button
                onClick={() => enlaceInicial.trim() && onVincularEnlace(enlaceInicial.trim())}
                disabled={!enlaceInicial.trim()}
                className="bg-jungle-700 disabled:opacity-40 text-white px-4 rounded-xl text-sm font-semibold"
              >
                Usar
              </button>
            </div>
          )}
        </div>

        <label className="w-full text-left bg-white border border-jungle-100 hover:border-jungle-400 rounded-2xl p-4 flex items-center gap-4 transition-colors cursor-pointer">
          <div className="w-11 h-11 rounded-xl bg-jungle-50 flex items-center justify-center flex-shrink-0">
            <FileImage size={20} className="text-jungle-700" />
          </div>
          <div>
            <p className="font-display font-bold text-sm text-jungle-950">Sube una foto</p>
            <p className="text-xs text-jungle-500 mt-0.5">Un volante o cartel de tu negocio.</p>
          </div>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onSubirArchivo(e.target.files[0])}
          />
        </label>
      </div>
    </div>
  );
}

// ─────────────── Editor de un bloque individual ───────────────
function BloqueEditor({
  bloque, esPrimero, esUltimo, subiendo, generandoIA,
  onCambiar, onEliminar, onSubirArchivo, onMoverArriba, onMoverAbajo, onGenerarIA,
}: {
  bloque: BloqueContenido;
  esPrimero: boolean;
  esUltimo: boolean;
  subiendo: boolean;
  generandoIA: boolean;
  onCambiar: (c: Partial<BloqueContenido>) => void;
  onEliminar: () => void;
  onSubirArchivo: (file: File) => void;
  onMoverArriba: () => void;
  onMoverAbajo: () => void;
  onGenerarIA: (semilla: string) => void;
}) {
  const info = TIPOS_BLOQUE.find((t) => t.tipo === bloque.tipo);
  const permiteIA = bloque.tipo === 'texto' || bloque.tipo === 'cita';

  return (
    <div className="bg-white border border-jungle-100 rounded-2xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-jungle-400">{info?.etiqueta}</span>
        <div className="flex items-center gap-1">
          {permiteIA && (
            <button
              onClick={() => onGenerarIA(bloque.texto ?? '')}
              disabled={generandoIA}
              title="Generar con IA"
              className="text-jungle-400 hover:text-jungle-700 p-1 disabled:opacity-40"
            >
              {generandoIA ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            </button>
          )}
          <button onClick={onMoverArriba} disabled={esPrimero} className="text-jungle-400 hover:text-jungle-700 p-1 disabled:opacity-25">
            <ChevronUp size={14} />
          </button>
          <button onClick={onMoverAbajo} disabled={esUltimo} className="text-jungle-400 hover:text-jungle-700 p-1 disabled:opacity-25">
            <ChevronDown size={14} />
          </button>
          <button onClick={onEliminar} className="text-red-300 hover:text-red-600 p-1">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {(bloque.tipo === 'titulo_grande' || bloque.tipo === 'titulo_mediano' || bloque.tipo === 'titulo_normal') && (
        <input
          value={bloque.texto ?? ''}
          onChange={(e) => onCambiar({ texto: e.target.value })}
          placeholder={info?.placeholder}
          className={`w-full bg-jungle-50 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jungle-400 font-display font-bold ${
            bloque.tipo === 'titulo_grande' ? 'text-lg' : bloque.tipo === 'titulo_mediano' ? 'text-base' : 'text-sm'
          }`}
        />
      )}

      {bloque.tipo === 'texto' && (
        <textarea
          value={bloque.texto ?? ''}
          onChange={(e) => onCambiar({ texto: e.target.value })}
          placeholder={info?.placeholder}
          rows={3}
          className="w-full bg-jungle-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400 resize-none"
        />
      )}

      {bloque.tipo === 'cita' && (
        <textarea
          value={bloque.texto ?? ''}
          onChange={(e) => onCambiar({ texto: e.target.value })}
          placeholder={info?.placeholder}
          rows={2}
          className="w-full bg-jungle-50 rounded-xl px-3 py-2 text-sm italic focus:outline-none focus:ring-2 focus:ring-jungle-400 resize-none"
        />
      )}

      {bloque.tipo === 'separador' && (
        <div className="py-2"><hr className="border-jungle-200" /></div>
      )}

      {bloque.tipo === 'enlace' && (
        <div className="space-y-2">
          <input
            value={bloque.texto ?? ''}
            onChange={(e) => onCambiar({ texto: e.target.value })}
            placeholder="Texto visible (ej: Síguenos en Instagram)"
            className="w-full bg-jungle-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
          />
          <input
            value={bloque.url ?? ''}
            onChange={(e) => onCambiar({ url: e.target.value })}
            placeholder={info?.placeholder}
            className="w-full bg-jungle-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
          />
        </div>
      )}

      {(bloque.tipo === 'actividad' || bloque.tipo === 'lugar') && (
        <div className="space-y-2">
          <input
            value={bloque.texto ?? ''}
            onChange={(e) => onCambiar({ texto: e.target.value })}
            placeholder={info?.placeholder}
            className="w-full bg-jungle-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
          />
          <input
            value={bloque.detalle ?? ''}
            onChange={(e) => onCambiar({ detalle: e.target.value })}
            placeholder="Descripción breve (opcional)"
            className="w-full bg-jungle-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jungle-400"
          />
        </div>
      )}

      {bloque.tipo === 'imagen' && (
        <div>
          {bloque.url ? (
            <div className="relative">
              <img src={bloque.url} alt="" className="w-full rounded-xl max-h-52 object-cover" />
              <label className="absolute bottom-2 right-2 bg-white/95 text-jungle-700 text-xs font-semibold px-3 py-1.5 rounded-full cursor-pointer shadow">
                Cambiar
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onSubirArchivo(e.target.files[0])}
                />
              </label>
            </div>
          ) : (
            <label className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-jungle-200 rounded-xl py-6 text-sm text-jungle-500 cursor-pointer hover:border-jungle-400">
              {subiendo ? (
                <><Loader2 size={16} className="animate-spin" /> Subiendo…</>
              ) : (
                <><FileImage size={16} /> Toca para subir una foto</>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={subiendo}
                onChange={(e) => e.target.files?.[0] && onSubirArchivo(e.target.files[0])}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
