# Cambios — sesión de arreglo de bugs

Todo compila limpio (`tsc -b --noEmit`) y el build de producción (`vite build`) corre sin errores. A continuación, qué se tocó y por qué, bug por bug.

---

# Sesión 2026-11-07 — Prueba de 30 consultas sin conexión y arreglos del asistente

## Hallazgo: el modelo de embeddings nunca se descargaba (dev y producción)
**Causa:** Transformers.js busca primero el modelo en `/models/...` de nuestro propio sitio; `vercel.json` (y Vite) responden `index.html` con código 200 a cualquier ruta desconocida, así que la librería leía HTML como JSON y fallaba en silencio. Verificado: en `go.tuxtlas.xyz` los vectores quedaban en 0 y no existía el `.onnx`.
**Cambio:** `env.allowLocalModels = false` en `src/lib/embeddings.ts`. El modelo (23 MB + 1.8 MB de jsDelivr) ya baja de Hugging Face y queda en caché del navegador.
**OJO — no subir este cambio solo:** con el modelo activo, MiniLM (entrenado sobre todo en inglés) da similitudes entre 0.4 y 0.7 para casi cualquier frase en español: el banco de respuestas (umbral 0.68) respondió una ficha equivocada ("mariscos en San Andrés" → cafeterías) y el umbral de 0.5 de `extraerPreferenciasLibres` inventó días/grupo, convirtiendo preguntas simples en rutas. Falta cambiar a un modelo multilingüe y recalibrar umbrales antes de activarlo.

## Arreglos del motor de reglas (no dependen del modelo)
- **Municipio sin cobertura:** "hospedaje en San Andrés Tuxtla" decía "hay buenas opciones en San Andrés" sobre tarjetas de Catemaco. Ahora, si el municipio pedido no tiene nada de esa categoría, lo dice y muestra lo que hay en otros; las tarjetas ligadas a una ficha también respetan el municipio pedido. `detectarMunicipio` ahora toma los municipios del catálogo (una zona nueva se reconoce sola). (`chatbot.ts`, `responderTextoLibre`, PASO 2 y 2.5)
- **Prestadores por tipo de servicio:** `buscarPorTipoDeServicio` — un prestador coincide si una palabra de la pregunta está en su nombre Y en su descripción ("lancha" → Lanchas Catemaco, "artesanías" → los dos negocios de artesanías). Pedir ambas cosas evita confundir un nombre propio con un tipo ("Sirena Dorada" ≠ "Sirena Olmeca"). También se usa en `recuperarContexto` (nube) de `llm.ts`.
- **Rutas con actividades:** `categoriasMencionadas` toma TODAS las categorías de la pregunta (antes solo la primera: "actividades y comida" se quedaba en comida) y "actividades" cuenta como naturaleza + aventura; se garantiza hasta 2 actividades por día; tope de 3 lugares para comer por día (salían 5).

## Probado
Prueba de 30 consultas con la red en Offline, catálogo real de producción copiado a la app local y el modelo bloqueado (mide solo reglas). Por mi criterio pasó de 12/30 a ~26/30 correctas; sin lugares ni precios inventados. Siguen mal: niños en Catemaco (sugiere bares), restaurante inexistente (no avisa), precio del helicóptero (responde con hospedaje) y "mejor época" (la ficha existe pero sus palabras clave no incluyen "época"). Una sola corrida y con rotación aleatoria de tarjetas: tomar el número como aproximado. No se corrió una regresión amplia del resto del chat.
- Archivos: `src/lib/chatbot.ts`, `src/lib/llm.ts`, `src/lib/embeddings.ts`

## Servicios de fuera de Los Tuxtlas (caso Mira Flores, opción A)
**Hallazgo:** "Mira Flores" (servicio 26) está guardado con municipio `Catemaco` pero con coordenadas de Villahermosa, Tabasco (17.99, -92.92), y salía recomendado como hospedaje en Catemaco. El registro (`api/servicios/registro.ts`) sí valida municipio vs. coordenadas, pero la edición (`api/servicios/editar.ts`) solo validaba el formato del municipio; por ahí se coló (hipótesis, no confirmable con lo que guarda la BD).
**Decisión (A):** los servicios de fuera de la región se ven en Explorar con su ubicación real y la etiqueta "Fuera de Los Tuxtlas", pero NO entran en recomendaciones, rutas ni chat de la región. Se pueden abrir por nombre o si el turista pregunta por esa ciudad.
**Cómo:** `estaEnLaRegion(coords)` (`data/lugares.ts`, misma caja que el registro) decide por UBICACIÓN, no por el texto del municipio — un registro mal etiquetado queda clasificado igual. `chatbot.ts` separa `catalogoActivo` (todo, para Explorar/Favoritos/nombre) de `catalogoMotor` (`getCatalogoRegion()`, solo región, para recomendar/rutas/chat/contexto de la nube/destacados de Inicio). `editar.ts` ahora rechaza un municipio de Los Tuxtlas si las coordenadas guardadas están fuera. `PlaceCard` muestra la etiqueta (con traducción al inglés).
**Probado:** con el catálogo real de producción: Mira Flores sigue en Explorar (con etiqueta), no aparece en "hospedaje en Catemaco", "cabañas económicas" ni en 6 rutas generadas, y se encuentra por nombre. Simulando el municipio corregido a "Villahermosa, Tabasco", "un hotel en Villahermosa" lo devuelve. Pendiente: corregir el municipio de Mira Flores en la BD (no se tocó la base). No se probó el mapa ni `editar.ts` contra la base real (las funciones `/api` no corren en local; solo `tsc`).
- Archivos: `src/data/lugares.ts`, `src/lib/chatbot.ts`, `src/lib/llm.ts`, `src/components/{PlaceCard,InicioScreen,SugerenciasChat}.tsx`, `src/lib/i18n-en.ts`, `api/servicios/editar.ts`

