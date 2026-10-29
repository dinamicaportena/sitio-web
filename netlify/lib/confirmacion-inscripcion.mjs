// Correo de confirmación que recibe cada persona al inscribirse en una página de evento (en el idioma del formulario).
// Incluye solo los párrafos que le corresponden: propuesta de charla/póster (o enlace personal para completar el título y
// el resumen), solicitud de beca y apoyo con la inscripción voluntaria. Se desactiva en el panel (casilla
// «No enviar correo de confirmación»). Si el correo no está configurado o falla, la inscripción igual queda registrada.
import { enviar, correoConfigurado } from "./correo.mjs";
import { fechasTexto, htmlCorreoEvento, cabeceraCorreoEvento, origenPublico, enlaceCompletar, correo as normalizar } from "./ev.mjs";
import { emailValido } from "./comun.mjs";

const tr = (v, l) => (v == null ? "" : typeof v === "string" ? v : v[l] || v.es || v.en || "");
const MESES = { es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] };
const dia = (f, l) => { const [a, m, d] = f.split("-").map(Number); return l === "en" ? `${MESES.en[m - 1]} ${d}, ${a}` : `${d} de ${MESES.es[m - 1]} de ${a}`; };
const NIVEL = {
  es: { investigador: "Investigador/a o profesor/a", postdoc: "Postdoctorado", doctorado: "Estudiante de doctorado", magister: "Estudiante de magíster", pregrado: "Estudiante de pregrado", otro: "Otra" },
  en: { investigador: "Researcher or faculty", postdoc: "Postdoc", doctorado: "PhD student", magister: "Master's student", pregrado: "Undergraduate student", otro: "Other" },
};
const PRES = { es: { charla: "charla", poster: "póster" }, en: { charla: "talk", poster: "poster" } };

export function textoConfirmacion(i, c, slug, origen) {
  const l = i.idioma === "en" ? "en" : "es", ins = c.inscripcion || {}, nombreEv = tr(c.nombre, l) || slug;
  const fechas = fechasTexto(c.inicio, c.fin, l === "en"), lugar = tr(c.lugar, l);
  const pagina = `${origenPublico(origen)}/${slug}/${l === "en" ? "en" : ""}`;
  const p = [];
  if (l === "en") {
    p.push(`Dear ${i.nombre},`);
    p.push(`We have received your registration for ${nombreEv}${fechas ? `, which will take place ${fechas}` : ""}${lugar ? ` at ${lugar}` : ""}.`);
    p.push(`Registered data: ${i.nombre} · ${i.institucion}, ${i.pais} · ${NIVEL.en[i.nivel] || i.nivel}.`);
    if (i.tipoPresentacion) {
      const t = PRES.en[i.tipoPresentacion] || i.tipoPresentacion;
      if (i.tituloCharla && i.resumen) p.push(`Proposed ${t}: "${i.tituloCharla}".`);
      else p.push(`To complete your ${t} proposal, please add the title and abstract ${ins.plazoResumen ? `by ${dia(ins.plazoResumen, "en")}` : "later"} at this personal link: ${enlaceCompletar(origen, slug, i.id, "en")}`);
    }
    if (i.beca === "si") p.push(`We have recorded your grant application, supported by ${i.patrocinador?.nombre || "your professor"}. Grants will be awarded subject to availability; results will be announced ${ins.resultadoBecas ? `on ${dia(ins.resultadoBecas, "en")}` : "on a date to be confirmed"}.`);
    if (i.aporte === "si") p.push("Thank you for your willingness to support student participation through the voluntary registration fee. We will send you information on the amount and payment method later.");
    p.push(`Information about the colloquium (programme, speakers, how to get there) will be updated at ${pagina}. If you need to correct any data, please reply to this email.`);
    p.push(`Best regards,\nOrganizing Committee\n${nombreEv}`);
    return { asunto: `Registration received — ${nombreEv}`, texto: p.join("\n\n") };
  }
  p.push(`Estimado/a ${i.nombre}:`);
  p.push(`Hemos recibido su inscripción en «${nombreEv}»${fechas ? `, que se realizará ${fechas}` : ""}${lugar ? ` en ${lugar}` : ""}.`);
  p.push(`Datos registrados: ${i.nombre} · ${i.institucion}, ${i.pais} · ${NIVEL.es[i.nivel] || i.nivel}.`);
  if (i.tipoPresentacion) {
    const t = PRES.es[i.tipoPresentacion] || i.tipoPresentacion;
    if (i.tituloCharla && i.resumen) p.push(`Propuesta de ${t}: «${i.tituloCharla}».`);
    else p.push(`Para completar su propuesta de ${t}, le pedimos agregar el título y el resumen ${ins.plazoResumen ? `antes del ${dia(ins.plazoResumen, "es")}` : "más adelante"} en este enlace personal: ${enlaceCompletar(origen, slug, i.id, "es")}`);
  }
  if (i.beca === "si") p.push(`Hemos registrado su solicitud de beca, patrocinada por ${i.patrocinador?.nombre || "su profesor/a"}. Las becas se asignarán según disponibilidad; comunicaremos los resultados ${ins.resultadoBecas ? `el ${dia(ins.resultadoBecas, "es")}` : "en una fecha por confirmar"}.`);
  if (i.aporte === "si") p.push("Le agradecemos su disposición a apoyar la participación de estudiantes mediante la inscripción voluntaria. Más adelante le enviaremos información con el monto y la forma de pago.");
  p.push(`La información del coloquio (programa, conferencistas, cómo llegar) se irá actualizando en ${pagina}. Si necesita corregir algún dato, responda a este correo.`);
  p.push(`Saludos cordiales,\nComité Organizador\n${nombreEv}`);
  return { asunto: `Inscripción recibida — ${nombreEv}`, texto: p.join("\n\n") };
}

export async function enviarConfirmacion(i, c, slug, origen) {
  if (!correoConfigurado() || c?.inscripcion?.sinConfirmacion === true) return false;
  const { asunto, texto } = textoConfirmacion(i, c, slug, origen);
  const contacto = normalizar(c.contacto?.email), cab = cabeceraCorreoEvento(c, origenPublico(origen));
  await enviar({ para: i.email, asunto, texto, html: cab ? htmlCorreoEvento(texto, cab) : undefined,
                 responderA: emailValido(contacto) ? contacto : undefined, remitenteNombre: `${tr(c.nombre, "es") || slug} · Dinámica Porteña` });
  return true;
}
