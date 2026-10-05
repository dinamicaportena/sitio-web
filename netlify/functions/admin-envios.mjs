// Historial de envíos a la lista de suscriptores (requiere sesión de administrador).
//   GET /api/admin/envios   últimos envíos a la lista
import { json, error, sesion } from "../lib/comun.mjs";
import { listarEnvios } from "../lib/envios.mjs";

export default async (req) => {
  if (!sesion(req)) return error("Debe iniciar sesión.", 401);
  if (req.method === "GET") return json(await listarEnvios());
  return error("Método no permitido.", 405);
};
export const config = { path: "/api/admin/envios" };
