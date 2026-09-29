// GET /api/foto/:id — sirve las fotos guardadas desde el panel o el formulario del expositor.
import { fotos, error } from "../lib/comun.mjs";
export default async (req, context) => {
  const id = context.params?.id || "";
  if (!/^[0-9]{8}-[0-9a-f]{10}$/.test(id)) return error("No encontrada", 404);
  const r = await fotos().getWithMetadata(id, { type: "arrayBuffer" });
  if (!r) return error("No encontrada", 404);
  return new Response(r.data, { headers: { "Content-Type": r.metadata?.tipo || "image/jpeg",
                                           "Cache-Control": "public, max-age=31536000, immutable" } });
};
export const config = { path: "/api/foto/:id" };
