# Cambios — sesión de arreglo de bugs

Todo compila limpio (`tsc -b --noEmit`) y el build de producción (`vite build`) corre sin errores. A continuación, qué se tocó y por qué, bug por bug.

---

# Sesión 2026-09-26 — Reestructura de "Mi Servicio" (menos saturación)

## "Mi Servicio" pasa de un formulario gigante a 3 modales por sección
**Pedido:** el usuario mostró capturas de "Mi Servicio" (Perfil de prestador) — un solo formulario largo con TODOS los campos (nombre, categoría, precio, contacto, horario, cómo llegar, mascotas...) visibles de golpe al tocar "Editar", muy saturado sobre todo en móvil. Pidió que cada edición abra una ventana emergente enfocada solo en esa parte, como el modal de "Iniciar sesión".
**Arreglo:** "Mi Servicio" ahora es una vista de solo lectura con 3 tarjetas (Información básica · Precio y contacto · Detalles para el turista), cada una con su propio lápiz de editar. Cada lápiz abre un modal (`ModalEditarSeccion`, mismo patrón visual que `AuthModal`: hoja desde abajo en móvil, centrado en escritorio) con solo los campos de esa sección. El guardado sigue siendo el mismo PATCH de siempre a `/api/servicios/editar` — no se tocó el backend. Al abrir cualquier modal, el formulario se refresca desde el servicio real (`formDesdeServicio()`), así "Cancelar" nunca deja un campo a medio escribir filtrándose a otra sección.
**Probado en vivo:** con sesión de prestador simulada (mock de `/api/auth/perfil` y `/api/servicios/editar`) — abrí y guardé cambios en los 3 modales, y confirmé que cancelar sin guardar descarta el cambio (reabrí el modal y seguía el valor original).
- Archivos: `src/components/PerfilScreen.tsx`

## "Detalles para el turista": horario tipo rueda de alarma + días con más espacio
**Pedido:** dentro de ese modal, "Días abierto" se veía muy apretado (compartía la mitad del ancho con "Horario"), y el campo Horario usaba el selector nativo del navegador (`<input type="time">`), que se ve técnico/feo y distinto en cada sistema — pidió algo como la rueda de hora de un celular al poner una alarma.
**Arreglo:**
- "Horario" y "Días abierto" ahora ocupan cada uno el ancho completo del modal (antes iban en 2 columnas apretadas) — los 7 botones de día ya tienen espacio de sobra.
- Selector de hora hecho a la medida con 3 ruedas deslizables (hora 12h, minutos, a.m./p.m.) usando scroll-snap nativo del navegador — sin agregar ninguna librería nueva. Reemplaza el `<input type="time">` para "Desde" y "Hasta".
**Probado en vivo:** abrí el modal, deslicé la rueda de hora de "Desde" de 9 a 6, guardé, y confirmó "6:00 am - 11:32 pm" en el resumen.
- Archivos: `src/components/PerfilScreen.tsx`

## "Días abierto" ahora abre su propia ventana con look de calendario
**Pedido:** que al tocar "Días abierto" se abra otra ventana, con una interfaz tipo Google Calendar para marcar los días.
**Decisión importante (confirmada con el usuario):** "Días abierto" sigue siendo un patrón semanal que se repite siempre (abierto todos los lunes) — NO se convirtió en una cuadrícula de fechas reales del mes, porque eso obligaría al prestador a venir cada mes a marcar el mes siguiente, para siempre. Se le explicó la diferencia y prefirió mantener el patrón semanal, solo con apariencia de calendario.
**Arreglo:** "Días abierto" ahora es un botón resumen (ej. "L, M, M, J, V") que abre una ventana propia, apilada sobre el modal de "Detalles para el turista". Ahí, columnas L-D con celdas apiladas simulan un calendario — tocar la columna completa de un día lo marca/desmarca para todas las semanas. Incluye "Marcar todos los días" y "Listo". El dato guardado (`dias_abierto`) no cambió de formato, solo la forma de capturarlo.
**Probado en vivo:** abrí la ventana, activé "Sábado" tocando su columna, cerré con "Listo", y confirmé que el resumen y el guardado final reflejan "Lunes, Martes, Miércoles, Jueves, Viernes, Sábado".
**Ajuste pedido después:** se quitaron las barras decorativas debajo de cada círculo (el usuario las vio de sobra) — quedan solo los 7 círculos L-D.
- Archivos: `src/components/PerfilScreen.tsx`

