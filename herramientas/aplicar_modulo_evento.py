import sys, pathlib
R = pathlib.Path(sys.argv[1])
def editar(rel, fn):
    p = R / rel; s = p.read_text(encoding="utf-8"); n = fn(s)
    if n != s: p.write_text(n, encoding="utf-8"); print("modificado", rel)
    else: print("sin cambios", rel)
def html(s):
    if "eventos-modulos.js" in s: return s
    a = '<script src="eventos.js"></script>'; assert a in s
    return s.replace(a, a + '\n<script src="eventos-modulos.js"></script>', 1)
def toml(s):
    if "Páginas de evento" in s: return s
    return s.rstrip("\n") + '''

# Páginas de evento: dinamicaportena.cl/<dirección>/ (ES), /<dirección>/en (EN) y /<dirección>/admin (panel del evento).
# Solo se aplican si no existe un archivo con esa ruta (las páginas y carpetas del sitio tienen prioridad).
[[redirects]]
  from = "/:slug/admin"
  to = "/evento/admin/index.html"
  status = 200

[[redirects]]
  from = "/:slug/en"
  to = "/evento/index-en.html"
  status = 200

[[redirects]]
  from = "/:slug"
  to = "/evento/index.html"
  status = 200
'''
def eventos_pub(s):
    if "eventosDeModulos" in s: return s
    a = 'import { listarEventos, publico, terminoDe } from "../lib/eventos.mjs";'; assert a in s
    s = s.replace(a, a + '\nimport { eventosDeModulos } from "../lib/ev.mjs";', 1)
    b = 'todos = (await listarEventos()).filter((e) => e.publicar);'; assert b in s
    s = s.replace(b, 'todos = [...(await listarEventos()).filter((e) => e.publicar), ...(await eventosDeModulos().catch(() => []))];', 1)
    c = 'const anteriores = todos.filter((e) => terminoDe(e) < hoy).map(publico);'; assert c in s
    return s.replace(c, 'const anteriores = todos.filter((e) => terminoDe(e) < hoy).sort((a, b) => b.inicio.localeCompare(a.inicio)).map(publico);', 1)
editar("admin/index.html", html); editar("netlify.toml", toml); editar("netlify/functions/eventos-publicos.mjs", eventos_pub)
