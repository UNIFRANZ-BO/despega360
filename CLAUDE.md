# Despega 360 · Arma tu guía IA (sube tu plan terminado) — emprendedoras

Proyecto de Rafael Aramayo (UNIFRANZ Cochabamba) para el programa Despega 360 (IFFI – UNIFRANZ/IPEE, apoyo UE).
App de un solo HTML que arma la instrucción (prompt) para que cada emprendedora complete su Plan de Acción
Individualizado con una IA, y **al final sube a una carpeta de Drive el plan terminado** que le entregó la IA.
Viene de un HTML que pasó Rafael (copia intacta en `docs/original_Despega360.html`). Arquitectura de las encuestas
de estudiantes/docentes (skill `encuesta-app-unifranz`), **pero sin base de datos ni Sheets** (decisión de Rafael).
Historia completa del chat de origen: `docs/Chat_Despega360_resumen.md`.

## Cómo trabaja Rafael
- No es programador: pasos numerados con rutas de menú exactas y qué NO tocar. Ejecución directa, poco ida y vuelta.
- Castellano neutro (tú), nunca voseo. Textos para emprendedoras: simples y cálidos.

## Decisiones
- **v2.0 (09-oct-2026), pedido de la responsable del programa vía Rafael:** lo que debe llegar a Drive es el
  **producto final** de la conversación con la IA (el plan), no una constancia. Por eso:
  - «Copiar mi instrucción» está disponible de inmediato (sin candado).
  - La constancia PDF quedó como en el HTML original: **descarga local opcional** («Guarda tu evidencia»), no se envía.
  - **Paso nuevo «Sube tu plan terminado»** (último paso, `SUBIR`): nombre del emprendimiento (obligatorio, prellenado),
    guía «¿Cómo saco mi plan de la IA?» según su IA (Gemini: Exportar a Documentos → PDF; ChatGPT/Claude: Word;
    Meta AI: capturas), zona para elegir o arrastrar archivos, lista con estado por archivo, «Enviar mi plan»,
    reintento sin duplicar, tarjeta «¡Tu plan llegó!» con confeti y despegue.
  - Formatos: PDF, Word (doc/docx/odt), fotos (jpg/png/webp/heic/gif), PowerPoint (ppt/pptx/odp), Excel (xls/xlsx/ods).
    Hasta **5 archivos de 15 MB** por envío. Las fotos de más de 1,2 MB se achican a máx. 2400 px JPEG 0,85 en el navegador.
  - **Atajo en la bienvenida** «¿Ya terminaste tu plan con la IA? Súbelo aquí» (para quien vuelve otro día u otro equipo);
    desde el atajo, «Atrás» vuelve a la bienvenida. La ruta de la bienvenida tiene un 4.º paso «Vuelve aquí y sube tu plan».
  - Sin cola persistente (los archivos pueden ser grandes para `localStorage`): si falla, el archivo queda en rojo y se
    reintenta con el **mismo código** (el script no lo duplica).
- **Nombre en Drive:** `AAAA-MM-DD HH.MM – Nombre del emprendimiento.ext`; varios a la vez: `… (1 de 3).jpg`
  (misma hora y numeración para todo el envío, también al reintentar). En la descripción: rubro, municipio, IA,
  nombre original del archivo, hora del equipo y código. Repetidos se depuran a mano (Rafael). Borrar PDF de la
  carpeta no rompe nada. **No hace falta hoja de control** (decisión de Rafael): la carpeta basta.
- **Nombre del emprendimiento obligatorio** (paso «Tu emprendimiento», al retomar con código y al subir).
  Sigue sin pedirse nombre personal, teléfono ni carnet.
- **Interfaz «noche andina» (v1.1):** tema único oscuro: auroras con colores del aguayo, canvas `#cielo` con estrellas,
  rombos de aguayo flotando (parallax con mouse y scroll) y estrellas fugaces, silueta del Tunari en SVG, franja tejida
  sobre la barra inferior, tarjetas de vidrio, borde aguayo giratorio (`@property --ang`), inclinación 3D con mouse,
  título dorado, pista con cohete 🚀, confeti y despegue. Vidrio solo en computadoras; canvas ~30 fps y en pausa con la
  pestaña oculta; `prefers-reduced-motion` → fondo quieto.
  Ojo: `body` con fondo transparente (el fondo va en `html`), si no tapa `.fondo` (z-index −1); nada debe salirse a lo
  ancho (`main`/`header` con `overflow-x:clip`): la e2e lo verifica.