## "Reservaciones": configuración a resumen + modal (calendario y solicitudes intactos)
**Pedido:** el tab "Reservaciones" no se sentía tan complejo como "Mi Servicio", pero seguía siendo todo en una sola pantalla larga — aplicar el mismo criterio donde conviniera, con cuidado porque esta parte ya funciona en producción (pagos reales, Mercado Pago).
**Decisión de alcance:** solo "Política de cancelación" + "Anticipo mínimo" (ajustes que se configuran una vez y rara vez se tocan) se movieron a resumen + modal de edición — mismo patrón que "Mi Servicio". El calendario, "Fechas no disponibles" y "Solicitudes" se dejaron visibles tal cual, porque son información operativa que el prestador necesita ver de un vistazo, no un formulario para esconder.
**Arreglo:** nueva tarjeta "Configuración de reservaciones" de solo lectura (política actual, anticipo actual, si muestra USD) con su lápiz de editar. El modal reutiliza exactamente la misma lógica de guardado (`onGuardarConfig`, incluyendo el aviso de la comisión 6%/94% al publicar por primera vez) — no se tocó ningún endpoint ni la lógica de pagos. "Eliminar reservaciones" pasó de botón grande junto a "Guardar" a un link rojo pequeño debajo del resumen, mismo comportamiento (con su confirmación).
**Probado en vivo:** cambié la política de "Flexible" a "No reembolsable" desde el modal, guardé, y el resumen se actualizó correctamente sin recargar la página.
- Archivos: `src/components/PerfilScreen.tsx`

## "Tu calendario" y "Fechas no disponibles" fusionados
**Pedido:** el usuario notó que esas dos tarjetas hacían básicamente lo mismo (bloquear/desbloquear fechas) y preguntó si convenía fusionarlas.
**Diagnóstico confirmado:** sí eran redundantes — el calendario (`CalendarioReservacionesPrestador.tsx`) ya permite tocar un día vacío para bloquearlo/desbloquearlo; la lista de chips + campo de fecha de "Fechas no disponibles" hacía lo mismo por otro camino.
**Arreglo (sin quitar funcionalidad):** se fusionaron en una sola tarjeta. El calendario queda arriba tal cual; abajo, separado por una línea, se conserva la lista de chips (para ver todas las fechas bloqueadas sin importar el mes) y el campo de fecha rápido (para bloquear un día lejano sin navegar mes por mes con las flechas) — las dos formas de bloquear se mantienen, solo dejaron de ser dos tarjetas separadas.
**Probado en vivo:** toqué un día del calendario (28 de septiembre) y confirmé que apareció de inmediato como chip "28 sep" en la sección de abajo, dentro de la misma tarjeta.
- Archivos: `src/components/PerfilScreen.tsx`

# Sesión 2026-09-25 — Limpieza de datos demo

## Prestadores demo eliminados
**Pedido:** quitar dos sitios de la lista.
**Nota:** "Restaurante & Tours Pedro Hernández" y "Lanchas Don Cheve" no existían en la base de datos real — eran datos de ejemplo que se insertan automáticamente en el IndexedDB local cuando la app arranca sin prestadores (`seedDemoSiVacio`). Se quitaron de ese seed; solo queda "Cabañas El Mirador" como demo. Además, quien ya los tenía sembrados de antes seguía viéndolos (el seed solo corre una vez) — se agregó `limpiarPrestadoresDemoRetirados()` que los borra del dispositivo al abrir la app, sin tocar favoritos/rutas/chats. Probado inyectando esos registros a mano en IndexedDB y confirmando que desaparecen al recargar.
- Archivos: `src/lib/db.ts`, `src/App.tsx`

