// Panel de un evento (requiere sesión con permiso sobre ese evento: administrador del evento o administrador central).
//   GET/PUT  /api/evadmin/:slug/contenido        contenido del evento (cualquier administrador)
//   PUT      /api/evadmin/:slug/estado           { estado?: "publicado"|"borrador", enSitio?: boolean } (responsable o central)
//   GET/POST /api/evadmin/:slug/inscripciones    lista / alta manual (ignora plazo y estado)
//   PATCH/DELETE /api/evadmin/:slug/inscripciones/:id
//   GET/POST /api/evadmin/:slug/mensajes        correos a los inscritos (responsable o central) o a la lista de Dinámica Porteña
//                                                (queda por aprobar por un administrador central); { prueba: true } lo envía solo a quien escribe
//   GET/POST/DELETE /api/evadmin/:slug/admins    lista / invitar { email, reenviar? } / quitar { email } (invitar y quitar: responsable o central)
import { json, error, leerJSON, texto, emailValido, sha256, tokenAleatorio } from "../lib/comun.mjs";
import { leerRegistro, registroStore, contenidoStore, inscStore, permiso, puedeAdministrar, validarContenido, validarSlug, correo, invitarAdmin } from "../lib/ev.mjs";
import { limpiarMensaje, crearMensaje, enviarPrueba, listarMensajes, resumenMensaje, conteoInscritos, suscribirDesdeEvento } from "../lib/mensajes.mjs";
import { correosActivos } from "../lib/suscriptores.mjs";

const NIVELES = ["investigador", "postdoc", "doctorado", "magister", "pregrado", "otro"];
const ESTADOS = ["pendiente", "aprobada", "rechazada"];

