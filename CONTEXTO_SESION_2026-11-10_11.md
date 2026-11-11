# Contexto de la sesión 10–11 de noviembre de 2026

Resumen de **todo lo que se hizo en esta sesión larga** (de la noche del 10 a la madrugada del 11), para retomar sin perder el hilo. El detalle fino, cambio por cambio, está en `CAMBIOS.md` (secciones "Sesión 2026-11-10 …" y "Sesión 2026-11-11 …"). Este archivo es el mapa: qué es cada cosa, dónde vive, qué decisiones se tomaron y qué falta.

> **Regla de trabajo del dueño del proyecto:** Claude **nunca hace commit ni push**; el dueño lo hace a mano. Para cambios grandes de interfaz se hace primero una **maqueta** (`pruebas/maqueta-*.html`), se aprueba y luego se pasa a la app. Todo se prueba en el navegador real, no solo con `tsc`.

---

## 1. Panorama

Se rediseñó de punta a punta el **flujo de prestadores**: registro de negocio, perfil del prestador (4 secciones), rechazo/aprobación con notificaciones, reservaciones, fotos editables, horario por día, enlaces con logos y vista previa. Estilo común: **tarjetas de vidrio** (`TarjetaFormulario`), iconos de línea de `lucide-react` de un solo tono verde, resúmenes con **lápiz** que despliega, barra flotante **"Tienes cambios sin guardar"**, pantalla completa en celular y dos columnas en PC, y animaciones suaves (opacidad/desplazamiento, sin desenfoque costoso).

## 2. Lo que se hizo, por área

### 2.1 Pantalla de carga
- `index.html`: splash en HTML/CSS puro dentro de `#root` (logo `logo-emblema.png` pulsando + barrita), se pinta antes del JS; React lo reemplaza al montar. Respeta `prefers-reduced-motion`.

### 2.2 Registro de negocio (`ProviderPanel.tsx`)
- Paso 1 **una pregunta por pantalla** con animación vertical: nombre → tipo (tarjetas grandes con foto) → municipio (lista grande; "Otro lugar" abre municipio + estado).
- Precio con **`SelectorRangoPrecio`** (4 niveles + 2 deslizadores), compartido con Mi Perfil.
- Contacto: teléfono, luego **mapa satelital Mapbox** a pantalla grande con pin fijo al centro, buscador (Nominatim) y "Usar mi ubicación actual".
- Verificación: un solo botón **"Subir foto"** (`<input type=file>` sin `capture` → el teléfono ofrece cámara/galería). Permiso `CAMERA` agregado en `android/.../AndroidManifest.xml` (**falta `npx cap sync` al compilar**).
- Pantalla final: avisa que llegará una notificación (ya no existe "Consultar estado").
- Inicio de `/prestador` minimalista y centrado (`PantallaInicio`), CTA según estado (crear cuenta / registrar / ir a mi perfil).

### 2.3 Aprobación / rechazo y notificaciones
- `api/servicios/admin.ts`: al aprobar, rechazar o dar de baja se inserta una **notificación** al prestador (con el motivo). Tabla `notificaciones` se auto-crea.
- `TarjetaRechazo.tsx` (en Mi Servicio): "Ver razones", **Volver a enviar a revisión** (`PATCH /api/servicios/editar` con `reenviar_revision: true`, solo si está rechazado) y **Escríbenos** (WhatsApp con mensaje precargado si hay número; si no, abre el perfil de Instagram `@tuxtlas_go`).
- `src/lib/soporte.ts`: **PENDIENTE poner el número real en `WHATSAPP_SOPORTE`** (ej. `'5219211234567'`).
- Se eliminó "Consultar estado de mi servicio" (`ConsultarEstado`).
- Redes oficiales actualizadas (footer, JSON-LD de `index.html`, soporte): Facebook `facebook.com/share/1KnrBQAX1T/`, Instagram `instagram.com/tuxtlas_go`, TikTok `tiktok.com/@tuxtlasgo` (nuevo, icono SVG propio).