- **El texto de la instrucción (`#basePrompt`) y `buildPrompt()` no se tocan**: idénticos al original.

## Estructura
| Ruta | Qué es |
|---|---|
| `src.html` | Fuente. Se edita aquí. |
| `build.py` | Copia a `index.html` y valida la sintaxis JS con `node --check`. |
| `index.html` | Lo que se publica. No editar a mano. |
| `apps-script/Codigo.gs` | Backend: Apps Script **independiente** (no ligado a hoja) en la cuenta dedicada. |
| `tests/backend.test.js` | Script con Drive simulado (formatos, archivos disfrazados, varios archivos, tope). |
| `tests/e2e_test.py` | Recorrido completo con Playwright (390 y 1366 px). **Bloquea script.google.com: nunca usa el servidor real.** |

## Contrato app ↔ script (script v2.0)
- `GET ?action=ping` → `{ok, servicio:'Despega 360 · planes de acción', version_app:'2.0', abierta}` (JSONP con `&callback=`).
- `GET ?action=verificar&id=` → `{ok, existe}`.
- `POST {action:'subir', data:{id, nombre, rubro, municipio, ia, ts, fecha_local, version, parte, total, nombre_original, archivo(base64)}}`
  → `{ok,id}` · `{ok,id,repetido:true}` · `{ok:false, codigo:'cerrada'|'invalido'|'limite'|'error'}`.
  Acepta también `pdf` (apps v1). El tipo lo deciden los **primeros bytes** (`tipoArchivo_`): PDF, JPG, PNG, WEBP, GIF,
  HEIC, ZIP de Office (solo con extensión docx/xlsx/pptx/odt/ods/odp) y OLE (doc/xls/ppt). Un .exe o un .zip no pasan.
- IDs `D360-…`; `PRUEBA-…` (panel técnico) se guardan con prefijo «PRUEBA · ».
- Límites: 15 MB por archivo, 300 archivos por hora, `LockService`.
- Claves locales: borrador `despega360-constructor-v2` (la misma del original). Ya no hay cola (`despega360-cola1` quedó sin uso).

## Script: funciones para ejecutar desde el editor
`configuracionInicial` · `estado` (nombre y enlace de la carpeta, total de archivos) · `abrir` · `cerrar` ·
`borrarPruebas` (a la papelera, recuperable). `CARPETA_ID` opcional al inicio del código.
Carpeta en uso: «Despega 360 · Constancias de las emprendedoras» (creada con v1; se puede renombrar, p. ej. a
«… Planes de acción …», sin romper nada: el script la guarda por ID). Actualizar: **Administrar implementaciones → ✏️ → Nueva versión**.

## Panel técnico
`?admin=1` o tres toques en «v2.0» (pie): probar conexión, enviar PDF de prueba. `?api=<url>` prueba otra URL;
`?api=sin-url` fuerza el **modo de prueba** (no envía nada).

## Estado (09-oct-2026)
- [x] v1.1 publicada: repo `UNIFRANZ-BO/despega360` → https://unifranz-bo.github.io/despega360/?v=1; script
      `AKfycbx1BiVd…QASeGHNzzg/exec` en la cuenta dedicada (ping OK, PDF de prueba OK).
- [x] v2.0 (subir el plan terminado) escrita y probada en local (backend simulado + e2e). Commit local.
- [ ] **Rafael: pegar el Codigo.gs v2.0 y publicar «Nueva versión»** (misma URL). Verificar `ping` → `version_app:"2.0"`.
- [ ] Solo después: `git push` y repartir **`?v=2`** (la app v2 no funciona con el script v1: manda `archivo`, no `pdf`).
- [ ] Prueba real desde el celular; `borrarPruebas`; borrar a mano cualquier PDF de prueba sin prefijo
      (posible «… – Delicias del Valle.pdf» de una e2e mal aislada en v1.1; ya corregido).

## Comandos
```bash
export PATH="/c/Program Files/nodejs:/c/Program Files/GitHub CLI:$PATH"; export PYTHONIOENCODING=utf-8
python build.py
node tests/backend.test.js
python tests/e2e_test.py
```
