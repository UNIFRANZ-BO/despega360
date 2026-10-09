/**
 * DESPEGA 360 · CONSTANCIAS EN PDF DE LAS EMPRENDEDORAS  (v1.0)
 * Recibe el PDF que arma la app «Arma tu guía IA» y lo guarda en una carpeta de Google Drive.
 * No usa hojas de cálculo ni base de datos: la carpeta es el registro.
 * Cada archivo se llama «AAAA-MM-DD HH.MM – Nombre del emprendimiento.pdf» (hora de Bolivia).
 *
 * ── PRIMERA VEZ ─────────────────────────────────────────────────────────────
 *   1. Con la sesión abierta en la cuenta de Google donde quieres los PDF:
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

const VERSION_APP = '1.0';
const ZONA = 'America/La_Paz';
// Opcional: ID de una carpeta que ya exista en esta cuenta (lo que va después de /folders/ en su enlace).
// Vacío = el script crea su propia carpeta la primera vez.
const CARPETA_ID = '';
const NOMBRE_CARPETA = 'Despega 360 · Constancias de las emprendedoras';
const MAX_MB = 5;            // tamaño máximo de un PDF
const MAX_POR_HORA = 150;    // tope de envíos por hora (frena abusos; con 80 emprendedoras sobra)
const ID_RE = /^(D360|PRUEBA)-[a-z0-9]{6,12}-[a-z0-9]{3,8}$/;

/* ═════════════════════════ WEB APP ═════════════════════════ */
function doGet(e) {
  const p = (e && e.parameter) || {};
  let out;
  try {
    if (p.action === 'verificar') out = {ok: true, existe: ID_RE.test(String(p.id || '')) && !!idGuardado_(p.id)};
    else out = {ok: true, servicio: 'Despega 360 · constancias', version_app: VERSION_APP, abierta: abierta_()};
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
    if (idGuardado_(id)) return {ok: true, id: id, repetido: true};   // reenvío del mismo PDF: no se duplica
    const b64 = String(d.pdf || '');
    if (!b64 || b64.length > MAX_MB * 1.4e6) return {ok: false, codigo: 'invalido'};
    const bytes = Utilities.base64Decode(b64);
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return {ok: false, codigo: 'invalido'};   // «%PDF»
    if (!cupo_()) return {ok: false, codigo: 'limite'};
    const cuando = fechaEnvio_(d.ts);
    const nombre = (id.indexOf('PRUEBA') === 0 ? 'PRUEBA · ' : '') +
      Utilities.formatDate(cuando, ZONA, 'yyyy-MM-dd HH.mm') + ' – ' + limpio_(d.nombre, 80) + '.pdf';
    const f = carpeta_().createFile(Utilities.newBlob(bytes, 'application/pdf', nombre));
    f.setDescription([
      'Rubro: ' + limpio_(d.rubro, 40), 'Municipio: ' + limpio_(d.municipio, 60), 'IA: ' + limpio_(d.ia, 30),
      'Hora en su equipo: ' + limpio_(d.fecha_local, 40), 'Código de envío: ' + id
    ].join('\n'));
    PropertiesService.getScriptProperties().setProperty('id_' + id, f.getId());
    return {ok: true, id: id};
  } finally { lock.releaseLock(); }
}

/* ═════════════════════════ AYUDANTES ═════════════════════════ */
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
  console.log('Listo. Los PDF se guardarán en: ' + c.getName() + '\n' + c.getUrl() +
    '\nAhora: Implementar → Nueva implementación → Aplicación web (Ejecutar como: Yo · Acceso: Cualquier persona).');
}

function estado() {
  const c = carpeta_();
  let n = 0, pruebas = 0;
  const it = c.getFiles();
  while (it.hasNext()) { const f = it.next(); n++; if (f.getName().indexOf('PRUEBA') === 0) pruebas++; }
  console.log('Recepción: ' + (abierta_() ? 'ABIERTA' : 'CERRADA') + '\nCarpeta: ' + c.getUrl() +
    '\nPDF en la carpeta: ' + n + (pruebas ? ' (' + pruebas + ' de prueba)' : ''));
}

function abrir() { PropertiesService.getScriptProperties().setProperty('ACTIVA', 'SI'); console.log('Recepción ABIERTA: la app vuelve a enviar PDF a la carpeta.'); }
function cerrar() { PropertiesService.getScriptProperties().setProperty('ACTIVA', 'NO'); console.log('Recepción CERRADA: las emprendedoras igual descargan su PDF, pero ya no llega a la carpeta.'); }

// Manda a la papelera de Drive (recuperable 30 días) los archivos que empiezan con «PRUEBA».
function borrarPruebas() {
  const it = carpeta_().getFiles();
  let n = 0;
  while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf('PRUEBA') === 0) { f.setTrashed(true); n++; } }
  console.log(n ? n + ' archivo(s) de prueba enviados a la papelera de Drive.' : 'No había archivos de prueba.');
}
