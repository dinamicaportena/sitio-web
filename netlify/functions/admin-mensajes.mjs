// Correos escritos desde el panel CENTRAL (requiere sesión de administrador del sitio).
//   GET  /api/admin/mensajes                   historial, correos de eventos por aprobar y destinatarios disponibles
//   POST /api/admin/mensajes                   { destino: {tipo: lista|inscritos|correos, slug?, estados?, texto?}, asunto, cuerpo, idioma, prueba? }
//   POST /api/admin/mensajes/:id/aprobar       aprueba y envía un correo a la lista pedido desde una página de evento
//   POST /api/admin/mensajes/:id/rechazar      { motivo? }
import { json, error, leerJSON, sesion } from "../lib/comun.mjs";
import { correosActivos } from "../lib/suscriptores.mjs";
import { listarRegistros, contenidoStore } from "../lib/ev.mjs";
import { leerPlantillas } from "../lib/plantillas.mjs";
import { limpiarMensaje, crearMensaje, enviarPrueba, resolverMensaje, listarMensajes, resumenMensaje, conteoInscritos } from "../lib/mensajes.mjs";

export default async (req, context) => {
  const admin = sesion(req);
  if (!admin) return error("Debe iniciar sesión.", 401);
  const { id, accion } = context.params || {}, origen = new URL(req.url).origin;
  try {
    if (!id && req.method === "GET") {
      const [mensajes, lista, regs] = await Promise.all([listarMensajes(), correosActivos(), listarRegistros()]);
      const eventos = await Promise.all(regs.map(async (r) => ({ slug: r.slug, nombre: (await contenidoStore().get(r.slug, { type: "json" }))?.contenido?.nombre?.es || r.slug,
                                                              inscritos: await conteoInscritos(r.slug) })));
      return json({ lista: lista.length, eventos, porAprobar: mensajes.filter((m) => m.estado === "por-aprobar").map(resumenMensaje),
                    mensajes: mensajes.filter((m) => m.estado !== "por-aprobar").slice(0, 40).map(resumenMensaje) });
    }
    if (!id && req.method === "POST") {
      const c = await leerJSON(req); if (!c) return error("Solicitud no válida.");
      const datos = limpiarMensaje(c, { permitidos: ["lista", "inscritos", "correos"] });
      if (datos.destino.tipo === "inscritos" && !(await listarRegistros()).some((r) => r.slug === datos.destino.slug)) return error("Elija un evento.");
      const responderA = (await leerPlantillas()).datos.email || admin;        // las respuestas llegan al correo del grupo
      if (c.prueba) { await enviarPrueba({ ...datos, responderA }, admin); return json({ ok: true, prueba: admin }); }
      const m = await crearMensaje({ datos, autor: admin, origen, responderA });
      return json(resumenMensaje(m), 201);
    }
    if (id && req.method === "POST" && (accion === "aprobar" || accion === "rechazar")) {
      const c = (await leerJSON(req)) || {};
      const m = await resolverMensaje(id, { aprobar: accion === "aprobar", admin, motivo: c.motivo, origen });
      return json(resumenMensaje(m));
    }
  } catch (e) { return error(e.message); }
  return error("Ruta o método no permitido.", 404);
};
export const config = { path: ["/api/admin/mensajes", "/api/admin/mensajes/:id/:accion"] };
