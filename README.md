# TuxtlasGO

> Plataforma turística inteligente offline de Los Tuxtlas, Veracruz.
> Proyecto **InnovaTecNM 2026** — ITSSAT — Folio 68894-17.

PWA construida con React + TypeScript + Vite. Funciona 100% offline una vez cargada con internet por primera vez. Asistente conversacional con PLN local (sin LLMs en la nube), base de conocimiento de la región, mapa interactivo de Los Tuxtlas y panel para que prestadores locales registren sus servicios y se validen.

---

## 🚀 Cómo correrla por primera vez

### 1. Requisitos
- **Node.js 18+** ([descárgalo aquí](https://nodejs.org/))
- **VS Code** o cualquier editor
- Un navegador moderno (Chrome, Edge, Firefox o Safari)

### 2. Instalar dependencias
Abre una terminal en la carpeta del proyecto y corre:

```bash
npm install
```

Esto descarga todo lo necesario (~300 MB en `node_modules/`). Tarda 1-3 minutos.

### 3. Levantar el servidor de desarrollo

```bash
npm run dev
```

La app abre en `http://localhost:5173`. El Service Worker se activa automáticamente.

### 4. Build de producción (para el demo)

```bash
npm run build
npm run preview
```

Esto genera la versión optimizada en `dist/` y la sirve en `http://localhost:4173`.
**Para el demo del stand usa siempre `npm run preview`**, no `npm run dev`, porque el build optimizado es más rápido y se ve mejor.

---

## 🎯 Demo de 5 minutos (script para el stand)

Tu demo gana o pierde con **4 momentos**. Practícalos:

| # | Momento | Pasos exactos |
|---|---------|---------------|
| 1 | **Instalar como app** | Abre la URL en Chrome móvil. Toca el botón "Instalar en mi celular" en la landing. Se agrega a la pantalla de inicio. Ábrela desde ahí: ya no se ve barra del navegador. |
| 2 | **Modo avión funciona** | Con la app cargada, **activa modo avión**. Recarga la app. Sigue funcionando todo: explorar, mapa, chat, favoritos. **El badge naranja "Modo offline activo" aparece arriba**. |
| 3 | **Asistente arma una ruta** | Toca la pestaña "Asistente". Responde: *2 días* → *Naturaleza + Aventura* → *Listo* → *Medio* → *Pareja*. En 3 segundos te genera una ruta por días con lugares reales. **Esta es tu win condition.** |
| 4 | **Prestador registra servicio** | Vuelve a `/` y entra a "Soy prestador" (o ve directo a `/prestador`). Llena el formulario → "Registrar servicio". El nuevo servicio aparece arriba de la lista al instante. |

### Antes de subir al stand
1. Levanta `npm run preview`
2. Abre la app en tu celular
3. Ve a la pestaña **Mapa** y toca **"Descargar mapa"** (espera ~12 seg a que termine). Esto pre-cachea los tiles del mapa para que se vea offline.
4. Explora las pestañas 1 vez para que el SW cachee imágenes.
5. **Ahora sí**, activa modo avión y empieza el demo.

---

## 📁 Estructura

```
tuxtlasgo/
├── public/
│   ├── icons/              # iconos PWA (192, 512, maskable, apple-touch)
│   └── favicon.svg
├── src/
│   ├── components/         # UI
│   │   ├── LandingPage.tsx
│   │   ├── AppShell.tsx        # contenedor con tabs
│   │   ├── ExploreScreen.tsx   # buscar y filtrar lugares
│   │   ├── MapScreen.tsx       # Leaflet + pre-cache offline
│   │   ├── ChatAssistant.tsx   # asistente conversacional (CORE)
│   │   ├── FavoritesScreen.tsx # favoritos + rutas guardadas
│   │   ├── ProviderPanel.tsx   # registro de prestadores
│   │   ├── PlaceCard.tsx
│   │   ├── PlaceDetail.tsx
│   │   ├── BottomNav.tsx
│   │   └── OfflineIndicator.tsx
│   ├── data/
│   │   └── lugares.ts          # 19 lugares reales y verificados
│   ├── lib/
│   │   ├── chatbot.ts          # motor del asistente (CORE)
│   │   ├── pln.ts              # módulo de Procesamiento de Lenguaje Natural
│   │   ├── conocimiento.ts     # base de conocimiento (clima, transporte, comida...)
│   │   └── db.ts               # IndexedDB con Dexie
│   ├── hooks/
│   │   └── useOffline.ts
│   ├── styles/
│   │   └── index.css
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── vite.config.ts          # PWA + Workbox config
├── tailwind.config.js
├── tsconfig.json
├── vercel.json             # config de deploy
├── package.json
└── README.md
```

---

## 🛠️ Tecnologías

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| Framework | React 18 + TypeScript | Tipado fuerte, escalable |
| Build | Vite 5 | Rapidísimo |
| PWA | vite-plugin-pwa (Workbox) | Service Worker de producción |
| Estilos | Tailwind CSS 3 | Diseño consistente y mobile-first |
| Mapa | Leaflet + react-leaflet | Open source, sin Google Maps |
| BD local | Dexie 4 (IndexedDB) | Persistencia offline real |
| Router | React Router 6 | Multi-página |
| Iconos | Lucide React | Iconografía consistente |

**No usamos:** ningún servicio en la nube, ninguna API externa para el chat, ningún CDN crítico (excepto tiles del mapa, que se cachean).

---

## 🌐 Deploy en Vercel + dominio en GoDaddy

### 1. Subir a GitHub
```bash
git init
git add .
git commit -m "TuxtlasGO v0.1"
gh repo create tuxtlasgo --public --source=. --push
```

(Si no tienes `gh` CLI, créa el repo en github.com y luego `git remote add origin URL && git push -u origin main`.)

### 2. Conectar a Vercel
1. Entra a [vercel.com](https://vercel.com) con tu cuenta de GitHub (gratis con GitHub Student Pack).
2. "Add New Project" → importa el repo `tuxtlasgo`.
3. Framework: Vite. El resto en automático.
4. Deploy. En ~2 minutos tienes una URL tipo `tuxtlasgo.vercel.app`.

### 3. Conectar tu dominio de GoDaddy
1. En Vercel → tu proyecto → Settings → Domains → Add → pon tu dominio (ej. `tuxtlasgo.com`).
2. Vercel te muestra registros DNS que tienes que poner en GoDaddy.
3. En GoDaddy → Mi cuenta → Productos → tu dominio → DNS → agrega:
   - `A` record: `@` → `76.76.21.21`
   - `CNAME` record: `www` → `cname.vercel-dns.com`
4. Espera 10-30 min para propagación. Listo.

---

## 🧠 Cómo funciona el asistente offline

El asistente es un **chatbot conversacional con PLN (Procesamiento de
Lenguaje Natural) local** — un sistema experto basado en reglas. No usa
ningún modelo de lenguaje en la nube ni ninguna API: toda la inteligencia
vive en el dispositivo. Funciona en tres etapas:

### Etapa 1 — PLN: entender al usuario
El módulo `lib/pln.ts` procesa lo que escribe el usuario:
- **Normalización:** minúsculas, sin acentos, sin signos.
- **Tokenización:** separa el texto en palabras.
- **Tolerancia a errores ortográficos:** usa la *distancia de edición de
  Damerau-Levenshtein* para reconocer palabras mal escritas. Así
  "cascda", "comdia" o "catemco" se entienden igual que bien escritas.
- **Normalización morfológica:** ignora la *h muda* del español
  ("ospedaje" → hospedaje) y el plural simple ("cascadas" → cascada).
- **Detección de intención y entidades:** identifica qué quiere el
  usuario (comida, naturaleza, cultura...) y qué municipio menciona.

### Etapa 2 — Motor de inferencia: decidir
- **Para rutas:** cada lugar recibe un score ponderado:
  +5 si su categoría coincide con tus intereses, +3 si tu grupo de viaje
  está en su lista "ideal para", + su rating, +1.5 si es destacado,
  -4 si excede tu presupuesto.
- **Para preguntas prácticas:** consulta la base de conocimiento
  (`lib/conocimiento.ts`) — clima, transporte, comida típica, seguridad,
  qué llevar, mejor época — y elige la entrada con más coincidencias.

### Etapa 3 — Generación de respuesta
- Agrupa los mejores lugares por municipio para minimizar traslados,
  los distribuye en días y los ordena por momento del día
  (aventura/naturaleza en la mañana, gastronomía en la tarde).
- **IA explicable:** cada recomendación viene con su razonamiento
  ("te puse esto porque..."), no es una caja negra.

### Por qué este enfoque y no un LLM en la nube
- **100% offline** — funciona en las zonas sin señal de Los Tuxtlas,
  que es el problema que la app resuelve.
- **Predecible** — no inventa lugares ni datos; solo responde con
  información verificada de la base.
- **Instantáneo** — sin esperar respuesta de ningún servidor.
- **Privado** — lo que escribe el usuario nunca sale del dispositivo.
- **Defendible** — todo el comportamiento es código que se puede leer,
  explicar y auditar.

---

## 📋 Lo que falta hacer (días restantes)

- [ ] Reemplazar imágenes de Unsplash por fotos propias (visita de campo o fotos de los prestadores con permiso)
- [ ] Agregar más prestadores reales al seed inicial (mínimo 10)
- [ ] Validar coordenadas con GPS en sitio
- [ ] Grabar video demo de 30 seg (para subir a la presentación)
- [ ] Imprimir QR de la URL para el stand
- [ ] Ensayar el pitch de 5 min mínimo 3 veces

---

## 🎓 Créditos

Proyecto del Instituto Tecnológico Superior de San Andrés Tuxtla (ITSSAT).
Categoría: **Bienes de Consumo Final — Soluciones y Productos Digitales**.
Etapa: Local · InnovaTecNM 2026.

---

## Licencia

Uso académico — InnovaTecNM 2026.
