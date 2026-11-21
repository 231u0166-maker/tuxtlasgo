// Servidor local de paquetes para PROBAR (con soporte de Range y CORS).
//   node scripts/paquetes/servir-paquetes.mjs        → http://localhost:8787
// y en .env.local:  VITE_PAQUETES_URL=http://localhost:8787
// En producción se usa un alojamiento real (ver README), no este script.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize } from 'node:path';

const RAIZ = join(process.cwd(), 'paquetes');
const PUERTO = Number(process.env.PUERTO || 8787);
const TIPOS = { '.json': 'application/json', '.pmtiles': 'application/octet-stream' };

createServer(async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range, If-Match',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, ETag, Accept-Ranges',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  try {
    const ruta = normalize(join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!ruta.startsWith(RAIZ)) { res.writeHead(403, cors); return res.end(); }
    const st = await stat(ruta);
    if (!st.isFile()) throw new Error('no es archivo');
    const ext = ruta.slice(ruta.lastIndexOf('.'));
    const base = { ...cors, 'Accept-Ranges': 'bytes', 'Content-Type': TIPOS[ext] || 'application/octet-stream', ETag: `"${st.size}-${st.mtimeMs}"` };
    const rango = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (rango) {
      const ini = rango[1] === '' ? Math.max(0, st.size - Number(rango[2])) : Number(rango[1]);
      const fin = rango[1] === '' || rango[2] === '' ? st.size - 1 : Math.min(Number(rango[2]), st.size - 1);
      if (ini > fin || ini >= st.size) { res.writeHead(416, { ...base, 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...base, 'Content-Range': `bytes ${ini}-${fin}/${st.size}`, 'Content-Length': fin - ini + 1 });
      return createReadStream(ruta, { start: ini, end: fin }).pipe(res);
    }
    res.writeHead(200, { ...base, 'Content-Length': st.size });
    createReadStream(ruta).pipe(res);
  } catch {
    res.writeHead(404, cors); res.end('No encontrado');
  }
}).listen(PUERTO, () => console.log(`Paquetes en http://localhost:${PUERTO}  (carpeta ${RAIZ})`));
