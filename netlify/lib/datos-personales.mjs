// Actualización de datos por la propia persona, con un enlace personal de un solo uso (vence en 30 días).
// Aplicación mixta: los datos propios (nombre, correos, ORCID, zbMATH, enlaces, foto, autorizaciones, suscripción,
// retiro como colaborador y cambio a una institución del catálogo) se aplican de inmediato; una institución que no está
// en el catálogo, la situación académica y los comentarios quedan como solicitudes pendientes para el administrador.
// Lo anterior queda siempre guardado: versión completa de la ficha e historial «antes → después».
import { almacen, sha256, tokenAleatorio, texto, emailValido, fechaValida, guardarFoto, nuevoId, hoyChile, fechaLarga } from "./comun.mjs";
import { obtenerPersona, guardarPersona, listarInstituciones, afiliacionVigente, correoPrincipal, estadoSuscripcion, evento, limpiarPersona,
         diferencias } from "./personas.mjs";
import { enviar, correoConfigurado } from "./correo.mjs";
import { leerPlantillas, rellenar } from "./plantillas.mjs";
import { baseSitio, encolarEnvio } from "./envios.mjs";

const enlacesStore = () => almacen("enlaces-datos");
export const DURACION_DIAS = 30;
const POR = "la propia persona (enlace personal)", ORIGEN = "Formulario de datos personales";

// ---------- Enlaces ----------
export async function anularEnlace(p) {
  if (p.enlaceDatos?.hash) await enlacesStore().delete(p.enlaceDatos.hash);
  if (p.enlaceDatos) p.enlaceDatos = { ...p.enlaceDatos, hash: null, anulado: p.enlaceDatos.usado ? p.enlaceDatos.anulado || null : new Date().toISOString() };
}
// Genera un enlace nuevo (anula el anterior). Quien llama guarda la ficha.
export async function crearEnlace(p, { por, origen }) {
  await anularEnlace(p);
  const token = tokenAleatorio(), hash = sha256(token), ahora = new Date().toISOString();
  const expira = new Date(Date.now() + DURACION_DIAS * 864e5).toISOString();
  await enlacesStore().setJSON(hash, { persona: p.id, expira, creado: ahora, por });
  p.enlaceDatos = { hash, expira, creado: ahora, por, enviadoA: null, enviadoEl: null, usado: null, anulado: null };
  return { token, enlace: `${baseSitio(origen)}/datos/?t=${token}`, expira };
}
export async function personaDeToken(token) {
  if (!token || typeof token !== "string" || token.length > 100) return null;
  const hash = sha256(token), e = await enlacesStore().get(hash, { type: "json" });
  if (!e || e.expira < new Date().toISOString()) return null;
  const p = await obtenerPersona(e.persona);
  return p && p.enlaceDatos?.hash === hash ? p : null;
}

// Texto del correo con el enlace (plantilla editable en «Plantillas» → «Enlace para actualizar datos»)
export async function textoEnlace(p, enlace, expira, idioma = "es") {
  const { textos, datos } = await leerPlantillas();
  const en = idioma === "en" ? "en" : "es", t = textos.datos[en];
  const vars = { nombre: p.nombre || (en === "en" ? "colleague" : "colega"), enlace, vence: fechaLarga(expira.slice(0, 10), "", en), web: datos.web, email: datos.email };
  return { asunto: rellenar(t.asunto, vars), texto: rellenar(t.cuerpo, vars), responderA: datos.email };
}
export async function enviarEnlace(p, { por, origen, idioma }) {
  const para = correoPrincipal(p);
  if (!para) throw new Error("La persona no tiene correo: agréguelo en su ficha o copie el enlace y envíelo usted.");
  if (!correoConfigurado()) throw new Error("El envío de correos no está configurado en Netlify (GMAIL_USER y GMAIL_APP_PASSWORD).");
  const r = await crearEnlace(p, { por, origen });
  const m = await textoEnlace(p, r.enlace, r.expira, idioma);
  await enviar({ para, asunto: m.asunto, texto: m.texto, responderA: m.responderA });
  p.enlaceDatos.enviadoA = para; p.enlaceDatos.enviadoEl = new Date().toISOString();
  await guardarPersona(p, { por, cambio: `Enlace para actualizar datos enviado a ${para}`, origen: "Panel" });
  return { ...r, enviadoA: para };
}
// Envío masivo: un enlace personal por persona, en la cola de envíos (cada uno recibe su propio correo)
export async function enviarEnlaces(personas, { por, origen, idioma }) {
  if (!correoConfigurado()) throw new Error("El envío de correos no está configurado en Netlify (GMAIL_USER y GMAIL_APP_PASSWORD).");
  const conCorreo = personas.filter((p) => correoPrincipal(p)), sinCorreo = personas.filter((p) => !correoPrincipal(p));
  const porDestinatario = {};
  for (let i = 0; i < conCorreo.length; i += 15) {
    await Promise.all(conCorreo.slice(i, i + 15).map(async (p) => {
      const para = correoPrincipal(p), r = await crearEnlace(p, { por, origen }), m = await textoEnlace(p, r.enlace, r.expira, idioma);
      porDestinatario[para] = { asunto: m.asunto, texto: m.texto, responderA: m.responderA };
      p.enlaceDatos.enviadoA = para; p.enlaceDatos.enviadoEl = new Date().toISOString();
      await guardarPersona(p, { por, cambio: `Enlace para actualizar datos enviado a ${para} (envío masivo)`, origen: "Panel" });
    }));
  }
  const destinatarios = Object.keys(porDestinatario);
  const trabajo = destinatarios.length ? await encolarEnvio({ tipo: "datos", idioma, asunto: idioma === "en" ? "Update your details — Dinámica Porteña" : "Actualización de datos — Dinámica Porteña",
    texto: "", destinatarios, porDestinatario }, origen) : null;
  return { encolados: destinatarios.length, sinCorreo: sinCorreo.map((p) => ({ id: p.id, nombre: p.nombre })), trabajo: trabajo?.id || null };
}

