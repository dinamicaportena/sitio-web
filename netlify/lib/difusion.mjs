// Difusión de cada sesión (un día con una o más charlas): aprobación, anuncio y recordatorio a la lista.
//
// Reglas acordadas:
//  · Los envíos de una sesión quedan programados solo cuando el administrador pulsa «Aprobar envíos».
//  · Anuncio: el lunes de la misma semana si la sesión es un viernes; en otro caso, 5 días hábiles antes
//    (sin sábados ni domingos). Se envía a la hora de la revisión diaria de ese día, o de inmediato si al aprobar ya pasó.
//  · Recordatorio: el mismo día de la sesión, a la hora de la revisión diaria.
//  · Si el anuncio sale el mismo día de la sesión, no se envía además el recordatorio (un solo correo).
import { almacen, nuevoId, fechaLarga, hoyChile, tomarTurno, soltarTurno } from "./comun.mjs";
import { charlasDelDia, idiomaDelDia, materialesDelDia } from "./sesiones.mjs";
import { leerPlantillas, rellenar, configuracionDocumentos } from "./plantillas.mjs";
import { correosActivos } from "./suscriptores.mjs";
import { encolarEnvio } from "./envios.mjs";
import { enviar, correoConfigurado } from "./correo.mjs";
import { esc } from "./composicion.mjs";

const tienda = () => almacen("sesiones");
const materiales = () => almacen("materiales");
// Hora de la revisión diaria (configurable en el panel, pestaña «Suscriptores»); por defecto 08:00
export async function horaEnvio() {
  const h = (await leerPlantillas()).datos.horaEnvio;
  return /^([01]\d|2[0-3]):00$/.test(h || "") ? h : "08:00";
}

export const horaChile = () => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
const sumarDias = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaSemana = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();   // 0 domingo … 5 viernes

export function fechaAnuncio(fecha) {
  if (diaSemana(fecha) === 5) return sumarDias(fecha, -4);            // viernes → lunes de esa semana
  let d = fecha, habiles = 0;
  while (habiles < 5) { d = sumarDias(d, -1); const w = diaSemana(d); if (w !== 0 && w !== 6) habiles++; }
  return d;
}

export async function leerSesion(fecha) {
  return (await tienda().get(fecha, { type: "json" })) || { fecha, aprobada: false, envios: {} };
}
export const guardarSesion = (s) => tienda().setJSON(s.fecha, s);
export async function listarSesiones() {
  const { blobs } = await tienda().list();
  return (await Promise.all(blobs.map((b) => tienda().get(b.key, { type: "json" })))).filter(Boolean);
}

// Estado legible para el panel
export async function estadoSesion(fecha) {
  const s = await leerSesion(fecha), charlas = await charlasDelDia(fecha);
  return { fecha, aprobada: s.aprobada, aprobadaPor: s.aprobadaPor || null, aprobadaEl: s.aprobadaEl || null,
           fechaAnuncio: fechaAnuncio(fecha), horaEnvio: await horaEnvio(), envios: s.envios || {}, charlas: charlas.length,
           suscriptores: (await correosActivos()).length, correo: correoConfigurado() };
}

// Texto y HTML del correo (anuncio o recordatorio) para una sesión
async function componerCorreo(tipo, charlas, idioma, cid) {
  const { textos, datos } = await leerPlantillas();
  const t = textos[tipo][idioma], hrs = idioma === "en" ? "h" : "hrs";
  const lista = charlas.map((c) => `• ${c.hora} ${hrs} — ${c.expositor}${c.institucion ? ` (${c.institucion})` : ""}: ${idioma === "en" ? "“" : "«"}${c.titulo}${idioma === "en" ? "”" : "»"}`).join("\n");
  const vars = { fecha: fechaLarga(charlas[0].fecha, "", idioma), sala: charlas[0].sala, charlas: lista, web: datos.web, email: datos.email,
                 expositor: charlas.map((c) => c.expositor).join(", "), titulo: charlas.map((c) => c.titulo).join(" / "), institucion: "" };
  const asunto = rellenar(t.asunto, vars), texto = rellenar(t.cuerpo, vars);
  // HTML: los mismos párrafos, con el anuncio incrustado después del primer párrafo de contenido
  const parrafos = texto.split(/\n\s*\n/).map((p) => `<p style="margin:0 0 14px;font:15px/1.5 Arial,Helvetica,sans-serif;color:#26292c">${esc(p).replace(/\n/g, "<br>")}</p>`);
  const alt = esc(`${vars.fecha}, ${vars.sala}. ` + charlas.map((c) => `${c.hora} ${hrs}: ${c.expositor}, ${c.titulo}`).join(". "));
  const img = `<p style="margin:0 0 16px"><img src="cid:${cid}" alt="${alt}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></p>`;
  parrafos.splice(Math.min(2, parrafos.length), 0, img);
  const html = `<div style="max-width:640px">${parrafos.join("")}</div>`;
  return { asunto, texto, html };
}