## Pestaña "Patrocinados" eliminada
**Pedido:** quitar el apartado/pestaña "Patrocinados" y revisar que no quedara rastro.
**Alcance (decisión del usuario):** solo la pestaña y pantalla dedicada. La insignia morada "Patrocinado" en las tarjetas y la mezcla de prestadores Premium dentro de "Destacados" (Inicio) se dejaron intactas a propósito — el Plan Premium sigue dando ese beneficio visible, solo sin pestaña propia.
**Arreglo:** se borró `PatrocinadosScreen.tsx`, la entrada `patrocinados` de `BottomNav.tsx` (móvil, incluyendo el tipo `Tab` y el import de `Crown` ahí) y el import/render de esa pantalla en `AppShell.tsx` (el ícono `Crown` ya no se usaba ahí tampoco). Se limpió un comentario en `InicioScreen.tsx` que hacía referencia a la pestaña ya inexistente. Verificado en vivo (escritorio y ancho móvil) que la pestaña ya no aparece en ningún menú.
- Archivos: `src/components/BottomNav.tsx`, `src/components/AppShell.tsx`, `src/components/InicioScreen.tsx`, `src/components/PatrocinadosScreen.tsx` (eliminado)

## Sección "Contacto" agregada arriba de "Cómo llegar"
**Pedido:** el contacto (teléfono) de cada prestador es lo primero que busca el turista — agregar una sección visible propia para eso, arriba de "Cómo llegar", sin quitar nada de lo que ya funciona ahí.
**Arreglo:** nueva sección "Contacto" (ícono de teléfono) en la ficha del turista (`PlaceDetail.tsx`) y en la vista previa del prestador (`PerfilScreen.tsx`), mostrando `lugar.contacto`, colocada justo antes de "Cómo llegar". "Cómo llegar" se dejó intacto tal cual estaba.
**Probado en vivo:** servicio de prueba con contacto y cómo llegar reales — la ficha muestra "Contacto: 294 125 0703" primero y "Cómo llegar" justo debajo, en ese orden.
- Archivos: `src/components/PlaceDetail.tsx`, `src/components/PerfilScreen.tsx`

## Números de contacto agregados a 6 lugares curados
**Pedido:** el usuario proporcionó los teléfonos reales que faltaban para que se vean en la nueva sección "Contacto".
**Arreglo:** se agregó el campo `contacto` en `src/data/lugares.ts` para: La Moyotera Restaurant-Bar (+52 294 103 3530), Palapas Gorel (294 103 2934), La Bicicleta Café (294 688 1177), Sirena Olmeca Restaurant-Cabañas (232 115 9176), Reserva Ecológica Nanciyaga (294 129 2037) y Hechizo de Amor (294 945 9418).
**Probado en vivo:** verificado que "Hechizo de Amor" ya muestra "Contacto: 294 945 9418" en su ficha.
- Archivos: `src/data/lugares.ts`

---

# Sesión 2026-09-23/24 — Copyright, chat offline/online, Premium

Todo probado en vivo en el navegador (no solo compilado) antes de darlo por bueno — varios de estos bugs solo se veían usando el chat de verdad, no leyendo el código.

## A. Copyright y footer
**Pedido:** proteger la autoría de la plataforma para que no se la roben.
**Arreglo:** aviso de copyright en el footer y meta tags en `index.html`, página dedicada `/copyright` con detalle legal, enlace en la sección Legal del footer, e iconos de Facebook/Instagram con sus colores de marca reales (antes monocromos).
- Archivos: `src/components/LandingPage.tsx`, `src/components/CopyrightPage.tsx` (nuevo), `src/App.tsx`, `index.html`

## B. Pantalla en blanco con señal débil (no caída, solo lenta)
**Causa:** los dos `fetch` de arranque (catálogo de prestadores y conocimiento dinámico) no tenían timeout — con señal intermitente (normal en Los Tuxtlas) se quedaban colgados para siempre y la app nunca mostraba nada (`if (!listo) return null`).
**Arreglo:** `AbortController` + timeout de 6s en ambos, cayendo al catálogo cacheado en IndexedDB si no responde a tiempo.
- Archivos: `src/App.tsx`, `src/lib/conocimiento.ts`

