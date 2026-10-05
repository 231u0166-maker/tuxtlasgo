// SOLO PARA PRUEBAS LOCALES — no se despliega ni toca la BD real.
// Levanta la app con una API falsa en memoria para poder ver el perfil de
// prestador sin Vercel/Neon:   npx vite --config vite.mock.config.mjs --port 5174
// Abre http://localhost:5174/__demo  (crea una sesión de prestador falsa).
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.ts';

let servicio = {
  id: 1,
  nombre: 'Cocos y Bebidas El Malecón',
  categoria: 'Comercio',
  municipio: 'Catemaco',
  descripcion:
    'Menú de bebidas. Ofrecemos aguas de coco naturales a $45 pesos, preparadas con carnita de coco al gusto. También cerveza Corona de cuartito: $18 pesos.',
  precio: '$$ $45 – $200 MXN (aprox. $3 – $12 USD)',
  contacto: '2941250703',
  lat: 18.42,
  lng: -95.11,
  estado: 'aprobado',
  codigo_seguimiento: 'TGO-DEMO',
  fotos: [],
  horario: '9:00 am - 6:00 pm',
  dias_abierto: 'Lunes, Martes, Miércoles, Jueves, Viernes',
  duracion: '1-2 horas',
  como_llegar: 'Sobre el malecón de Catemaco, frente al muelle.',
  tip: 'Lleva efectivo.',
  mascotas: '',
  ideal_para: ['pareja', 'familia'],
  enlaces: [],
  acepta_reservaciones: false,
  politica_cancelacion: 'flexible',
  fechas_bloqueadas: [],
  monto_minimo: null,
  mostrar_usd_reservacion: false,
};

const usuario = { id: 99, nombre: 'Alfredo Demo', correo: 'demo@tuxtlasgo.test', tipo: 'prestador' };

function json(res, obj, code = 200) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

function leerCuerpo(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => {
      try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); }
    });
  });
}

const apiFalsa = {
  name: 'api-falsa-tuxtlasgo',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = req.url ?? '';

      if (url.startsWith('/__demo')) {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<script>
          localStorage.setItem('tuxtlasgo-token','demo');
          localStorage.setItem('tuxtlasgo-usuario', ${JSON.stringify(JSON.stringify(usuario))});
          location.replace('/app?tab=perfil');
        </script>`);
        return;
      }

      if (!url.startsWith('/api/')) return next();

      if (url.startsWith('/api/auth/perfil')) {
        return json(res, { ok: true, usuario, servicio });
      }
      if (url.startsWith('/api/servicios/editar')) {
        if (url.includes('recurso=estadisticas')) {
          return json(res, { ok: true, ganancias: 0, reservasPagadas: 0, vistas: 12, likes: 3, iaRecomendaciones: 1, porcentajeLike: 25, serie: [] });
        }
        if (req.method === 'PATCH') {
          const cambios = await leerCuerpo(req);
          servicio = { ...servicio, ...cambios };
          return json(res, { ok: true, servicio });
        }
        return json(res, { ok: true, servicio });
      }
      if (url.startsWith('/api/reservaciones')) return json(res, { ok: true, reservaciones: [], notificaciones: [] });
      return json(res, { ok: false, error: 'API falsa: no implementado' }, 404);
    });
  },
};

export default mergeConfig(base, defineConfig({ plugins: [apiFalsa] }));
