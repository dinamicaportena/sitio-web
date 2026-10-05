// Correos escritos desde los paneles (central y de cada evento). Todos salen por el sistema de envíos del sitio
// (cola «envios» y trabajador en segundo plano), desde la cuenta de Dinámica Porteña:
//   - «lista»: la lista de divulgación de Dinámica Porteña (suscritos activos, cada uno con su enlace de baja).
//     Desde el panel de un evento queda «por aprobar» hasta que un administrador central lo apruebe.
//   - «inscritos»: los inscritos de una página de evento (según su estado), con un pie que explica por qué lo reciben.
//   - «correos»: direcciones puntuales (solo panel central).
import { almacen, nuevoId, texto, emailValido, tomarTurno, soltarTurno } from "./comun.mjs";
import { encolarEnvio } from "./envios.mjs";
import { correosActivos, interpretar } from "./suscriptores.mjs";
import { enviar, correoConfigurado } from "./correo.mjs";
import { leerPlantillas, firmaCorreos } from "./plantillas.mjs";
import { contenidoStore, inscStore, correo as normalizarCorreo } from "./ev.mjs";

export const mensajesStore = () => almacen("mensajes");
const ESTADOS_INSC = ["aprobada", "pendiente", "rechazada"];
const leer = (n) => process.env[n] ?? globalThis.Netlify?.env?.get?.(n);
export const correosAviso = () => (leer("AVISO_EMAILS") || leer("ADMIN_EMAILS") || "").split(",").map((x) => x.trim()).filter(Boolean);

// ---------- Texto → HTML (párrafos y enlaces) ----------
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function htmlDeTexto(cuerpo) {
  const enlazar = (s) => escHtml(s).replace(/\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)»]/g, (u) => `<a href="${u}" style="color:#1a4269">${u}</a>`);
  const parrafos = String(cuerpo).split(/\n\s*\n/).map((p) => `<p style="margin:0 0 14px;font:15px/1.5 Arial,Helvetica,sans-serif;color:#26292c">${enlazar(p).replace(/\n/g, "<br>")}</p>`);
  return `<div style="max-width:640px">${parrafos.join("")}</div>`;
}

// ---------- Validación ----------
export function limpiarMensaje(c, { permitidos }) {
  const asunto = texto(c?.asunto, 200).replace(/\s+/g, " "), cuerpo = texto(c?.cuerpo, 20000), idioma = c?.idioma === "en" ? "en" : "es";
  if (!asunto) throw new Error("Escriba el asunto.");
  if (!cuerpo) throw new Error("Escriba el texto del correo.");
  const d = c?.destino || {}, tipo = d.tipo;
  if (!permitidos.includes(tipo)) throw new Error("Destinatarios no válidos.");
  const destino = { tipo };
  if (tipo === "inscritos") {
    destino.slug = texto(d.slug, 60);
    destino.estados = (Array.isArray(d.estados) ? d.estados : ["aprobada"]).filter((e) => ESTADOS_INSC.includes(e));
    if (!destino.estados.length) throw new Error("Elija al menos un estado de inscripción.");
  }
  if (tipo === "correos") {
    const { validos, invalidos } = interpretar(texto(d.texto, 20000));
    if (invalidos.length) throw new Error(`Correos no reconocidos: ${invalidos.slice(0, 5).join(", ")}${invalidos.length > 5 ? "…" : ""}`);
    destino.correos = [...new Set(validos.map((v) => v.email))].slice(0, 500);
    if (!destino.correos.length) throw new Error("Escriba al menos un correo.");
  }
  return { asunto, cuerpo, idioma, destino, firma: c?.firma !== false };   // firma: casilla «Agregar la firma» (marcada por defecto)
}

// ---------- Destinatarios ----------
const nombreEvento = async (slug) => (await contenidoStore().get(slug, { type: "json" }))?.contenido?.nombre?.es || slug;
async function inscritos(slug, estados) {
  const s = inscStore(), { blobs } = await s.list({ prefix: slug + "/" });
  const todas = (await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))).filter(Boolean);
  return [...new Set(todas.filter((i) => i.email && estados.includes(i.estado)).map((i) => normalizarCorreo(i.email)).filter(emailValido))];
}
export async function destinatarios(destino) {
  if (destino.tipo === "lista") return correosActivos();
  if (destino.tipo === "inscritos") return inscritos(destino.slug, destino.estados);
  if (destino.tipo === "correos") return destino.correos;
  return [];
}
const NOMBRE_ESTADO = { aprobada: "aprobadas", pendiente: "pendientes", rechazada: "rechazadas" };
export async function describirDestino(destino) {
  if (destino.tipo === "lista") return "Lista de divulgación de Dinámica Porteña";
  if (destino.tipo === "inscritos") return `Inscritos de «${await nombreEvento(destino.slug)}» (${destino.estados.map((e) => NOMBRE_ESTADO[e]).join(", ")})`;
  return `${destino.correos.length} correo(s): ${destino.correos.slice(0, 3).join(", ")}${destino.correos.length > 3 ? "…" : ""}`;
}
// Cantidades para los formularios de los paneles
export async function conteoInscritos(slug) {
  const s = inscStore(), { blobs } = await s.list({ prefix: slug + "/" });
  const todas = (await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))).filter((i) => i?.email);
  return Object.fromEntries(ESTADOS_INSC.map((e) => [e, todas.filter((i) => i.estado === e).length]));
}

