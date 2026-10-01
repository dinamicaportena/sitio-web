// Correos del sitio enviados con Gmail:
//   1) invitación al expositor, enviada desde el panel;
//   2) aviso a los organizadores cuando un expositor completa o corrige los datos de su charla.
// Variables de entorno en Netlify:
//   GMAIL_USER          cuenta con la que se inicia sesión en Gmail (la que genera la contraseña de aplicación)
//   GMAIL_APP_PASSWORD  contraseña de aplicación de esa cuenta (secreta)
//   GMAIL_FROM          dirección que aparece como remitente (opcional; debe estar configurada como
//                       «Enviar como» en la cuenta GMAIL_USER), p. ej. dinamica.portena@pucv.cl
//   AVISO_EMAILS        destinatarios de los avisos, separados por comas (opcional; por defecto, ADMIN_EMAILS)
import nodemailer from "nodemailer";
import { fechaLarga } from "./comun.mjs";

const leer = (n) => process.env[n] ?? globalThis.Netlify?.env?.get?.(n);
export const correoConfigurado = () => leer("CORREO_MODO") === "prueba" || Boolean(leer("GMAIL_USER") && leer("GMAIL_APP_PASSWORD"));

export function crearTransporte(pool = false) {
  if (leer("CORREO_MODO") === "prueba") {            // solo para pruebas locales: no envía, registra los mensajes
    const t = nodemailer.createTransport({ jsonTransport: true });
    return { sendMail: async (m) => { (globalThis.__correos ||= []).push(m); return t.sendMail(m); }, close() {} };
  }
  const usuario = leer("GMAIL_USER"), clave = leer("GMAIL_APP_PASSWORD");
  if (!usuario || !clave) throw new Error("El envío de correos no está configurado (faltan GMAIL_USER o GMAIL_APP_PASSWORD).");
  return nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true, pool, maxConnections: 1,
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000,
    auth: { user: usuario, pass: clave.replace(/\s+/g, "") },
  });
}
export const remitente = () => `"Seminario Dinámica Porteña" <${leer("GMAIL_FROM") || leer("GMAIL_USER") || "prueba@localhost"}>`;

export async function enviar({ para, copia, asunto, texto, html, adjuntos, cabeceras, responderA }, transporte) {
  const t = transporte || crearTransporte();
  await t.sendMail({
    from: remitente(), to: para, ...(copia ? { cc: copia } : {}), subject: asunto, text: texto, ...(html ? { html } : {}),
    ...(adjuntos?.length ? { attachments: adjuntos } : {}), ...(cabeceras ? { headers: cabeceras } : {}),
    ...(responderA ? { replyTo: responderA } : {}),
  });
}

// Texto de la invitación (el mismo que se muestra en el panel para copiar)
export function textoInvitacion(c, enlace, idioma) {
  if (idioma === "en") return {
    asunto: `Invitation: Dinámica Porteña Seminar — ${fechaLarga(c.fecha, "", "en")}`,
    texto:
`Dear ${c.expositor},

Thank you very much for agreeing to give a talk at the Dinámica Porteña Seminar. Your talk is tentatively scheduled for ${fechaLarga(c.fecha, c.hora, "en")}, in ${c.sala}.

To prepare the announcement, we kindly ask you to provide the title, abstract, your affiliation and, optionally, a photo, using the following link:

${enlace}

LaTeX formulas between $…$ are supported in the abstract.

Best regards,
Dinámica Porteña Seminar` };
  return {
    asunto: `Invitación: Seminario Dinámica Porteña — ${fechaLarga(c.fecha, "", "es")}`,
    texto:
`Estimado/a ${c.expositor}:

Muchas gracias por aceptar dar una charla en el Seminario Dinámica Porteña. En principio, su charla está programada para el ${fechaLarga(c.fecha, c.hora, "es")}, en ${c.sala}.

Para preparar el anuncio, le pedimos completar el título, el resumen, su institución y, si lo desea, una foto, en el siguiente enlace:

${enlace}

El resumen admite fórmulas en LaTeX entre signos $…$.

Saludos cordiales,
Seminario Dinámica Porteña` };
}

export async function enviarInvitacion(c, enlace, idioma, responderA) {
  const { asunto, texto } = textoInvitacion(c, enlace, idioma);
  await enviar({ para: c.email, asunto, texto, responderA });
}

export async function avisarEnvioExpositor(c, { origen, correccion }) {
  const destinatarios = (leer("AVISO_EMAILS") || leer("ADMIN_EMAILS") || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!correoConfigurado() || !destinatarios.length) return;
  const accion = correccion ? "corrigió" : "completó";
  await enviar({
    para: destinatarios.join(", "),
    asunto: `[Dinámica Porteña] ${c.expositor} ${accion} los datos de su charla (${c.fecha})`,
    texto:
`${c.expositor} ${accion} los datos de su charla en el Seminario Dinámica Porteña.

Fecha: ${fechaLarga(c.fecha, c.hora, "es")}
Sala: ${c.sala}
Institución: ${c.institucion}
Título: ${c.titulo}

Resumen:
${c.resumen}

La charla quedó como «Pendiente de revisión». Para revisarla y publicarla, ingrese al panel:
${origen}/admin/

Este es un aviso automático del sitio del seminario.`,
  });
}

// Aviso de cancelación o reprogramación: a la lista de suscriptores (en cola) y al expositor (directo).
export async function textoCambio(c, tipo, anterior, idioma) {
  const { leerPlantillas, rellenar } = await import("./plantillas.mjs");
  const { textos, datos } = await leerPlantillas();
  const en = idioma === "en" ? "en" : "es", t = textos[tipo][en];
  const vars = { fecha: fechaLarga(c.fecha, c.hora, en), fecha_anterior: fechaLarga(anterior.fecha, anterior.hora, en), sala: c.sala,
                 titulo: c.titulo || "", expositor: c.expositor, institucion: c.institucion || "", web: datos.web, email: datos.email };
  if (tipo === "cancelada") vars.fecha = vars.fecha_anterior;
  return { asunto: rellenar(t.asunto, vars), texto: rellenar(t.cuerpo, vars) };
}

export async function avisarCambio(c, tipo, anterior, responderA, origen) {
  if (!correoConfigurado()) return { expositor: false, lista: 0, motivo: "El envío de correos no está configurado." };
  const { correosActivos } = await import("./suscriptores.mjs");
  const { encolarEnvio } = await import("./envios.mjs");
  const idioma = c.idioma || "es";
  const { asunto, texto } = await textoCambio(c, tipo, anterior, idioma);
  let expositor = false, error = null;
  if (c.email) { try { await enviar({ para: c.email, asunto, texto, responderA }); expositor = true; } catch (e) { error = e.message; } }
  const lista = (await correosActivos()).filter((x) => x !== c.email);
  if (lista.length) await encolarEnvio({ tipo, idioma, asunto, texto, destinatarios: lista, charlas: [c.id] }, origen);
  return { expositor, lista: lista.length, motivo: error ? "No se pudo avisar al expositor: " + error : null };
}
