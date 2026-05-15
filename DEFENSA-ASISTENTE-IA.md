# Defensa del asistente de TuxtlasGO — "¿Esto es Inteligencia Artificial?"

> Documento de estudio para el equipo. InnovaTecNM 2026 — Etapa Local.
> Léelo completo antes del stand. La idea no es memorizar, es **entender**
> el argumento para poder defenderlo con tus propias palabras.

---

## 1. La versión de 30 segundos (apréndela)

> "El asistente de TuxtlasGO es un **chatbot conversacional con
> Procesamiento de Lenguaje Natural**, construido como un **sistema
> experto**. Es Inteligencia Artificial: usa técnicas de PLN para
> entender al usuario aunque escriba con errores, un motor de inferencia
> para razonar sobre sus preferencias, y genera rutas explicando su
> razonamiento. Todo corre en el dispositivo, sin internet — porque el
> problema que resolvemos es justamente la falta de señal en Los Tuxtlas."

Si solo te acuerdas de una cosa: **no es "if/else", es un sistema experto
con PLN, y eso es una rama clásica y legítima de la IA.**

---

## 2. Por qué SÍ es Inteligencia Artificial

El error más común es creer que "IA = ChatGPT" o "IA = redes neuronales".
Eso es falso. La Inteligencia Artificial es un campo amplio que existe
desde los años 50, y los **sistemas expertos** y el **PLN basado en
reglas** son de sus ramas más establecidas.

Nuestro asistente hace cuatro cosas que son IA de libro de texto:

### a) Procesamiento de Lenguaje Natural (PLN)
El módulo `pln.ts` no solo "busca palabras". Hace:
- **Normalización y tokenización** del texto del usuario.
- **Tolerancia a errores ortográficos** con la *distancia de edición de
  Damerau-Levenshtein* — el mismo algoritmo que usan los correctores
  para detectar que "cascda" quiere decir "cascada", o "comdia" quiere
  decir "comida" (una transposición de letras).
- **Normalización morfológica**: ignora la *h muda* ("ospedaje" →
  hospedaje) y el plural ("cascadas" → cascada).
- **Reconocimiento de intenciones y entidades**: deduce que el usuario
  quiere comida, o naturaleza, o cultura, y detecta de qué municipio
  habla.

Esto es exactamente lo que define a un *chatbot conversacional con PLN*:
que el usuario pueda escribir libre, con errores y sinónimos, y el
sistema lo entienda igual.

### b) Motor de inferencia
El sistema no tiene las respuestas pre-escritas. **Razona**: cruza las
preferencias del usuario (días, intereses, presupuesto, grupo) con la
base de datos mediante un **algoritmo de scoring ponderado**, y resuelve
restricciones (no exceder presupuesto, agrupar por cercanía geográfica).
Eso es un motor de inferencia, un componente central de un sistema
experto.

### c) Planificación automática
Generar una ruta de varios días no es trivial: hay que seleccionar
lugares, agruparlos por municipio para minimizar traslados, repartirlos
entre los días y ordenarlos por momento del día. Eso es **planificación
automática** — otra área clásica de la IA.

