// Revisión diaria desde el panel (requiere sesión de administrador).
//   GET  /api/admin/revision   resultado de la última revisión
//   POST /api/admin/revision   ejecuta la revisión ahora (útil para probar; respeta las mismas reglas de fecha y hora)
import { json, error, sesion } from "../lib/comun.mjs";
import { ejecutarRevision, ultimaRevision } from "../lib/revision.mjs";

export default async (req) => {
  if (!sesion(req)) return error("Debe iniciar sesión.", 401);
  if (req.method === "GET") return json((await ultimaRevision()) || null);
  if (req.method === "POST") return json(await ejecutarRevision({ origen: new URL(req.url).origin, manual: true }));
  return error("Método no permitido.", 405);
};
export const config = { path: "/api/admin/revision" };