// ---------- Vista para el formulario (solo los datos de la persona) ----------
export async function vista(p) {
  const instituciones = await listarInstituciones(), av = afiliacionVigente(p);
  return {
    nombre: p.nombre || "", correoPrincipal: correoPrincipal(p), otrosCorreos: (p.correos || []).filter((c) => !c.principal).map((c) => c.email),
    institucion: av ? { id: av.inst, unidad: av.unidad || "" } : null,
    catalogo: instituciones.map((i) => ({ id: i.id, nombre: i.nombre, nombreEn: i.nombreEn || "", sigla: i.sigla || "", pais: i.pais })),
    roles: (p.roles || []).filter((r) => r.estado === "Vigente" || r.estado === "Por confirmar").map((r) => r.rol),
    colaborador: (p.roles || []).some((r) => r.rol.startsWith("Colaborador") && r.estado === "Vigente"),
    orcid: p.orcid || "", zbmath: p.zbmath || "", enlaces: p.enlaces || [], publicar: Boolean(p.publicar), fotoAutorizada: Boolean(p.fotoAutorizada),
    foto: p.foto ? `/api/foto/${p.foto}` : p.fotoArchivo ? `/assets/fotos/${encodeURIComponent(p.fotoArchivo)}` : null,
    suscrito: estadoSuscripcion(p) === "activo", vence: p.enlaceDatos?.expira || null,
  };
}

