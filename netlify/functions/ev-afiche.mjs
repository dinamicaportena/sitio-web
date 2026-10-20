// Afiche automático de una página de evento (se arma con los datos guardados en el panel; ver lib/afiche-evento.mjs):
//   GET /api/evento/:slug/afiche.jpg         vertical, proporción carta (1700 × 2200)
//   GET /api/evento/:slug/afiche.pdf         tamaño carta, para imprimir
//   GET /api/evento/:slug/afiche-redes.jpg   4:5 (1080 × 1350), para redes sociales
// Evento publicado: público (con caché de unos minutos). En borrador: solo sus administradores (vista previa en el panel).
import { leerRegistro, contenidoStore, permiso, validarSlug } from "../lib/ev.mjs";
import { svgAficheEvento, aficheJPEG, afichePDF } from "../lib/afiche-evento.mjs";

export default async (req, context) => {
  const no = (m, st = 404) => new Response(m, { status: st, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  let slug; try { slug = validarSlug(context.params?.slug); } catch { return no("No encontrado"); }
  const reg = await leerRegistro(slug); if (!reg) return no("No encontrado");
  const publicado = reg.estado === "publicado";
  if (!publicado && !permiso(req, reg)) return no("No encontrado");
  const c = (await contenidoStore().get(slug, { type: "json" }))?.contenido;
  if (!c) return no("No encontrado");
  const url = new URL(req.url), archivo = url.pathname.split("/").pop();
  const formato = archivo === "afiche-redes.jpg" ? "redes" : "carta";
  try {
    const svg = await svgAficheEvento(c, { formato, origen: url.origin, slug });
    const nombre = `Afiche - ${(c.nombre?.es || slug).replace(/["\\/:*?<>|]/g, "")}`;
    const pdf = archivo === "afiche.pdf";
    const cuerpo = pdf ? await afichePDF(svg, nombre) : aficheJPEG(svg, formato === "redes" ? 1080 : 1700);
    const h = { "Content-Type": pdf ? "application/pdf" : "image/jpeg",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nombre + (formato === "redes" ? " (redes)" : "") + (pdf ? ".pdf" : ".jpg"))}`,
      "X-Content-Type-Options": "nosniff" };
    if (publicado) { h["Cache-Control"] = "public, max-age=300"; h["Netlify-CDN-Cache-Control"] = "public, s-maxage=300, stale-while-revalidate=3600"; h["Netlify-Vary"] = "query"; }
    else h["Cache-Control"] = "private, no-store";
    return new Response(cuerpo, { headers: h });
  } catch (e) { console.error("afiche:", e); return no("No se pudo generar el afiche.", 500); }
};
export const config = { path: ["/api/evento/:slug/afiche.jpg", "/api/evento/:slug/afiche.pdf", "/api/evento/:slug/afiche-redes.jpg"] };