### 2.4 Perfil del prestador (`PerfilScreen.tsx`)
- **Menú por secciones:** celular = lista agrupada en vidrio + fila aparte "Ver cómo te ven"; PC = columna lateral con pastilla activa animada (`layoutId`). Secciones: **Mi servicio, Fotos, Reservaciones, Enlaces y pagos** (la pestaña *Vista previa* se eliminó; `PreviewCard` borrado).
- Componentes de formulario reutilizables definidos en el mismo archivo: `TarjetaFormulario` (con `derecha` opcional), `SeccionRegla` (resumen + lápiz que despliega), `ModalEditarSeccion` (variante `formulario`: pantalla completa en celular, 2 columnas en PC), `NotaCompacta`.
- **Mi servicio** (tres modales rediseñados):
  - *Información básica:* tarjetas Tu negocio / Ubicación / Descripción. La descripción usa **`EditorDescripcion`** (bloc de notas: papel con renglones, emojis, viñetas, interlineado, tamaño de letra, **Expandir** a pantalla completa vía portal en `<body>`, modo `compacto`).
  - *Precio y contacto:* `SelectorRangoPrecio` + teléfono (`tel:`), interruptor "también tiene WhatsApp" y correo. WhatsApp y correo se guardan como **enlaces con id fijo** (`wa-contacto`, `correo-contacto`), sin tocar la BD. La ficha pública hace el contacto tocable (`tel:`/`mailto:`).
  - *Detalles para el turista:* **horario por día** (ver 2.5) + tarjetas Duración, Cómo llegar, Consejo, Mascotas (las tres con el mismo bloc de notas) e Ideal para (chips con icono).
- **Vista previa:** "Ver cómo te ven" abre la **ficha real** (`PlaceDetail`) con los datos guardados (fotos con texto, redes con logo, botón Reservar si está activo; el servidor impide que un prestador reserve). También hay un botón en el aviso "Cambios guardados" (dura 9 s).

### 2.5 Horario por día
- `src/lib/horario.ts`: formato `Semana` = 7 días × tramos `[inicio, fin]` en minutos. `textosDeSemana()` genera los textos de siempre (`horario`, `dias_abierto`) para no romper fichas ni asistente: si todos los días abiertos coinciden → "Lunes, Martes…" / "9:00 am - 6:00 pm"; si no → `dias_abierto = "Horario por día"` y `horario = "Lun–Mar 9:00 am - 10:00 pm; Mié …; Jue–Dom cerrado"`. `semanaDesdeTextos()` precarga negocios viejos.
- `EditorHorarioSemanal.tsx`: PC = calendario semanal tipo Google Calendar (arrastrar para crear, bordes para ajustar, mover, × quitar; pasos de 30 min, 6:00 a. m.–medianoche) con botón **Expandir** a pantalla completa; celular = renglón por día con interruptor y `<input type=time>` (permite horario partido). Columnas memorizadas para arrastre ligero. `ResumenHorario.tsx` = "Así lo verá el turista".
- Servidor: columna `servicios.horario_semanal JSONB`; `editar.ts` la valida (7 días, ≤4 tramos, 0–1440, fin > inicio).

### 2.6 Fotos del servicio
- `GestorFotos.tsx`: doble clic (o lápiz) abre **`EditorFoto.tsx`**: recorte con marco arrastrable (Libre/Original/1:1/4:3/3:4/16:9), brillo/contraste/color, **texto debajo** (160 caracteres) y **Subir a Comunidad** (`POST /api/comunidad/publicaciones` con `texto` + `imagen_url`). Procesa en canvas (máx. 1600 px, JPEG 0.9), sube la foto nueva a Cloudinary y **reemplaza la anterior en su lugar** (borra la vieja por `public_id`).
- Servidor: columna `servicios.fotos_pies JSONB` (`{url: texto}`); `PATCH /api/servicios/editar?recurso=fotos` con `{url, pie?, reemplazarPor?, publicIdViejo?}`; `GET` devuelve `pies`; `DELETE` limpia el pie. El catálogo público (`aprobados.ts`) trae `pies` y la galería de `PlaceDetail` los muestra bajo cada foto. El caché offline guarda fichas completas, así que `pies` ya viaja también sin internet.

