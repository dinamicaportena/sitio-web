// Catálogo de instituciones (requiere sesión de administrador).
//   GET  /api/admin/instituciones        lista
//   POST /api/admin/instituciones        crea {nombre, sigla?, ciudad?, pais, variantes?, notas?}
//   PUT  /api/admin/instituciones/:id    modifica
import { json, error, leerJSON, sesion } from "../lib/comun.mjs";
import { listarInstituciones, institucionesStore, generadorIdInstitucion, limpiarInstitucion } from "../lib/personas.mjs";

export default async (req, context) => {
  const admin = sesion(req);
  if (!admin) return error("Debe iniciar sesión.", 401);
  const { id } = context.params || {};
  try {
    if (!id && req.method === "GET") return json(await listarInstituciones());
    if (!id && req.method === "POST") {
      const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
      const todas = await listarInstituciones();
      const nueva = limpiarInstitucion(cuerpo);
      const igual = todas.find((x) => x.nombre.toLowerCase() === nueva.nombre.toLowerCase());
      if (igual) return error(`Ya existe: ${igual.nombre} (${igual.id}).`);
      const sig = await generadorIdInstitucion();
      for (let k = 1; k < 50; k++) {
        const i = { ...nueva, id: sig(k), creada: new Date().toISOString(), creadaPor: admin };
        const r = await institucionesStore().setJSON(i.id, i, { onlyIfNew: true });
        if (r?.modified !== false) return json(i, 201);
      }
      return error("No se pudo asignar un ID nuevo; intente otra vez.");
    }
    if (id && req.method === "PUT") {
      const actual = await institucionesStore().get(id, { type: "json" }); if (!actual) return error("La institución no existe.", 404);
      const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
      const i = { ...limpiarInstitucion(cuerpo, actual), id, actualizada: new Date().toISOString(), actualizadaPor: admin };
      await institucionesStore().setJSON(id, i);
      return json(i);
    }
    return error("Ruta o método no permitido.", 405);
  } catch (e) { return error(e.message); }
};
export const config = { path: ["/api/admin/instituciones", "/api/admin/instituciones/:id"] };
