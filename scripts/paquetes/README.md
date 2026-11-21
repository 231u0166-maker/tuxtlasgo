# Paquetes regionales de mapas (estilo MAPS.ME)

El turista elige **"Veracruz"** y baja un solo archivo con todas las calles, edificios y nombres de la
región, más la red de calles y senderos ya armada para calcular rutas sin internet.

```
 OpenStreetMap ──Planetiler──▶ mapa.pmtiles ──(mismo código de la app)──▶ grafo.json
                                    └──────────── paquetes/<region>/ + paquetes.json ──▶ servidor ──▶ teléfono
```

Los mosaicos salen con el **mismo esquema que OpenFreeMap** (Planetiler, perfil OpenMapTiles), así que la app
reutiliza el mismo estilo `liberty`, y la red de rutas se arma con el mismo código que ya corre en el teléfono
(`src/lib/grafoDesdeMosaicos.ts`).

## 1. Preparar (una sola vez)
- **Java 21+** (`java -version`).
- Bajar **`planetiler.jar`** desde <https://github.com/onthegomap/planetiler/releases/latest> y dejarlo en
  `tools/planetiler.jar`. (Es un programa de código abierto; revisa la descarga antes de correrlo.)
- Ocupa ~10 GB de disco libre y 8 GB de RAM para México. Cambia la memoria con `JAVA_XMX=12g`.

## 2. Construir un paquete
```bash
node --max-old-space-size=8192 scripts/paquetes/construir-paquete.mjs veracruz
node --max-old-space-size=8192 scripts/paquetes/construir-paquete.mjs all
```
Las regiones y sus recuadros están en `scripts/paquetes/regiones.json` (agrega o ajusta ahí).
Genera `paquetes/<id>/mapa.pmtiles`, `paquetes/<id>/grafo.json` y actualiza `paquetes/paquetes.json`.
La primera corrida baja los datos de México (~1–2 GB) y tarda; las siguientes reutilizan lo bajado (`data/`).

**Tamaños:** todavía no se han medido paquetes reales (solo el de prueba). Se espera del orden de cientos de MB
por estado; ajusta con `--maxzoom` o `--exclude-layers` en `construir-paquete.mjs` si salen muy grandes.

## 3. Alojar
Los archivos son estáticos y necesitan **peticiones por rango (Range)** y **CORS**:

- Recomendado: **Cloudflare R2** (almacenamiento ~US$0.015/GB-mes y **sin costo por descarga**). Crea un bucket,
  actívale acceso público (o un dominio propio) y sube la carpeta `paquetes/` completa.
- CORS del bucket: métodos `GET, HEAD`; orígenes tu dominio de la app (y `http://localhost:5173` para probar);
  cabeceras permitidas `Range`; cabeceras expuestas `Content-Range, Content-Length, ETag, Accept-Ranges`.
- En Vercel (o `.env.local`): `VITE_PAQUETES_URL=https://<tu-bucket-o-dominio>` (sin `/` final) y vuelve a desplegar.
  Sin esa variable la app oculta la sección de paquetes y usa solo las zonas.

## 4. Actualizar
Vuelve a correr `construir-paquete.mjs` (por ejemplo una vez al mes) y sube de nuevo. Cada paquete lleva su
`version` (fecha); la app ofrece **Actualizar** cuando el catálogo trae una más nueva.

## Probar sin Planetiler
```bash
node scripts/paquetes/crear-paquete-de-prueba.mjs   # paquete chico (Catemaco) en el mismo formato
node scripts/paquetes/servir-paquetes.mjs           # http://localhost:8787 (Range + CORS)
VITE_PAQUETES_URL=http://localhost:8787 npm run dev
```
Eso NO es el proceso de producción: solo sirve para probar la app y el servidor.

## Límites actuales
- **Satélite:** no viene en los paquetes (las imágenes pesan gigas y Mapbox/Esri limitan guardarlas); se sigue
  guardando por zona o ruta desde "Más opciones".
- **Navegador:** guardar un archivo tan grande usa el sistema de archivos privado del navegador (OPFS) y
  `createWritable`: funciona en Chrome/Edge (Android y escritorio); en Safari/iOS aún no.
- Una ruta entre dos paquetes distintos (p. ej. Puebla → Veracruz) no se calcula sin internet: cada paquete
  tiene su propia red. Con internet siempre funciona.
