// Página pública de un evento (dinamicaportena.cl/<dirección>/ y /<dirección>/en): sirve la plantilla estática
// de evento/index.html (o index-en.html) con <title>, meta description y og:image ya completados en el servidor,
// a partir del afiche del evento (pestaña General → «Identidad del evento»). El contenido del cuerpo de la página
// (objetivo, conferencistas, programa, etc.) lo sigue completando el navegador, como siempre, llamando a
// /api/evento/:slug; esto solo mejora la vista previa que muestran WhatsApp, redes sociales, etc. al compartir el enlace.
// Si algo falla, se sirve la plantilla tal cual (igual que antes de esta función), nunca un error.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { leerRegistro, contenidoStore } from "../lib/ev.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const PLANTILLA = {
  es: readFileSync(path.join(aqui, "../../evento/index.html"), "utf8"),
  en: readFileSync(path.join(aqui, "../../evento/index-en.html"), "utf8"),
};

const tr = (v, l) => (v == null ? "" : typeof v === "string" ? v : v[l] || v.es || v.en || "");
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const urlAbs = (ruta, origen) => (/^https?:\/\//.test(ruta) ? ruta : origen + ruta);
const sustituir = (html, re, valor) => (re.test(html) ? html.replace(re, valor) : html);

export default async (req, context) => {
  const slug = context.params?.slug, lang = context.params?.lang === "en" ? "en" : "es";
  let html = PLANTILLA[lang] || PLANTILLA.es;
  const depurar = new URL(req.url).searchParams.get("depurar") === "1";
  if (depurar) {
    let detalle = {};
    try {
      detalle.slug = slug; detalle.params = context.params;
      const reg = slug ? await leerRegistro(slug) : null; detalle.reg = reg;
      const guardado = reg ? await contenidoStore().get(slug, { type: "json" }) : null; detalle.tieneContenido = Boolean(guardado?.contenido);
      detalle.afiche = guardado?.contenido?.afiche;
    } catch (e) { detalle.error = e.message; detalle.stack = e.stack; }
    return new Response(JSON.stringify(detalle, null, 2), { headers: { "Content-Type": "application/json" } });
  }
  try {
    const reg = slug ? await leerRegistro(slug) : null;
    const guardado = reg ? await contenidoStore().get(slug, { type: "json" }) : null;
    const c = guardado?.contenido;
    if (reg && c) {
      const nombre = tr(c.nombre, lang) || "Evento";
      const titulo = `${nombre} — Dinámica Porteña`;
      const desc = String(tr(c.objetivo, lang) || "").split(/\n{2,}/)[0].slice(0, 200) ||
        (lang === "en" ? "Event page of the Dinámica Porteña group." : "Página de evento del grupo Dinámica Porteña.");
      const origen = new URL(req.url).origin;
      html = sustituir(html, /<title>[^<]*<\/title>/, `<title>${esc(titulo)}</title>`);
      html = sustituir(html, /(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`);
      html = sustituir(html, /(<meta property="og:title" content=")[^"]*(")/, `$1${esc(titulo)}$2`);
      html = sustituir(html, /(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`);
      if (c.afiche) {
        const img = esc(urlAbs(c.afiche, origen));
        html = sustituir(html, /(<meta name="twitter:card" content=")[^"]*(")/, `$1summary_large_image$2`);
        html = html.replace("</head>", `<meta property="og:image" content="${img}">\n</head>`);
      }
    }
  } catch { /* se sirve la plantilla sin personalizar */ }
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" } });
};
export const config = { path: ["/.netlify/functions/evento-pagina/:slug", "/.netlify/functions/evento-pagina/:slug/:lang"] };