// ---------- Aplicación de lo enviado por la persona ----------
export async function aplicar(p, c, { origen }) {
  const ahora = new Date().toISOString(), hoy = hoyChile(), previa = structuredClone(p), solicitudes = [];
  // datos propios
  const principal = texto(c.correoPrincipal, 200).toLowerCase();
  if (!emailValido(principal)) throw new Error("Indique un correo principal válido.");
  const otros = (Array.isArray(c.otrosCorreos) ? c.otrosCorreos : []).map((x) => texto(x, 200).toLowerCase()).filter((x) => x && x !== principal);
  const nombre = texto(c.nombre, 150);
  if (!nombre) throw new Error("Indique su nombre.");
  let q = limpiarPersona({ nombre, correos: [{ email: principal, principal: true }, ...otros.map((email) => ({ email }))],
    orcid: c.orcid ?? "", zbmath: c.zbmath ?? "", enlaces: Array.isArray(c.enlaces) ? c.enlaces.slice(0, 6) : [],
    publicar: Boolean(c.publicar), fotoAutorizada: Boolean(c.fotoAutorizada) }, structuredClone(p));
  if (previa.nombre && previa.nombre !== q.nombre && !(q.variantes || []).includes(previa.nombre)) q.variantes = [...(q.variantes || []), previa.nombre];
  if (typeof c.foto === "string" && c.foto.startsWith("data:")) q.foto = await guardarFoto(c.foto);   // la foto anterior se conserva
  // institución
  const inst = c.institucion || {}, vig = afiliacionVigente(q), desde = fechaValida(inst.desde || "") ? inst.desde : hoy;
  const catalogo = new Set((await listarInstituciones()).map((i) => i.id));
  const unidad = texto(inst.unidad, 150);
  if (inst.id && inst.id !== "otra") {
    if (!catalogo.has(inst.id)) throw new Error("Institución no válida.");
    if (!vig || vig.inst !== inst.id) {
      q.afiliaciones = (q.afiliaciones || []).map((a) => (a.vigente ? { ...a, vigente: false, hasta: a.hasta || desde } : a));
      q.afiliaciones.push({ inst: inst.id, unidad, desde, hasta: "", vigente: true, primera: "", ultima: "", fuente: "Informada por la persona (formulario)" });
    } else if ((vig.unidad || "") !== unidad) q.afiliaciones = q.afiliaciones.map((a) => (a === vig ? { ...a, unidad } : a));
  } else if (inst.id === "otra" && texto(inst.otraNombre, 200)) {
    solicitudes.push({ tipo: "Institución", texto: `Nueva institución: ${texto(inst.otraNombre, 200)}${inst.otraPais ? ", " + texto(inst.otraPais, 60) : ""}${unidad ? " (" + unidad + ")" : ""}, desde ${desde}. Agregarla al catálogo y registrar el cambio.` });
  }
  // retiro voluntario como colaborador
  if (c.retiroColaborador) q.roles = (q.roles || []).map((r) => (r.rol.startsWith("Colaborador") && r.estado === "Vigente"
    ? { ...r, estado: "Retiro voluntario", hasta: hoy, nota: "Solicitado por la persona en el formulario de datos" } : r));
  // situación académica y comentarios: para revisión
  const ac = (c.academica && typeof c.academica === "object") ? c.academica : {}, situacion = texto(ac.situacion, 100);
  if (situacion) solicitudes.push({ tipo: "Situación académica", texto: [situacion, ac.programa && `programa: ${texto(ac.programa, 150)}`,
    ac.director && `director/a de tesis: ${texto(ac.director, 150)}`, ac.fecha && `fecha: ${texto(ac.fecha, 10)}`].filter(Boolean).join("; ") });
  if (texto(c.comentario, 1500)) solicitudes.push({ tipo: "Comentario", texto: texto(c.comentario, 1500) });
  // suscripción
  const estado = estadoSuscripcion(q);
  if (c.suscrito && estado !== "activo")
    q.suscripcion = [...(q.suscripcion || []), evento({ evento: estado === "baja" ? "reactivacion" : "alta", email: principal, origen: ORIGEN, nota: "Solicitada por la propia persona", por: POR })];
  if (!c.suscrito && estado === "activo")
    q.suscripcion = [...(q.suscripcion || []), evento({ evento: "baja", email: principal, origen: ORIGEN, nota: "Solicitada por la propia persona", por: POR })];
  if (solicitudes.length) {
    q.solicitudes = [...(q.solicitudes || []), ...solicitudes.map((x) => ({ id: nuevoId(), el: ahora, ...x, estado: "pendiente" }))];
    q.pendientes = [q.pendientes, ...solicitudes.map((x) => `Solicitud del ${hoy} (${x.tipo.toLowerCase()}): ver «Solicitudes de la persona».`)].filter(Boolean).join("\n");
  }
  // un solo uso: el enlace se elimina una vez guardados los datos
  const hash = p.enlaceDatos.hash;
  q.enlaceDatos = { ...q.enlaceDatos, hash: null, usado: ahora };
  const dif = diferencias(previa, q);
  try { await guardarPersona(q, { por: POR, cambio: "Actualizó sus datos con el enlace personal", origen: ORIGEN, anterior: previa }); }
  catch (e) {                                   // sin revelar datos de otras personas
    if (/ya pertenece/.test(e.message)) throw new Error("Uno de los correos indicados ya está registrado para otra persona. Escriba a dinamica.portena@pucv.cl para resolverlo.");
    throw e;
  }
  await enlacesStore().delete(hash);
  try { await avisarAdministradores(q, dif, solicitudes, origen); } catch (e) { console.error("No se pudo avisar a los administradores:", e.message); }
  return { cambios: dif.map((d) => d.etiqueta), solicitudes: solicitudes.length, suscripcion: estadoSuscripcion(q) };
}

async function avisarAdministradores(p, dif, solicitudes, origen) {
  const leer = (n) => process.env[n] ?? globalThis.Netlify?.env?.get?.(n);
  const para = (leer("AVISO_EMAILS") || leer("ADMIN_EMAILS") || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!correoConfigurado() || !para.length) return;
  const lineas = dif.map((d) => `• ${d.etiqueta}: «${d.antes || "—"}» → «${d.despues || "—"}»`);
  await enviar({ para: para.join(", "), asunto: `[Dinámica Porteña] ${p.nombre} actualizó sus datos`,
    texto: `${p.nombre} (${p.id}) actualizó sus datos con su enlace personal.\n\n${lineas.length ? "Cambios aplicados:\n" + lineas.join("\n") : "Sin cambios en los datos."}\n\n` +
      (solicitudes.length ? "Solicitudes que requieren su revisión:\n" + solicitudes.map((s) => `• ${s.tipo}: ${s.texto}`).join("\n") + "\n\n" : "") +
      `Los datos anteriores quedaron guardados en el historial de la ficha. Panel: ${baseSitio(origen)}/admin/\n\nEste es un aviso automático del sitio del seminario.` });
}
