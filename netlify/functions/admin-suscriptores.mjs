// Gestión de suscriptores y del historial de envíos (requiere sesión de administrador).
//   GET    /api/admin/suscriptores                 lista completa
//   POST   /api/admin/suscriptores                 {texto, reactivarBajas?}  agrega correos pegados
//   DELETE /api/admin/suscriptores/:id             elimina un suscriptor
//   POST   /api/admin/suscriptores/:id/reactivar   reactiva a quien se había dado de baja
//   GET    /api/admin/envios                       últimos envíos a la lista
import { json, error, leerJSON, sesion } from "../lib/comun.mjs";
import { leerTodos, obtener, guardar, borrar, interpretar, idDe, enTandas } from "../lib/suscriptores.mjs";
import { listarEnvios } from "../lib/envios.mjs";

export default async (req, context) => {
  const admin = sesion(req);
  if (!admin) return error("Debe iniciar sesión.", 401);
  const { id, accion } = context.params || {};
  const ruta = new URL(req.url).pathname;

  if (ruta === "/api/admin/envios" && req.method === "GET") return json(await listarEnvios());

  if (!id && req.method === "GET") {
    return json((await leerTodos()).sort((a, b) => a.email.localeCompare(b.email)));
  }
  if (!id && req.method === "POST") {
    const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
    const { validos, invalidos } = interpretar(cuerpo.texto);
    if (!validos.length) return error(invalidos.length ? "No se reconoció ningún correo válido." : "Pegue al menos un correo.");
    const ahora = new Date().toISOString();
    const r = { agregados: 0, existentes: 0, bajasOmitidas: [], reactivados: 0 };
    const porCorreo = new Map();
    for (const v of validos) { const p = porCorreo.get(v.email); if (!p) porCorreo.set(v.email, { ...v }); else if (!p.nombre && v.nombre) p.nombre = v.nombre; }
    const unicos = [...porCorreo.values()];
    r.existentes += validos.length - unicos.length;
    await enTandas(unicos, async ({ email, nombre }) => {
      const sid = idDe(email), s = await obtener(sid);
      if (!s) { await guardar({ id: sid, email, nombre, estado: "activo", alta: ahora, fuente: admin }); r.agregados++; }
      else if (s.estado === "baja") {
        if (cuerpo.reactivarBajas) { s.estado = "activo"; s.reactivado = ahora; await guardar(s); r.reactivados++; } else r.bajasOmitidas.push(email);
      } else { r.existentes++; if (nombre && !s.nombre) { s.nombre = nombre; await guardar(s); } }
    });
    return json({ ...r, invalidos });
  }
  if (id && !accion && req.method === "DELETE") {
    if (!(await obtener(id))) return error("No existe.", 404);
    await borrar(id); return json({ ok: true });
  }
  if (id && accion === "reactivar" && req.method === "POST") {
    const s = await obtener(id); if (!s) return error("No existe.", 404);
    s.estado = "activo"; s.reactivado = new Date().toISOString(); await guardar(s); return json({ ok: true });
  }
  return error("Ruta o método no permitido.", 405);
};
export const config = { path: ["/api/admin/suscriptores", "/api/admin/suscriptores/:id", "/api/admin/suscriptores/:id/:accion", "/api/admin/envios"] };
