# Cambios — sesión de arreglo de bugs

Todo compila limpio (`tsc -b --noEmit`) y el build de producción (`vite build`) corre sin errores. A continuación, qué se tocó y por qué, bug por bug.

---

## 1. Bug Comunidad
**Causa:** `agregarAlAlbum()` en `PerfilScreen.tsx` subía la foto y la guardaba en `usuarios.fotos`, pero nunca llamaba a `/api/comunidad/publicaciones`. Eran dos tablas totalmente desconectadas.

**Arreglo:**
- Nuevo checkbox "Compartir también en la Comunidad al subir" en el álbum de fotos del turista (activado por default).
- Cada foto ya subida tiene su propio botón "Compartir" para publicarla en Comunidad cuando quieras, sin volver a subirla.
- Archivos: `src/components/PerfilScreen.tsx`

## 2. Bug Mis lugares (reservas)
**Causa:** No existía endpoint `DELETE` para reservaciones, y cancelar no avisaba nada a la otra parte ni explicaba la política.

**Arreglo:**
- Nuevo `DELETE /api/reservaciones` — quita la reservación del panel y de la BD (solo para rechazadas/canceladas, solo el dueño).
- Botón **"Quitar reservación"** en Mis lugares → Reservas.
- **"Cancelar reservación"** ahora muestra antes de confirmar qué pasa con el anticipo según la política (flexible / no reembolsable) y si ya se pagó.
- Nueva tabla `notificaciones` (autoprovisionada) — al cancelar, se le avisa a la OTRA parte (turista o prestador) con un mensaje claro.
- Esas notificaciones ya se muestran en la burbuja flotante (antes solo mostraba solicitudes pendientes y mensajes).
- Archivos: `api/reservaciones.ts`, `src/components/FavoritesScreen.tsx`, `src/components/NotificacionesBurbuja.tsx`

## 3. Bug de actualizaciones molestas (parpadeo constante)
**Causa raíz:** cada refresco automático de 8s hacía `setCargando(true)` antes de pedir los datos, lo que desmontaba toda la lista y mostraba el loader — eso era el "cambio cambio" molesto, no un problema de datos.

**Arreglo:**
- Los refrescos en segundo plano ya no tocan el estado de "cargando" — solo el primer render de cada pestaña muestra el spinner.
- Aplicado en los 3 lugares que hacían polling: Mis lugares → Reservas, panel de Prestador → Reservaciones → Solicitudes, y la burbuja de notificaciones.
- **Bonus:** se arregló el bug de "Invalid Date" visible en las capturas — el backend mandaba `fecha` como timestamp completo (`2026-08-16T00:00:00.000Z`) y el frontend le pegaba una hora encima esperando texto plano. Ahora el backend manda `YYYY-MM-DD` con `to_char()`.
- Archivos: `api/reservaciones.ts`, `src/components/FavoritesScreen.tsx`, `src/components/PerfilScreen.tsx`, `src/components/NotificacionesBurbuja.tsx`

## 4. Bug Redes sociales y sitio
**Causa:** el guardado en base de datos SÍ funcionaba. El bug estaba en `buildPreview()`, la función que arma la vista previa de "tu PlaceCard" — nunca incluía el campo `enlaces`, así que guardabas el link, no había error, pero jamás se veía reflejado sin importar cuántas veces lo intentaras.

**Arreglo:** una línea — `buildPreview()` ahora incluye `enlaces`.
- Archivos: `src/components/PerfilScreen.tsx`

## 5. Bug Ganancias y estadísticas
**Causa:** el módulo era honesto pero un placeholder — "$0.00 MXN" estaba literalmente escrito fijo en el código, sin ninguna consulta real, y no existía ningún tracking de vistas/clics/recomendaciones.

**Arreglo — de punta a punta:**
- Nueva tabla `eventos_servicio` (autoprovisionada) con 3 tipos de evento: `vista`, `like`, `ia_recomendacion`.
- Tracking real en 3 puntos:
  - `PlaceDetail.tsx` → registra "vista" cada vez que se abre la ficha completa de un servicio.
  - `toggleFavorito()` en `db.ts` → registra "like" cuando alguien lo agrega a favoritos.
  - `ChatAssistant.tsx` → registra "ia_recomendacion" cada vez que el asistente muestra ese servicio en el chat.
- Nuevo endpoint `GET /api/servicios/editar?recurso=estadisticas` — ganancias reales (suma de anticipos pagados, ya con el 6% de comisión descontado), vistas, likes, recomendaciones de IA, % de vistas que terminaron en like, y una serie diaria de 14 días.
- El módulo "Ganancias y estadísticas" ahora muestra el monto real (no $0.00 fijo), 4 tarjetas de métricas, y 3 gráficas de barras (vistas / likes / IA) — sin agregar ninguna librería nueva, es SVG puro (`GraficaMini.tsx`) para no inflar el bundle.
- Archivos: `api/_lib/db.ts`, `api/servicios/aprobados.ts`, `api/servicios/editar.ts`, `src/lib/eventos.ts` (nuevo), `src/components/GraficaMini.tsx` (nuevo), `src/components/PlaceDetail.tsx`, `src/lib/db.ts`, `src/components/ChatAssistant.tsx`, `src/components/PerfilScreen.tsx`

## 6b. Calendario grande al reservar
**Causa:** el modal de "Reservar" usaba `<input type="date">`, que en muchos navegadores abre el selector nativo minúsculo (ver tu captura de referencia). Y el panel del prestador solo tenía una lista de texto para bloquear fechas, sin ninguna vista de calendario.

**Arreglo:**
- `CalendarioSeleccionFecha.tsx` (nuevo) — calendario grande de un mes para el turista al reservar, con los días ya ocupados tachados y deshabilitados automáticamente (se expuso `fechas_bloqueadas` públicamente en el catálogo para esto).
- `CalendarioReservacionesPrestador.tsx` (nuevo) — calendario mensual para el prestador en la pestaña Reservaciones: verde = confirmada, ámbar = pendiente, gris = bloqueada a mano. Tocar un día vacío lo bloquea, tocar uno bloqueado lo libera, tocar un día con reservación muestra el detalle (nombre del viajero + acceso directo a Mensajes).
- Archivos: `src/components/CalendarioSeleccionFecha.tsx` (nuevo), `src/components/CalendarioReservacionesPrestador.tsx` (nuevo), `src/components/ModalReservacion.tsx`, `src/components/PerfilScreen.tsx`, `api/servicios/aprobados.ts`, `src/data/lugares.ts`

---

## 6a. Rediseño visual del panel de prestador — PENDIENTE

Esto no se tocó todavía. Es un trabajo grande y subjetivo (todo `PerfilScreen.tsx`, +2000 líneas), y hacerlo a ciegas arriesga tirar horas en una dirección que no te guste. Antes de meterle mano conviene platicar:
- ¿Qué estilo te gusta como referencia? (¿Airbnb, algo más minimalista, oscuro como tu captura del calendario, etc.)
- ¿Se puede hacer pantalla por pantalla o necesitas todo de un golpe?

## Nota sobre la base de datos
Todas las tablas nuevas (`notificaciones`, `eventos_servicio`) se autoprovisionan solas la primera vez que se usan (`CREATE TABLE IF NOT EXISTS`), igual que ya hacían otras partes de este proyecto (`ia_uso_diario`, `conocimiento_dinamico`). **No hace falta correr ninguna migración manual** — con desplegar el código a Vercel es suficiente.
