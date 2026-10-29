// Correos escritos desde los paneles (central y de cada evento). Todos salen por el sistema de envíos del sitio
// (cola «envios» y trabajador en segundo plano), desde la cuenta de Dinámica Porteña:
//   - «lista»: la lista de divulgación de Dinámica Porteña (suscritos activos, cada uno con su enlace de baja).
//     Desde el panel de un evento queda «por aprobar» hasta que un administrador central lo apruebe.
//   - «inscritos»: los inscritos de una página de evento (según su estado), con un pie que explica por qué lo reciben.
//   - «cientifico» / «organizador» / «comites» (ambos): los integrantes con correo de los comités de una página de evento
//     (si el evento tiene «un solo comité», las tres opciones son el mismo grupo). A diferencia de los demás, es UN solo
//     correo con todos los integrantes visibles en «Para», para que puedan «Responder a todos»; quien escribe va en copia
//     y como «Responder a».
//   - «correos»: direcciones puntuales (solo panel central).
import { almacen, nuevoId, texto, emailValido, tomarTurno, soltarTurno } from "./comun.mjs";
import { encolarEnvio } from "./envios.mjs";
import { correosActivos, interpretar } from "./suscriptores.mjs";
import { enviar, correoConfigurado } from "./correo.mjs";
import { leerPlantillas, firmaCorreos } from "./plantillas.mjs";
import { contenidoStore, inscStore, correo as normalizarCorreo, pendientesInscripcion, enlaceCompletar } from "./ev.mjs";

export const mensajesStore = () => almacen("mensajes");
const ESTADOS_INSC = ["aprobada", "pendiente", "rechazada"];
export const COMITES = ["cientifico", "organizador", "comites"];
const leer = (n) => process.env[n] ?? globalThis.Netlify?.env?.get?.(n);
export const correosAviso = () => (leer("AVISO_EMAILS") || leer("ADMIN_EMAILS") || "").split(",").map((x) => x.trim()).filter(Boolean);

// ---------- Texto → HTML (párrafos y enlaces; banner opcional como cabecera) ----------
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function htmlDeTexto(cuerpo, { banner } = {}) {
  const enlazar = (s) => escHtml(s).replace(/\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)»]/g, (u) => `<a href="${u}" style="color:#1a4269">${u}</a>`);
  const parrafos = String(cuerpo).split(/\n\s*\n/).map((p) => `<p style="margin:0 0 14px;font:15px/1.5 Arial,Helvetica,sans-serif;color:#26292c">${enlazar(p).replace(/\n/g, "<br>")}</p>`);
  const img = banner ? `<img src="${escHtml(banner)}" alt="" width="640" style="width:100%;max-width:640px;height:auto;display:block;margin:0 0 20px;border:0">` : "";
  return `<div style="max-width:640px">${img}${parrafos.join("")}</div>`;
}