## "Te puede interesar": ofrecer otras zonas y liberar el mapa (visión de crecimiento)
**Pedido:** TuxtlasGO impulsa una región pero debe escalar: alguien de Puebla puede querer ver también lo que haya en Tabasco. Si pregunta por Catemaco, solo Catemaco; los servicios de fuera no se recomiendan por defecto, pero se ofrecen como "breve comercial" y, si el turista acepta, aparecen en el mapa con su ubicación real. Si cancela, todo sigue por Los Tuxtlas.
**Cómo:** nuevo `OtrasZonasOferta.tsx` — al abrir el asistente (una vez por sesión) lista los servicios de fuera agrupados por zona ("Villahermosa, Tabasco · 1 servicio"), con "Ver en el mapa" y "No, gracias — seguir en Los Tuxtlas". `AppShell` guarda `zonaLibre`; `MapScreen` recibe `zonaLibre`/`onSalirZonaLibre`: mientras haya zona elegida quita la caja de la región, vuela a esos servicios y muestra el botón "← Volver a Los Tuxtlas". Abrir "Ver en mapa" desde el detalle de un servicio de fuera también libera el mapa. La cámara espera ~450 ms a que el mapa sea visible (si no, se quedaba atrapada en el borde de la región). `mostrarMapaAlLado` ahora incluye `zonaLibre` para que en escritorio el mapa aparezca junto al chat.
**Probado en vivo (escritorio, catálogo real de producción):** aparece el aviso, "Ver en el mapa" lleva a Villahermosa y se ve el pin de Mira Flores (31 marcadores, 1 en pantalla); "Volver" regresa a Los Tuxtlas; "No, gracias" cierra y no vuelve a salir en la sesión. Hubo que desregistrar el Service Worker de desarrollo para simular `/api/servicios/aprobados`.
**No probado:** móvil (el flujo usa `cambiarTab('mapa')`), ruta/"Cómo llegar" hacia un servicio de fuera, y offline: los mapas fuera de Los Tuxtlas necesitan internet (solo se descarga la región). El aviso solo sale si hay servicios con coordenadas fuera de la región; hoy es solo Mira Flores, y en la BD su municipio sigue siendo "Catemaco" (el aviso lo agrupa como "Otra ubicación" hasta corregirlo).
- Archivos: `src/components/OtrasZonasOferta.tsx` (nuevo), `AppShell.tsx`, `MapScreen.tsx`, `src/lib/i18n-en.ts`

## Modelo de lenguaje multilingüe (embeddings) y calibración
**Problema:** `all-MiniLM-L6-v2` está entrenado casi solo en inglés. Con 63 preguntas en español (52 con ficha en el banco + 11 fuera de tema) acertaba la ficha correcta 19 de 52 veces (37 %), y exigiendo cero fichas equivocadas, 7-11 de 52.
**Prueba (en Node, sin tocar el proyecto):** se compararon 4 modelos y 3 formas de armar el texto de la ficha. `multilingual-e5-small` (113 MB, 384 dim.) fue el mejor: 46/52 de aciertos con "título + claves + respuesta" y, con umbral + margen elegidos en una mitad y evaluados en la otra, 37/52 con 1 equivocada (MiniLM actual: 7/52; paraphrase-multilingual-L12: 32/52; distiluse-multilingual: 26/52 y más pesado). Indexar título + claves + respuesta (en vez de solo la respuesta) mejora a todos los modelos.
**Cambios:** `embeddings.ts` usa e5-small con prefijos `query:`/`passage:`; banco de respuestas con umbral 0.84 y margen 0.01 sobre la segunda ficha (antes 0.68); versión de vectores (`VERSION_VECTORES`) para recalcular lo guardado con el modelo anterior; `indexarConocimiento` guarda la respuesta (lo que se muestra) aparte de lo que se vectoriza (`huella`); no se descarga el modelo si el dispositivo reporta < 4 GB de RAM o "ahorro de datos". `chatbot.ts`: el extractor de preferencias usa reglas propias (umbral + margen) por tipo — días 0.87/0.02, grupo 0.90/0.01, intereses 0.87/0.03 — y **presupuesto ya no usa embeddings** (salió poco confiable); antes el umbral de 0.5 aceptaba casi cualquier frase. `ChatAssistant.tsx`: el banco ya no contesta solicitudes de ruta ni preguntas que coinciden por tipo con prestadores registrados (con el modelo bueno, una ficha se adelantaba a la ruta y a "artesanías").
**Probado en vivo (escritorio, sin internet, catálogo real):** el modelo se descarga e indexa 31 lugares + 27 fichas en ~22 s; "mejor época" ya responde con la ficha de clima (antes "No te entendí"); "cómo llego desde la CDMX", "¿hay un hospital cerca?", "licores artesanales", "limpia espiritual" responden la ficha correcta; rutas con presupuesto y por San Andrés arman la ruta; artesanías y lancha muestran los prestadores reales; temas fuera de lugar no inventan nada. Siguen sin respuesta de ficha "¿llueve mucho en verano?" y "¿qué debo meter en la maleta?" (el umbral conservador prefiere no contestar a contestar mal; caen al motor de reglas).
**Límites honestos:** (1) las 63 preguntas las escribí yo a partir de las fichas — turistas reales preguntarán distinto, así que el acierto real puede ser menor; conviene juntar preguntas reales y repetir la calibración. (2) NO probado en un celular real: el modelo pesa ~5 veces más que antes (113 vs 22 MB) y tus pruebas anteriores fallaron por memoria en Android; la primera descarga es de Hugging Face (no de tu sitio). (3) La búsqueda semántica de lugares del catálogo (`buscarSemantico`, umbral 0.80) y la de "ejemplos" no tienen prueba propia. (4) Las reglas de preferencias se calibraron con ~10 frases por tipo.
- Archivos: `src/lib/embeddings.ts`, `src/lib/db.ts`, `src/lib/conocimiento.ts` (solo `obtenerFichasParaIndexar`), `src/lib/chatbot.ts`, `src/components/ChatAssistant.tsx`

