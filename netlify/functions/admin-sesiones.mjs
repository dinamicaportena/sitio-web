// Difusión de una sesión (requiere sesión de administrador).
//   GET  /api/admin/sesiones/:fecha                 estado (aprobación, fechas y envíos)
//   POST /api/admin/sesiones/:fecha/aprobar         aprueba y programa los envíos (envía de inmediato si ya corresponde)
//   POST /api/admin/sesiones/:fecha/anular          anula la aprobación (lo ya enviado no se deshace)
//   POST /api/admin/sesiones/:fecha/prueba          envía el anuncio solo al administrador, marcado [PRUEBA]
//   POST /api/admin/sesiones/:fecha/enviar          envía ahora el anuncio (o lo reenvía) a toda la lista
import { json, error, sesion, fechaValida } from "../lib/comun.mjs";
import { estadoSesion, aprobarSesion, anularAprobacion, enviarDifusion } from "../lib/difusion.mjs";

export default async (req, context) => {
  const admin = sesion(req);
  if (!admin) return error("Debe iniciar sesión.", 401);
  const { fecha, accion } = context.params || {};
  if (!fechaValida(fecha || "")) return error("Fecha no válida.");
  const origen = new URL(req.url).origin;
  try {
    if (!accion && req.method === "GET") return json(await estadoSesion(fecha));
    if (req.method !== "POST") return error("Método no permitido.", 405);
    if (accion === "aprobar") { const hechos = await aprobarSesion(fecha, admin, origen); return json({ estado: await estadoSesion(fecha), hechos }); }
    if (accion === "anular") { await anularAprobacion(fecha); return json({ estado: await estadoSesion(fecha) }); }
    if (accion === "prueba") { const r = await enviarDifusion(fecha, "anuncio", origen, { prueba: admin }); return r.ok ? json(r) : error(r.motivo); }
    if (accion === "enviar") { const r = await enviarDifusion(fecha, "anuncio", origen, { responderA: admin }); return r.ok ? json({ ...r, estado: await estadoSesion(fecha) }) : error(r.motivo); }
  } catch (e) { console.error(e); return error("No se pudo completar la acción: " + e.message, 500); }
  return error("Acción no reconocida.", 404);
};
export const config = { path: ["/api/admin/sesiones/:fecha", "/api/admin/sesiones/:fecha/:accion"] };