// ---------- Validación ----------
export function limpiarMensaje(c, { permitidos }) {
  const asunto = texto(c?.asunto, 200).replace(/\s+/g, " "), cuerpo = texto(c?.cuerpo, 20000), idioma = c?.idioma === "en" ? "en" : "es";
  if (!asunto) throw new Error("Escriba el asunto.");
  if (!cuerpo) throw new Error("Escriba el texto del correo.");
  const d = c?.destino || {}, tipo = d.tipo;
  if (!permitidos.includes(tipo)) throw new Error("Destinatarios no válidos.");
  const destino = { tipo };
  if (COMITES.includes(tipo)) destino.slug = texto(d.slug, 60);
  if (tipo === "inscritos") {
    destino.slug = texto(d.slug, 60);
    destino.estados = (Array.isArray(d.estados) ? d.estados : ["aprobada"]).filter((e) => ESTADOS_INSC.includes(e));
    if (!destino.estados.length) throw new Error("Elija al menos un estado de inscripción.");
    destino.pendiente = GRUPOS.includes(d.pendiente) ? d.pendiente : "";
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
const contenidoEvento = async (slug) => (await contenidoStore().get(slug, { type: "json" }))?.contenido;
const nombreEvento = async (slug) => (await contenidoEvento(slug))?.nombre?.es || slug;
// Afiche del evento (si tiene uno cargado en «Identidad del evento»): se adjunta en los correos a sus inscritos.
const urlAbs = (ruta, origen) => (/^https?:\/\//.test(ruta) ? ruta : origen + ruta);
async function adjuntoAfiche(slug, nombreEv, origen) {
  const c = await contenidoEvento(slug);
  if (!c?.afiche) return [];
  return [{ nombre: `Afiche - ${nombreEv}.jpg`, tipo: "image/jpeg", url: urlAbs(c.afiche, origen) }];
}
// Cabecera de los correos en HTML: la imagen propia para correos («Cabecera de los correos» en Identidad del evento)
// o, si no hay, el banner de portada del evento.
async function bannerEvento(slug, origen) {
  const c = await contenidoEvento(slug);
  const img = c?.cabeceraCorreo || c?.imagenPortada;
  return img ? urlAbs(img, origen) : null;
}
// Inscripciones que reciben un correo: por estado y, opcionalmente, solo un grupo (campo «pendiente» del destino):
//   "resumen": charla/póster sin título o resumen · "aporte": aún no responde sobre la inscripción voluntaria ·
//   "aporta": respondió que apoyará con la inscripción voluntaria · "beca": estudiantes que solicitan beca
const GRUPOS = ["resumen", "aporte", "aporta", "beca"];
const enGrupo = (i, g, insc) => !g || (g === "aporta" ? i.aporte === "si" : g === "beca" ? i.beca === "si" : pendientesInscripcion(i, insc).includes(g));
async function fichasInscritos(slug, estados, pendiente) {
  const s = inscStore(), { blobs } = await s.list({ prefix: slug + "/" });
  const todas = (await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))).filter(Boolean);
  const insc = (await contenidoEvento(slug))?.inscripcion || {};
  const vistos = new Set();
  return todas.filter((i) => i.email && estados.includes(i.estado) && enGrupo(i, pendiente, insc))
    .filter((i) => { const e = normalizarCorreo(i.email); if (!emailValido(e) || vistos.has(e)) return false; vistos.add(e); return true; });
}
async function inscritos(slug, estados, pendiente) {
  return (await fichasInscritos(slug, estados, pendiente)).map((i) => normalizarCorreo(i.email));
}
// Integrantes con correo de un comité. Con «un solo comité» (comiteUnico), el organizador es el mismo comité científico.
const filasComite = (c, tipo) => tipo === "comites" ? [...(c?.cientifico || []), ...(c?.comiteUnico ? [] : c?.organizadores || [])]
  : ((tipo === "organizador" && !c?.comiteUnico) ? c?.organizadores : c?.cientifico) || [];
async function integrantesComite(slug, tipo) {
  const c = await contenidoEvento(slug);
  return [...new Set(filasComite(c, tipo).map((f) => normalizarCorreo(f?.email)).filter(emailValido))];
}
// Nombre del comité para la descripción y el pie del correo
async function nombreComite(slug, tipo, idioma = "es") {
  const c = await contenidoEvento(slug);
  if (c?.comiteUnico) return idioma === "en" ? "Scientific and Organizing Committee" : "Comité Científico y Organizador";
  if (tipo === "comites") return idioma === "en" ? "Scientific and Organizing Committees" : "Comités Científico y Organizador";
  return tipo === "organizador" ? (idioma === "en" ? "Organizing Committee" : "Comité Organizador") : (idioma === "en" ? "Scientific Committee" : "Comité Científico");
}
export async function conteoComites(slug) {
  const c = await contenidoEvento(slug);
  return { unico: Boolean(c?.comiteUnico), ...Object.fromEntries(await Promise.all(COMITES.map(async (t) => [t, (await integrantesComite(slug, t)).length]))) };
}
export async function destinatarios(destino) {
  if (destino.tipo === "lista") return correosActivos();
  if (COMITES.includes(destino.tipo)) return integrantesComite(destino.slug, destino.tipo);
  if (destino.tipo === "inscritos") return inscritos(destino.slug, destino.estados, destino.pendiente);
  if (destino.tipo === "correos") return destino.correos;
  return [];
}
const DESC_GRUPO = { resumen: "; solo con título o resumen pendiente", aporte: "; solo sin respuesta sobre la inscripción voluntaria",
  aporta: "; solo quienes apoyarán con la inscripción voluntaria", beca: "; solo estudiantes que solicitan beca" };
const NOMBRE_ESTADO = { aprobada: "aprobadas", pendiente: "pendientes", rechazada: "rechazadas" };
export async function describirDestino(destino) {
  if (destino.tipo === "lista") return "Lista de divulgación de Dinámica Porteña";
  if (destino.tipo === "inscritos") return `Inscritos de «${await nombreEvento(destino.slug)}» (${destino.estados.map((e) => NOMBRE_ESTADO[e]).join(", ")}${DESC_GRUPO[destino.pendiente] || ""})`;
  if (COMITES.includes(destino.tipo)) return `${await nombreComite(destino.slug, destino.tipo)} de «${await nombreEvento(destino.slug)}»`;
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
  comite: { es: (ev, com) => `\n\n—\nCorreo a los integrantes ${com.startsWith("Comités") ? "de los" : "del"} ${com} de «${ev}», enviado a través del sitio de Dinámica Porteña. Para que la respuesta llegue a todos, use «Responder a todos».`,
            en: (ev, com) => `\n\n—\nEmail to the members of the ${com} of "${ev}", sent through the Dinámica Porteña website. To reach everyone, use "Reply all".` },
};
// Pie de los correos personales (no lista) según el tipo de destinatarios
async function piePersonal(m, ev) {
  const t = m.destino.tipo, nombreEv = ev || (m.destino.slug ? await nombreEvento(m.destino.slug) : "");
  if (t === "inscritos") return PIE.inscritos[m.idioma](nombreEv);
  if (COMITES.includes(t)) return PIE.comite[m.idioma](nombreEv, await nombreComite(m.destino.slug, t, m.idioma));
  return PIE.correos[m.idioma]();
}

// ---------- Envío ----------
const personalizar = (texto, i, slug, origen) => texto.replace(/\{nombre\}/g, i.nombre || "").replace(/\{enlace\}/g, enlaceCompletar(origen, slug, i.id, i.idioma));
// m: mensaje ya validado y guardado; encola el envío y devuelve { total }
// Texto del correo con la firma de Dinámica Porteña al final (si se pidió)
async function conFirma(m) {
  if (m.firma === false) return m.cuerpo;
  const f = await firmaCorreos(m.idioma);
  return f ? `${m.cuerpo.replace(/\s+$/, "")}\n\n${f}` : m.cuerpo;
}
// Correo a un comité: UN solo mensaje, con todos los integrantes en «Para» (se ven entre sí y pueden responder a todos);
// quien escribe va en copia (si no es integrante) y como «Responder a». Se envía en el momento (grupos pequeños).
async function enviarAComite(m, origen, { prueba = null } = {}) {
  const para = await destinatarios(m.destino);
  if (!para.length) throw new Error("No hay destinatarios para este correo: el comité no tiene integrantes con correo (pestaña Organización).");
  const ev = await nombreEvento(m.destino.slug), banner = await bannerEvento(m.destino.slug, origen);
  const cuerpo = await conFirma(m) + await piePersonal(m, ev);
  const autor = normalizarCorreo(m.autor), copia = autor && !para.includes(autor) ? autor : undefined;
  const nota = prueba ? (m.idioma === "en" ? `[TEST — in the real email: To: ${para.join(", ")}${copia ? `; Cc: ${copia}` : ""}]\n\n` : `[PRUEBA — en el envío real: Para: ${para.join(", ")}${copia ? `; Cc: ${copia}` : ""}]\n\n`) : "";
  await enviar({ para: prueba || para.join(", "), copia: prueba ? undefined : copia, asunto: (prueba ? "[PRUEBA] " : "") + m.asunto,
                 texto: nota + cuerpo, html: banner ? htmlDeTexto(nota + cuerpo, { banner }) : undefined,
                 responderA: autor || m.responderA || undefined, remitenteNombre: `${ev} · Dinámica Porteña` });
  return { total: para.length, para, copia: copia || null };
}

export async function despacharMensaje(m, origen) {
  if (!correoConfigurado()) throw new Error("El envío de correos no está configurado.");
  if (COMITES.includes(m.destino.tipo)) { const r = await enviarAComite(m, origen); return { total: r.total, trabajo: null, para: r.para, copia: r.copia }; }
  const cuerpo = await conFirma(m);
  const para = await destinatarios(m.destino);
  if (!para.length) throw new Error("No hay destinatarios para este correo.");
  const ev = m.slug ? await nombreEvento(m.slug) : null;
  const banner = m.slug ? await bannerEvento(m.slug, origen) : null;
  const remitenteNombre = ev ? `${ev} · Dinámica Porteña` : "Dinámica Porteña";
  const adjuntos = m.destino.tipo === "inscritos" ? await adjuntoAfiche(m.destino.slug, ev || await nombreEvento(m.destino.slug), origen) : [];
  const base = { tipo: "mensaje", idioma: m.idioma, asunto: m.asunto, destinatarios: para, remitenteNombre, responderA: m.responderA || undefined, mensaje: m.id, adjuntos };
  let trabajo;
  if (m.destino.tipo === "lista") trabajo = await encolarEnvio({ ...base, texto: cuerpo, html: htmlDeTexto(cuerpo, { banner }) }, origen);
  else {
    const pie = await piePersonal(m, ev);
    const personal = { asunto: m.asunto, texto: cuerpo + pie, responderA: m.responderA || undefined, html: banner ? htmlDeTexto(cuerpo + pie, { banner }) : undefined };
    let porDestinatario = Object.fromEntries(para.map((p) => [p, personal]));
    // Marcadores en los correos a inscritos: {nombre} y {enlace} (enlace personal para completar título, resumen, etc.)
    if (m.destino.tipo === "inscritos" && /\{(nombre|enlace)\}/.test(cuerpo)) {
      const fichas = await fichasInscritos(m.destino.slug, m.destino.estados, m.destino.pendiente);
      porDestinatario = Object.fromEntries(fichas.map((i) => {
        const t = personalizar(cuerpo, i, m.destino.slug, origen) + pie;
        return [normalizarCorreo(i.email), { ...personal, texto: t, html: banner ? htmlDeTexto(t, { banner }) : undefined }];
      }));
    }
    trabajo = await encolarEnvio({ ...base, texto: "", porDestinatario }, origen);
  }
  return { total: para.length, trabajo: trabajo.id };
}

// Prueba: el mismo correo solo a quien lo escribe, marcado [PRUEBA]
export async function enviarPrueba(m, a, origen) {
  if (!correoConfigurado()) throw new Error("El envío de correos no está configurado.");
  if (COMITES.includes(m.destino.tipo)) { await enviarAComite({ ...m, autor: m.autor || a }, origen, { prueba: a }); return; }
  const ev = m.slug ? await nombreEvento(m.slug) : null;
  const banner = m.slug ? await bannerEvento(m.slug, origen) : null;
  const pie = m.destino.tipo === "lista" ? (m.idioma === "en" ? "\n\n—\n(Each subscriber receives here their personal unsubscribe link.)" : "\n\n—\n(Aquí cada suscriptor recibe su enlace personal para darse de baja.)")
    : await piePersonal(m, ev);
  let cuerpo = await conFirma(m);
  if (m.destino.tipo === "inscritos") {   // en la prueba, los marcadores se muestran con un ejemplo (la primera persona de la selección, si hay)
    const ej = (await fichasInscritos(m.destino.slug, m.destino.estados, m.destino.pendiente))[0];
    cuerpo = ej ? personalizar(cuerpo, ej, m.destino.slug, origen) : cuerpo.replace(/\{nombre\}/g, "(nombre)").replace(/\{enlace\}/g, "(enlace personal)");
  }
  const adjuntos = m.destino.tipo === "inscritos" ? await adjuntoAfiche(m.destino.slug, ev || await nombreEvento(m.destino.slug), origen) : [];
  const html = (m.destino.tipo === "lista" || banner) ? htmlDeTexto(cuerpo + pie, { banner }) : undefined;
  await enviar({ para: a, asunto: "[PRUEBA] " + m.asunto, texto: cuerpo + pie, html,
                 responderA: m.responderA || undefined, remitenteNombre: ev ? `${ev} · Dinámica Porteña` : "Dinámica Porteña", adjuntos });
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
  Object.assign(m, { estado: "enviado", enviado: new Date().toISOString(), total: r.total, trabajo: r.trabajo }, r.para ? { para: r.para, copia: r.copia } : {});
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
  aprobadoPor: m.aprobadoPor || null, para: m.para || null, rechazadoPor: m.rechazadoPor || null, motivo: m.motivo || null });

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
