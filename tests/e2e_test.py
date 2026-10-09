"""Prueba de punta a punta de la app (v2: subir el plan terminado) con un Apps Script simulado.
NUNCA toca el servidor real: todas las llamadas a script.google.com se interceptan.
Requisitos: pip install playwright pillow && playwright install chromium
Uso: python tests/e2e_test.py        (capturas en tests/shots/)
"""
import asyncio, base64, io, json, os, pathlib
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright
from PIL import Image

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SHOTS = RAIZ / 'tests' / 'shots'; SHOTS.mkdir(exist_ok=True)
TMP = SHOTS / 'archivos'; TMP.mkdir(exist_ok=True)
API = 'https://script.google.com/macros/s/TESTID/exec'
DRIVE = {}           # id → payload recibido
CAIDO = {'on': False}

def preparar_archivos():
    b = io.BytesIO(); Image.new('RGB', (600, 800), 'white').save(b, 'PDF'); (TMP / 'Plan_de_Accion.pdf').write_bytes(b.getvalue())
    (TMP / 'Plan_otra_vez.pdf').write_bytes(b.getvalue())
    Image.frombytes('RGB', (2600, 2000), os.urandom(2600 * 2000 * 3)).save(TMP / 'foto_plan.jpg', quality=90)   # foto «pesada»
    (TMP / 'PAI_07_Alimentos.docx').write_bytes(b'PK\x03\x04' + b'\0' * 2000)
    (TMP / 'programa.exe').write_bytes(b'MZ\x90\x00' + b'\0' * 500)

async def backend(route, req):
    if CAIDO['on']: return await route.abort()
    q = parse_qs(urlparse(req.url).query)
    if req.method == 'POST':
        d = json.loads(req.post_data)['data']
        raw = base64.b64decode(d.get('archivo') or d.get('pdf'))
        ok = raw[:4] == b'%PDF' or raw[:3] == b'\xff\xd8\xff' or raw[:4] == b'PK\x03\x04'
        out = {'ok': True, 'id': d['id']} if ok else {'ok': False, 'codigo': 'invalido'}
        if ok: DRIVE[d['id']] = dict(d, bytes=len(raw))
        return await route.fulfill(status=200, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}, body=json.dumps(out))
    a, cb = q.get('action', ['ping'])[0], q.get('callback', [''])[0]
    out = {'ok': True, 'existe': q.get('id', [''])[0] in DRIVE} if a == 'verificar' else {'ok': True, 'abierta': True}
    await route.fulfill(status=200, headers={'Content-Type': 'application/javascript'}, body=f'{cb}({json.dumps(out)});')

async def sin_desborde(pg):
    w = await pg.evaluate('document.documentElement.scrollWidth')
    assert w <= await pg.evaluate('innerWidth'), f'la página se desborda a lo ancho: {w}px'

async def recorrido(pg, ancho):
    await pg.screenshot(path=str(SHOTS / f'{ancho}_00_bienvenida.png'))
    await pg.click('#sig'); await pg.wait_for_timeout(700)
    await pg.click('.opt[data-v="Cuadernillo del Taller 1"]'); await pg.click('.opt[data-v="Calculadora de costos"]')
    await pg.click('#sig'); await pg.wait_for_timeout(500)
    await pg.click('#sig'); await pg.wait_for_timeout(300)
    assert 'Elige tu IA' in await pg.inner_text('#errIa')
    await pg.click('.opt[data-v="Gemini"]'); await pg.click('#sig'); await pg.wait_for_timeout(500)
    await pg.click('#sig'); await pg.wait_for_timeout(300)
    assert 'nombre de tu emprendimiento' in await pg.inner_text('#errNombre')
    await pg.fill('#nombre', 'Delicias del Valle')
    await pg.click('.opt[data-v="Alimentos"]'); await pg.click('.opt[data-v="Otro"]')
    await pg.fill('#muniOtro', 'Sacaba'); await pg.fill('#prod', 'Mermelada de durazno')
    await pg.click('#mas'); await pg.click('#mas'); await pg.click('#mas')
    assert await pg.inner_text('#antigOut') == '3 años'
    await pg.click('#sig'); await pg.wait_for_timeout(500)
    for v in ['paso', 'voz', 'partes', 'ejemplos']: await pg.click(f'.opt[data-v="{v}"]')
    await pg.click('#sig'); await pg.wait_for_timeout(1800)
    assert await pg.is_visible('#btnCopiar'), 'copiar debe estar disponible sin enviar nada'
    assert await pg.inner_text('#sig') == 'Ya terminé: subir mi plan'
    await sin_desborde(pg)
    await pg.screenshot(path=str(SHOTS / f'{ancho}_05_final.png'), full_page=True)

