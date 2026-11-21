# TuxtlasGO

> Plataforma turística inteligente de Los Tuxtlas, Veracruz.
> Proyecto **InnovaTecNM 2026** — ITSSAT — Folio 68894-17.

PWA (instalable, con soporte offline) hecha con React + TypeScript + Vite. Combina un **asistente conversacional con motor de recomendación local** (funciona sin internet) y, cuando hay conexión, **IA en la nube opcional**. Incluye mapa interactivo, exploración de lugares y servicios, eventos, comunidad, reservaciones y un panel para que los **prestadores locales** registren y administren sus servicios.

---

## Características

- **Asistente de viaje**: flujo guiado (días, intereses, presupuesto, grupo) que genera rutas por días con lugares reales, más modo de texto libre. Funciona offline con reglas + scoring; con conexión puede apoyarse en IA en la nube y en un modelo de embeddings (Transformers.js) para entender mejor preguntas en lenguaje natural.
- **Explorar y mapa**: catálogo de lugares y servicios con filtros, mapa con MapLibre y descarga de tiles para uso sin conexión.
- **Prestadores**: registro, edición, horarios semanales, fotos (Cloudinary) y aprobación por un administrador.
- **Reservaciones** con calendario de disponibilidad.
- **Eventos y actividades** con programa por evento, y sección de **comunidad** (publicaciones, reseñas, galería).
- **Cuentas**: registro/login propio (JWT + bcrypt) e inicio de sesión con Google.
- **Panel de administración**: aprobación de servicios, eventos, base de conocimiento del asistente.
- **Multilenguaje** (español / inglés) y avisos de privacidad, términos y derechos de autor.
- **App Android** empaquetada con Capacitor.

> Pagos premium con Mercado Pago: el flujo está implementado pero **aún no se ha confirmado con un pago real**.

---

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS 3, React Router 6, Motion |
| PWA | vite-plugin-pwa (Workbox) |
| Mapa | MapLibre GL (`@vis.gl/react-maplibre`) |
| Datos en el cliente | Dexie 4 (IndexedDB) |
| IA / PLN | Motor de reglas propio (`chatbot.ts`, `pln.ts`), `@xenova/transformers` (embeddings), `@mlc-ai/web-llm`, Groq / Gemini en la nube |
| Backend | Funciones serverless de Vercel en `api/` |
| Base de datos | Postgres en Neon (`@neondatabase/serverless`, `pg`) |
| Autenticación | JWT + bcryptjs, Google Identity |
| Imágenes | Cloudinary |
| Pagos | Mercado Pago |
| Móvil | Capacitor 8 (Android) |

---

## Primeros pasos

### Requisitos
- Node.js 18 o superior
- Un navegador moderno
- (Opcional) Android Studio para compilar la app móvil

### Instalación y desarrollo

```bash
npm install
npm run dev
```

La app abre en `http://localhost:5173`.

> Las funciones de `api/` son serverless de Vercel y **no corren con `npm run dev`**. Para probarlas localmente usa `vercel dev` (requiere el CLI de Vercel y las variables de entorno), o prueba contra el despliegue.

### Scripts

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Servidor de desarrollo (Vite) |
| `npm run build` | Chequeo de tipos (`tsc -b`) + build de producción en `dist/` |
| `npm run preview` | Sirve el build en red local para probar la PWA |
| `npm run lint` | Verifica tipos sin emitir (`tsc -b --noEmit`) |
| `npm run vectores` | Precalcula los vectores de embeddings del banco de respuestas |

---

## Variables de entorno

Crea un archivo `.env.local` en la raíz (está en `.gitignore`; **nunca subas secretos**). En Vercel se configuran en *Settings → Environment Variables*.

**Cliente (prefijo `VITE_`)**

| Variable | Uso |
|----------|-----|
| `VITE_MAPBOX_TOKEN` | Token del mapa |
| `VITE_GOOGLE_CLIENT_ID` | Inicio de sesión con Google |
| `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET` | Subida de imágenes |