**Panel de diagnóstico para probar en un celular real (`?diag=1`):** `DiagnosticoIA.tsx` (solo aparece al abrir la app con `?diag=1`; `?diag=0` lo apaga) muestra la fase del modelo (descargando % → indexando → LISTO en X s, u OMITIDO/ERROR con el motivo), cuántos vectores hay, la RAM que reporta el navegador, la memoria JS en uso (no incluye la memoria WASM del modelo) y dos botones de prueba que muestran la ficha más parecida y su similitud. `embeddings.ts` expone el estado (`estadoEmbeddings`/`suscribirEstadoEmbeddings`) y `App.tsx` lo actualiza. Verificado en escritorio: 0 % → 82 % → indexando → LISTO en 18.7 s, 10 lugares + 27 fichas, "mejor época" → Clima (0.905), "cómo llegar" → Cómo llegar (0.878).
**Prueba en un Samsung Galaxy A13 de 4 GB (Chrome, rama de pruebas):** descarga completa por Wi-Fi sin problema, estado LISTO (31 lugares + 27 fichas) en 291 s la primera vez (en la PC: ~18 s), RAM reportada 4 GB; sin internet (modo avión) las dos pruebas dieron lo mismo que en la PC (mejor época → Clima 0.905, cómo llegar → 0.878) y el chat respondió bien ("Como llego desde mexico" → ficha de cómo llegar; "Gracuas" → agradecimiento). Al volver el Wi-Fi y recargar, el modelo falló con **"Can't create a session"**; la app siguió funcionando con el motor de reglas. Causas posibles (no confirmadas): poca memoria libre al crear el modelo (había 13 pestañas abiertas) o archivo guardado dañado. **Corrección:** `inicializarEmbeddings` ya no deja guardada la promesa fallida (antes no se reintentaba hasta recargar); reintenta tras 2.5 s y, si sigue fallando y hay internet, borra el modelo guardado y lo baja de nuevo (nunca lo borra sin conexión); pide almacenamiento persistente; el panel `?diag=1` muestra el error completo y un botón "Reintentar". Pendiente de probar en el A13: recarga con el modelo guardado, con y sin internet.
**Preparación para producción (rama `prueba-modelo`):**
- **Términos y condiciones:** nueva sección "6. Modo sin conexión y consumo de datos" (descarga automática de ~113 MB la primera vez, recomendación de Wi-Fi, se guarda en el dispositivo, no se descarga con < 4 GB de RAM o ahorro de datos, el mapa sin conexión es una descarga aparte, cómo borrarlo). Secciones siguientes renumeradas (hasta la 14) y fecha actualizada a noviembre de 2026. Decisión del equipo: la descarga es automática, sin pedir permiso aparte. **Ojo:** los términos solo obligan a quien los acepta (al registrarse); un turista que usa la app sin cuenta nunca los acepta.
- **Palabras clave ampliadas** en las 15 fichas generales (formas de preguntar: "maleta", "mochila", "epoca", "llueve", "alojamiento", "desde puebla", "abren/cierran", "licores", "brujeria", "me siento mal", "es peligroso"…). No se tocó "medico" (la tolerancia a erratas lo confunde con "medio").
- **Vectores precalculados:** `npm run vectores` (`scripts/precalcular-vectores.mjs`) calcula con el mismo modelo los vectores de las 27 fichas estáticas y los guarda en `src/data/vectoresFichas.json` (99 KB). La app los usa si su huella (versión + texto) coincide con la ficha actual; si alguien edita una ficha y no regenera, la app la recalcula en el dispositivo (más lento, correcto). **Volver a correrlo al cambiar modelo, `VERSION_VECTORES` o el texto/claves de una ficha estática.**
- **LISTO antes:** App.tsx indexa primero las fichas (ya calculadas) y marca LISTO; los lugares (cuyo texto sí se vectoriza en el dispositivo, ahora recortado a 500 caracteres) se indexan después en segundo plano. El panel `?diag=1` muestra "Fichas: N precalculadas · M calculadas aquí".
- **Regla del banco recalibrada** con 93 preguntas (74 con ficha + 19 fuera de tema; 30 de ellas escritas después de las claves, sin usarlas para elegirlas): umbral 0.82 y margen 0.02 (antes 0.84/0.01, que dejó pasar "¿qué hora es en Tokio?"). Resultado: 43 de 74 bien y 0 equivocadas en la muestra; validación cruzada ~60 % bien y ~1.3 equivocadas por cada 100 preguntas. Lo que no pasa cae al motor de reglas. Las preguntas las escribió el equipo, no turistas reales.
- **Probado en la PC (instalación limpia):** LISTO en 8.3 s (antes 18 s), 27/27 fichas precalculadas, 0 calculadas en el dispositivo; sin internet: "mejor época", "¿qué debo meter en la maleta?" (antes sin respuesta), "¿qué ropa para la selva?", "hospital", "transporte desde Puebla" y rutas responden bien; "¿qué hora es en Tokio?" y "¿quién ganó las elecciones?" no inventan nada. Pendiente de repetir en el Galaxy A13.
**Prueba en el Galaxy A13 (8 preguntas, sin internet, 10 pestañas):** primera pregunta 7 s, las demás 1 s. Instalación desde cero: LISTO en 51.3 s con 27 fichas precalculadas y 0 calculadas en el teléfono (antes 302 s); recarga con el modelo guardado: 27.2 s, sin errores. Hallazgos de las 8 preguntas: (a) **los 8 restaurantes registrados en Catemaco nunca aparecían**: `seleccionarConVariedad` toma "los mejores" por calificación y un prestador recién registrado tiene calificación 0; además las tarjetas ligadas a la ficha ocupaban los 3 lugares; (b) "ninguno de esos me gusta" repetía las mismas opciones o no se entendía; (c) "ruta de La Moyotera a Eyipantla" se tomó como "cuéntame de La Moyotera"; (d) "quiero uno, el más caro" ignora "solo uno" y "el más caro"; (e) "qué lugares me recomiendas visitar en Catemaco" cayó en la ficha de dónde comer (el banco la aceptó); (f) con presupuesto de $500 para Sirena Olmeca da el precio pero no compara.
**Corregido (a) y (b):** `seleccionarConVariedad` reserva 1 de cada 3 lugares para un prestador sin calificar, rotando entre ellos (sin calificar ≠ malo, solo falta información); las tarjetas ligadas a la ficha ocupan como máximo 2 y rotan; memoria de lo mostrado ampliada a 14. Nueva petición de "otras opciones" (`esPeticionDeOtrasOpciones`, "ninguno de esos me gusta", "otros", "más opciones"…): repite la última búsqueda por categoría y municipio SIN lo ya mostrado en esa búsqueda, y al agotarse dice "Ya te mostré todas las opciones…"; el banco de respuestas no la intercepta (`ChatAssistant.tsx`). Probado con el catálogo real: antes 10 de 60 respuestas incluían un negocio registrado, ahora 60 de 60 (aparecen los 8, entre 5 y 13 veces cada uno, sin quitar los 4 conocidos); la secuencia "sitios para comer en catemaco" + 4 veces "otros" mostró los 12 de Catemaco sin repetir y luego avisó que ya no quedaban. **Corregido (c) y (e):** (c) `lugaresNombradosEnTexto` encuentra TODOS los lugares que el turista nombró, en el orden en que los dijo (un lugar cuenta si coincide al menos la mitad de sus palabras distintivas y, si solo coincide parte, esa palabra es casi exclusiva de ese lugar; los empates como "bicicleta" se desempatan por municipio o no se adivinan). Si nombra 2 o más y pide una ruta (`pareceSolicitudDeRuta`) o dice "de X a Y" (`pareceRutaDeAaB`), el chat arma el trayecto con esos lugares (`construirRutaEntreLugares`: Salida/Parada/Llegada, distancia en línea recta, aviso de que el camino real y el tiempo salen del mapa con internet) con el botón "Ver ruta en el mapa". Con un solo lugar sigue contando de ese lugar. (e) `pideLugaresParaVisitar` ("qué lugares me recomiendas visitar", "qué hay para ver", "lugares turísticos"…) responde con naturaleza y aventura, con el mismo cupo para negocios registrados y también admite "otras opciones"; no se activa con "mejor época para visitar" (probado). El banco de respuestas no intercepta ninguna de las dos. La memoria de la última búsqueda (`ultimaBusqueda`) ahora guarda un grupo de categorías.
**Probado:** con el catálogo real y el modelo activo (PC): "Que lugares me recomiendas visitar en catemaco" → Nanciyaga, La Jungla y Albercas Matalcalcinta (registrado); "ninguno de esos me gusta" → las que faltaban (Lanchas Catemaco) y luego avisa; "generame una ruta de la moyotera a el salto de eyipantla" → tarjeta de ruta con mini-mapa, Salida/Llegada, 11.9 km en línea recta y botón del mapa; "ruta de 2 días con presupuesto de $3000" y "mejor época" siguen bien. Cosmético pendiente: la tarjeta de una ruta A→B dice "Día 1".
**Sin corregir todavía:** (d) "solo uno, el más caro" y (f) comparar un presupuesto contra el precio de un lugar.
**Error intermitente "Can't create a session" al RECARGAR (Galaxy A13):** en una sesión de ~12 capturas, con y sin internet, con 10 pestañas y con 1, algunas recargas fallaban y otras no; una instalación desde cero con 1 pestaña salió bien (LISTO 32.7 s) y las funciones nuevas (qué visitar, ruta A→B) funcionaron en el teléfono. Con el modelo en ERROR el chat siguió respondiendo con las reglas. Causa NO confirmada: el mensaje aparece después de leer el archivo, así que no es de red; candidatos: falta de memoria al armar el modelo (p. ej. la página anterior aún liberando la suya al recargar) o archivo guardado dañado. **Problema en mi reintento anterior:** con internet, tras 2 fallos borraba el modelo y lo descargaba otra vez (113 MB) SIEMPRE; si la causa es memoria eso no arregla nada y gasta los datos del turista en cada recarga fallida (en las capturas: "borrando el modelo guardado… intento 3"; el "LISTO en 69.6 s" probablemente fue una re-descarga).
**Corregido (`embeddings.ts`, `App.tsx`, `DiagnosticoIA.tsx`):** (1) solo se vuelve a descargar con evidencia de archivo dañado (el runtime dice "protobuf/parsing/invalid…" o el tamaño guardado ≠ el del momento de instalar) y solo con internet; si parece falta de memoria o no se sabe, NO se descarga. (2) Cada intento captura los mensajes que el runtime imprime en consola (ahí está la causa real: `bad_alloc`, etc.) y los clasifica como memoria/modelo/desconocido. (3) El arranque del modelo espera 3 s (al abrir/recargar compiten por memoria el mapa, el catálogo y el modelo) y, si falla, se reintenta UNA vez más a los 45 s, en silencio. (4) El panel `?diag=1` muestra el registro de intentos con hora y causa, y "Modelo guardado: X MB · al instalar: Y MB". (5) Solo para pruebas con `?diag=1`: `localStorage['tuxtlasgo-diag-forzar-fallo']='memoria:2'|'modelo:2'` simula 2 fallos de ese tipo.
**Probado en la PC (simulado):** instalación limpia LISTO 7.8 s con modelo guardado 112.8 MB = instalado; fallo tipo memoria con internet → 2 intentos fallan, 0 descargas del modelo, ERROR con la causa anotada y a los 45 s el reintento lo recupera solo; fallo tipo archivo dañado con internet → borra y descarga de nuevo, LISTO en 12.5 s; el mismo fallo con `navigator.onLine=false` → NO borra (modelo en caché 1→1) y queda en ERROR. **No probado:** que el error real del A13 sea de memoria o de archivo dañado (eso lo dirá el nuevo registro del panel); que el retraso de 3 s o el reintento a los 45 s lo eviten en el teléfono.
**Rutas entre municipios ("ruta de Catemaco a San Andrés"):** hallazgo en el A13: la ruta pedida salió con los 2 días en Catemaco (solo se tomaba el primer municipio). Corregido: `detectarMunicipios` devuelve todos los municipios nombrados EN EL ORDEN en que se dijeron (nuevo campo opcional `PreferenciasUsuario.municipios`, `ChatAssistant.tsx` lo llena cuando hay 2 o más). `generarRuta`: con 2 o más días reparte un día por municipio, origen primero y sin barajar (si hay 3 días vuelve al primero); con 1 día (`construirDiaEntreMunicipios`) arma mañana y comida en el primero y tarde y cena en el segundo, en ese orden y con encabezado "Catemaco → San Andrés Tuxtla" — si algún municipio no tiene nada que ofrecer cae a la ruta normal. Una ruta de un solo municipio no cambió. Probado con el catálogo real, directo y en el chat: "generame ruta divertida de catemaco a san andres" → Día 1 Catemaco, Día 2 San Andrés Tuxtla; "ruta de 1 dia de san andres a catemaco" → un día San Andrés → Catemaco; "ruta de 2 dias en catemaco" sigue todo en Catemaco.
**Estado del modelo:** si el modelo sí quedó cargado, un paso posterior que falle ya no marca ERROR ni apaga "IA: listo" (`App.tsx`). Hipótesis del equipo pendiente de confirmar en el teléfono: que en estado ERROR el chat siga funcionando solo por las reglas (el banco por significado queda apagado); se comprueba con el botón "Probar: mejor época" del panel: si responde la ficha de clima el modelo sí está cargado, si dice "sin modelo cargado todavía" no lo está.
**Prueba en el A13 con el despliegue que ya traía el registro de intentos (2:44-2:51):** (1) **La hipótesis de "solo es la etiqueta" se descartó:** con ERROR en pantalla, "Probar: mejor época" respondió "sin modelo cargado todavía" — el modelo realmente no estaba cargado (el chat siguió con las reglas). (2) **El registro confirmó falta de memoria:** en una recarga, "intento 1 falló (memoria): std::bad_alloc"; el intento 2, 17 s después, falló con el mensaje genérico "Can't create a session [desconocido]". Otros ERROR solo mostraron el genérico (sin la causa). (3) **El archivo del modelo está sano:** "Modelo guardado 112.8 MB = al instalar 112.8 MB", y el sistema NO lo volvió a descargar ("sin evidencia de archivo dañado") — la regla nueva funcionó, sin gastar datos. (4) Patrón: abrir la app en una pestaña/ventana nueva con el modelo guardado → LISTO en 20-28 s; RECARGAR la página → falla con frecuencia. Una instalación desde cero tras borrar datos: LISTO 28.2 s, fichas 27 precalculadas / 0 calculadas aquí, modelo 112.8 = 112.8 MB, y "mejor época" → Clima 0.905. (5) Los vectores de lugares se indexan despacio en este teléfono (4 → 13 → 15 de 31 tras varias recargas): cada recarga interrumpe ese trabajo; no afecta al banco de respuestas. Hipótesis (no confirmada): el pico de memoria al crear el modelo (~113 MB del archivo + copias en WASM) queda cerca del tope del WASM en un teléfono de 4 GB, y al recargar la página anterior aún no libera la suya.
**Ajustes de este paso:** si la navegación es una recarga o "atrás", el modelo arranca a los 10 s (en vez de 3); entre intentos se espera 10 s y 30 s (antes 4 s) y hay un tercer intento; el reintento tardío pasa de 45 a 90 s; el panel dice "cargando modelo (si ya estaba guardado, solo lo lee)…" en vez de "descargando…" cuando lee de la caché. Probado en la PC: apertura normal LISTO 8.4 s; recarga → el modelo arranca a los 10 s y queda LISTO a los 11 s; fallo de memoria forzado → intentos a los 0, 10 y 30 s y LISTO en el tercero. **NO se sabe si esto reduce los fallos del teléfono** (en la PC la memoria nunca falta de verdad): hay que repetir en el A13 las recargas y contar aciertos. Si sigue fallando con frecuencia, la salida de fondo es hacer el modelo más pequeño (~96 de sus 113 MB son el vocabulario de 250 mil palabras; recortarlo a español/inglés lo dejaría en ~30 MB, pero es un trabajo aparte y delicado).
**Prueba en el A13 con el despliegue de las esperas largas (3:10-3:28):** apertura en pestaña nueva con el modelo guardado → LISTO 28.3 s; tras borrar datos → LISTO 31.0 s con 27 fichas precalculadas / 0 calculadas aquí. **Recargas:** a las 3:11 falló todo: "recarga detectada, arranca en 10 s" → intento 1 "falló (memoria): std::bad_alloc" (a los ~40 s) → intento 2 (esperando 10 s) "falló (desconocido)" → intento 3 (esperando 30 s) "falló (desconocido)" → ERROR; un reintento posterior en esa misma página (3:13:46, probablemente el botón "Reintentar") también falló. A las 3:28 otra recarga SÍ cargó (LISTO 18.4 s con la espera de 10 s incluida). En la PC (16 GB) la recarga carga en 1 s. **Conclusión:** (1) esperar entre intentos NO libera la memoria en esa página — 4 de 4 reintentos dentro de la misma página fallaron en el teléfono; las esperas largas solo funcionaron en la simulación de la PC, así que su valor real es dudoso (se dejan, no estorban, pero no son la solución); (2) la falla es intermitente: 1 recarga buena y 1 mala con la misma versión; (3) abrir en pestaña/ventana nueva funcionó las 3 veces. Hipótesis sin confirmar: el WASM del navegador no devuelve la memoria que ya creció (por eso reintentar en la misma página no ayuda) y la recarga conserva el proceso de la página anterior, mientras que cerrar y abrir lo reinicia.
**Aviso al usuario (propuesta del equipo, implementada):** `AvisoModoInteligente.tsx` — franja discreta sobre el chat: "El modo inteligente no se activó en esta carga (poca memoria). El asistente sigue funcionando con respuestas básicas, incluso sin internet. Para activarlo, cierra la app por completo y vuelve a abrirla." Solo si el modelo falló tras agotar los intentos (no si se omite a propósito ni mientras carga), una vez por sesión, se puede cerrar; traducida al inglés. Probado en la PC forzando fallos de memoria: no aparece antes del error, aparece tras él, al cerrarla no vuelve en esa sesión. **Pendiente de probar en el A13.**
**Sin probar y que importa:** la app instalada ("Instalar en mi celular") o el APK de Capacitor. Idea del equipo (plausible, NO verificada): ahí no hay botón de recargar y cada apertura es un arranque nuevo, así que podría comportarse como "cerrar y abrir" (que funcionó). Hay que probarlo en el A13 antes de afirmarlo.
**Prueba en la app INSTALADA (PWA) en el A13 (3:44-3:48):** cerrar y abrir → LISTO en 14.1 s y 14.2 s (2 de 2), "mejor época" → Clima 0.905; recargar (3:46:41) → "recarga detectada" → "intento 1 falló (memoria): std::bad_alloc" y reintentando (la captura no muestra el desenlace final; el usuario reporta error). El patrón se repite también en la app instalada: abrir funciona, recargar falla con frecuencia. Muestra pequeña, sin conteo de 10 intentos. **Hallazgo en el código (no probado):** `registerType: 'autoUpdate'` + `updateServiceWorker(true)` normalmente RECARGA la página al publicar una versión nueva, así que cada usuario pasaría por una recarga (la que más falla) justo al actualizar; el costo para él es bajo (reglas + aviso hasta que cierre y abra), pero conviene medirlo.
**CSS `display-mode: standalone` (`src/styles/index.css`):** `html { overscroll-behavior-y: none }` solo en la app instalada, para evitar recargar sin querer con "deslizar hacia abajo". `body` ya tenía esa regla, así que es posible que el "refresh" que se probó en el teléfono se hiciera de otra forma; **no se sabe y no se pudo probar** (el navegador de pruebas no simula el gesto). Compilación verificada: la regla está en el CSS final. Si el gesto sigue recargando en el teléfono, hay que averiguar cómo se hizo el refresh.
**Salidas de fondo si se quiere más fiabilidad (no hechas):** (a) pedirle a ONNX Runtime que use menos memoria al crear la sesión (desactivar optimización de grafo / arena de memoria): transformers.js 2.17 no lo expone y su onnxruntime-web 1.14 va anidado, habría que parchear o actualizar; (b) un modelo más pequeño (podar el vocabulario de 250 mil palabras, ~96 de los 113 MB); (c) servir la versión de pruebas a un porcentaje de usuarios y medir.
**Cómo probar sin afectar producción:** subir los cambios a una rama aparte (`prueba-modelo`), no a `main`; Vercel solo actualiza `go.tuxtlas.xyz` con `main` y da a la rama su propia dirección de vista previa.