// ---------- Pies de los correos personales (los de la lista llevan el pie con enlace de baja que agrega el trabajador) ----------
const PIE = {
  inscritos: { es: (ev) => `\n\n—\nRecibe este correo por estar inscrito/a en «${ev}». Enviado a través del sitio de Dinámica Porteña.`,
               en: (ev) => `\n\n—\nYou receive this email because you registered for "${ev}". Sent through the Dinámica Porteña website.` },
  correos: { es: () => "\n\n—\nEnviado a través del sitio de Dinámica Porteña.", en: () => "\n\n—\nSent through the Dinámica Porteña website." },
};

// ---------- Envío ----------
// m: mensaje ya validado y guardado; encola el envío y devuelve { total }
// Texto del correo con la firma de Dinámica Porteña al final (si se pidió)
async function conFirma(m) {
  if (m.firma === false) return m.cuerpo;
  const f = await firmaCorreos(m.idioma);
  return f ? `${m.cuerpo.replace(/\s+$/, "")}\n\n${f}` : m.cuerpo;
}
export async function despacharMensaje(m, origen) {
  if (!correoConfigurado()) throw new Error("El envío de correos no está configurado.");
  const cuerpo = await conFirma(m);
  const para = await destinatarios(m.destino);
  if (!para.length) throw new Error("No hay destinatarios para este correo.");
  const ev = m.slug ? await nombreEvento(m.slug) : null;
  const remitenteNombre = ev ? `${ev} · Dinámica Porteña` : "Dinámica Porteña";
  const base = { tipo: "mensaje", idioma: m.idioma, asunto: m.asunto, destinatarios: para, remitenteNombre, responderA: m.responderA || undefined, mensaje: m.id };
  let trabajo;
  if (m.destino.tipo === "lista") trabajo = await encolarEnvio({ ...base, texto: cuerpo, html: htmlDeTexto(cuerpo) }, origen);
  else {
    const pie = m.destino.tipo === "inscritos" ? PIE.inscritos[m.idioma](ev || await nombreEvento(m.destino.slug)) : PIE.correos[m.idioma]();
    const personal = { asunto: m.asunto, texto: cuerpo + pie, responderA: m.responderA || undefined };
    trabajo = await encolarEnvio({ ...base, texto: "", porDestinatario: Object.fromEntries(para.map((p) => [p, personal])) }, origen);
  }
  return { total: para.length, trabajo: trabajo.id };
}

// Prueba: el mismo correo solo a quien lo escribe, marcado [PRUEBA]
export async function enviarPrueba(m, a) {
  if (!correoConfigurado()) throw new Error("El envío de correos no está configurado.");
  const ev = m.slug ? await nombreEvento(m.slug) : null;
  const pie = m.destino.tipo === "lista" ? (m.idioma === "en" ? "\n\n—\n(Each subscriber receives here their personal unsubscribe link.)" : "\n\n—\n(Aquí cada suscriptor recibe su enlace personal para darse de baja.)")
    : m.destino.tipo === "inscritos" ? PIE.inscritos[m.idioma](ev || await nombreEvento(m.destino.slug)) : PIE.correos[m.idioma]();
  const cuerpo = await conFirma(m);
  await enviar({ para: a, asunto: "[PRUEBA] " + m.asunto, texto: cuerpo + pie, html: m.destino.tipo === "lista" ? htmlDeTexto(cuerpo + pie) : undefined,
                 responderA: m.responderA || undefined, remitenteNombre: ev ? `${ev} · Dinámica Porteña` : "Dinámica Porteña" });
}

// Crea y, según el caso, envía o deja por aprobar. Devuelve el mensaje guardado.
export async function crearMensaje({ datos, autor, slug = null, origen, porAprobar = false, responderA = null }) {
  const m = { id: nuevoId(), creado: new Date().toISOString(), autor, slug, ...datos, responderA, descripcion: await describirDestino(datos.destino) };
  if (porAprobar) {
    m.estado = "por-aprobar"; m.total = (await destinatarios(m.destino)).length;
    await mensajesStore().setJSON(m.id, m);
    await avisarPorAprobar(m, origen).catch((e) => console.error("Aviso de correo por aprobar:", e.message));
    return m;
  }
  const r = await despacharMensaje(m, origen);
  Object.assign(m, { estado: "enviado", enviado: new Date().toISOString(), total: r.total, trabajo: r.trabajo });
  await mensajesStore().setJSON(m.id, m);
  return m;
}