### 2.7 Reservaciones
- **Recibir reservaciones:** interruptor; encender = publicar (confirmación del 6 %), apagar = **pausar** (`acepta_reservaciones=false` conservando config; distinto de "Eliminar").
- **Reglas** sin ventana, tres secciones con lápiz: Si el cliente cancela (Flexible / No reembolsable), Anticipo (Sin anticipo, $100–$300, Otro monto) y Turistas extranjeros (USD). Barra de guardar.
- **`CalendarioReservas.tsx`** (reemplaza `CalendarioReservacionesPrestador.tsx`, borrado): Mes y Semana (7 días PC / 3 celular) estilo Google Calendar; horario de apertura sombreado, reservas como etiquetas, días bloqueados rayados. Bloquear: botón del día, **arrastre con mouse** sobre varios días, o **"Varios días"** (tocar primero y último) en celular. Día con reservación confirmada = "Reservado" (no se libera a mano; el servidor ya lo bloquea al confirmar). Agenda del día **debajo** del calendario (Aceptar/Rechazar/Mensajes). Las reservaciones son **por día, sin hora**, por eso en Semana van en "todo el día".
- Tarjeta **Solicitudes** se dejó igual (decisión del dueño). "Eliminar reservaciones" quedó como enlace discreto al final.
- **Notificaciones:** las solicitudes pendientes aparecen en la campana (`NotificacionesBurbuja.tsx`) con **Aceptar/Rechazar** inline (mismo `PATCH /api/reservaciones`). Y `api/reservaciones.ts` ahora **avisa al turista** cuando el prestador acepta o rechaza (tipos `reservacion_confirmada` / `reservacion_rechazada`).

### 2.8 Enlaces y pagos
- `LogoRed.tsx`: cuadro con color de marca + icono (Instagram degradado, Facebook, WhatsApp, TikTok, YouTube; Sitio, Correo y Otro genéricos). Se usa en el perfil y en los chips de la ficha pública.
- `lib/enlaces.ts`: tipos `instagram | facebook | whatsapp | tiktok | youtube | sitio | correo | otro`; `normalizarEnlace()` (basta escribir `@usuario`, número o dominio) y `textoCortoEnlace()`.
- Pestaña: tarjeta **Redes y contacto** (lista con logo, lápiz, papelera; selector "Agregar" con logos) y tarjeta **Pagos** (Mercado Pago), con barra de guardar.

### 2.9 Búsqueda semántica (consulta, sin cambios)
- Modelo en uso: **`Xenova/multilingual-e5-small`** (embeddings de 384 dimensiones, corre en el dispositivo; umbrales ~0.80–0.82). Reemplazó a `all-MiniLM-L6-v2`. No es un LLM.

---

## 3. Cambios de servidor y base de datos (importante al desplegar)

| Cambio | Dónde | Notas |
|---|---|---|
| Columnas nuevas `servicios.horario_semanal` y `servicios.fotos_pies` (JSONB) | `api/_lib/db.ts` → `asegurarColumnasServicio(pool)` | Se crean solas con `ALTER TABLE … ADD COLUMN IF NOT EXISTS` la primera vez (bandera por instancia). La llaman `perfil.ts`, `editar.ts`, `aprobados.ts`. |
| `reenviar_revision`, `horario_semanal`, fotos PATCH/pies | `api/servicios/editar.ts` | Validaciones del lado servidor. |
| Notificaciones de aprobado / rechazado / baja | `api/servicios/admin.ts` | Dentro de `try/catch`: si falla no se tumba la acción. |
| Aviso al turista al confirmar/rechazar | `api/reservaciones.ts` (`mensajeRespuesta`) | Igual, dentro de `try/catch`. |
| Catálogo público trae `pies` | `api/servicios/aprobados.ts` | `Lugar.pies?: Record<string,string>` en `data/lugares.ts`. |

**Nada de esto se probó contra Neon ni con el Cloudinary real** (en el navegador se simularon con rutas de Playwright). Tras desplegar, vigilar el primer guardado de horario/foto y una reservación de prueba aceptada/rechazada.

## 4. Archivos nuevos / eliminados