## Rediseño de la navegación (referencia Mindtrip, con los colores verdes de siempre)
**Pedido:** que la interfaz se vea como la referencia — barra lateral con nombres, "Nuevo chat", usuario abajo —, con el botón de notificaciones dentro de la barra y la Comunidad integrada, sin pasar a negro.
**Barra lateral (escritorio):** a partir de 1280 px va siempre abierta (256 px) con los nombres: Destacados, Explorar, Asistente IA, **Comunidad**, Mis lugares, **Notificaciones** (campana con contador), Mi Perfil; botón verde **"Nuevo chat"**; abajo idioma, Portal prestadores y una tarjeta de usuario (foto o inicial, nombre y correo, cerrar sesión). Entre 1024 y 1279 px conserva el riel de íconos que se abre al acercar el cursor (mismo comportamiento de antes).
**Notificaciones:** `NotificacionesBurbuja` ahora tiene 3 variantes — `flotante` (la de siempre), `barra` (elemento de la barra lateral, panel que se abre a su lado y se cierra al tocar fuera) y `barra-movil` (ícono en la nueva barra superior del celular). Se quitó la burbuja flotante del shell. El atajo "Mientras esperas, mira la Comunidad" cambia de pestaña dentro de la app.
**Comunidad integrada:** nueva pestaña `comunidad` (`ComunidadPage` con prop `embebido`: sin cabecera pública y con su propio scroll). `/comunidad` ahora redirige a `/app?tab=comunidad`; Galería sigue siendo página aparte.
**Celular:** barra superior (marca + campana) y la barra inferior pasa a 6 secciones (se agrega Comunidad).
**"Nuevo chat":** `ChatAssistant` recibe `nuevoChatSenal`; cada clic abre el asistente y empieza una conversación nueva (la anterior queda en el historial). Inicio muestra hasta 4-5 tarjetas por fila en pantallas anchas.
**Probado en vivo (sesión simulada, 1650 px y 390 px):** barra con todos los elementos, Comunidad dentro de la app (sin cabecera pública), panel de la campana (abre y cierra), "Nuevo chat" lleva al asistente con el saludo inicial, barra superior e inferior del celular. **No probado:** el riel de 1024-1279 px (el navegador de pruebas no baja de 1650 px), notificaciones reales (el contador y los avisos dependen de `/api`, que no corre en local), ni la Comunidad con datos reales (en local sale "Sin conexión"). No se agregó el encabezado "Para ti en [zona] · Mapa · clima" de la referencia.
- Archivos: `AppShell.tsx`, `BottomNav.tsx`, `NotificacionesBurbuja.tsx`, `ComunidadPage.tsx`, `ChatAssistant.tsx`, `InicioScreen.tsx`, `App.tsx`, `i18n-en.ts`

