// Gestión de charlas desde el panel (requiere sesión de administrador).
//   GET    /api/admin/charlas                 lista todas
//   POST   /api/admin/charlas                 crea
//   PUT    /api/admin/charlas/:id             modifica
//   DELETE /api/admin/charlas/:id             elimina
//   POST   /api/admin/charlas/:id/invitacion  genera (o renueva) el enlace para el expositor
//   POST   /api/admin/charlas/:id/publicar    publica ({publicar:true}) o retira ({publicar:false})
import {
  json, error, leerJSON, sesion, charlas, invitaciones, listarCharlas, paraPanel, texto, fechaValida, horaValida,
  guardarFoto, borrarFoto, nuevoId, tokenAleatorio, sha256, SALA_POR_DEFECTO, DURACION_INVITACION_DIAS, emailValido, hoyChile,
} from "../lib/comun.mjs";
import { textoInvitacion, enviarInvitacion, correoConfigurado, avisarCambio } from "../lib/correo.mjs";
import { trasladarAprobacion } from "../lib/difusion.mjs";
import { enviarCertificado } from "../lib/certificados.mjs";
import { vincularCharla } from "../lib/vinculos.mjs";

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
  if ("personaId" in cuerpo) c.personaId = /^P\d{4,}$/.test(String(cuerpo.personaId || "")) ? cuerpo.personaId : null;
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
      const vinculo = await vincularCharla(c, { por: email });
      await almacen.setJSON(c.id, c);
      return json({ ...paraPanel(c), vinculo }, 201);
    }
    return error("Método no permitido.", 405);
  }

  const c = await almacen.get(id, { type: "json" });
  if (!c) return error("La charla no existe.", 404);

  if (!accion && req.method === "PUT") {
    const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
    const nueva = camposDesde(cuerpo, c);
    const problema = validar(nueva); if (problema) return error(problema);
    if (c.estado === "publicada" && (nueva.fecha !== c.fecha || nueva.hora !== c.hora))
      return error("Para cambiar la fecha u hora de una charla publicada use «Reprogramar», que avisa a los suscriptores y al expositor.");
    if (cuerpo.foto === null) { await borrarFoto(c.foto); nueva.foto = null; }
    else if (typeof cuerpo.foto === "string" && cuerpo.foto.startsWith("data:")) {
      try { nueva.foto = await guardarFoto(cuerpo.foto); } catch (e) { return error(e.message); }
      await borrarFoto(c.foto);
    }
    nueva.actualizada = ahora; nueva.actualizadaPor = email;
    // vínculo con el registro (salvo que el administrador lo haya quitado a propósito, o sea una charla del archivo histórico)
    const vinculo = nueva.historica || ("personaId" in cuerpo && !nueva.personaId) ? null : await vincularCharla(nueva, { por: email, crear: nueva.estado === "publicada" });
    await almacen.setJSON(id, nueva);
    return json({ ...paraPanel(nueva), vinculo });
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
    if (!c.email) return error("La charla no tiene correo del expositor: agréguelo con «Editar» para poder enviarle la invitación.");
    if (cuerpo.enviar) {
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

  // Cancelación: solo charlas publicadas cuya fecha no ha pasado
  if (accion === "cancelar" && req.method === "POST") {
    if (c.estado !== "publicada") return error("Solo se pueden cancelar charlas publicadas.");
    if (c.cancelada) return error("La charla ya está cancelada.");
    if (c.fecha < hoyChile()) return error("La charla ya se realizó; no puede cancelarse.");
    c.cancelada = { el: ahora, por: email };
    c.actualizada = ahora; c.actualizadaPor = email;
    await almacen.setJSON(id, c);
    const aviso = await avisarCambio(c, "cancelada", { fecha: c.fecha, hora: c.hora }, email, new URL(req.url).origin);
    return json({ charla: paraPanel(c), aviso });
  }

  // Reprogramación: nueva fecha, hora y (opcional) sala; reinicia el ciclo de anuncios
  if (accion === "reprogramar" && req.method === "POST") {
    const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
    if (c.estado !== "publicada") return error("Solo se pueden reprogramar charlas publicadas.");
    if (c.fecha < hoyChile() && !c.cancelada) return error("La charla ya se realizó; no puede reprogramarse.");
    const fecha = texto(cuerpo.fecha, 10), hora = texto(cuerpo.hora, 5), sala = texto(cuerpo.sala, 120) || c.sala;
    if (!fechaValida(fecha) || !horaValida(hora)) return error("Indique una fecha y hora válidas.");
    if (fecha < hoyChile()) return error("La nueva fecha no puede ser anterior a hoy.");
    if (fecha === c.fecha && hora === c.hora && sala === c.sala && !c.cancelada) return error("La fecha, hora y sala son las mismas.");
    const anterior = { fecha: c.fecha, hora: c.hora, sala: c.sala, cancelada: Boolean(c.cancelada), el: ahora, por: email };
    c.reprogramaciones = [...(c.reprogramaciones || []), anterior];
    Object.assign(c, { fecha, hora, sala, cancelada: null, envios: {} });   // envios: se reinicia el ciclo de anuncio
    c.actualizada = ahora; c.actualizadaPor = email;
    await almacen.setJSON(id, c);
    const aviso = await avisarCambio(c, "reprogramada", anterior, email, new URL(req.url).origin);
    // si la sesión original estaba aprobada, la nueva fecha hereda la aprobación y se repite el ciclo de anuncio
    let difusion = [];
    try { difusion = await trasladarAprobacion(anterior.fecha, fecha, email, new URL(req.url).origin); } catch (e) { console.error(e); }
    return json({ charla: paraPanel(c), aviso, difusion });
  }

  // Envío (o reenvío) manual del certificado
  if (accion === "certificado" && req.method === "POST") {
    if (c.estado !== "publicada" || c.cancelada) return error("Solo se emiten certificados de charlas publicadas y no canceladas.");
    if (c.fecha > hoyChile()) return error("La charla aún no se realiza.");
    try { const r = await enviarCertificado(c); return json({ ok: true, ...r }); } catch (e) { return error(e.message); }
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
    // al publicar, la charla queda vinculada a una ficha del registro (existente o nueva)
    const vinculo = c.estado === "publicada" && !c.historica ? await vincularCharla(c, { por: email, crear: true }) : null;
    await almacen.setJSON(id, c);
    return json({ ...paraPanel(c), vinculo });
  }

  return error("Ruta o método no permitido.", 405);
};
export const config = { path: ["/api/admin/charlas", "/api/admin/charlas/:id", "/api/admin/charlas/:id/:accion"] };
