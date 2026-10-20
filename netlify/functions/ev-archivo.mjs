// Imágenes subidas desde el panel de un evento (logos, banner, afiche, cabecera de correos):
//   GET /api/evento/:slug/archivo/:id   — pública (se usan en la página del evento y en los correos)
import { archivosStore, validarSlug } from "../lib/ev.mjs";

export default async (req, context) => {
  let slug; try { slug = validarSlug(context.params?.slug); } catch { return new Response("No encontrado", { status: 404 }); }
  const id = String(context.params?.id || "");
  if (!/^[A-Za-z0-9_-]{6,40}\.(png|jpg|webp)$/.test(id)) return new Response("No encontrado", { status: 404 });
  const r = await archivosStore().getWithMetadata(`${slug}/${id}`, { type: "arrayBuffer" });
  if (!r) return new Response("No encontrado", { status: 404 });
  return new Response(r.data, { headers: {
    "Content-Type": r.metadata?.tipo || { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[id.split(".").pop()],
    "Cache-Control": "public, max-age=31536000, immutable",      // el nombre cambia con cada archivo subido
    "X-Content-Type-Options": "nosniff",
  } });
};
export const config = { path: "/api/evento/:slug/archivo/:id" };
