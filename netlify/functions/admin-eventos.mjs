// Eventos desde el panel (requiere sesión de administrador).
//   GET    /api/admin/eventos        lista
//   POST   /api/admin/eventos        crea
//   PUT    /api/admin/eventos/:id    modifica (incluye publicar / retirar)
//   DELETE /api/admin/eventos/:id    elimina
import { json, error, leerJSON, sesion } from "../lib/comun.mjs";
import { listarEventos, limpiarEvento, eventosStore, generadorIdEvento } from "../lib/eventos.mjs";

export default async (req, context) => {
  const admin = sesion(req);
  if (!admin) return error("Debe iniciar sesión.", 401);
  const { id } = context.params || {};
  try {
    if (!id && req.method === "GET") return json(await listarEventos());
    if (!id && req.method === "POST") {
      const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
      const datos = limpiarEvento(cuerpo), sig = await generadorIdEvento(), ahora = new Date().toISOString();
      for (let k = 1; k < 50; k++) {
        const e = { ...datos, id: sig(k), creado: ahora, creadoPor: admin, actualizado: ahora, actualizadoPor: admin };
        const r = await eventosStore().setJSON(e.id, e, { onlyIfNew: true });
        if (r?.modified !== false) return json(e, 201);
      }
      return error("No se pudo asignar un ID nuevo; intente otra vez.");
    }
    const actual = id ? await eventosStore().get(id, { type: "json" }) : null;
    if (!actual) return error("El evento no existe.", 404);
    if (req.method === "PUT") {
      const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
      const e = { ...limpiarEvento(cuerpo, actual), id, actualizado: new Date().toISOString(), actualizadoPor: admin };
      await eventosStore().setJSON(id, e); return json(e);
    }
    if (req.method === "DELETE") { await eventosStore().delete(id); return json({ ok: true }); }
    return error("Método no permitido.", 405);
  } catch (e) { return error(e.message); }
};
export const config = { path: ["/api/admin/eventos", "/api/admin/eventos/:id"] };
