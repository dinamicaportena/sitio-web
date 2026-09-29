// Gestión de charlas desde el panel (requiere sesión de administrador).
//   GET    /api/admin/charlas                 lista todas
//   POST   /api/admin/charlas                 crea
//   PUT    /api/admin/charlas/:id             modifica
//   DELETE /api/admin/charlas/:id             elimina
//   POST   /api/admin/charlas/:id/invitacion  genera (o renueva) el enlace para el expositor
//   POST   /api/admin/charlas/:id/publicar    publica ({publicar:true}) o retira ({publicar:false})
import {
  json, error, leerJSON, sesion, charlas, invitaciones, listarCharlas, paraPanel, texto, fechaValida, horaValida,
  guardarFoto, borrarFoto, nuevoId, tokenAleatorio, sha256, SALA_POR_DEFECTO, DURACION_INVITACION_DIAS, emailValido,
} from "../lib/comun.mjs";
import { textoInvitacion, enviarInvitacion, correoConfigurado } from "../lib/correo.mjs";

function camposDesde(cuerpo, base = {}) {
  const c = { ...base };
  if ("fecha" in cuerpo) c.fecha = texto(cuerpo.fecha, 10);
  if ("hora" in cuerpo) c.hora = texto(cuerpo.hora, 5);
  if ("sala" in cuerpo) c.sala = texto(cuerpo.sala, 120) || SALA_POR_DEFECTO;
  if ("expositor" in cuerpo) c.expositor = texto(cuerpo.expositor, 120);
  if ("institucion" in cuerpo) c.institucion = texto(cuerpo.institucion, 200);
  if ("titulo" in cuerpo) c.titulo = texto(cuerpo.titulo, 300);
  if ("resumen" in cuerpo) c.resumen = texto(cuerpo.resumen, 5000);
  if ("email" in cuerpo) c.email = texto(cuerpo.email, 200).toLowerCase();
  if ("idioma" in cuerpo) c.idioma = cuerpo.idioma === "en" ? "en" : "es";
  return c;
}
function validar(c) {
  if (!fechaValida(c.fecha || "")) return "Indique una fecha válida.";
  if (!horaValida(c.hora || "")) return "Indique una hora válida (HH:MM).";
  if (!c.expositor) return "Indique el nombre del expositor.";
  if (c.email && !emailValido(c.email)) return "El correo del expositor no es válido.";
  return null;
}
async function anularInvitacion(c) {
  if (c.invitacion?.hash) await invitaciones().delete(c.invitacion.hash);
  c.invitacion = null;
}

export default async (req, context) => {
  const email = sesion(req);
  if (!email) return error("Debe iniciar sesión.", 401);

  const almacen = charlas();
  const { id, accion } = context.params || {};
  const ahora = new Date().toISOString();

  // Colección
  if (!id) {
    if (req.method === "GET") return json((await listarCharlas()).map(paraPanel));
    if (req.method === "POST") {
      const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
      const c = camposDesde(cuerpo, { id: nuevoId(), sala: SALA_POR_DEFECTO, institucion: "", titulo: "", resumen: "",
                                      foto: null, estado: "borrador", invitacion: null, creada: ahora, creadaPor: email });
      const problema = validar(c); if (problema) return error(problema);
      if (cuerpo.foto) { try { c.foto = await guardarFoto(cuerpo.foto); } catch (e) { return error(e.message); } }
      c.actualizada = ahora; c.actualizadaPor = email;
      await almacen.setJSON(c.id, c);
      return json(paraPanel(c), 201);
    }
    return error("Método no permitido.", 405);
  }

  const c = await almacen.get(id, { type: "json" });
  if (!c) return error("La charla no existe.", 404);

  if (!accion && req.method === "PUT") {
    const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
    const nueva = camposDesde(cuerpo, c);
    const problema = validar(nueva); if (problema) return error(problema);
    if (cuerpo.foto === null) { await borrarFoto(c.foto); nueva.foto = null; }
    else if (typeof cuerpo.foto === "string" && cuerpo.foto.startsWith("data:")) {
      try { nueva.foto = await guardarFoto(cuerpo.foto); } catch (e) { return error(e.message); }
      await borrarFoto(c.foto);
    }
    nueva.actualizada = ahora; nueva.actualizadaPor = email;
    await almacen.setJSON(id, nueva);
    return json(paraPanel(nueva));
  }

  if (!accion && req.method === "DELETE") {
    await anularInvitacion(c);
    await borrarFoto(c.foto);
    await almacen.delete(id);
    return json({ ok: true });
  }

  if (accion === "invitacion" && req.method === "POST") {
    // {enviar: true} envía la invitación por correo al expositor (requiere su correo y Gmail configurado)
    const cuerpo = (await leerJSON(req)) || {};
    if (c.estado === "publicada") return error("La charla ya está publicada; retírela antes de invitar al expositor.");
    if (cuerpo.enviar) {
      if (!c.email) return error("Indique el correo del expositor para enviarle la invitación.");
      if (!correoConfigurado()) return error("El envío de correos no está configurado en Netlify (GMAIL_USER y GMAIL_APP_PASSWORD).");
    }
    await anularInvitacion(c);
    const token = tokenAleatorio();
    const expira = new Date(Date.now() + DURACION_INVITACION_DIAS * 864e5).toISOString();
    const enlace = `${new URL(req.url).origin}/charla/?invitacion=${token}`;
    c.invitacion = { hash: sha256(token), expira };
    let envio = { enviado: false };
    if (cuerpo.enviar) {
      try {
        await enviarInvitacion(c, enlace, c.idioma || "es", email);
        c.invitacion.enviadaA = c.email; c.invitacion.enviadaEl = ahora;
        envio = { enviado: true, a: c.email };
      } catch (e) {
        envio = { enviado: false, error: "No se pudo enviar el correo: " + e.message };
      }
    }
    if (c.estado === "borrador") c.estado = "invitada";
    c.actualizada = ahora; c.actualizadaPor = email;
    await invitaciones().setJSON(c.invitacion.hash, { charla: id, expira });
    await almacen.setJSON(id, c);
    const textos = { es: textoInvitacion(c, enlace, "es").texto, en: textoInvitacion(c, enlace, "en").texto };
    return json({ enlace, expira, textos, ...envio, charla: paraPanel(c) });
  }

  if (accion === "publicar" && req.method === "POST") {
    const cuerpo = (await leerJSON(req)) || {};
    if (cuerpo.publicar === false) {
      c.estado = "borrador";
    } else {
      if (!c.titulo) return error("La charla necesita un título antes de publicarse.");
      await anularInvitacion(c);
      c.estado = "publicada";
    }
    c.actualizada = ahora; c.actualizadaPor = email;
    await almacen.setJSON(id, c);
    return json(paraPanel(c));
  }

  return error("Ruta o método no permitido.", 405);
};
export const config = { path: ["/api/admin/charlas", "/api/admin/charlas/:id", "/api/admin/charlas/:id/:accion"] };