- **Nuevos (`src/components/`):** `EditorDescripcion`, `SelectorRangoPrecio`, `EditorHorarioSemanal`, `ResumenHorario`, `EditorFoto`, `CalendarioReservas`, `LogoRed`, `TarjetaRechazo`.
- **Nuevos (`src/lib/`):** `precio.ts`, `horario.ts`, `soporte.ts`. Reescrito: `enlaces.ts`.
- **Eliminados:** `CalendarioReservacionesPrestador.tsx`.
- **Maquetas (`pruebas/`):** `maqueta-perfil.html`, `maqueta-info-basica.html`, `maqueta-horario.html`, `maqueta-reservaciones.html`.
- **Más tocados:** `PerfilScreen.tsx` (el grande), `ProviderPanel.tsx`, `PlaceDetail.tsx`, `GestorFotos.tsx`, `NotificacionesBurbuja.tsx`, `FooterDinamico.tsx`, `i18n-en.ts`, `index.html`, `MapScreen.tsx` (exporta el estilo satélite).

## 5. Rendimiento (decisiones)
- Carga diferida (`React.lazy`) de `EditorDescripcion`, `SelectorRangoPrecio`, `EditorHorarioSemanal`, `CalendarioReservas` y `EditorFoto`: paquetes de ~2–14 kB que solo se bajan al abrir su formulario.
- Se quitó `backdrop-blur` de tarjetas grandes y los `filter: blur()` de las transiciones (solo quedan 3 barras fijas pequeñas con vidrio).
- El **paquete principal sigue pesando ~3.1 MB (840 kB gzip)**; viene de antes (modelo de embeddings/mapas/etc.). Candidato a revisar aparte si hay problemas de RAM en celulares viejos.

## 6. Pendientes y decisiones abiertas

1. **Poner el número real** en `src/lib/soporte.ts` (`WHATSAPP_SOPORTE`).
2. **`npx cap sync`** y recompilar la app Android (permiso de cámara en el manifest).
3. **Probar en teléfono real:** selector de foto/cámara, `tel:` desde la ficha, GPS del mapa de registro, teclado en los bloc de notas, doble toque en fotos (hay lápiz como respaldo).
4. **Probar contra Neon/Cloudinary reales** todo lo de la sección 3, y la prueba **sin internet** de los textos de fotos.
5. **Editor de foto con fotos chicas:** hoy no se amplían en pantalla (propuesta: ajustar la vista al espacio y avisar si la foto es muy pequeña). Sin decidir.
6. **Horario:** el calendario llega a las 12:00 a. m.; un negocio que cierra después de medianoche no cabe. Sin decidir.
7. **Reservaciones por día sin hora:** si se quiere ver reservas por hora en la Semana, hay que agregar la hora al formulario del turista.
8. Con el interruptor de reservaciones apagado el calendario se oculta (igual que antes).
9. Más redes (X, Telegram…) no se agregaron; "Otro enlace" las cubre sin logo de marca.
10. El perfil de **turista** (`PerfilTurista`) no se tocó en esta sesión.

## 7. Notas técnicas para no tropezar

- **Probar en local:** `npx vite --config vite.mock.config.mjs --port 5174` (API falsa en memoria), abrir `/__demo` (sesión de prestador). Para ver el registro: cambiar `tipo` a `turista` en `localStorage['tuxtlasgo-usuario']`. En Playwright se simula lo demás con `page.route(...)`. Cuidado: tras un error de Playwright la página se reinicia y las rutas viejas se acumulan (usar `page.unrouteAll()`).
- **Fin de línea:** algunos archivos usan CRLF (por ejemplo `PlaceDetail.tsx`); al editar con scripts hay que respetarlo. `PerfilScreen.tsx` terminaba sin salto de línea al final.
- **Trampa de `String.replace`:** al reemplazar texto con `$` (precios) hay que usar función (`() => nuevo`), si no `$'` y `$&` se interpretan y se corrompe el archivo (pasó una vez; se restauró desde git).
- **Portales:** los editores "expandidos" se pintan en `<body>` con `createPortal` porque un ancestro con `backdrop-filter` o `transform` atrapa a `position: fixed`.
- **Datos por día:** `fechas_bloqueadas` es una lista de `YYYY-MM-DD`; al confirmar una reservación el servidor agrega esa fecha; cancelar una confirmada la quita.

## 8. Cómo retomar mañana
1. Leer este archivo y la sección final de `CAMBIOS.md`.
2. Resolver los pendientes 1–4 (los que bloquean publicar).
3. Decidir 5–7 con el dueño y seguir con lo siguiente que pida (quedaron todas las pestañas del perfil del prestador rediseñadas; lo lógico es una **revisión general** antes de subir a producción).