## C. Servicios básicos (hospital/farmacia/comisaría) consultables por el chat
**Pedido:** que el chat pueda decir qué hospital/farmacia/comisaría hay cerca de un lugar, sin que aparezcan como categoría nueva en Explorar/Mapa.
**Arreglo:** base de datos oculta con 9 lugares reales (3 tipos × 3 municipios, geocodificados vía OpenStreetMap Nominatim) que solo el chat consulta bajo demanda — nunca se mezcla con `LUGARES`/`catalogoActivo`. Resuelve por lugar mencionado, por municipio, o por GPS. Funciona igual online que offline (motor de reglas local, sin llamadas de red).
- Archivos: `src/data/serviciosBasicos.ts` (nuevo), `src/lib/chatbot.ts`, `src/components/ChatAssistant.tsx`, `src/lib/routing.ts` (se exportó `distanciaHaversine`)

## D. Hospital más cercano integrado al generador de rutas
**Pedido:** si el turista menciona una condición médica (diabético, cardíaco, etc.), la ruta que se le arme debe traer el hospital más cercano a cada día — pero SOLO si lo mencionó, nunca por defecto.
**Arreglo:** `PreferenciasUsuario.requiereHospitalCercano`, persistente igual que días/presupuesto mientras dure el plan de viaje. Se detecta en CUALQUIER mensaje de la conversación (no solo el que pide la ruta) — si el turista dice "soy diabético" antes de pedir la ruta, se confirma con un mensaje corto y se aplica cuando arme la ruta después, sin que lo repita. También hay un modo de seguimiento: preguntar "qué hospital consideras para esta ruta" después de ya tenerla armada, sin regenerar nada (usa solo los días de la ruta MÁS RECIENTE).
- Archivos: `src/lib/chatbot.ts`, `src/components/ChatAssistant.tsx`

## E. Dos falsos positivos por tolerancia a errores de dedo (bugs reales encontrados en QA)
**Causa:** el motor de PLN tolera errores de escritura (distancia de edición ≤1), y dos palabras cortas chocaban con palabras comunes: "asma" (condición médica) hacía match con "**arma**" (como en "ARMA una ruta", la forma más común de pedirla) — activaba la nota de hospital sin que el turista dijera nada médico. "medico" chocaba con "**medio**" (como en "presupuesto medio", una de las 3 palabras de precio que usa TODA la app) — desviaba preguntas normales hacia "aquí está el hospital más cercano".
**Arreglo:** coincidencia EXACTA (sin tolerancia a errores) para las palabras de condición médica y de servicios básicos — perder una que venga con typo real es mejor que activarlo de más con palabras comunes.
- Archivos: `src/lib/chatbot.ts`

## F. "mi itinerario" no se reconocía como la ruta ya armada
**Causa:** solo "mi ruta"/"este itinerario" estaban en la lista de frases — preguntar "en mi itinerario qué hospital hay" no calzaba y regeneraba una ruta nueva en vez de responder sobre la existente.
**Arreglo:** agregado "mi itinerario" a la lista.
- Archivos: `src/lib/chatbot.ts`

## G. "qué onda" se clasificaba como intención de comida, no saludo
**Causa:** "onda" hacía match por tolerancia a errores con "fonda" (palabra clave de comida), y esa categoría se revisaba antes que saludo en la lista.
**Arreglo:** saludo/agradecimiento se revisan primero en mensajes cortos sin negación, antes que cualquier otra intención.
- Archivos: `src/lib/chatbot.ts`

## H. Geocodificación corregida — hospital de Santiago Tuxtla
**Causa:** tenía las mismas coordenadas que el centro del pueblo, aunque su dirección real es "Carretera Santiago Tuxtla–Isla Km 1.5" — decía "a unos 0 metros" en vez de la distancia real.
**Arreglo:** geocodificado por separado contra un hospital real en OpenStreetMap; ahora reporta ~1.2 km, coherente con la dirección.
- Archivos: `src/data/serviciosBasicos.ts`