async def main():
    preparar_archivos()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for ancho, alto, movil in [(390, 844, True), (1366, 900, False)]:
            DRIVE.clear(); CAIDO['on'] = False
            ctx = await b.new_context(viewport={'width': ancho, 'height': alto}, is_mobile=movil, has_touch=movil, accept_downloads=True)
            await ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
            pg = await ctx.new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.route('https://script.google.com/**', backend)
            url = (RAIZ / 'index.html').as_uri() + '?api=' + API
            await pg.goto(url); await pg.wait_for_timeout(1200)
            await recorrido(pg, ancho)

            # Copiar
            await pg.click('#btnCopiar'); await pg.wait_for_timeout(300)
            clip = await pg.evaluate('navigator.clipboard.readText()')
            assert clip.startswith('# TU ROL') and 'Delicias del Valle' in clip and 'Sacaba' in clip

            # Constancia local: se descarga y NO se envía
            async with pg.expect_download() as dl:
                await pg.click('#btnPdf')
            assert (await dl.value).suggested_filename == 'Despega360_Plan_de_Accion_Alimentos_Delicias_del_Valle.pdf'
            await pg.wait_for_timeout(400)
            assert not DRIVE, 'la constancia local no debe enviarse'

            # Paso «Sube tu plan»
            await pg.click('#sig'); await pg.wait_for_timeout(900)
            assert await pg.input_value('#nombre3') == 'Delicias del Valle'
            assert 'Gemini' in await pg.inner_text('#tips li.tuya')
            await pg.click('#btnSubir'); await pg.wait_for_timeout(300)
            assert 'Primero elige' in await pg.inner_text('#errArch')
            await pg.set_input_files('#archivos', [str(TMP / n) for n in ['Plan_de_Accion.pdf', 'foto_plan.jpg', 'PAI_07_Alimentos.docx', 'programa.exe']])
            await pg.wait_for_timeout(1500)
            assert 'programa.exe' in await pg.inner_text('#errArch')
            assert await pg.locator('#lista li').count() == 3
            await pg.click('#lista li:nth-child(3) .quitar'); await pg.wait_for_timeout(200)
            assert await pg.locator('#lista li').count() == 2
            assert await pg.inner_text('#txtSubir') == 'Enviar mis 2 archivos'
            await sin_desborde(pg)
            await pg.screenshot(path=str(SHOTS / f'{ancho}_06_subir_lista.png'))
            await pg.click('#btnSubir')
            await pg.wait_for_selector('#exito:not([hidden])', timeout=20000); await pg.wait_for_timeout(700)
            env = sorted(DRIVE.values(), key=lambda d: d['parte'])
            assert len(env) == 2 and [d['parte'] for d in env] == [1, 2] and all(d['total'] == 2 for d in env), env
            assert env[0]['ts'] == env[1]['ts'] and env[0]['nombre'] == 'Delicias del Valle' and env[0]['municipio'] == 'Sacaba'
            assert env[0]['nombre_original'] == 'Plan_de_Accion.pdf' and env[1]['nombre_original'] == 'foto_plan.jpg'
            orig = (TMP / 'foto_plan.jpg').stat().st_size
            assert env[1]['bytes'] < orig, f'la foto debía achicarse ({env[1]["bytes"]} ≥ {orig})'
            print(f'   foto: {orig // 1024} KB → {env[1]["bytes"] // 1024} KB')
            await pg.screenshot(path=str(SHOTS / f'{ancho}_07_subido.png'))

            # Sin internet: falla, se reintenta y no se duplica
            await pg.click('#otraVez'); await pg.wait_for_timeout(300)
            await pg.set_input_files('#archivos', str(TMP / 'Plan_otra_vez.pdf')); await pg.wait_for_timeout(500)
            CAIDO['on'] = True
            await pg.click('#btnSubir')
            await pg.wait_for_function("document.querySelector('#txtSubir').textContent === 'Reintentar el envío'", timeout=60000)
            assert 'conexión' in await pg.inner_text('#estadoSubir')
            await pg.screenshot(path=str(SHOTS / f'{ancho}_08_error.png'))
            CAIDO['on'] = False
            await pg.click('#btnSubir')
            await pg.wait_for_selector('#exito:not([hidden])', timeout=20000)
            assert len(DRIVE) == 3

            # Panel técnico
            await pg.goto(url + '&admin=1'); await pg.wait_for_timeout(900)
            await pg.click('#admin [data-a="ping"]'); await pg.wait_for_timeout(800)
            assert '"abierta":true' in await pg.inner_text('#admLog')
            await pg.click('#admin [data-a="prueba"]'); await pg.wait_for_timeout(1500)
            assert any(k.startswith('PRUEBA-') for k in DRIVE)
            await pg.click('#admin [data-a="close"]')

            # Atajo desde la bienvenida (otra emprendedora, sin datos)
            await pg.evaluate("localStorage.clear()"); await pg.goto(url); await pg.wait_for_timeout(900)
            await pg.click('.atajo'); await pg.wait_for_timeout(900)
            assert await pg.evaluate("document.querySelector('.step.active').dataset.id") == 'subir'
            await pg.set_input_files('#archivos', str(TMP / 'PAI_07_Alimentos.docx')); await pg.wait_for_timeout(400)
            await pg.click('#btnSubir'); await pg.wait_for_timeout(300)
            assert 'nombre de tu emprendimiento' in await pg.inner_text('#errNombre3')
            await pg.fill('#nombre3', 'Tejidos Sur'); await pg.click('#btnSubir')
            await pg.wait_for_selector('#exito:not([hidden])', timeout=20000)
            ult = [d for d in DRIVE.values() if d['nombre'] == 'Tejidos Sur']
            assert len(ult) == 1 and ult[0]['nombre_original'] == 'PAI_07_Alimentos.docx' and ult[0]['total'] == 1
            await pg.click('#atras'); await pg.wait_for_timeout(500)
            assert await pg.evaluate("document.querySelector('.step.active').dataset.id") == 'inicio', 'desde el atajo, Atrás vuelve a la bienvenida'

            assert not errs, errs
            print(f'OK {ancho}px · archivos recibidos: {len(DRIVE)}')
            await ctx.close()

        # Modo de prueba (?api=sin-url): no envía nada
        ctx = await b.new_context(); pg = await ctx.new_page()
        await pg.route('https://script.google.com/**', lambda r: r.abort())   # nunca tocar el servidor real
        await pg.goto((RAIZ / 'index.html').as_uri() + '?api=sin-url'); await pg.wait_for_timeout(800)
        await pg.click('.atajo'); await pg.wait_for_timeout(600)
        await pg.fill('#nombre3', 'Demo'); await pg.set_input_files('#archivos', str(TMP / 'Plan_de_Accion.pdf'))
        await pg.wait_for_timeout(300); await pg.click('#btnSubir')
        await pg.wait_for_selector('#exito:not([hidden])', timeout=8000)
        assert 'Modo de prueba' in await pg.inner_text('#exito')
        print('OK modo de prueba')

        # Movimiento reducido: sin errores
        ctx = await b.new_context(reduced_motion='reduce'); pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('https://script.google.com/**', lambda r: r.abort())
        await pg.goto((RAIZ / 'index.html').as_uri() + '?api=sin-url'); await pg.wait_for_timeout(800)
        assert not errs, errs
        print('OK movimiento reducido')
        await b.close()

asyncio.run(main())
