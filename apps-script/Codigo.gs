/**
 * DESPEGA 360 · PLANES DE ACCIÓN DE LAS EMPRENDEDORAS  (v2.1)
 * Recibe el plan terminado que cada emprendedora sube desde la app «Arma tu guía IA»
 * (PDF, Word, fotos, PowerPoint o Excel) y lo guarda en una carpeta de Google Drive.
 * No usa hojas de cálculo ni base de datos: la carpeta es el registro.
 * Cada emprendimiento tiene su SUBCARPETA (se crea sola la primera vez que sube algo). Mayúsculas, tildes
 * y espacios de más no crean carpetas distintas: «delicias del valle» y «Delicias  del Valle» van juntas.
 * Dentro, cada archivo se llama «AAAA-MM-DD HH.MM – Nombre del emprendimiento.ext» (hora de Bolivia);
 * si sube varios a la vez: «… (1 de 3).jpg». Los archivos de PRUEBA quedan sueltos en la carpeta principal.
 * Revisa que cada archivo sea de verdad lo que dice ser (no acepta programas ni archivos raros).
 *
 * ── PRIMERA VEZ ─────────────────────────────────────────────────────────────
 *   1. Con la sesión abierta en la cuenta de Google donde quieres los archivos:
 *      script.google.com → Nuevo proyecto → pega este código → Guardar.
 *   2. Elige «configuracionInicial» en la lista de funciones → Ejecutar → autoriza.
 *      Crea la carpeta en tu Drive y escribe su enlace en el registro de ejecución.
 *   3. Implementar → Nueva implementación → Aplicación web
 *        Ejecutar como: Yo · Quién tiene acceso: Cualquier persona
 *      Copia la URL que termina en /exec.
 *
 * ── PARA ACTUALIZAR ESTE CÓDIGO DESPUÉS ─────────────────────────────────────
 *   Implementar → Administrar implementaciones → ✏️ → Versión: «Nueva versión» → Implementar.
 *   (Nunca «Nueva implementación»: cambia la URL.)
 *
 * ── FUNCIONES QUE PUEDES EJECUTAR DESDE ESTE EDITOR ─────────────────────────
 *   estado · abrir · cerrar · borrarPruebas · configuracionInicial
 *   (elige la función en la lista de arriba y toca «Ejecutar»; el resultado sale abajo).
 */

const VERSION_APP = '2.1';
const ZONA = 'America/La_Paz';
// Opcional: ID de una carpeta que ya exista en esta cuenta (lo que va después de /folders/ en su enlace).
// Vacío = el script crea su propia carpeta la primera vez.
const CARPETA_ID = '';
const NOMBRE_CARPETA = 'Despega 360 · Planes de acción de las emprendedoras';   // solo se usa si el script crea la carpeta
const MAX_MB = 15;           // tamaño máximo de cada archivo
const MAX_POR_HORA = 300;    // tope de archivos por hora (frena abusos; con 80 emprendedoras sobra)
// Formatos aceptados: extensión → [familia según sus primeros bytes, tipo MIME]
const FORMATOS = {
  pdf: ['pdf', 'application/pdf'], jpg: ['jpg', 'image/jpeg'], jpeg: ['jpg', 'image/jpeg'], png: ['png', 'image/png'],
  webp: ['webp', 'image/webp'], gif: ['gif', 'image/gif'], heic: ['heic', 'image/heic'], heif: ['heic', 'image/heif'],
  docx: ['zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['zip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  pptx: ['zip', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  odt: ['zip', 'application/vnd.oasis.opendocument.text'], ods: ['zip', 'application/vnd.oasis.opendocument.spreadsheet'],
  odp: ['zip', 'application/vnd.oasis.opendocument.presentation'],
  doc: ['ole', 'application/msword'], xls: ['ole', 'application/vnd.ms-excel'], ppt: ['ole', 'application/vnd.ms-powerpoint']
};
const ID_RE = /^(D360|PRUEBA)-[a-z0-9]{6,12}-[a-z0-9]{3,8}$/;

/* ═════════════════════════ WEB APP ═════════════════════════ */
function doGet(e) {
  const p = (e && e.parameter) || {};
  let out;
  try {
    if (p.action === 'verificar') out = {ok: true, existe: ID_RE.test(String(p.id || '')) && !!idGuardado_(p.id)};
    else out = {ok: true, servicio: 'Despega 360 · planes de acción', version_app: VERSION_APP, abierta: abierta_()};
  } catch (err) { out = {ok: false, codigo: 'error', mensaje: String(err && err.message || err)}; }
  return salida_(out, p.callback);
}

function doPost(e) {
  let out;
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.action !== 'subir') throw new Error('Acción desconocida');
    out = subir_(b.data || {});
  } catch (err) { out = {ok: false, codigo: 'error', mensaje: String(err && err.message || err)}; }
  return salida_(out);
}

