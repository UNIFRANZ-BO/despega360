"""Prueba de punta a punta de la app con un Apps Script simulado (no toca Drive).
Requisitos: pip install playwright && playwright install chromium
Uso: python tests/e2e_test.py        (genera capturas en tests/shots/)
"""
import asyncio, base64, json, pathlib
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SHOTS = RAIZ / 'tests' / 'shots'; SHOTS.mkdir(exist_ok=True)
API = 'https://script.google.com/macros/s/TESTID/exec'
DRIVE = {}           # id → payload recibido
CAIDO = {'on': False}

async def backend(route, req):
    if CAIDO['on']: return await route.abort()
    q = parse_qs(urlparse(req.url).query)
    if req.method == 'POST':
        d = json.loads(req.post_data)['data']
        assert base64.b64decode(d['pdf'])[:4] == b'%PDF', 'no es PDF'
        DRIVE[d['id']] = d
        return await route.fulfill(status=200, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                                   body=json.dumps({'ok': True, 'id': d['id']}))
    a, cb = q.get('action', ['ping'])[0], q.get('callback', [''])[0]
    out = {'ok': True, 'existe': q.get('id', [''])[0] in DRIVE} if a == 'verificar' else {'ok': True, 'abierta': True}
    await route.fulfill(status=200, headers={'Content-Type': 'application/javascript'}, body=f'{cb}({json.dumps(out)});')

async def recorrido(pg, ancho):
    await pg.screenshot(path=str(SHOTS / f'{ancho}_00_bienvenida.png'), full_page=True)
    await pg.click('#sig'); await pg.wait_for_timeout(700)
    await pg.click('.opt[data-v="Cuadernillo del Taller 1"]'); await pg.click('.opt[data-v="Calculadora de costos"]')
    await pg.screenshot(path=str(SHOTS / f'{ancho}_01_materiales.png'))
    await pg.click('#sig'); await pg.wait_for_timeout(500)
    await pg.click('#sig'); await pg.wait_for_timeout(300)
    assert 'Elige tu IA' in await pg.inner_text('#errIa')
    await pg.click('.opt[data-v="Gemini"]'); await pg.click('#sig'); await pg.wait_for_timeout(500)
    # nombre obligatorio
    await pg.click('#sig'); await pg.wait_for_timeout(300)
    assert 'nombre de tu emprendimiento' in await pg.inner_text('#errNombre')
    await pg.fill('#nombre', 'Delicias del Valle')
    assert await pg.inner_text('#errNombre') == ''
    await pg.click('.opt[data-v="Alimentos"]'); await pg.click('.opt[data-v="Otro"]')
    await pg.fill('#muniOtro', 'Sacaba'); await pg.fill('#prod', 'Mermelada de durazno')
    await pg.click('#mas'); await pg.click('#mas'); await pg.click('#mas')
    assert await pg.inner_text('#antigOut') == '3 años'
    await pg.screenshot(path=str(SHOTS / f'{ancho}_03_emprendimiento.png'), full_page=True)
    await pg.click('#sig'); await pg.wait_for_timeout(500)
    for v in ['paso', 'voz', 'partes', 'ejemplos']: await pg.click(f'.opt[data-v="{v}"]')
    await pg.click('#sig'); await pg.wait_for_timeout(1800)
    assert await pg.is_hidden('#trasEnvio'), 'la instrucción no debe verse antes de enviar'
    await pg.screenshot(path=str(SHOTS / f'{ancho}_05_final_antes.png'), full_page=True)

