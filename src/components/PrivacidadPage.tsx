// ============================================================
// POLÍTICA DE PRIVACIDAD
// ============================================================
// Basada en cómo TuxtlasGO maneja datos de verdad: qué se guarda en
// el dispositivo (IndexedDB, offline-first) vs qué llega a Neon, qué
// terceros están de por medio (Mercado Pago, Cloudinary) y los
// derechos ARCO que exige la ley mexicana de protección de datos.
// ============================================================

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacidadPage() {
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
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-obsidiana-900 mb-2">Política de Privacidad</h1>
        <p className="text-obsidiana-800/60 mb-10">Última actualización: agosto de 2026</p>

        <div className="space-y-8 text-obsidiana-800">
          <Seccion titulo="1. Qué información recopilamos">
            <p>Dependiendo de cómo uses TuxtlasGO, podemos recopilar:</p>
            <ul>
              <li><strong>Datos de cuenta:</strong> nombre, correo electrónico, contraseña (cifrada), foto de perfil.</li>
              <li><strong>Datos de prestador:</strong> nombre del negocio, categoría, municipio, teléfono o correo de contacto, precios, horarios, fotos del servicio.</li>
              <li><strong>Ubicación:</strong> solo si das permiso explícito, para mostrar tu posición en el mapa y calcular rutas — nunca se guarda en el servidor, solo se usa en tu sesión.</li>
              <li><strong>Contenido que subes:</strong> fotos y videos en Comunidad o en tu perfil de servicio.</li>
              <li><strong>Mensajes:</strong> el contenido de la conversación entre turista y prestador dentro de una reservación.</li>
              <li><strong>Datos de uso:</strong> qué lugares visitas dentro de la app, tus rutas guardadas, tus favoritos — todo esto se guarda principalmente en tu propio dispositivo.</li>
            </ul>
          </Seccion>

          <Seccion titulo="2. Cómo usamos tu información">
            <ul>
              <li>Para crear y administrar tu cuenta.</li>
              <li>Para mostrar tu servicio a los turistas (si eres prestador aprobado).</li>
              <li>Para procesar reservaciones y conectar el pago con la cuenta de Mercado Pago del prestador correspondiente.</li>
              <li>Para que el asistente de IA pueda responder tus preguntas y recomendarte lugares.</li>
              <li>Para moderar contenido en Comunidad y mantener la Plataforma segura.</li>
            </ul>
          </Seccion>

          <Seccion titulo="3. Con quién compartimos información">
            <p><strong>Nunca vendemos tus datos a terceros.</strong> Sí trabajamos con proveedores que procesan datos en nuestro nombre, cada uno con su propia política de privacidad:</p>
            <ul>
              <li><strong>Mercado Pago</strong> — procesa todos los pagos (Plan Premium, anticipos de reservación). Nosotros nunca vemos ni guardamos datos de tarjetas o cuentas bancarias.</li>
              <li><strong>Cloudinary</strong> — almacena las fotos y videos que subes.</li>
              <li><strong>Neon (base de datos)</strong> — guarda la información de cuentas, servicios y reservaciones.</li>
              <li><strong>Vercel</strong> — aloja la aplicación y sus funciones de servidor.</li>
            </ul>
          </Seccion>

          <Seccion titulo="4. Datos guardados en tu dispositivo">
            <p>
              TuxtlasGO está diseñada para funcionar sin internet en zonas de baja conectividad. Para esto, guarda
              información localmente en tu dispositivo (favoritos, rutas, caché del catálogo de lugares) usando
              tecnología del navegador (IndexedDB). Esta información no sale de tu dispositivo salvo que la
              sincronices explícitamente (por ejemplo, al guardar una ruta en la nube).
            </p>
          </Seccion>

          <Seccion titulo="5. Seguridad">
            <p>
              Las contraseñas se almacenan cifradas, nunca en texto plano. Las conexiones a la Plataforma usan
              HTTPS. Aun así, ningún sistema es 100% infalible — te recomendamos usar una contraseña única para tu
              cuenta de TuxtlasGO.
            </p>
          </Seccion>

          <Seccion titulo="6. Tus derechos (ARCO)">
            <p>
              Conforme a la ley mexicana de protección de datos personales, tienes derecho a Acceder, Rectificar,
              Cancelar u Oponerte al tratamiento de tus datos personales (derechos ARCO). Puedes ejercerlos
              directamente editando tu perfil dentro de la app, o solicitando la eliminación de tu cuenta a través
              de los medios de contacto disponibles en la Plataforma.
            </p>
          </Seccion>

          <Seccion titulo="7. Menores de edad">
            <p>
              TuxtlasGO no está dirigida a menores de 18 años. Si eres padre o tutor y crees que un menor nos ha
              proporcionado información personal, contáctanos para eliminarla.
            </p>
          </Seccion>

          <Seccion titulo="8. Cambios a esta política">
            <p>
              Podemos actualizar esta política conforme la Plataforma evolucione. Los cambios importantes se
              anunciarán dentro de la app.
            </p>
          </Seccion>

          <Seccion titulo="9. Contacto">
            <p>
              Si tienes preguntas sobre esta política de privacidad o quieres ejercer tus derechos ARCO, puedes
              contactarnos a través de los medios de contacto disponibles dentro de la Plataforma.
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