**Servidor (`api/`)**

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` (o `NEON_DATABASE_URL`) | Conexión a Postgres (Neon) |
| `GOOGLE_CLIENT_ID` | Validar tokens de Google |
| `ADMIN_PASSWORD` | Acceso al panel de administración |
| `GROQ_API_KEY`, `GROQ_MODEL` | IA en la nube (Groq) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | IA en la nube (Gemini) |
| `IA_NUBE_LIMITE_DIARIO`, `IA_CACHE_TTL_SEGUNDOS` | Límite y caché de la IA en la nube |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary (servidor) |
| `LIMITE_VIDEO_MB_MES`, `LIMITE_VIDEO_REPRODUCCIONES_MES` | Cuotas de video |
| `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET` | Pagos |
| `EVENTOS_SAL` | Sal para identificadores de eventos |

---

## Estructura del proyecto

```
tuxtlasgo/
├── api/                    # Funciones serverless (Vercel)
│   ├── _lib/               # db, seguridad, eventos (código compartido)
│   ├── auth/               # login, registro, perfil
│   ├── servicios/          # registro, edición, aprobados, admin
│   ├── reservaciones.ts
│   ├── comunidad/          # publicaciones
│   ├── conocimiento/       # base de conocimiento del asistente (admin)
│   ├── ia/chat.ts          # proxy a IA en la nube
│   └── pagos/mercadopago.ts
├── src/
│   ├── components/         # Pantallas y componentes de UI
│   ├── lib/                # chatbot, pln, embeddings, llm, auth, db, i18n…
│   ├── data/               # catálogo base de lugares
│   ├── hooks/              # useOffline, useLLM
│   └── styles/
├── public/                 # íconos PWA, assets estáticos
├── scripts/                # precalcular-vectores.mjs
├── android/                # proyecto Android (Capacitor)
├── pruebas/                # maquetas HTML y colección Postman
├── vite.config.ts          # Vite + PWA/Workbox
├── vercel.json             # rewrites de /api y SPA, headers del SW
├── capacitor.config.ts
└── CAMBIOS.md              # bitácora de cambios por sesión
```

---

## Cómo funciona el asistente

1. **Reglas y scoring (offline)**: detecta intención, municipio y categorías; puntúa lugares por intereses, grupo de viaje, rating, destacados y presupuesto; arma rutas por día agrupando por municipio.
2. **Banco de respuestas + embeddings**: entiende paráfrasis comparando contra respuestas precalculadas (`npm run vectores`).
3. **IA en la nube (opcional)**: con conexión, recibe como contexto solo lugares y servicios reales del catálogo, para no inventar datos.

Los servicios ubicados **fuera de Los Tuxtlas** se muestran en Explorar con la etiqueta "Fuera de Los Tuxtlas", pero no entran en recomendaciones ni rutas de la región.

---

## Seguridad: guía para armar la presentación (diapositivas)

Esta sección sirve como guion para explicar **qué métodos de seguridad usa TuxtlasGO, dónde están en el código y cómo se ven en acción**. Sugerencia: una diapositiva por método, siempre con el mismo formato:

> **Problema → Método → Dónde está en TuxtlasGO → Demostración**

### Mapa de métodos

| # | Método | Problema que resuelve | Dónde está |
|---|--------|----------------------|-----------|
| 1 | **Hash de contraseñas (bcrypt)** | Que nadie vea las contraseñas aunque se filtre la base de datos | `api/auth/registro.ts`, `api/auth/login.ts` |
| 2 | **Tokens de sesión aleatorios** | Que no se pueda adivinar ni falsificar una sesión | `tokenSesion()` en `api/_lib/seguridad.ts`; tabla `sesiones` (caduca a los 30 días) |
| 3 | **Límite de intentos fallidos** | Fuerza bruta contra el login y la recuperación de contraseña | `intentosAgotados`, `registrarIntento`, `limpiarIntentos` en `api/_lib/seguridad.ts`; se aplican en `api/auth/login.ts` (por correo y por IP, tabla `intentos_auth`) |
| 4 | **Respuesta con tiempo constante** | Que el tiempo de respuesta no delate qué correos están registrados | `HASH_RELLENO` en `api/auth/login.ts` |
| 5 | **Mensajes de error genéricos** | No revelar si falló el correo o la contraseña | "Correo o contraseña incorrectos" en `login.ts` |
| 6 | **Verificación de Google (ID token)** | Que el inicio con Google no se pueda falsificar | `?accion=google` en `api/auth/login.ts` (revisa emisor, `aud` y correo verificado) |
| 7 | **Código de recuperación aleatorio** | Recuperar cuenta sin enviar la contraseña | `codigoAleatorio('REC')` en `api/auth/registro.ts` |
| 8 | **Acceso de administrador** | Que solo el admin apruebe servicios, eventos y contenido | `esAdmin()` en `api/_lib/seguridad.ts` (ver ejemplo abajo) |
| 9 | **Secretos fuera del código** | Que las llaves no queden en el repositorio | Variables de entorno (`.env.local` está en `.gitignore`; sin contraseña por defecto) |
| 10 | **Datos privados y avisos legales** | Transparencia con el usuario | `PrivacidadPage.tsx`, `TerminosPage.tsx`, `AvisoPrivacidad.tsx` |

### Ejemplo estrella: la página de administración

Es el mejor caso para la presentación porque muestra **seguridad en las dos capas** (navegador y servidor) y un cambio real que se hizo para mejorarla.

**Dónde está**
- Pantalla: `src/components/AdminPanel.tsx` (también `AdminEventos.tsx`).
- Contraseña en el navegador: `src/lib/adminPwd.ts`.
- Validación en el servidor: `esAdmin()` en `api/_lib/seguridad.ts`, usada en `api/servicios/admin.ts`, `api/conocimiento/admin.ts`, `api/comunidad/publicaciones.ts` y `api/_lib/eventos.ts`.

**Cómo funciona (para la diapositiva de flujo)**

1. El admin escribe la contraseña en `AdminPanel`.
2. El navegador **no la compara**: hace una petición de prueba a `/api/servicios/admin` con el encabezado `X-Admin-Password`.
3. El servidor ejecuta `esAdmin(req)`: compara con `process.env.ADMIN_PASSWORD`.
4. Si responde `401` → "Contraseña incorrecta". Si responde `200` → se muestra el panel.
5. La contraseña se guarda **solo en memoria** (`adminPwd.ts`): se pierde al recargar la página y nunca va a `localStorage`.
6. Cada acción del panel (aprobar, rechazar, dar de baja…) vuelve a mandar el encabezado, y **el servidor la revisa cada vez**. Esconder un botón no basta: la protección real está en el servidor.

**Mejoras que conviene contar (antes → ahora)**

| Antes | Ahora |
|-------|-------|
| La contraseña estaba escrita en el código del navegador | Se valida en el servidor; el código no la contiene |
| Si faltaba la variable, caía a una contraseña por defecto en el repo | Sin `ADMIN_PASSWORD` **nadie** es admin |
| Comparación normal de texto | Comparación de hashes SHA-256 con `timingSafeEqual` (tiempo constante, evita ataques por tiempo) |

**Demostración sugerida (2 minutos)**
1. Abre el panel de admin y escribe una contraseña incorrecta → mensaje de error.
2. Entra con la correcta → aparecen los servicios pendientes.
3. Recarga la página → pide la contraseña otra vez (no quedó guardada).
4. En el login normal, falla el acceso varias veces seguidas → tras el límite responde "Demasiados intentos".

> Para la demo no uses la contraseña real en pantalla compartida: cámbiala antes o ensaya con la ventana oculta.

### Estructura sugerida de la presentación

1. **Portada** — TuxtlasGO y por qué la seguridad importa (datos de turistas y prestadores).
2. **Qué protegemos** — cuentas, reservaciones, servicios de prestadores, panel de admin.
3. **Mapa de capas** — navegador → API serverless → base de datos (Neon), con los métodos de la tabla ubicados en cada capa.
4. **Cuentas y contraseñas** — bcrypt, tokens aleatorios, mensajes genéricos (métodos 1, 2, 5).
5. **Contra la fuerza bruta** — límite de intentos por correo y por IP, tiempo constante (métodos 3, 4).
6. **Inicio con Google** — verificación del ID token (método 6).
7. **Ejemplo: página de administración** — flujo de 6 pasos y tabla antes/ahora.
8. **Secretos y configuración** — variables de entorno, nada de contraseñas en el repo (método 9).
9. **Privacidad y transparencia** — aviso de privacidad y términos (método 10).
10. **Limitaciones y siguiente paso** — ver abajo. Ser honestos suma puntos con el jurado.
11. **Cierre y demo** — flujo de admin en vivo.

### Limitaciones reales (menciónalas, no las ocultes)

- La contraseña de admin es **una sola y compartida**; no hay cuentas de administrador individuales ni registro de quién hizo qué.
- El límite de intentos protege el login y la recuperación de contraseña, pero **no** los demás endpoints (incluido el acceso de admin).
- Las sesiones son tokens guardados en la base de datos (no JWT), con vigencia de 30 días.
- Los endpoints permiten CORS abierto (`Access-Control-Allow-Origin: *`).
- El flujo de pagos con Mercado Pago aún no se ha confirmado con un pago real.

---

## Despliegue

El proyecto se despliega en **Vercel** (frontend + funciones `api/`) con base de datos en **Neon**.

1. Importa el repositorio en Vercel (framework: Vite).
2. Configura las variables de entorno de la sección anterior.
3. Deploy. `vercel.json` ya enruta `/api/*` a las funciones y el resto a `index.html`.

### App Android

```bash
npm run build
npx cap sync android
npx cap open android
```

---

## Créditos

Proyecto del Instituto Tecnológico Superior de San Andrés Tuxtla (ITSSAT).
Categoría: **Bienes de Consumo Final — Soluciones y Productos Digitales**.
InnovaTecNM 2026.

## Licencia

Uso académico — InnovaTecNM 2026.