export default async (req, context) => {
  let slug; try { slug = validarSlug(context.params?.slug); } catch { return error("El evento no existe.", 404); }
  const reg = await leerRegistro(slug);
  if (!reg) return error("El evento no existe.", 404);
  const p = permiso(req, reg);
  if (!p) return error("Debe iniciar sesión con una cuenta autorizada para este evento.", 401);
  const [, , , , recurso, id] = new URL(req.url).pathname.split("/");
  const origen = new URL(req.url).origin, nombreEvento = async () => (await contenidoStore().get(slug, { type: "json" }))?.contenido?.nombre?.es || slug;

  // ---- contenido ----
  if (recurso === "contenido") {
    if (req.method === "GET") { const g = await contenidoStore().get(slug, { type: "json" }); return json({ contenido: g?.contenido || null, actualizado: g?.actualizado || null, actualizadoPor: g?.actualizadoPor || null, estado: reg.estado, enSitio: reg.enSitio === true, rol: p.rol }); }
    if (req.method === "PUT") {
      const c = await leerJSON(req); if (!c) return error("Solicitud no válida.");
      // Control de versiones: si otro administrador guardó después de que este cargó el contenido, se avisa en vez de sobrescribir
      const vigente = await contenidoStore().get(slug, { type: "json" });
      if (!c.forzar && vigente?.actualizado && c.base !== vigente.actualizado)
        return error(`${vigente.actualizadoPor || "Otro administrador"} guardó cambios en este evento después de que usted abrió el panel.`, 409);
      try {
        const contenido = validarContenido(c.contenido), r = { contenido, actualizado: new Date().toISOString(), actualizadoPor: p.email };
        await contenidoStore().setJSON(slug, r); return json({ ok: true, actualizado: r.actualizado, actualizadoPor: p.email });
      } catch (e) { return error(e.message); }
    }
  }

  // ---- publicar / volver a borrador / mostrar en la pestaña Eventos del sitio ----
  if (recurso === "estado" && req.method === "PUT") {
    if (!puedeAdministrar(p)) return error("Solo el responsable del evento puede cambiar su publicación.", 403);
    const c = await leerJSON(req);
    if (!c || (c.estado === undefined && c.enSitio === undefined)) return error("Solicitud no válida.");
    if (c.estado !== undefined) { if (!["publicado", "borrador"].includes(c.estado)) return error("Estado no válido."); reg.estado = c.estado; }
    if (c.enSitio !== undefined) reg.enSitio = Boolean(c.enSitio);
    await registroStore().setJSON(slug, reg); return json({ ok: true, estado: reg.estado, enSitio: reg.enSitio === true });
  }

  // ---- administradores ----
  if (recurso === "admins") {
    if (req.method === "GET") return json(reg.admins.map((a) => ({ email: a.email, rol: a.rol, agregado: a.agregado, agregadoPor: a.agregadoPor })));
    if (!puedeAdministrar(p)) return error("Solo el responsable del evento puede invitar o quitar administradores.", 403);
    const c = await leerJSON(req); if (!c) return error("Solicitud no válida.");
    const email = correo(c.email);
    if (!emailValido(email)) return error("Ingrese un correo electrónico válido.");
    if (req.method === "POST") {
      let a = reg.admins.find((x) => x.email === email);
      if (a && !c.reenviar) return error("Ese correo ya es administrador de este evento.", 409);
      const nuevo = !a;
      if (nuevo) { a = { email, rol: "colaborador", agregado: new Date().toISOString(), agregadoPor: p.email }; reg.admins.push(a); await registroStore().setJSON(slug, reg); }
      const invitacion = await invitarAdmin({ origen, slug, nombre: await nombreEvento(), email, rol: a.rol, por: p.email });
      return json({ admins: reg.admins, invitacion }, nuevo ? 201 : 200);
    }
    if (req.method === "DELETE") {
      const a = reg.admins.find((x) => x.email === email);
      if (!a) return error("Ese correo no es administrador de este evento.", 404);
      if (a.rol === "responsable") return error("No se puede quitar al responsable del evento; un administrador central puede cambiarlo.", 400);
      reg.admins = reg.admins.filter((x) => x.email !== email); await registroStore().setJSON(slug, reg);
      return json({ admins: reg.admins });
    }
  }

  // ---- correos ----
  if (recurso === "mensajes") {
    if (req.method === "GET") {
      const [mensajes, lista, inscritos] = await Promise.all([listarMensajes({ slug }), correosActivos(), conteoInscritos(slug)]);
      return json({ mensajes: mensajes.map(resumenMensaje), lista: lista.length, inscritos, puedeEnviar: puedeAdministrar(p) });
    }
    if (req.method === "POST") {
      const c = await leerJSON(req); if (!c) return error("Solicitud no válida.");
      try {
        const datos = limpiarMensaje({ ...c, destino: { ...(c.destino || {}), slug } }, { permitidos: ["inscritos", "lista"] });
        const contacto = correo((await contenidoStore().get(slug, { type: "json" }))?.contenido?.contacto?.email);
        const responderA = emailValido(contacto) ? contacto : p.email;      // las respuestas llegan al contacto del evento
        if (c.prueba) { await enviarPrueba({ ...datos, slug, responderA }, p.email); return json({ ok: true, prueba: p.email }); }
        if (!puedeAdministrar(p)) return error("Solo el responsable del evento puede enviar correos; usted puede enviarse una prueba.", 403);
        const m = await crearMensaje({ datos, autor: p.email, slug, origen, responderA, porAprobar: datos.destino.tipo === "lista" && p.rol !== "central" });
        return json(resumenMensaje(m), 201);
      } catch (e) { return error(e.message); }
    }
  }

  // ---- inscripciones ----
  if (recurso === "inscripciones") {
    const s = inscStore();
    if (!id && req.method === "GET") {
      const { blobs } = await s.list({ prefix: slug + "/" });
      const todas = (await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))).filter(Boolean);
      return json(todas.sort((a, b) => (b.creada || "").localeCompare(a.creada || "")));
    }
    if (!id && req.method === "POST") {
      const c = await leerJSON(req); if (!c) return error("Solicitud no válida.");
      const nombre = texto(c.nombre, 120), institucion = texto(c.institucion, 160), pais = texto(c.pais, 80), email = texto(c.email, 160).toLowerCase();
      if (!nombre || !institucion || !pais) return error("Complete nombre, institución y país.");
      if (email && !emailValido(email)) return error("El correo electrónico no es válido.");
      const nuevoId = email ? sha256(email).slice(0, 24) : tokenAleatorio(12);
      if (await s.get(`${slug}/${nuevoId}`, { type: "json" })) return error("Ya existe una inscripción con ese correo.", 409);
      const ahora = new Date().toISOString();
      const ficha = { id: nuevoId, estado: ESTADOS.includes(c.estado) ? c.estado : "aprobada", creada: ahora, actualizada: ahora, nombre, institucion, pais, email,
        nivel: NIVELES.includes(c.nivel) ? c.nivel : "otro", charla: Boolean(c.charla), tituloCharla: texto(c.tituloCharla, 250), observaciones: texto(c.observaciones, 600),
        publicar: Boolean(c.publicar), suscribir: Boolean(c.suscribir) && Boolean(email), idioma: "es", ingresadaPor: p.email };
      if (ficha.estado === "aprobada" && ficha.suscribir) {
        try { ficha.suscripcion = (await suscribirDesdeEvento({ email, nombre, slug, por: p.email })) ? "suscrita" : "ya estaba o se dio de baja"; }
        catch (e) { console.error("Suscripción desde evento:", e.message); }
      }
      await s.setJSON(`${slug}/${nuevoId}`, ficha); return json(ficha, 201);
    }
    const actual = id ? await s.get(`${slug}/${id}`, { type: "json" }) : null;
    if (!actual) return error("La inscripción no existe.", 404);
    if (req.method === "PATCH") {
      const c = await leerJSON(req); if (!c) return error("Solicitud no válida.");
      const nueva = { ...actual };
      if (c.estado !== undefined) { if (!ESTADOS.includes(c.estado)) return error("Estado no válido."); nueva.estado = c.estado; }
      // quien pidió suscribirse a la lista de Dinámica Porteña queda suscrito al aprobarse su inscripción
      if (nueva.estado === "aprobada" && nueva.suscribir && !nueva.suscripcion) {
        try { nueva.suscripcion = (await suscribirDesdeEvento({ email: nueva.email, nombre: nueva.nombre, slug, por: p.email })) ? "suscrita" : "ya estaba o se dio de baja"; }
        catch (e) { console.error("Suscripción desde evento:", e.message); }
      }
      if (c.publicar !== undefined) nueva.publicar = Boolean(c.publicar);
      if (c.nota !== undefined) nueva.nota = texto(c.nota, 500);
      nueva.revisadaPor = p.email; nueva.revisada = new Date().toISOString();
      await s.setJSON(`${slug}/${id}`, nueva); return json(nueva);
    }
    if (req.method === "DELETE") { await s.delete(`${slug}/${id}`); return json({ ok: true }); }
  }
  return error("Ruta o método no permitido.", 404);
};
export const config = { path: ["/api/evadmin/:slug/contenido", "/api/evadmin/:slug/estado", "/api/evadmin/:slug/admins", "/api/evadmin/:slug/mensajes", "/api/evadmin/:slug/inscripciones", "/api/evadmin/:slug/inscripciones/:id"] };