// Aprobación o rechazo (panel central) de un correo a la lista solicitado desde un evento
export async function resolverMensaje(id, { aprobar, admin, motivo, origen }) {
  const turno = await tomarTurno("mensaje/" + id, 5 * 60 * 1000);
  if (!turno) throw new Error("Este correo ya se está procesando.");
  try {
    const m = await mensajesStore().get(id, { type: "json" });
    if (!m) throw new Error("El correo no existe.");
    if (m.estado !== "por-aprobar") throw new Error("Este correo ya fue resuelto.");
    if (aprobar) {
      const r = await despacharMensaje(m, origen);
      Object.assign(m, { estado: "enviado", enviado: new Date().toISOString(), total: r.total, trabajo: r.trabajo, aprobadoPor: admin });
    } else Object.assign(m, { estado: "rechazado", rechazadoPor: admin, rechazado: new Date().toISOString(), motivo: texto(motivo, 500) });
    await mensajesStore().setJSON(m.id, m);
    await avisarResolucion(m, origen).catch((e) => console.error("Aviso de resolución:", e.message));
    return m;
  } finally { await soltarTurno("mensaje/" + id, turno); }
}

export async function listarMensajes({ slug } = {}) {
  const s = mensajesStore(), { blobs } = await s.list();
  const todos = (await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))).filter(Boolean);
  return todos.filter((m) => slug === undefined || m.slug === slug).sort((a, b) => b.creado.localeCompare(a.creado));
}
// Lo que se muestra en los paneles (sin el texto completo en la lista general)
export const resumenMensaje = (m) => ({ id: m.id, creado: m.creado, autor: m.autor, slug: m.slug, asunto: m.asunto, cuerpo: m.cuerpo, idioma: m.idioma,
  destino: m.destino.tipo, descripcion: m.descripcion, estado: m.estado, total: m.total ?? null, enviado: m.enviado || null,
  aprobadoPor: m.aprobadoPor || null, rechazadoPor: m.rechazadoPor || null, motivo: m.motivo || null });

// ---------- Avisos ----------
async function avisarPorAprobar(m, origen) {
  const a = correosAviso(); if (!a.length || !correoConfigurado()) return;
  const ev = await nombreEvento(m.slug);
  await enviar({ para: a.join(", "), asunto: `[Dinámica Porteña] Correo a la lista por aprobar — ${ev}`,
    texto: `${m.autor}, administrador/a de la página del evento «${ev}», pidió enviar un correo a la lista de divulgación de Dinámica Porteña (${m.total} suscriptores).\n\nAsunto: ${m.asunto}\n\n${m.cuerpo}\n\n—\nPara aprobarlo o rechazarlo, ingrese al panel (pestaña «Correos»):\n${origen}/admin/\n\nEste es un aviso automático del sitio.` });
}
async function avisarResolucion(m, origen) {
  if (!m.autor || !correoConfigurado()) return;
  const ev = await nombreEvento(m.slug);
  const t = m.estado === "enviado"
    ? `Su correo «${m.asunto}» a la lista de divulgación de Dinámica Porteña fue aprobado y se está enviando a ${m.total} suscriptores.`
    : `Su correo «${m.asunto}» a la lista de divulgación de Dinámica Porteña no fue aprobado.${m.motivo ? `\n\nMotivo: ${m.motivo}` : ""}`;
  await enviar({ para: m.autor, asunto: `[${ev}] Correo a la lista: ${m.estado === "enviado" ? "aprobado" : "no aprobado"}`,
    texto: `${t}\n\nPanel del evento: ${origen}/${m.slug}/admin/\n\nEste es un aviso automático del sitio de Dinámica Porteña.` });
}

// ---------- Suscripción desde la inscripción a un evento ----------
// Solo personas que no estaban en la lista (no reactiva a quien se dio de baja). Se llama al aprobar la inscripción.
export async function suscribirDesdeEvento({ email, nombre, slug, por }) {
  const { personaPorCorreo, crearPersona, estadoSuscripcion, registrarEvento } = await import("./personas.mjs");
  const ev = await nombreEvento(slug), origen = `Inscripción en «${ev}»`.slice(0, 120);
  let p = await personaPorCorreo(email);
  if (!p) p = await crearPersona({ nombre: nombre || "", correos: [{ email, principal: true }], fuentes: origen }, { por, cambio: "Ficha creada al suscribirse desde un evento" });
  if (estadoSuscripcion(p) !== "sin") return false;
  await registrarEvento(p, { evento: "alta", email, origen, nota: "Lo pidió al inscribirse en el evento" }, por);
  return true;
}
export { normalizarCorreo };