### d) IA explicable (Explainable AI)
Cada recomendación viene con su **razonamiento** ("te puse Eyipantla
para empezar porque conviene aprovechar la mañana para actividad al aire
libre"). La IA explicable es un campo de investigación actual y muy
valorado — y es algo que muchos LLMs *no* hacen bien, porque son cajas
negras. Nuestro sistema, por diseño, siempre puede explicar por qué
recomendó lo que recomendó.

**Conclusión del punto 2:** un sistema que entiende lenguaje natural,
infiere, planifica y explica su razonamiento es Inteligencia Artificial.
Que no use una red neuronal no lo hace "menos IA" — lo hace una
*clase distinta* de IA, elegida a propósito.

---

## 3. Por qué NO usamos un LLM en la nube (fue una decisión, no una carencia)

Esta es la pregunta clave del jurado. La respuesta corta:
**un LLM en la nube es la herramienta equivocada para este problema.**

Cuatro razones, en orden de importancia:

1. **El problema que resolvemos es la falta de señal.** Los Tuxtlas
   tiene zonas sin internet — cascadas, sierra, playas, partes de la
   laguna. Una app que depende de la nube se cae justo donde el turista
   más la necesita. Poner un LLM en la nube **contradice la razón de
   existir de la app.**

2. **Un LLM alucina.** Un modelo generativo puede inventar una cascada
   que no existe, un precio falso o un horario equivocado. Para una app
   que guía a personas reales a lugares reales, eso es inaceptable.
   Nuestro sistema **solo responde con información verificada** que está
   en su base de datos. Nunca inventa.

3. **Privacidad.** Lo que el usuario escribe nunca sale de su teléfono.

4. **Costo y velocidad.** Sin servidores que pagar, sin latencia de red.
   La respuesta es instantánea y la app es gratis de operar.

Frase para el stand:
> "No es que no pudiéramos conectar un modelo en la nube. Es que hacerlo
> rompería lo único que hace única a esta app: que funciona sin internet
> y que nunca te miente sobre un lugar."

---

## 4. "¿Y si le pregunto sobre la historia de Francia?" — la especialización es una FORTALEZA

Es muy probable que un juez intente "romper" el asistente preguntándole
algo fuera de Los Tuxtlas. **Esto no es un problema: es la respuesta más
fuerte que tienes.**

Respuesta:
> "No va a contestar sobre Francia, y está bien que no lo haga. No es un
> chatbot de conocimiento general — es un asistente turístico
> **especializado** en Los Tuxtlas. Igual que un sistema experto médico
> no recomienda películas, ni un GPS te da recetas de cocina. La
> especialización no es una limitación: es lo que lo hace confiable y
> profundo en lo suyo."

Analogías que puedes usar:
- Un **motor de ajedrez** es IA, y no sabe manejar un coche.
- Un **corrector ortográfico** es IA, y no sabe de astronomía.
- Un **sistema experto médico** (como MYCIN, de los años 70) es IA, y no
  sabe de turismo.

La pregunta correcta no es "¿sabe de todo?", es **"¿hace bien su
trabajo?"**. Y el trabajo del asistente es: ayudar a un turista en Los
Tuxtlas, sin internet, sin mentirle. En eso, le gana a un LLM general.

---

## 5. Preguntas difíciles del jurado y cómo responderlas

**P: ¿Esto es IA de verdad o son puros if/else?**
R: Es un sistema experto con PLN — una rama clásica de la IA. Tiene un
módulo de procesamiento de lenguaje natural con tolerancia a errores
ortográficos por distancia de edición, un motor de inferencia con
scoring ponderado, y un planificador de rutas. Un `if` simple no tolera
que escribas "cascda" en lugar de "cascada"; el nuestro sí, porque aplica
un algoritmo de PLN. La complejidad está en cómo decide, no en la
sintaxis del código.

**P: ¿Por qué no usaron ChatGPT o un modelo gratuito?**
R: (Ver punto 3.) Porque rompería el modo offline, que es el corazón de
la app, y porque un modelo generativo puede inventar lugares o datos
falsos. Elegimos la herramienta correcta para el problema.

**P: ¿Qué pasa si le pregunto algo que no sabe?**
R: Te lo dice con claridad y te ofrece lo que sí puede hacer — no inventa
una respuesta. Esa honestidad es una decisión de diseño. Preferimos un
asistente que reconozca su alcance a uno que alucine.

**P: ¿Cómo entiende si escribo mal?**
R: Con el módulo de PLN. Usa la distancia de Damerau-Levenshtein para
medir qué tan parecida es lo que escribiste a las palabras que conoce,
tolera la *h* muda y los plurales. Por eso "komo yego a catemco" se
entiende igual que "cómo llego a Catemaco".

**P: ¿El sistema aprende?**
R: (Responde con honestidad — no digas que hace machine learning si no
lo hace.) No usa aprendizaje automático; es un sistema basado en
conocimiento. Pero su base de conocimiento **crece**: cuando un prestador
registra su servicio y se valida en el panel, ese servicio pasa a formar
parte de lo que el asistente puede recomendar. La inteligencia mejora
ampliando y curando el conocimiento, no reentrenando un modelo.

**P: ¿Dónde está exactamente la "inteligencia"?**
R: En tres lugares: (1) en el PLN que entiende lenguaje natural con
errores, (2) en el motor de inferencia que razona sobre tus preferencias
para puntuar y elegir, y (3) en el planificador que arma una ruta
coherente por geografía y tiempo. Y todo es **explicable**: el sistema
siempre puede decirte por qué recomendó algo.

**P: ¿No es muy limitado comparado con un chatbot real?**
R: Es un chatbot real — uno especializado. Compáralo en su terreno: para
planear un viaje a Los Tuxtlas sin internet, le gana a un chatbot general
porque funciona offline, es instantáneo y nunca te manda a un lugar que
no existe.

---

## 6. Vocabulario: qué decir y qué NO decir

**Usa estos términos (son correctos y suenan con autoridad):**
- Sistema experto / sistema basado en reglas / basado en conocimiento
- Procesamiento de Lenguaje Natural (PLN)
- Motor de inferencia
- Base de conocimiento
- Reconocimiento de intenciones y entidades
- Distancia de edición (Damerau-Levenshtein)
- IA explicable (Explainable AI)
- Planificación automática

**NO digas esto (no es verdad y un juez agudo te va a cachar):**
- ❌ "Entrenamos un modelo" — no entrenaron ninguno.
- ❌ "Usa redes neuronales" / "machine learning" / "deep learning" — no.
- ❌ "Aprende solo" — no hay aprendizaje automático.
- ❌ "Es como ChatGPT pero offline" — no, es una clase distinta de IA.

La honestidad aquí es estrategia: si reclamas exactamente lo que el
sistema es —ni más ni menos— y lo defiendes con seguridad, eres
inatacable. Si exageras y te cachan una, dudan de todo lo demás.

---

## 7. El cierre que amarra todo

Si tienes que resumir la defensa en una frase para cerrar:

> "TuxtlasGO no usa IA por moda. Usa **la clase de IA correcta para el
> problema**: un sistema experto con PLN que funciona sin internet, que
> razona y explica, y que nunca inventa un lugar. Para un turista perdido
> en la sierra sin señal, eso vale más que el chatbot más grande del
> mundo encerrado detrás de una barra de carga."
