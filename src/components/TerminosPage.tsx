// ============================================================
// TÉRMINOS Y CONDICIONES
// ============================================================
// Contenido real, no placeholder — reflejan exactamente cómo
// funciona TuxtlasGO hoy (Premium $89 MXN, comisión 6% por
// reservación vía Mercado Pago, moderación de Comunidad, etc.).
// Si el producto cambia, esta página también debe actualizarse.
// ============================================================

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TerminosPage() {
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
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-obsidiana-900 mb-2">Términos y Condiciones</h1>
        <p className="text-obsidiana-800/60 mb-10">Última actualización: agosto de 2026</p>

        <div className="prose-tuxtlas space-y-8 text-obsidiana-800">
          <Seccion titulo="1. Aceptación de los términos">
            <p>
              Al registrarte o usar TuxtlasGO (la "Plataforma"), aceptas estos Términos y Condiciones en su totalidad.
              Si no estás de acuerdo con alguna parte, no debes usar la Plataforma. TuxtlasGO es operada como
              proyecto TRL4 en desarrollo, no como una empresa constituida formalmente todavía.
            </p>
          </Seccion>

          <Seccion titulo="2. Qué es TuxtlasGO">
            <p>
              TuxtlasGO es una aplicación web progresiva (PWA) que funciona como guía turística de la región de Los
              Tuxtlas, Veracruz. Conecta a <strong>turistas</strong> que buscan actividades, hospedaje y gastronomía
              con <strong>prestadores de servicios</strong> locales, e incluye un asistente conversacional que
              funciona incluso sin conexión a internet, un mapa con rutas, y una sección de Comunidad para compartir
              experiencias.
            </p>
          </Seccion>

          <Seccion titulo="3. Cuentas de usuario">
            <p>
              Para registrarte necesitas dar información veraz (nombre, correo, y en el caso de prestadores, datos
              del negocio). Eres responsable de mantener la confidencialidad de tu contraseña y de toda actividad
              que ocurra en tu cuenta. TuxtlasGO puede suspender cuentas que proporcionen información falsa o que
              violen estos términos.
            </p>
          </Seccion>

          <Seccion titulo="4. Para prestadores de servicios">
            <p>El registro básico como prestador es <strong>gratuito</strong>. Al registrar tu servicio:</p>
            <ul>
              <li>Tu información pasa por un proceso de aprobación antes de aparecer públicamente en la Plataforma.</li>
              <li>Eres responsable de que la información publicada (precios, horarios, ubicación, fotos) sea exacta y esté actualizada.</li>
              <li>
                Puedes contratar el <strong>Plan Premium</strong> ($89 MXN/mes) para obtener posicionamiento
                prioritario en las recomendaciones del asistente de IA. Este pago se procesa a través de Mercado
                Pago; TuxtlasGO nunca almacena datos de tarjetas o cuentas bancarias.
              </li>
              <li>
                Puedes activar el módulo de <strong>reservaciones</strong>, independiente del Plan Premium. Para
                esto debes conectar tu propia cuenta de Mercado Pago mediante autorización OAuth. Cuando un turista
                paga el anticipo de una reservación, Mercado Pago reparte el pago automáticamente: TuxtlasGO retiene
                una comisión del <strong>6%</strong> y el resto se deposita directo a tu cuenta — TuxtlasGO nunca
                recibe ni retiene ese dinero de forma manual.
              </li>
              <li>
                Tú eliges la política de cancelación de tus reservaciones (flexible o no reembolsable) y el monto
                del anticipo. Eres responsable de cumplir con las condiciones que ofreces a los turistas.
              </li>
            </ul>
          </Seccion>

          <Seccion titulo="5. Para turistas">
            <p>
              Puedes explorar la Plataforma sin necesidad de cuenta. Para reservar un servicio, comentar o dar like
              en Comunidad, o guardar rutas en la nube, necesitas una cuenta. Al reservar un servicio, te
              comprometes a pagar el anticipo indicado (si aplica) y a respetar la política de cancelación que el
              prestador haya elegido para esa reservación.
            </p>
          </Seccion>

          <Seccion titulo="6. Comunidad">
            <p>
              La sección Comunidad permite compartir fotos, videos cortos (máximo 1 minuto) y experiencias. Al
              publicar contenido:
            </p>
            <ul>
              <li>Confirmas que tienes el derecho de compartir ese contenido (fotos y videos propios).</li>
              <li>Le das a TuxtlasGO permiso para mostrar ese contenido dentro de la Plataforma.</li>
              <li>
                No debes publicar contenido ilegal, que incite al odio, sexualmente explícito, o que viole los
                derechos de terceros.
              </li>
              <li>
                Cualquier publicación que reciba 3 reportes de usuarios distintos se oculta automáticamente del
                feed público mientras un administrador la revisa.
              </li>
            </ul>
          </Seccion>

          <Seccion titulo="7. Pagos y procesamiento">
            <p>
              Todos los pagos dentro de TuxtlasGO (Plan Premium y anticipos de reservación) se procesan a través de
              Mercado Pago, una pasarela de pago certificada. TuxtlasGO no almacena números de tarjeta, CLABE ni
              ninguna credencial bancaria en sus servidores. Cualquier disputa sobre un cargo debe iniciarse
              directamente con Mercado Pago o con el prestador correspondiente.
            </p>
          </Seccion>

          <Seccion titulo="8. Mensajería">
            <p>
              La bandeja de mensajes ligada a cada reservación existe para que turistas y prestadores resuelvan
              dudas dentro de la Plataforma. Si decides coordinar o pagar algo fuera de TuxtlasGO por tu cuenta,
              esa transacción queda completamente fuera de nuestra responsabilidad.
            </p>
          </Seccion>

          <Seccion titulo="9. Limitación de responsabilidad">
            <p>
              TuxtlasGO es un intermediario tecnológico: no presta directamente los servicios turísticos anunciados
              (hospedaje, tours, alimentos, transporte). No somos responsables de la calidad, seguridad o legalidad
              de los servicios ofrecidos por los prestadores, ni de la veracidad de las publicaciones de Comunidad.
              Cualquier disputa entre turista y prestador debe resolverse entre las partes.
            </p>
          </Seccion>

          <Seccion titulo="10. Propiedad intelectual">
            <p>
              El nombre "TuxtlasGO", su logotipo y el diseño de la Plataforma son propiedad de sus creadores. El
              contenido que tú subes (fotos, videos, texto) sigue siendo tuyo — solo le das permiso a TuxtlasGO de
              mostrarlo dentro de la Plataforma.
            </p>
          </Seccion>

          <Seccion titulo="11. Cambios a estos términos">
            <p>
              Podemos actualizar estos términos conforme la Plataforma evolucione. Los cambios importantes se
              anunciarán dentro de la app. El uso continuado de TuxtlasGO después de un cambio implica tu aceptación
              de los nuevos términos.
            </p>
          </Seccion>

          <Seccion titulo="12. Ley aplicable">
            <p>
              Estos términos se rigen por las leyes de los Estados Unidos Mexicanos, con jurisdicción en el estado
              de Veracruz.
            </p>
          </Seccion>

          <Seccion titulo="13. Contacto">
            <p>
              Si tienes dudas sobre estos términos, puedes contactarnos a través de los medios de contacto
              disponibles dentro de la Plataforma.
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