function salida_(o, cb) {
  const s = JSON.stringify(o);
  if (cb && /^[\w$.]{1,64}$/.test(cb)) return ContentService.createTextOutput(cb + '(' + s + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}

function subir_(d) {
  if (!abierta_()) return {ok: false, codigo: 'cerrada'};
  const id = String(d.id || '');
  if (!ID_RE.test(id)) return {ok: false, codigo: 'invalido'};
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    if (idGuardado_(id)) return {ok: true, id: id, repetido: true};   // reenvío del mismo archivo: no se duplica
    const b64 = String(d.archivo || d.pdf || '');   // «pdf»: apps de la versión 1
    if (!b64 || b64.length > MAX_MB * 1.37e6) return {ok: false, codigo: 'invalido'};
    const bytes = Utilities.base64Decode(b64);
    const ext = tipoArchivo_(bytes, d.nombre_original || (d.pdf ? 'constancia.pdf' : ''));
    if (!ext) return {ok: false, codigo: 'invalido'};
    if (!cupo_()) return {ok: false, codigo: 'limite'};
    const cuando = fechaEnvio_(d.ts);
    const total = Math.min(Math.max(parseInt(d.total, 10) || 1, 1), 20), parte = Math.min(Math.max(parseInt(d.parte, 10) || 1, 1), total);
    const nombre = (id.indexOf('PRUEBA') === 0 ? 'PRUEBA · ' : '') +
      Utilities.formatDate(cuando, ZONA, 'yyyy-MM-dd HH.mm') + ' – ' + limpio_(d.nombre, 80) +
      (total > 1 ? ' (' + parte + ' de ' + total + ')' : '') + '.' + ext;
    const destino = id.indexOf('PRUEBA') === 0 ? carpeta_() : subcarpeta_(d.nombre);
    const f = destino.createFile(Utilities.newBlob(bytes, FORMATOS[ext][1], nombre));
    f.setDescription([
      'Rubro: ' + limpio_(d.rubro, 40), 'Municipio: ' + limpio_(d.municipio, 60), 'IA: ' + limpio_(d.ia, 30),
      'Archivo original: ' + limpio_(d.nombre_original, 120), 'Hora en su equipo: ' + limpio_(d.fecha_local, 40), 'Código de envío: ' + id
    ].join('\n'));
    PropertiesService.getScriptProperties().setProperty('id_' + id, f.getId());
    return {ok: true, id: id};
  } finally { lock.releaseLock(); }
}

/* ═════════════════════════ AYUDANTES ═════════════════════════ */
// Devuelve la extensión con la que se guarda el archivo, o '' si no es un formato aceptado.
// Mandan sus primeros bytes, no solo el nombre (un programa renombrado a .pdf no pasa).
function tipoArchivo_(bytes, nombreOriginal) {
  const b = i => bytes[i] & 0xFF;
  const txt = (i, n) => { let t = ''; for (let k = i; k < i + n && k < bytes.length; k++) t += String.fromCharCode(b(k)); return t; };
  let fam = '';
  if (txt(0, 4) === '%PDF') fam = 'pdf';
  else if (b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF) fam = 'jpg';
  else if (b(0) === 0x89 && txt(1, 3) === 'PNG') fam = 'png';
  else if (txt(0, 4) === 'RIFF' && txt(8, 4) === 'WEBP') fam = 'webp';
  else if (txt(0, 4) === 'GIF8') fam = 'gif';
  else if (txt(4, 4) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(txt(8, 4))) fam = 'heic';
  else if (b(0) === 0x50 && b(1) === 0x4B && b(2) === 0x03 && b(3) === 0x04) fam = 'zip';
  else if (b(0) === 0xD0 && b(1) === 0xCF && b(2) === 0x11 && b(3) === 0xE0) fam = 'ole';
  if (!fam) return '';
  const m = /\.([a-z0-9]{2,5})$/i.exec(String(nombreOriginal || '').trim());
  const ext = m ? m[1].toLowerCase() : '';
  if (FORMATOS[ext] && FORMATOS[ext][0] === fam) return ext === 'jpeg' ? 'jpg' : ext === 'heif' ? 'heic' : ext;
  if (fam === 'zip' || fam === 'ole') return '';   // un ZIP u OLE sin extensión de Office no se acepta
  return fam;   // imagen o PDF con un nombre raro: se guarda con su extensión real
}