## Tarjeta de lugar: se desacomodaba con nombres/municipios largos (`PlaceCard`)
**Hallazgo (captura del usuario):** con "Villahermosa, Tabasco" + la etiqueta "Fuera de Los Tuxtlas" + una duración larga, el pie de la tarjeta se partía en 3-4 líneas y las tarjetas del carrusel quedaban de distinto alto y ancho.
**Arreglo:** estructura fija igual en todas (como las referencias del usuario): nombre + calificación (o "Prestador local") en la misma fila, descripción de 2 líneas, y UNA línea al pie con ubicación (recortada con "…", tiene prioridad) y duración (recortada, máx. 48 %). La etiqueta "Fuera de Los Tuxtlas" pasó a la foto, debajo de la categoría. La tarjeta ahora ocupa todo su contenedor (`w-full h-full min-w-0`; el contenedor del carrusel es `flex`) para que todas las de una fila midan igual. En la versión compacta (listas) la ubicación se recorta y la etiqueta va en su propia línea.
**Probado en vivo (escritorio, 1280 px):** fila "Alojamientos" con Mira Flores ("Villahermosa, Tabasco"), Sirena Olmeca (duración larga) y Hotel Fonseca: mismo ancho y alto, pie de una línea. No probado en un celular real ni en la vista compacta.
- Archivos: `src/components/PlaceCard.tsx`, `src/components/ExploreScreen.tsx`

