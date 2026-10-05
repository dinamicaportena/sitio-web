// Gestión de las páginas de evento desde el panel CENTRAL (solo administradores del sitio, ADMIN_EMAILS).
//   GET    /api/admin/paginas-evento          lista
//   POST   /api/admin/paginas-evento          crea { nombre, slug?, email }  (email = administrador interino/responsable)
//   PATCH  /api/admin/paginas-evento/:slug    { estado?, responsable?, reenviar? }
//   DELETE /api/admin/paginas-evento/:slug    elimina el evento, su contenido y sus inscripciones ({ confirmar: slug })
import { json, error, leerJSON, texto, emailValido } from "../lib/comun.mjs";
import { sesion } from "../lib/comun.mjs";
import { registroStore, contenidoStore, inscStore, listarRegistros, leerRegistro, validarSlug, slugDe, correo, contenidoInicial, invitarAdmin } from "../lib/ev.mjs";

export default async (req, context) => {
  const admin = sesion(req);
  if (!admin) return error("Debe iniciar sesión.", 401);
  const origen = new URL(req.url).origin, { slug: slugParam } = context.params || {};

  if (!slugParam && req.method === "GET") {
    const regs = await listarRegistros();
    const filas = await Promise.all(regs.map(async (r) => {
      const c = (await contenidoStore().get(r.slug, { type: "json" }))?.contenido;
      const { blobs } = await inscStore().list({ prefix: r.slug + "/" });
      return { slug: r.slug, estado: r.estado, creado: r.creado, creadoPor: r.creadoPor, nombre: c?.nombre?.es || r.slug, inicio: c?.inicio || null, admins: r.admins.map((a) => ({ email: a.email, rol: a.rol })), inscripciones: blobs.length };
    }));
    return json(filas.sort((a, b) => (b.creado || "").localeCompare(a.creado || "")));
  }

  if (!slugParam && req.method === "POST") {
    const c = await leerJSON(req); if (!c) return error("Solicitud no válida.");
    const nombre = texto(c.nombre, 200), email = correo(c.email);
    if (!nombre) return error("Indique el nombre del evento.");
    if (!emailValido(email)) return error("Indique el correo del administrador interino.");
    let slug; try { slug = validarSlug(c.slug || slugDe(nombre)); } catch (e) { return error(e.message); }
    if (await leerRegistro(slug)) return error(`Ya existe un evento con la dirección «${slug}».`, 409);
    const ahora = new Date().toISOString();
    const reg = { slug, estado: "borrador", creado: ahora, creadoPor: admin, admins: [{ email, rol: "responsable", agregado: ahora, agregadoPor: admin }] };
    await contenidoStore().setJSON(slug, { contenido: contenidoInicial(nombre), actualizado: ahora, actualizadoPor: admin });
    await registroStore().setJSON(slug, reg);
    const invitacion = await invitarAdmin({ origen, slug, nombre, email, rol: "responsable", por: admin });
    return json({ slug, estado: reg.estado, nombre, admins: reg.admins, invitacion }, 201);
  }

  const reg = slugParam ? await leerRegistro(slugParam) : null;
  if (!reg) return error("El evento no existe.", 404);
  if (req.method === "PATCH") {
    const c = await leerJSON(req); if (!c) return error("Solicitud no válida.");
    let invitacion = null;
    if (c.estado !== undefined) { if (!["publicado", "borrador"].includes(c.estado)) return error("Estado no válido."); reg.estado = c.estado; }
    const nombre = (await contenidoStore().get(reg.slug, { type: "json" }))?.contenido?.nombre?.es || reg.slug;
    if (c.responsable !== undefined) {
      const email = correo(c.responsable);
      if (!emailValido(email)) return error("Correo del responsable no válido.");
      reg.admins.forEach((a) => { if (a.rol === "responsable") a.rol = "colaborador"; });
      const ya = reg.admins.find((a) => a.email === email);
      if (ya) ya.rol = "responsable"; else reg.admins.push({ email, rol: "responsable", agregado: new Date().toISOString(), agregadoPor: admin });
      invitacion = await invitarAdmin({ origen, slug: reg.slug, nombre, email, rol: "responsable", por: admin });
    }
    if (c.reenviar) { const r = reg.admins.find((a) => a.rol === "responsable"); if (r) invitacion = await invitarAdmin({ origen, slug: reg.slug, nombre, email: r.email, rol: "responsable", por: admin }); }
    await registroStore().setJSON(reg.slug, reg);
    return json({ slug: reg.slug, estado: reg.estado, admins: reg.admins.map((a) => ({ email: a.email, rol: a.rol })), invitacion });
  }
  if (req.method === "DELETE") {
    const c = await leerJSON(req);
    if (c?.confirmar !== reg.slug) return error("Para eliminar el evento, confirme escribiendo su dirección.");
    const s = inscStore(), { blobs } = await s.list({ prefix: reg.slug + "/" });
    await Promise.all(blobs.map((b) => s.delete(b.key)));
    await contenidoStore().delete(reg.slug); await registroStore().delete(reg.slug);
    return json({ ok: true });
  }
  return error("Método no permitido.", 405);
};
export const config = { path: ["/api/admin/paginas-evento", "/api/admin/paginas-evento/:slug"] };
