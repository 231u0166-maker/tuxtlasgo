// ============================================================
// AVISO DE COPYRIGHT
// ============================================================
// Declara la autoría de TuxtlasGO (código, diseño, marca y
// contenido propio) para dejar constancia frente a copias o
// uso no autorizado por terceros.
// ============================================================

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function CopyrightPage() {
  return (
    <div className="min-h-screen bg-amate-50">
      <header className="bg-white border-b border-obsidiana-900/5 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-1.5 text-sm font-semibold text-jungle-800 hover:text-jungle-950">
            <ArrowLeft size={18} /> Inicio
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 pb-20">
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-obsidiana-900 mb-2">Aviso de Copyright</h1>
        <p className="text-obsidiana-800/60 mb-10">Última actualización: septiembre de 2026</p>

        <div className="prose-tuxtlas space-y-8 text-obsidiana-800">
          <Seccion titulo="1. Titularidad">
            <p>
              © {new Date().getFullYear()} TuxtlasGO. Todos los derechos reservados. El nombre "TuxtlasGO", su
              logotipo, la identidad visual, el diseño de interfaz, el código fuente y los textos originales de esta
              Plataforma son de la autoría de su equipo creador y están protegidos por la legislación de propiedad
              intelectual de los Estados Unidos Mexicanos y por tratados internacionales aplicables.
            </p>
          </Seccion>

          <Seccion titulo="2. Qué está protegido">
            <ul>
              <li>El código fuente de la aplicación (frontend, lógica de negocio y funciones de servidor).</li>
              <li>El diseño visual, la interfaz de usuario y la experiencia de navegación (UX/UI).</li>
              <li>El nombre "TuxtlasGO" y su logotipo.</li>
              <li>Los textos, íconos y elementos gráficos propios creados para la Plataforma.</li>
            </ul>
          </Seccion>

          <Seccion titulo="3. Uso no autorizado">
            <p>
              Queda prohibida la reproducción, copia, distribución, modificación, ingeniería inversa o publicación
              total o parcial de TuxtlasGO, su código o su diseño, sin autorización previa y por escrito de sus
              autores. Esto incluye la creación de aplicaciones o sitios derivados que reutilicen su código o diseño
              sin permiso.
            </p>
          </Seccion>

          <Seccion titulo="4. Contenido de terceros">
            <p>
              El contenido que los usuarios suben a la sección Comunidad (fotos, videos, comentarios) sigue siendo
              propiedad de quien lo publica, conforme a lo descrito en los{' '}
              <Link to="/terminos" className="text-jungle-700 hover:text-jungle-900 underline">
                Términos y Condiciones
              </Link>
              .
            </p>
          </Seccion>

          <Seccion titulo="5. Reportar un uso indebido">
            <p>
              Si detectas una copia no autorizada de TuxtlasGO o de sus contenidos, puedes reportarlo a través de los
              medios de contacto disponibles dentro de la Plataforma.
            </p>
          </Seccion>
        </div>
      </div>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display font-bold text-xl text-obsidiana-900 mb-3">{titulo}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-obsidiana-900 [&_strong]:font-semibold">
        {children}
      </div>
    </section>
  );
}