---

# Sesión 2026-10-04 — Interfaz en inglés (ES/EN) para turistas extranjeros

## Botón de idioma + traducción básica de la interfaz
**Pedido:** que un extranjero pueda operar la PWA. Se acordó alcance básico: lo necesario para operar; el asistente de chat queda para después.
**Arreglo:** i18n propio, sin dependencias nuevas y 100% offline (`src/lib/i18n.tsx`). La clave es el texto en español (`t('Explorar')`), con diccionario en `src/lib/i18n-en.ts`; lo que no tenga traducción se muestra en español, nunca se rompe. El idioma se guarda en `localStorage`, la primera vez respeta el idioma del dispositivo, y actualiza `<html lang>`. Botón ES/EN (`SelectorIdioma.tsx`) en: navbar de la landing, sidebar de escritorio, modal de login y Perfil (único lugar en móvil dentro de la app).
**Traducido:** landing y navbar, login/registro/recuperar, Inicio, Explorar, tarjetas, detalle del lugar, modal de reservar y calendarios (meses y días), Mis lugares (favoritos/rutas/reservas/pago), mapa y sus controles, filtros del viaje, perfil de turista, notificaciones, barra de navegación. Los datos de lugares escritos por prestadores (horario, duración, costo, días) pasan por `td()`, que traduce solo frases comunes ("Todos los días", "horas", "por persona"…). Los errores que devuelve el servidor también están en el diccionario.
**Queda en español a propósito:** descripciones/consejos/"cómo llegar" de cada lugar (vienen de la BD), paneles de prestador y admin, páginas legales, Comunidad y Galería, y **las respuestas del asistente** (el motor de PLN y el prompt de IA aún no son bilingües; solo se tradujo el placeholder y el botón de enviar).
**Probado en vivo:** Inicio, Explorar, Perfil y detalle de un lugar en inglés; el cambio ES↔EN funciona, persiste y cambia `<html lang>`. En la prueba encontré y corregí un bug mío (la duración en `PlaceCard` no pasaba por `td`). No probé en el navegador login, reservar ni Mis lugares con sesión iniciada: esos están verificados solo por compilación (`tsc` limpio).
- Archivos nuevos: `src/lib/i18n.tsx`, `src/lib/i18n-en.ts`, `src/components/SelectorIdioma.tsx`
- Archivos tocados: `main.tsx` y los componentes de pantalla del turista (AppShell, AuthModal, BottomNav, Calendario*, ExploreScreen, FavoritesScreen, FiltrosViaje, InicioScreen, LandingPage, MapScreen, ModalReservacion, NavbarLanding, NotificacionesBurbuja, OfflineIndicator, PerfilScreen, PlaceCard, PlaceDetail, SugerenciasChat, ChatAssistant)

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