// Genera los materiales, los guarda y encola el envío a la lista (o envía una prueba a un solo correo)
export async function enviarDifusion(fecha, tipo, origen, opciones = {}) {
  if (opciones.prueba) return componerYEnviar(fecha, tipo, origen, opciones);
  // Un solo envío a la vez por sesión y tipo: evita anuncios duplicados (doble clic, o aprobación simultánea con la revisión diaria)
  const clave = `difusion/${fecha}/${tipo}`, turno = await tomarTurno(clave, 10 * 60 * 1000);
  if (!turno) return { ok: false, motivo: "Ya hay un envío de este correo en preparación; espere un momento y revise el estado." };
  try {
    if (opciones.soloSiFalta && (await leerSesion(fecha)).envios?.[tipo]) return { ok: true, total: 0, motivo: "Ya se había enviado." };
    return await componerYEnviar(fecha, tipo, origen, opciones);
  } finally { await soltarTurno(clave, turno); }
}
async function componerYEnviar(fecha, tipo, origen, { prueba = null, responderA = null } = {}) {
  const charlas = await charlasDelDia(fecha);
  if (!charlas.length) return { ok: false, motivo: "No hay charlas publicadas vigentes en esa fecha." };
  if (!correoConfigurado()) return { ok: false, motivo: "El envío de correos no está configurado." };
  const cfg = await configuracionDocumentos(), idioma = idiomaDelDia(charlas);
  const [anuncio, afiche] = await Promise.all([materialesDelDia(fecha, "anuncio", cfg), materialesDelDia(fecha, "afiche", cfg)]);
  const cid = "anuncio-" + fecha;
  const correo = await componerCorreo(tipo, charlas, idioma, cid);
  if (prueba) {
    await enviar({ para: prueba, asunto: "[PRUEBA] " + correo.asunto, texto: correo.texto, html: correo.html,
                   adjuntos: [{ filename: anuncio.nombre, contentType: anuncio.tipo, content: anuncio.datos, cid },
                              { filename: afiche.nombre, contentType: afiche.tipo, content: afiche.datos }] });
    return { ok: true, prueba };
  }
  const base = `${fecha}/${tipo}-${nuevoId()}`;
  await materiales().set(base + "-anuncio", anuncio.datos.buffer.slice(anuncio.datos.byteOffset, anuncio.datos.byteOffset + anuncio.datos.length));
  await materiales().set(base + "-afiche", afiche.datos.buffer.slice(afiche.datos.byteOffset, afiche.datos.byteOffset + afiche.datos.length));
  const destinatarios = await correosActivos();
  const trabajo = destinatarios.length ? await encolarEnvio({ tipo, idioma, asunto: correo.asunto, texto: correo.texto, html: correo.html,
    adjuntos: [{ nombre: anuncio.nombre, tipo: anuncio.tipo, clave: base + "-anuncio", cid }, { nombre: afiche.nombre, tipo: afiche.tipo, clave: base + "-afiche" }],
    destinatarios, sesion: fecha, charlas: charlas.map((c) => c.id) }, origen) : null;
  const s = await leerSesion(fecha);
  s.envios = { ...(s.envios || {}), [tipo]: { enviado: new Date().toISOString(), trabajo: trabajo?.id || null, total: destinatarios.length } };
  if (tipo === "anuncio" && fecha === hoyChile()) s.envios.recordatorio = { omitido: "anuncio enviado el mismo día de la sesión", el: new Date().toISOString() };
  await guardarSesion(s);
  return { ok: true, total: destinatarios.length, motivo: destinatarios.length ? null : "La lista de suscriptores está vacía." };
}

// Revisa una sesión aprobada y envía lo que corresponda a esta hora (lo usan la aprobación y la revisión diaria)
export async function procesarSesion(fecha, origen) {
  const s = await leerSesion(fecha), hoy = hoyChile(), ya = horaChile() >= (await horaEnvio()), hechos = [];
  if (!s.aprobada || fecha < hoy) return hechos;
  if (!(await charlasDelDia(fecha)).length) return hechos;          // sesión sin charlas vigentes (canceladas o movidas)
  const debidoAnuncio = hoy > fechaAnuncio(fecha) || (hoy === fechaAnuncio(fecha) && ya) || (fecha === hoy && ya);
  if (!s.envios?.anuncio && debidoAnuncio) { hechos.push(["anuncio", await enviarDifusion(fecha, "anuncio", origen, { soloSiFalta: true })]); }
  else if (fecha === hoy && ya && s.envios?.anuncio && !s.envios?.recordatorio) { hechos.push(["recordatorio", await enviarDifusion(fecha, "recordatorio", origen, { soloSiFalta: true })]); }
  return hechos;
}

export async function aprobarSesion(fecha, admin, origen) {
  const s = await leerSesion(fecha);
  s.aprobada = true; s.aprobadaPor = admin; s.aprobadaEl = new Date().toISOString();
  await guardarSesion(s);
  return procesarSesion(fecha, origen);
}
export async function anularAprobacion(fecha) {
  const s = await leerSesion(fecha);
  s.aprobada = false; await guardarSesion(s);
}
// Al reprogramar: la nueva fecha hereda la aprobación y reinicia su ciclo de anuncio
export async function trasladarAprobacion(fechaAnterior, fechaNueva, admin, origen) {
  const antes = await leerSesion(fechaAnterior);
  if (!antes.aprobada) return [];
  const nueva = await leerSesion(fechaNueva);
  nueva.aprobada = true; nueva.aprobadaPor = admin; nueva.aprobadaEl = new Date().toISOString(); nueva.envios = {};
  await guardarSesion(nueva);
  return procesarSesion(fechaNueva, origen);
}
