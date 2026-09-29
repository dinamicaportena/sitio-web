// Aviso por correo (Gmail) cuando un expositor completa o corrige los datos de su charla.
// Variables de entorno en Netlify:
//   GMAIL_USER          cuenta con la que se inicia sesión en Gmail (la que genera la contraseña de aplicación)
//   GMAIL_FROM          dirección que aparece como remitente (opcional; debe estar configurada como
//                       «Enviar como» en la cuenta GMAIL_USER), p. ej. dinamica.portena@pucv.cl
//   GMAIL_APP_PASSWORD  contraseña de aplicación de esa cuenta (secreta)
//   AVISO_EMAILS        destinatarios separados por comas (opcional; por defecto, ADMIN_EMAILS)
// Si falta alguna variable, el aviso simplemente no se envía y la charla se guarda igual.
import nodemailer from "nodemailer";

const leer = (n) => process.env[n] ?? globalThis.Netlify?.env?.get?.(n);

export async function avisarEnvioExpositor(charla, { origen, correccion }) {
  const usuario = leer("GMAIL_USER"), clave = leer("GMAIL_APP_PASSWORD");
  const destinatarios = (leer("AVISO_EMAILS") || leer("ADMIN_EMAILS") || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!usuario || !clave || !destinatarios.length) return { enviado: false, motivo: "sin configuración" };

  const transporte = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
    auth: { user: usuario, pass: clave.replace(/\s+/g, "") },
  });
  const accion = correccion ? "corrigió" : "completó";
  const asunto = `[Dinámica Porteña] ${charla.expositor} ${accion} los datos de su charla (${charla.fecha})`;
  const texto =
`${charla.expositor} ${accion} los datos de su charla en el Seminario Dinámica Porteña.

Fecha: ${charla.fecha} · ${charla.hora} hrs
Sala: ${charla.sala}
Institución: ${charla.institucion}
Título: ${charla.titulo}

Resumen:
${charla.resumen}

La charla quedó como «Pendiente de revisión». Para revisarla y publicarla, ingrese al panel:
${origen}/admin/

Este es un aviso automático del sitio del seminario.`;

  await transporte.sendMail({
    from: `"Seminario Dinámica Porteña" <${leer("GMAIL_FROM") || usuario}>`,
    to: destinatarios.join(", "),
    subject: asunto,
    text: texto,
  });
  return { enviado: true };
}