---

# Sesión 2026-11-08 — Barra lateral dinámica y logo nuevo

- **Barra lateral:** vuelve a ser dinámica en todos los anchos. Siempre compacta (solo íconos) y se abre con los nombres al pasar el cursor o enfocar con teclado. Se quitó la versión fija y abierta de ≥1280px (`esAncho` en `AppShell.tsx`).
- **Logo:** se reemplazó el pino de lucide por el emblema real de TuxtlasGO (pin con montaña y hoja), recortado de `logo-tuxtlasgo.png` a un PNG transparente: `public/logo-emblema.png`. Va sobre una insignia blanca redonda porque el verde del emblema se perdía sobre el fondo verde oscuro. Aplica a la barra lateral y a la barra superior de celular.

---

# Sesión 2026-11-08 (noche) — Rediseño estilo Mindtrip (rama local `diseno-mindtrip`, SIN subir a main)

- **Explorar:** ya no muestra el mapa al entrar (ni al lado en escritorio, ni de fondo con hoja arrastrable en celular). Ahora es una página a todo el ancho con carruseles por servicio (Destacados, Restaurantes, Actividades, Alojamientos, Naturaleza, Comercio) y una tarjeta final "Ver todos …" con collage. El botón **Mapa** (cabecera y barra de filtros) abre el mapa a pantalla completa con "Cerrar mapa" (antes solo existía en celular). Se quitó el bloque verde "Descubre Los Tuxtlas".
- **Cabecera nueva:** emblema de TuxtlasGO + titular + mosaico de tarjetas. Las tarjetas son fotos/nombres reales de lugares destacados; para que sean **video**, copiar el .mp4 a `public/videos/` y registrarlo en `src/data/heroMedia.ts` (`VIDEOS_HERO`). Si el video falla, cae a la foto.
- **Detalle de servicio** (`PlaceDetail.tsx`): hoja grande con mosaico de fotos, pestañas fijas Resumen / Reseñas / Ubicación, mapa embebido con "Cómo llegar", y "Lugares similares" (misma categoría). **Reseñas:** aún no existe sistema de reseñas; se dice tal cual, sin inventar opiniones.
- **Chat:** el campo de texto flota, translúcido y con desenfoque sobre los mensajes (en vez de barra blanca pegada abajo).
- Pendiente a decidir: tema oscuro como la referencia (hoy se mantiene la paleta verde clara de la marca).

