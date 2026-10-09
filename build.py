"""Genera index.html (archivo que se publica) a partir de src.html y valida la sintaxis JS.
Uso:  python build.py
"""
import pathlib, re, subprocess, sys
raiz = pathlib.Path(__file__).parent
s = (raiz / 'src.html').read_text(encoding='utf-8')
(raiz / 'index.html').write_text(s, encoding='utf-8')
js = re.findall(r'<script>(.*?)</script>', s, re.S)[-1]
tmp = raiz / 'tests' / '.check.js'; tmp.write_text(js, encoding='utf-8')
r = subprocess.run(['node', '--check', str(tmp)], capture_output=True, text=True); tmp.unlink()
if r.returncode: print(r.stderr); sys.exit(1)
print(f'index.html generado ({len(s)//1024} KB) · sintaxis JS OK')
