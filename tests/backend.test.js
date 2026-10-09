// Prueba de humo del script con un Drive simulado (no necesita Google).
// Uso: node tests/backend.test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const code = fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Codigo.gs'), 'utf8');

const files = [], props = {}, cache = {};
function File(blob) { this.name = blob.name; this.bytes = blob.bytes; this.type = blob.type; this.id = 'F' + (files.length + 1); this.desc = ''; this.trashed = false; }
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

// v2: planes terminados en varios formatos
const hora = ctx.Utilities.formatDate(new Date(ts), 'America/La_Paz', 'yyyy-MM-dd HH.mm');
const B = (hex, resto) => Buffer.concat([Buffer.from(hex, 'hex'), Buffer.from(resto || 'xxxxxxxxxxxx')]).toString('base64');
const JPG = B('ffd8ffe0'), PNG = B('89504e470d0a1a0a'), ZIP = B('504b0304'), OLE = B('d0cf11e0a1b11ae1');
const HEIC = Buffer.concat([Buffer.from('00000018', 'hex'), Buffer.from('ftypheic0000')]).toString('base64');
const n0 = files.length;
r = post({ id: 'D360-v2aaaa1-q0p1', nombre: 'Delicias del Valle', ts, parte: 1, total: 3, archivo: JPG, nombre_original: 'IMG_2031.JPEG' });
assert(r.ok, JSON.stringify(r)); assert.strictEqual(files[n0].name, hora + ' – Delicias del Valle (1 de 3).jpg');
r = post({ id: 'D360-v2aaaa1-q0p2', nombre: 'Delicias del Valle', ts, parte: 2, total: 3, archivo: ZIP, nombre_original: 'PAI_07_Alimentos.docx' });
assert(r.ok && files[n0 + 1].name === hora + ' – Delicias del Valle (2 de 3).docx', files[n0 + 1] && files[n0 + 1].name);
assert(/wordprocessingml/.test(files[n0 + 1].type), 'tipo MIME de Word');
r = post({ id: 'D360-v2aaaa1-q0p3', nombre: 'Delicias del Valle', ts, parte: 3, total: 3, archivo: PDF, nombre_original: 'plan' });
assert(r.ok && files[n0 + 2].name.endsWith('(3 de 3).pdf'), 'PDF sin extensión → .pdf');
assert(/Archivo original: PAI_07_Alimentos.docx/.test(files[n0 + 1].desc));
console.log('✓ varios archivos:', files[n0].name, '·', files[n0 + 1].name);
r = post({ id: 'D360-v2aaaa2-q0x1', nombre: 'Ana', ts, archivo: PNG, nombre_original: 'captura.pdf' });
assert(r.ok && files[files.length - 1].name.endsWith(' – Ana.png'), 'manda el contenido real, no el nombre');
assert(post({ id: 'D360-v2aaaa2-q0x2', nombre: 'Ana', archivo: OLE, nombre_original: 'plan.doc' }).ok);
assert(files[files.length - 1].name.endsWith('.doc'));
assert(post({ id: 'D360-v2aaaa2-q0x3', nombre: 'Ana', archivo: HEIC, nombre_original: 'IMG_1.HEIC' }).ok);
assert(files[files.length - 1].name.endsWith('.heic'));
const n1 = files.length;
assert.strictEqual(post({ id: 'D360-v2aaaa3-q0z1', nombre: 'x', archivo: ZIP, nombre_original: 'virus.zip' }).codigo, 'invalido');
assert.strictEqual(post({ id: 'D360-v2aaaa3-q0z2', nombre: 'x', archivo: ZIP, nombre_original: 'plan.pdf' }).codigo, 'invalido');
assert.strictEqual(post({ id: 'D360-v2aaaa3-q0z3', nombre: 'x', archivo: B('4d5a9000'), nombre_original: 'plan.pdf' }).codigo, 'invalido');   // un .exe
assert.strictEqual(post({ id: 'D360-v2aaaa3-q0z4', nombre: 'x', archivo: OLE, nombre_original: 'plan.msi' }).codigo, 'invalido');
assert.strictEqual(files.length, n1, 'no guarda nada inválido');
console.log('✓ rechaza ZIP sueltos, programas y archivos disfrazados');

ctx.cerrar();
assert.strictEqual(post({ id: 'D360-mgx1abh-eeee', nombre: 'x', pdf: PDF }).codigo, 'cerrada');
assert.strictEqual(get({}).abierta, false);
ctx.abrir();
console.log('✓ abrir / cerrar');

r = post({ id: 'PRUEBA-mgx1abi-ffff', nombre: 'Prueba de conexión', ts, pdf: PDF });
const fp = files[files.length - 1]; assert(r.ok && fp.name.startsWith('PRUEBA · '));
ctx.estado();
ctx.borrarPruebas();
assert(fp.trashed && !files[0].trashed);
console.log('✓ pruebas a la papelera');

Object.keys(cache).forEach(k => { cache[k] = '300'; });   // MAX_POR_HORA
const k = Object.keys(cache)[0];
assert.strictEqual(post({ id: 'D360-mgx1abj-gggg', nombre: 'x', pdf: PDF }).codigo, 'limite');
console.log('✓ tope por hora (' + k + ')');

console.log('\nOK · backend');