## Explorar: secciones en paneles + barra flotante de cristal
- Cada carrusel de servicio va dentro de un panel blanco translúcido con borde y sombra (divisores entre servicios).
- Barra "Pregunta a TuxtlasGO…" flotante (sticky, backdrop-blur) sobre Explorar; envía la pregunta al chat.
- Se revirtieron los bordes verdes gruesos de tarjetas/chips.

## Detalle de lugar: panel + expandir + galería
- El detalle ya no es un modal centrado: ocupa el área de contenido (barra lateral visible). Botón expandir/contraer (solo escritorio) lo pasa a pantalla completa, más ancho (mosaico más grande, 3 columnas de datos, 4 de similares, mapa más alto).
- Clic en cualquier foto del mosaico abre la galería a pantalla completa (fondo oscuro, columnas).
- Barra flotante de cristal "Pregunta sobre …" dentro del detalle; manda la pregunta al chat.
- Se quitaron del encabezado de Explorar los botones repetidos "Ver el mapa" y "Preguntar al asistente".

## Explorar: que se vea TODO el catálogo
- Antes Cooperativa y Otro no tenían sección, y "Comercio" solo mostraba una parte: esos servicios solo salían al filtrar.
- Ahora hay sección para Comercio, Cooperativas y Otros servicios (se omite si está vacía).
- Chips con conteo (p. ej. "Gastronomía · 10"), cada sección dice cuántos lugares tiene, y al final un panel "Todos los servicios" con la cuadrícula completa.

## Explorar: categorías con icono y barra más ancha
- Los chips planos con emoji se reemplazaron por una fila arriba de todo (pegada al deslizar) con círculo de color + icono lucide por categoría y su conteo.
- Barra flotante "Pregunta…" más ancha (max-w-5xl).

## Asistente = tegogolo; buscador/mapa salen de Explorar
- Se quitó el buscador y el botón "Mapa" de la fila "Para ti en Los Tuxtlas".
- La barra flotante ahora trae el botón de mapa (desplegarlo desde el asistente) y, en lugar de la chispa, un tegogolo (public/tegogolo.png); con la barra vacía el tegogolo abre el chat.
- Misma barra en Destacados, Explorar y detalle del lugar.

## Cabecera de Explorar con fotos en movimiento + caracol verde
- Cabecera: emblema grande + dos filas de fotos del catálogo corriendo en sentidos contrarios de fondo (animate-marquee-izq/der, respeta prefers-reduced-motion) con velo claro para leer el texto. Se quitó el mosaico de tarjetas (duplicaba Destacados). src/data/heroMedia.ts ya no se usa.
- Tegogolo recoloreado a verde con fondo transparente (public/tegogolo.png); el botón es solo el caracol, sin círculo.
- Caracol del asistente con contorno blanco (estilo sticker, como las letras del logo) vía drop-shadow.

## Landing: inicio con historia que avanza con el scroll
- Nuevo src/components/HeroScroll.tsx reemplaza el hero con collage de la landing (modo turista): escenario fijo con 4 fotos reales que se encadenan, cámara con parallax, palabras que entran desenfocadas, tarjetas de lugares reales y cifras que cuentan (catálogo + servicios aprobados vía /api/servicios/aprobados; sin internet solo el catálogo fijo). Idea de un demo de scroll-storytelling, pero sin assets ni marca de terceros.
- Features sube con borde redondeado sobre el escenario. Respeta prefers-reduced-motion y el loop solo corre con la sección en pantalla.
- Se quitó el contorno blanco del caracol (vuelve a como estaba).

## Landing: recorrido de fotos que vuelan + todo fusionado
- Nuevo src/components/RecorridoCartas.tsx: segunda parte de la historia. 9 fotos reales entran desde abajo con curva, crecen, se apilan y salen (técnica de scroll tipo "cartas"), mientras al lado un panel cambia entre las 6 características de "Por qué TuxtlasGO"; al final, cierre con "Empezar ahora". Reemplaza las secciones sueltas de Features y CTA final: toda la landing turista es ahora una sola historia (HeroScroll -> RecorridoCartas -> footer).
- Acentos amarillos del inicio cambiados a verde (jungle-300).
- Nota de desarrollo: el service worker puede servir una landing vieja en localhost; si no ves cambios, desregistrarlo y limpiar caches.
