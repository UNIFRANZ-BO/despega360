# Despega 360 · Arma tu guía IA (constancias en PDF) — emprendedoras

Proyecto de Rafael Aramayo (UNIFRANZ Cochabamba) para el programa Despega 360 (IFFI – UNIFRANZ/IPEE, apoyo UE).
App de un solo HTML que arma la instrucción (prompt) para que cada emprendedora complete su Plan de Acción
Individualizado con una IA. Viene de un HTML que pasó Rafael (copia intacta en `docs/original_Despega360.html`).
Parte de la arquitectura de las encuestas de estudiantes/docentes (skill `encuesta-app-unifranz`), **pero sin
base de datos ni Sheets**: decisión de Rafael (09-oct-2026).

## Cómo trabaja Rafael
- No es programador: pasos numerados con rutas de menú exactas y qué NO tocar. Ejecución directa, poco ida y vuelta.
- Castellano neutro (tú), nunca voseo. Textos para emprendedoras: simples y cálidos.

## Decisiones
- **Botón final «Enviar y guardar en PDF»:** genera el PDF una vez → lo descarga en su equipo **y** sube la misma copia
  a una carpeta de Google Drive. Sin hoja de cálculo: la carpeta es el registro.
- **Nombre en Drive:** `AAAA-MM-DD HH.MM – Nombre del emprendimiento.pdf` (hora de La Paz, la del momento en que tocó
  Enviar si su reloj es creíble). Nada más en el nombre; en la descripción del archivo van rubro, municipio, IA y código.
  Repetidos/sobrescritos se depuran después a mano (Rafael).
- **Nombre del emprendimiento obligatorio** (paso «Tu emprendimiento» y, si retoma con código, en el paso «Tu IA»).
  Sigue sin pedirse nombre personal, teléfono ni carnet.
- **«Copiar mi instrucción» aparece solo después de enviar** (candado 🔒 antes). Si cambia algo después de enviar,
  vuelve el candado y debe enviar de nuevo. Sin cambios, el botón solo descarga otra copia (no reenvía).
- El PDF contiene los datos elegidos + **anexo con la instrucción completa** que se le da a la IA.
- Se respeta la estructura y el aguayo del HTML original (Baloo 2 + Atkinson Hyperlegible). **v1.1 (09-oct-2026):**
  Rafael pidió algo más impactante e inmersivo → tema único oscuro «noche andina»: auroras con colores del aguayo,
  canvas `#cielo` con estrellas, rombos de aguayo flotando en capas (parallax con mouse y scroll) y estrellas fugaces,
  silueta del Tunari en SVG, franja tejida sobre la barra inferior, tarjetas de vidrio, borde aguayo giratorio
  (`@property --ang`) en lo elegido, inclinación 3D con mouse, título dorado, pista con cohete 🚀, confeti y despegue.
  El desenfoque de vidrio solo en computadoras (en celulares sencillos cuesta fluidez); canvas a ~30 fps, se pausa
  con la pestaña oculta. Respeta `prefers-reduced-motion` (fondo estático).
  Ojo: `body` debe quedar con fondo transparente (el fondo va en `html`), si no tapa la capa `.fondo` (z-index −1);
  y nada debe salirse a lo ancho (`main`/`header` con `overflow-x:clip`): la prueba e2e lo verifica.
- **El texto de la instrucción (`#basePrompt`) y `buildPrompt()` no se tocan**: son idénticos al original
  (verificable comparando con `docs/original_Despega360.html`).
- La nota de bienvenida ya no dice «No se envía a nadie»: explica que al final se envía una copia.

## Estructura
| Ruta | Qué es |
|---|---|
| `src.html` | Fuente. Se edita aquí. |
| `build.py` | Copia a `index.html` y valida la sintaxis JS con `node --check`. |
| `index.html` | Lo que se publica. No editar a mano. |
| `apps-script/Codigo.gs` | Backend: Apps Script **independiente** (no ligado a hoja) en la cuenta donde van los PDF. |
| `tests/backend.test.js` | Script con Drive simulado. |
| `tests/e2e_test.py` | Recorrido completo con Playwright (390 y 1366 px, cola sin internet, retoma, panel, modo de prueba). |

