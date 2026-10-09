// Prueba de humo del script con un Drive simulado (no necesita Google).
// Uso: node tests/backend.test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const code = fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Codigo.gs'), 'utf8');

const files = [], props = {}, cache = {};
function File(blob) { this.name = blob.name; this.bytes = blob.bytes; this.id = 'F' + (files.length + 1); this.desc = ''; this.trashed = false; }
File.prototype = { getId() { return this.id; }, getName() { return this.name; }, setDescription(d) { this.desc = d; return this; }, setTrashed(t) { this.trashed = t; } };
const folder = {
  id: 'CARPETA1', getId() { return this.id; }, getName() { return 'Despega 360'; }, getUrl() { return 'https://drive/' + this.id; },
  createFile(blob) { const f = new File(blob); files.push(f); return f; },
  getFiles() { const l = files.filter(f => !f.trashed); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; }
};
let carpetasCreadas = 0;
const pad = n => String(n).padStart(2, '0');
const ctx = {
  console: { log: (...a) => console.log('   [log]', a.join(' ').replace(/\n/g, ' / ')) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = String(v); } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  DriveApp: {
    createFolder() { carpetasCreadas++; return folder; },
    getFolderById(id) { if (id !== folder.id) throw new Error('no existe'); return folder; }
  },
  Utilities: {
    base64Decode: s => Array.from(Buffer.from(s, 'base64')).map(b => b > 127 ? b - 256 : b),   // bytes con signo, como Java
    newBlob: (bytes, type, name) => ({ bytes, type, name }),
    formatDate: (d, tz, f) => { const b = new Date(d.getTime() - 4 * 3600e3);   // La Paz = UTC-4
      return f.replace('yyyy', b.getUTCFullYear()).replace('MM', pad(b.getUTCMonth() + 1)).replace('dd', pad(b.getUTCDate()))
        .replace('HH', pad(b.getUTCHours())).replace('mm', pad(b.getUTCMinutes())); }
  },
  ContentService: { MimeType: { JSON: 'json', JAVASCRIPT: 'js' }, createTextOutput: s => ({ s, setMimeType(m) { this.m = m; return this; } }) }
};
vm.createContext(ctx); vm.runInContext(code, ctx);

const post = d => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'subir', data: d }) } }).s);
const get = p => { const o = ctx.doGet({ parameter: p }); return o.m === 'js' ? o.s : JSON.parse(o.s); };
const PDF = Buffer.from('%PDF-1.3\n% prueba\n').toString('base64');
const ts = Date.now() - 2 * 3600e3;   // tocó «Enviar» hace 2 horas (p. ej., quedó en cola sin internet)

ctx.configuracionInicial();
assert.strictEqual(carpetasCreadas, 1); assert.strictEqual(props.CARPETA_ID, 'CARPETA1'); assert.strictEqual(props.ACTIVA, 'SI');

let r = get({});
assert(r.ok && r.abierta === true, 'ping');
assert(/^cb1\(\{"ok":true/.test(get({ callback: 'cb1' })), 'JSONP');

r = post({ id: 'D360-mgx1abc-k3j9q', nombre: 'Delicias del Valle', rubro: 'Alimentos', municipio: 'Quillacollo', ia: 'Gemini', ts, pdf: PDF });
assert(r.ok, JSON.stringify(r));
assert.strictEqual(files[0].name, ctx.Utilities.formatDate(new Date(ts), 'America/La_Paz', 'yyyy-MM-dd HH.mm') + ' – Delicias del Valle.pdf');
assert(/Rubro: Alimentos/.test(files[0].desc) && /D360-mgx1abc-k3j9q/.test(files[0].desc));
console.log('✓ guarda:', files[0].name);

r = post({ id: 'D360-mgx1abc-k3j9q', nombre: 'Delicias del Valle', ts, pdf: PDF });
assert(r.ok && r.repetido && files.length === 1, 'el mismo envío no se duplica');
assert.strictEqual(get({ action: 'verificar', id: 'D360-mgx1abc-k3j9q' }).existe, true);
assert.strictEqual(get({ action: 'verificar', id: 'D360-noexiste-zzz' }).existe, false);
console.log('✓ reenvío idempotente y verificar');

r = post({ id: 'D360-mgx1abd-aaaa', nombre: 'Tejidos / Ana: "Sur"\n', ts: 1, pdf: PDF });   // ts no creíble → hora de llegada
assert(r.ok && files[1].name.endsWith(' – Tejidos Ana Sur.pdf'), files[1].name);
r = post({ id: 'D360-mgx1abe-bbbb', nombre: '', pdf: PDF });
assert(r.ok && files[2].name.endsWith(' – Sin nombre.pdf'));
console.log('✓ limpia el nombre:', files[1].name);

assert.strictEqual(post({ id: 'D360-mgx1abf-cccc', nombre: 'x', pdf: Buffer.from('<html>').toString('base64') }).codigo, 'invalido');
assert.strictEqual(post({ id: '../../malo', nombre: 'x', pdf: PDF }).codigo, 'invalido');
assert.strictEqual(post({ id: 'D360-mgx1abg-dddd', nombre: 'x', pdf: '' }).codigo, 'invalido');
console.log('✓ rechaza lo que no es PDF o trae un código raro');

ctx.cerrar();
assert.strictEqual(post({ id: 'D360-mgx1abh-eeee', nombre: 'x', pdf: PDF }).codigo, 'cerrada');
assert.strictEqual(get({}).abierta, false);
ctx.abrir();
console.log('✓ abrir / cerrar');

r = post({ id: 'PRUEBA-mgx1abi-ffff', nombre: 'Prueba de conexión', ts, pdf: PDF });
assert(r.ok && files[3].name.startsWith('PRUEBA · '));
ctx.estado();
ctx.borrarPruebas();
assert(files[3].trashed && !files[0].trashed);
console.log('✓ pruebas a la papelera');

Object.keys(cache).forEach(k => { cache[k] = '150'; });
const k = Object.keys(cache)[0];
assert.strictEqual(post({ id: 'D360-mgx1abj-gggg', nombre: 'x', pdf: PDF }).codigo, 'limite');
console.log('✓ tope por hora (' + k + ')');

console.log('\nOK · backend');