## I. Fichas de conocimiento mezclaban categorías (recomendaciones incorrectas)
**Causa:** la ficha "Hospedaje en Los Tuxtlas" recomendaba Nanciyaga y La Jungla Balneario (categoría real: Naturaleza) como si fueran hoteles, junto con Sirena Olmeca (el único que sí es Hospedaje). La ficha "Naturaleza y aventura" mezclaba ambas categorías bajo las mismas palabras clave, y como el límite es mostrar 3 lugares, el único lugar de Aventura real (Cerro del Venado) quedaba excluido por completo al preguntar por "aventura".
**Arreglo:** "Hospedaje" ahora solo vincula a Sirena Olmeca (el texto sigue mencionando las otras como alternativa, aclarando que no son hoteles). "Naturaleza y aventura" se separó en dos fichas independientes, cada una con sus lugares reales.
- Archivos: `src/lib/conocimiento.ts`

## J. Default de interés forzaba "Naturaleza" sin avisar
**Causa:** si el mensaje no mencionaba ninguna categoría reconocible (ej. "quiero visitar el pueblo"), la ruta se armaba forzosamente con `intereses: ['Naturaleza']`, dando reservas ecológicas retiradas del centro en vez de una muestra real del lugar.
**Arreglo:** ahora queda `[]` — el motor de puntuación arma una mezcla real por calificación/destacados en vez de forzar una sola categoría.
- Archivos: `src/components/ChatAssistant.tsx`

## K. Aviso de "supuestos" simplificado
**Causa:** CUALQUIER ruta pedida sin especificar días/presupuesto/grupo mostraba "No me quedó claro todo de tu mensaje, así que asumí: X, Y, Z" — molesto e innecesario para pedidos simples y claros como "ruta de pura gastronomía en Catemaco".
**Arreglo:** el aviso solo aparece cuando se corrige algo que el turista SÍ pidió explícitamente (ej. pidió 5 días y el generador solo arma hasta 3) — no por simplemente no mencionar un dato.
- Archivos: `src/components/ChatAssistant.tsx`

## L. Bug de producción: el Plan Premium nunca afectaba las recomendaciones
**Causa:** `api/servicios/aprobados.ts` (el endpoint real que alimenta el catálogo de la app) nunca consultaba ni devolvía las columnas `premium`/`premium_hasta` de la base de datos — un prestador podía pagar los $89 MXN/mes, la base se actualizaba bien, pero la IA nunca se enteraba.
**Arreglo:** se agregaron esas columnas a la consulta y al objeto que se devuelve, con el mismo criterio de vigencia que ya usaba la versión offline.
**Nota:** el flujo de pago en sí (`api/pagos/mercadopago.ts`) sigue sin confirmarse con un pago real completado — ver sección de pendientes abajo.
- Archivos: `api/servicios/aprobados.ts`

## M. Nuevo módulo "Patrocinados"
**Pedido:** que pagar Premium dé un beneficio más visible que solo un desempate invisible en el chat — sin que eso le quite credibilidad a "Destacados" (curaduría real, sin dinero de por medio).
**Arreglo:** insignia "Patrocinado" (morada) distinta de "Destacado" (ámbar) en las tarjetas. Pestaña propia "Patrocinados" en el menú (escritorio y móvil) mostrando solo prestadores Premium activos. Además, en "Destacados" (Inicio) los prestadores Premium que no estén ya destacados también se muestran ahí — así pagar siempre da un lugar en la portada, incluso si algún día dejan de estar en la lista curada de "Destacados".
- Archivos: `src/components/PatrocinadosScreen.tsx` (nuevo), `src/components/PlaceCard.tsx`, `src/components/InicioScreen.tsx`, `src/components/AppShell.tsx`, `src/components/BottomNav.tsx`

## Pendiente — pago de Mercado Pago sin confirmar
El flujo de pago del Plan Premium nunca se ha probado de punta a punta con un pago real completado. Se revisaron 5 intentos reales en la base de datos (ago. 2026) que quedaron en `pendiente` para siempre, sin `mp_payment_id` — confirmado que eran pruebas incompletas de un familiar, no evidencia de un webhook roto. El código del webhook se ve correcto, pero "se ve bien" no es lo mismo que "confirmado". El 2026-09-24 se activó `premium = TRUE` manualmente en la base real para el servicio 19 ("Artesanias Paseo Del Malecon") como ejemplo de demo — **eso no confirma que el flujo de pago funcione**, es solo un ajuste manual de administrador.

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
