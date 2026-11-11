// Genera TuxtlasGO_Pruebas.postman_collection.json  ->  node generar.mjs
import { writeFileSync } from 'node:fs';
const U = p => ({ raw: `{{baseUrl}}${p}`, host: ['{{baseUrl}}'], path: p.split('?')[0].split('/').filter(Boolean), ...(p.includes('?') ? { query: p.split('?')[1].split('&').map(q => { const [key, value] = q.split('='); return { key, value }; }) } : {}) });
const js = body => ({ listen: 'test', script: { type: 'text/javascript', exec: body.trim().split('\n') } });
const req = (name, method, path, body, tests) => ({
  name,
  request: { method, header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [], ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2) } } : {}), url: U(path) },
  event: [js(tests)],
});
const T = (status, ms) => `
pm.test('Status ${status}', () => pm.response.to.have.status(${status}));
pm.test('Tiempo < ${ms} ms', () => pm.expect(pm.response.responseTime).to.be.below(${ms}));`;

const chatOk = (txt) => ({ systemPrompt: 'Eres un asistente turístico de Los Tuxtlas. Responde breve y solo con el contexto dado.', mensajes: [{ role: 'user', content: txt }] });

const col = {
  info: { name: 'TuxtlasGO - Pruebas de estrés y robustez', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'Seccion 2 de la memoria tecnica. Correr con Collection Runner (humo, robustez) y Performance (carga). baseUrl: local con "vercel dev" o preview; NO correr carga fuerte en produccion.' },
  variable: [{ key: 'baseUrl', value: 'http://localhost:3000' }, { key: 'correoPrueba', value: 'prueba@ejemplo.com' }, { key: 'passwordPrueba', value: 'cambiar-esto' }],
  item: [
    { name: '1. Humo (1 usuario)', item: [
      req('Catalogo aprobado', 'GET', '/api/servicios/aprobados', null, T(200, 5000) + `
pm.test('ok=true y trae lugares', () => { const j = pm.response.json(); pm.expect(j.ok).to.be.true; pm.expect(j.lugares).to.be.an('array').that.is.not.empty; });`),
      req('Disponibilidad publica', 'GET', '/api/reservaciones?disponibilidad=1&servicio_id=26&fecha=2026-12-24', null, `
pm.test('Responde sin sesion (200)', () => pm.response.to.have.status(200));
pm.test('Tiempo < 5000 ms', () => pm.expect(pm.response.responseTime).to.be.below(5000));`),
      req('Login valido (cuenta de prueba)', 'POST', '/api/auth/login', { correo: '{{correoPrueba}}', password: '{{passwordPrueba}}' }, `
pm.test('Status 200', () => pm.response.to.have.status(200));
pm.test('Tiempo < 5000 ms', () => pm.expect(pm.response.responseTime).to.be.below(5000));`),
      req('Chat IA - pregunta simple', 'POST', '/api/ia/chat', chatOk('Cuanto cuesta ir a la cascada?'), `
pm.test('200 o 429 (limite diario)', () => pm.expect([200,429]).to.include(pm.response.code));
if (pm.response.code === 200) pm.test('Trae texto', () => pm.expect(pm.response.json().texto).to.be.a('string').and.not.empty);`),
    ]},
    { name: '2. Robustez (errores esperados)', item: [
      req('Login con password incorrecta', 'POST', '/api/auth/login', { correo: '{{correoPrueba}}', password: 'incorrecta-xyz' }, T(401, 5000)),
      req('Login sin cuerpo', 'POST', '/api/auth/login', {}, `pm.test('Rechaza (400/401)', () => pm.expect([400,401]).to.include(pm.response.code));`),
      req('Catalogo con metodo incorrecto (PUT)', 'PUT', '/api/servicios/aprobados', null, T(405, 1500)),
      req('Chat con metodo incorrecto (GET)', 'GET', '/api/ia/chat', null, T(405, 1500)),
      req('Chat sin mensajes', 'POST', '/api/ia/chat', { systemPrompt: 'x', mensajes: [] }, T(400, 1500)),
      req('Chat mensaje demasiado largo (>8000)', 'POST', '/api/ia/chat', chatOk('a'.repeat(8100)), T(400, 1500)),
      req('Chat conversacion larga (>20 msgs)', 'POST', '/api/ia/chat', { systemPrompt: 'x', mensajes: Array.from({ length: 21 }, () => ({ role: 'user', content: 'hola' })) }, T(400, 1500)),
      req('Evento con datos invalidos', 'POST', '/api/servicios/aprobados?recurso=evento', { servicio_id: 0, tipo: 'hack' }, T(400, 1500)),
      req('Reservaciones sin sesion', 'GET', '/api/reservaciones', null, `pm.test('Exige sesion (401/403)', () => pm.expect([401,403]).to.include(pm.response.code));`),
    ]},
    { name: '3. Carga del catalogo (usar en Performance)', item: [
      req('GET catalogo bajo carga', 'GET', '/api/servicios/aprobados', null, T(200, 3000)),
    ]},
    { name: '4. Limite IA y cache (correr con Runner)', description: 'Paso A: "Pregunta repetida" x2 -> la 2a debe traer desdeCache:true. Paso B: "Pregunta unica" con 200+ iteraciones hasta ver 429 (SOLO en entorno propio: gasta cuota Groq/Gemini).', item: [
      req('Pregunta repetida (debe cachear)', 'POST', '/api/ia/chat', chatOk('Que horario tiene la reserva de Los Tuxtlas?'), `
const j = pm.response.json();
pm.test('200 o 429', () => pm.expect([200,429]).to.include(pm.response.code));
if (pm.response.code === 200) { console.log('desdeCache=' + j.desdeCache + ' proveedor=' + j.proveedor); pm.environment.set('ultimoCache', String(j.desdeCache)); }`),
      { name: 'Pregunta unica (consume cuota)', request: { method: 'POST', header: [{ key: 'Content-Type', value: 'application/json' }],
        body: { mode: 'raw', raw: '{\n  "systemPrompt": "Eres un asistente turistico de Los Tuxtlas.",\n  "mensajes": [{"role":"user","content":"Dato unico {{$randomUUID}} cuanto cuesta un guia?"}]\n}' }, url: U('/api/ia/chat') },
        event: [js(`pm.test('200 o 429', () => pm.expect([200,429]).to.include(pm.response.code));
if (pm.response.code === 429) console.log('LIMITE ALCANZADO en esta iteracion: ' + pm.info.iteration);`)] },
    ]},
  ],
};
writeFileSync('TuxtlasGO_Pruebas.postman_collection.json', JSON.stringify(col, null, 2));
console.log('OK');