function abierta_() { return PropertiesService.getScriptProperties().getProperty('ACTIVA') !== 'NO'; }
function idGuardado_(id) { return PropertiesService.getScriptProperties().getProperty('id_' + id); }

function limpio_(s, max) {
  const t = String(s == null ? '' : s).replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || 'Sin nombre';
}

// Hora en que la emprendedora tocó «Enviar» (si su reloj es creíble); si no, la hora de llegada.
function fechaEnvio_(ts) {
  const n = Number(ts), ahora = Date.now();
  return (n && n <= ahora + 5 * 60e3 && n >= ahora - 30 * 864e5) ? new Date(n) : new Date(ahora);
}

function cupo_() {
  const c = CacheService.getScriptCache(), k = 'n_' + Utilities.formatDate(new Date(), ZONA, 'yyyyMMddHH');
  const n = Number(c.get(k) || 0);
  if (n >= MAX_POR_HORA) return false;
  c.put(k, String(n + 1), 3700);
  return true;
}

// Subcarpeta del emprendimiento dentro de la carpeta principal (la crea si no existe).
// Se recuerda por su ID: si Rafael la renombra o la mueve, los archivos siguen llegando a ella.
function subcarpeta_(nombre) {
  const visible = limpio_(nombre, 80), clave = 'sub_' + clave_(visible), props = PropertiesService.getScriptProperties();
  const id = props.getProperty(clave);
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const raiz = carpeta_(), it = raiz.getFolders();
  while (it.hasNext()) { const f = it.next(); if (clave_(f.getName()) === clave_(visible)) { props.setProperty(clave, f.getId()); return f; } }
  const f = raiz.createFolder(visible);
  props.setProperty(clave, f.getId());
  return f;
}
function clave_(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }

function carpeta_() {
  const props = PropertiesService.getScriptProperties();
  const id = CARPETA_ID || props.getProperty('CARPETA_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { if (CARPETA_ID) throw new Error('No encuentro la carpeta de CARPETA_ID en esta cuenta.'); } }
  const f = DriveApp.createFolder(NOMBRE_CARPETA);
  props.setProperty('CARPETA_ID', f.getId());
  return f;
}

/* ═══════════════════ FUNCIONES PARA EL EDITOR ═══════════════════ */
function configuracionInicial() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ACTIVA')) props.setProperty('ACTIVA', 'SI');
  const c = carpeta_();
  console.log('Listo. Los archivos se guardarán en: ' + c.getName() + '\n' + c.getUrl() +
    '\nAhora: Implementar → Nueva implementación → Aplicación web (Ejecutar como: Yo · Acceso: Cualquier persona).');
}

function estado() {
  const c = carpeta_();
  let sueltos = 0, pruebas = 0, emp = 0, arch = 0;
  const it = c.getFiles();
  while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf('PRUEBA') === 0) pruebas++; else sueltos++; }
  const sub = c.getFolders();
  while (sub.hasNext()) { const fs = sub.next().getFiles(); emp++; while (fs.hasNext()) { fs.next(); arch++; } }
  console.log('Recepción: ' + (abierta_() ? 'ABIERTA' : 'CERRADA') + '\nCarpeta: ' + c.getName() + '\n' + c.getUrl() +
    '\nEmprendimientos con archivos (subcarpetas): ' + emp + '\nArchivos en sus subcarpetas: ' + arch +
    (sueltos ? '\nArchivos sueltos en la carpeta principal: ' + sueltos : '') + (pruebas ? '\nArchivos de prueba: ' + pruebas : ''));
}

function abrir() { PropertiesService.getScriptProperties().setProperty('ACTIVA', 'SI'); console.log('Recepción ABIERTA: las emprendedoras pueden subir sus planes.'); }
function cerrar() { PropertiesService.getScriptProperties().setProperty('ACTIVA', 'NO'); console.log('Recepción CERRADA: la app sigue funcionando, pero ya no se pueden subir planes a la carpeta.'); }

// Manda a la papelera de Drive (recuperable 30 días) los archivos que empiezan con «PRUEBA».
function borrarPruebas() {
  const it = carpeta_().getFiles();
  let n = 0;
  while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf('PRUEBA') === 0) { f.setTrashed(true); n++; } }
  console.log(n ? n + ' archivo(s) de prueba enviados a la papelera de Drive.' : 'No había archivos de prueba.');
}