async def main():
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

            # Enviar y guardar en PDF
            async with pg.expect_download() as dl:
                await pg.click('#btnPdf')
            d = await dl.value
            assert d.suggested_filename == 'Despega360_Plan_de_Accion_Alimentos_Delicias_del_Valle.pdf', d.suggested_filename
            await pg.wait_for_selector('#trasEnvio:not([hidden])', timeout=8000); await pg.wait_for_timeout(600)
            assert len(DRIVE) == 1, 'el PDF no llegó al servidor'
            env = list(DRIVE.values())[0]
            assert env['nombre'] == 'Delicias del Valle' and env['municipio'] == 'Sacaba' and env['rubro'] == 'Alimentos', env
            assert 'llegó al equipo' in await pg.inner_text('#estadoPdf')
            pdf = base64.b64decode(env['pdf']); (SHOTS / f'{ancho}_constancia.pdf').write_bytes(pdf)
            await pg.screenshot(path=str(SHOTS / f'{ancho}_06_final_enviado.png'), full_page=True)

            # Copiar
            await pg.click('#btnCopiar'); await pg.wait_for_timeout(300)
            clip = await pg.evaluate('navigator.clipboard.readText()')
            assert clip.startswith('# TU ROL') and 'Delicias del Valle' in clip and 'Sacaba' in clip

            # Segunda vez sin cambios: solo descarga, no reenvía
            async with pg.expect_download():
                await pg.click('#btnPdf')
            await pg.wait_for_timeout(500)
            assert len(DRIVE) == 1, 'no debe reenviar si no cambió nada'

            # Cambia algo → hay que volver a enviar
            await pg.click('[data-goto="4"]'); await pg.wait_for_timeout(400)
            await pg.click('.opt[data-v="corto"]'); await pg.click('#sig'); await pg.wait_for_timeout(1500)
            assert await pg.is_hidden('#trasEnvio') and 'Cambiaste algo' in await pg.inner_text('#estadoPdf')

            # Sin internet: descarga igual, queda en cola y se envía al volver a abrir
            CAIDO['on'] = True
            async with pg.expect_download():
                await pg.click('#btnPdf')
            await pg.wait_for_selector('#trasEnvio:not([hidden])', timeout=30000)
            assert 'se enviará sola' in await pg.inner_text('#estadoPdf')
            assert await pg.evaluate("JSON.parse(localStorage.getItem('despega360-cola1')).length") == 1
            CAIDO['on'] = False
            await pg.reload(); await pg.wait_for_timeout(3500)
            assert len(DRIVE) == 2, 'la cola no se reenvió'
            assert await pg.evaluate("JSON.parse(localStorage.getItem('despega360-cola1')).length") == 0
            await pg.screenshot(path=str(SHOTS / f'{ancho}_07_cola_enviada.png'))

            # Retomar con código: pide nombre
            pg.once('dialog', lambda dg: asyncio.ensure_future(dg.accept()))
            await pg.click('#reiniciar'); await pg.wait_for_timeout(600)
            await pg.click('#sig'); await pg.click('#sig'); await pg.wait_for_timeout(400)
            await pg.click('.opt[data-v="Claude"]'); await pg.click('.opt[data-f="cont"][data-v="si"]')
            await pg.fill('#codigo', 'CÓDIGO PARA CONTINUAR\nBloque 4...'); await pg.click('#sig'); await pg.wait_for_timeout(300)
            assert 'Escribe el nombre' in await pg.inner_text('#errNombre2')
            await pg.fill('#nombre2', 'Tejidos Sur'); await pg.click('#sig'); await pg.wait_for_timeout(1500)
            async with pg.expect_download():
                await pg.click('#btnPdf')
            await pg.wait_for_selector('#trasEnvio:not([hidden])', timeout=8000)
            assert len(DRIVE) == 3 and list(DRIVE.values())[-1]['nombre'] == 'Tejidos Sur'
            await pg.screenshot(path=str(SHOTS / f'{ancho}_08_retoma.png'), full_page=True)

            # Panel técnico
            await pg.goto(url + '&admin=1'); await pg.wait_for_timeout(900)
            await pg.click('#admin [data-a="ping"]'); await pg.wait_for_timeout(800)
            assert '"abierta":true' in await pg.inner_text('#admLog')
            await pg.click('#admin [data-a="prueba"]'); await pg.wait_for_timeout(1200)
            assert any(k.startswith('PRUEBA-') for k in DRIVE)

            ancho_doc = await pg.evaluate('document.documentElement.scrollWidth')
            assert ancho_doc <= ancho, f'scroll horizontal: {ancho_doc}px'
            assert not errs, errs
            print(f'OK {ancho}px · envíos recibidos: {len(DRIVE)}')
            await ctx.close()

        # Modo de prueba (sin URL): descarga y desbloquea, sin enviar
        ctx = await b.new_context(accept_downloads=True); pg = await ctx.new_page()
        await pg.goto((RAIZ / 'index.html').as_uri()); await pg.wait_for_timeout(800)
        await recorrido(pg, 'demo')
        async with pg.expect_download():
            await pg.click('#btnPdf')
        await pg.wait_for_selector('#trasEnvio:not([hidden])', timeout=8000)
        assert 'Modo de prueba' in await pg.inner_text('#estadoPdf')
        print('OK modo de prueba')
        await b.close()

asyncio.run(main())