## Contrato app ↔ script
- `GET ?action=ping` → `{ok, servicio, version_app, abierta}` (JSONP con `&callback=`).
- `GET ?action=verificar&id=` → `{ok, existe}`.
- `POST {action:'subir', data:{id, nombre, rubro, municipio, ia, ts, fecha_local, version, pdf(base64)}}` →
  `{ok, id}` · `{ok, id, repetido:true}` (mismo id ya guardado) · `{ok:false, codigo:'cerrada'|'invalido'|'limite'|'error'}`.
- IDs `D360-<base36>-<rand>`; `PRUEBA-…` (panel técnico) se guardan con prefijo «PRUEBA · ».
- Envío: POST `text/plain` → POST `no-cors` + `verificar` → cola local `despega360-cola1` (se reenvía al abrir la página
  o al volver internet). `cerrada` e `invalido` son definitivos (no se encolan). La cola se guarda **antes** de descargar,
  por si el navegador interrumpe la página.
- Borrador local: `despega360-constructor-v2` (misma clave que el HTML original, para no perder avances).
- Seguridad del script: valida que sea PDF (`%PDF`), máx. 5 MB, máx. 150 envíos/hora, id con formato fijo,
  `LockService`. Usa permiso de Drive completo → conviene una **cuenta dedicada** (Rafael va a usar una aparte).

## Script: funciones para ejecutar desde el editor
`configuracionInicial` (crea la carpeta «Despega 360 · Constancias de las emprendedoras» y muestra su enlace) ·
`estado` · `abrir` · `cerrar` (las emprendedoras igual descargan su PDF) · `borrarPruebas` (a la papelera, recuperable).
`CARPETA_ID` opcional al inicio del código para usar una carpeta existente.
Actualizar: **Administrar implementaciones → ✏️ → Nueva versión** (nunca «Nueva implementación»).

## Panel técnico
`?admin=1` o tres toques en «v1.0» (pie): probar conexión, enviar PDF de prueba, reenviar pendientes.
Sin URL (`API_URL_DEFECTO = 'PEGA_AQUI_LA_URL_EXEC'`) la app corre en **modo de prueba**: descarga pero no envía.
`?api=<url>` prueba otra URL sin guardarla.

## Estado (09-oct-2026)
- [x] App y script escritos; pruebas locales en verde (backend simulado + Playwright).
- [x] Script implementado en la cuenta dedicada (09-oct-2026): `AKfycbx1BiVd…QASeGHNzzg/exec`. Ping anónimo OK y
      PDF de prueba subido OK (`PRUEBA-a120d7cafc-85g7p`). URL incrustada en `API_URL_DEFECTO` (app v1.1).
- [x] Repo `UNIFRANZ-BO/despega360` + GitHub Pages → https://unifranz-bo.github.io/despega360/?v=1
- [ ] Prueba real desde el celular de Rafael; luego `borrarPruebas` y borrar a mano cualquier PDF de prueba sin prefijo
      (el 09-oct-2026 una corrida de e2e mal aislada pudo subir «… – Delicias del Valle.pdf»; ya corregido: la e2e
      bloquea script.google.com y usa `?api=sin-url` para el modo de prueba).
- Al cambiar la app: `python build.py`, pruebas, commit, push y repartir el enlace con `?v=N+1`. Cambiar solo el
  script no requiere tocar GitHub (pero sí «Nueva versión» en Apps Script).

## Comandos
```bash
export PATH="/c/Program Files/nodejs:/c/Program Files/GitHub CLI:$PATH"; export PYTHONIOENCODING=utf-8
python build.py
node tests/backend.test.js
python tests/e2e_test.py
```
