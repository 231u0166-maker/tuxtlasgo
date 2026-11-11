// Genera TuxtlasGO_Carga_Produccion.postman_collection.json  ->  node generar-produccion.mjs
// Flujo de UN turista: portada -> catalogo -> disponibilidad -> evento "vista" -> chat IA (pregunta cacheada).
// Seguro para produccion: sin login, sin pagos, el evento usa servicio_id 999999 (limpiable) y el chat
// repite UNA pregunta fija (acierto de cache = no gasta cuota Groq/Gemini ni el limite diario).
import { writeFileSync } from 'node:fs';
const U = p => ({ raw: `{{baseUrl}}${p}`, host: ['{{baseUrl}}'], path: p.split('?')[0].split('/').filter(Boolean), ...(p.includes('?') ? { query: p.split('?')[1].split('&').map(q => { const [key, value] = q.split('='); return { key, value }; }) } : {}) });
const t = (...c) => ({ listen: 'test', script: { type: 'text/javascript', exec: c } });
const req = (name, method, path, body, tests) => ({ name,
  request: { method, header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [], ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body) } } : {}), url: U(path) },
  event: [t(...tests)] });
const col = {
  info: { name: 'TuxtlasGO - Carga en produccion (flujo turista)', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  variable: [{ key: 'baseUrl', value: 'https://go.tuxtlas.xyz' }],
  // Pausa de 1 a 2 s antes de cada peticion (el turista real no dispara sin parar)
  event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: ['const ms = 1000 + Math.floor(Math.random() * 1000);', 'setTimeout(() => {}, ms);'] } }],
  item: [
    req('Portada (estatico)', 'GET', '/', null, ["pm.test('200', () => pm.response.to.have.status(200));"]),
    req('Catalogo', 'GET', '/api/servicios/aprobados', null, ["pm.test('200', () => pm.response.to.have.status(200));"]),
    req('Disponibilidad', 'GET', '/api/reservaciones?disponibilidad=1&servicio_id=26&fecha=2026-12-24', null, ["pm.test('200', () => pm.response.to.have.status(200));"]),
    req('Evento vista (servicio 999999)', 'POST', '/api/servicios/aprobados?recurso=evento', { servicio_id: 999999, tipo: 'vista' }, ["pm.test('200', () => pm.response.to.have.status(200));"]),
    req('Chat IA (pregunta fija, cacheada)', 'POST', '/api/ia/chat', { systemPrompt: 'Eres un asistente turístico de Los Tuxtlas. Responde breve y solo con el contexto dado.', mensajes: [{ role: 'user', content: 'Que horario tiene la reserva de Los Tuxtlas?' }] },
      ["pm.test('200 (429 = limite diario, cuenta como fallo de IA)', () => pm.response.to.have.status(200));"]),
  ],
};
writeFileSync('TuxtlasGO_Carga_Produccion.postman_collection.json', JSON.stringify(col, null, 2));
console.log('OK');
