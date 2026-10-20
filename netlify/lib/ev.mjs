// Páginas de evento dentro de dinamicaportena.cl (p. ej. dinamicaportena.cl/lxiv-coloquio/).
// Cada evento tiene su propio contenido, sus inscripciones y sus administradores, separados del panel central del sitio.
//   Almacén «ev-registro»      clave = slug → { slug, estado, creado, creadoPor, admins: [{ email, rol, agregado, agregadoPor }] }
//   Almacén «ev-contenido»     clave = slug → { contenido, actualizado, actualizadoPor }
//   Almacén «ev-inscripciones» clave = «slug/id» → ficha de inscripción
// Roles: «central» (administradores del sitio; entran a cualquier evento), «responsable» (administra el evento y a sus
// administradores) y «colaborador» (edita contenido e inscripciones).
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { almacen, variable, sesion as sesionCentral, texto, emailValido, peticionAjena } from "./comun.mjs";
import { correoConfigurado, crearTransporte, remitente } from "./correo.mjs";

export const registroStore = () => almacen("ev-registro");
export const contenidoStore = () => almacen("ev-contenido");
export const inscStore = () => almacen("ev-inscripciones");

// ---------- Direcciones (slug) ----------
const RESERVADOS = new Set(["admin", "api", "assets", "charla", "baja", "datos", "netlify", "evento", "eventos", "events", "en", "es", "seminario",
  "archivo", "contacto", "el-grupo", "index", "favicon", "robots", "sitemap", "login", "www", "static", "public", "panel", "evadmin", "evauth",
  "herramientas", "404", "node-modules", "readme", "package", "netlify-toml", "apple-touch-icon"]);
// Toda página del sitio tiene versión en inglés «-en» (p. ej. el-grupo-en): también quedan reservadas.
const reservado = (s) => RESERVADOS.has(s) || (s.endsWith("-en") && RESERVADOS.has(s.slice(0, -3)));
export function validarSlug(s) {
  s = String(s || "").trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) || s.length < 3 || s.length > 50) throw new Error("La dirección debe tener de 3 a 50 caracteres: letras minúsculas sin tildes, números y guiones (por ejemplo, lxiv-coloquio).");
  if (reservado(s)) throw new Error(`La dirección «${s}» está reservada por el sitio; elija otra.`);
  return s;
}
export const slugDe = (nombre) => String(nombre || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/g, "");
export const correo = (v) => texto(v, 160).toLowerCase();

// ---------- Sesión de los administradores de evento (cookie propia, distinta de la del panel central) ----------
const COOKIE = "dp_ev_sesion", DURACION_S = 8 * 60 * 60;
const firmar = (c) => createHmac("sha256", variable("SESSION_SECRET")).update(c).digest("base64url");
// duracion: 8 horas por defecto; 30 días si la persona marcó «Recordar este equipo» al pedir un enlace de acceso
export const RECORDAR_S = 30 * 24 * 60 * 60;
export function crearCookieEv(email, duracion = DURACION_S) {
  const datos = Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + duracion })).toString("base64url");
  return `${COOKIE}=${datos}.${firmar(datos)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${duracion}`;
}
export const cookieEvCierre = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
export function sesionEv(req) {
  if (peticionAjena(req)) return null;
  const cookies = Object.fromEntries((req.headers.get("cookie") || "").split(";").map((c) => { const i = c.indexOf("="); return i < 0 ? [c.trim(), ""] : [c.slice(0, i).trim(), c.slice(i + 1).trim()]; }));
  const valor = cookies[COOKIE];
  if (!valor || !valor.includes(".")) return null;
  const [datos, firma] = valor.split(".");
  const a = Buffer.from(firma), b = Buffer.from(firmar(datos));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let info; try { info = JSON.parse(Buffer.from(datos, "base64url").toString()); } catch { return null; }
  return info?.email && info.exp >= Date.now() / 1000 ? String(info.email).toLowerCase() : null;
}

// Permiso de quien hace la solicitud sobre un evento: { email, rol } o null.
export function permiso(req, registro) {
  const central = sesionCentral(req);
  if (central) return { email: central, rol: "central" };
  const e = sesionEv(req);
  const a = e && registro?.admins?.find((x) => x.email === e);
  return a ? { email: e, rol: a.rol } : null;
}
export const puedeAdministrar = (p) => p && (p.rol === "central" || p.rol === "responsable");

// ---------- Registro del evento ----------
export const leerRegistro = (slug) => registroStore().get(slug, { type: "json" });
export async function listarRegistros() {
  const s = registroStore(), { blobs } = await s.list();
  return (await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))).filter(Boolean);
}

// ---------- Contenido ----------
export function contenidoInicial(nombre) {
  const bi = (v = "") => ({ es: v, en: v });
  return {
    nombre: bi(nombre), marca: bi(), eyebrow: bi(), institucion: bi(), bannerConTitulo: false,
    enlaces: [{ texto: bi("Dinámica Porteña"), url: "https://www.dinamicaportena.cl/" }],
    pieEnlace: { texto: { es: "Sitio del grupo Dinámica Porteña", en: "Dinámica Porteña group website" }, url: "https://www.dinamicaportena.cl/" },
    inicio: null, fin: null, lugar: bi(), direccion: "",
    secciones: Object.fromEntries(["objetivo", "conferencistas", "programa", "participantes", "inscripcion", "info", "organizacion"].map((k) => [k, { visible: true, titulo: bi() }])),
    objetivo: bi(), conferencistas: [], programa: [], participantes: [],
    inscripcion: { abierta: false, fechaLimite: "", formularioExterno: "", texto: { es: "La inscripción se abrirá próximamente.", en: "Registration will open soon." } },
    info: [], cientifico: [], organizadores: [], auspiciantes: [], contacto: { email: "" },
  };
}
const MAX_BYTES = 400 * 1024;
export function limpiar(v, prof = 0) {
  if (prof > 8) return null;
  if (typeof v === "string") return v.replace(/\r\n/g, "\n").slice(0, 20000);
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean" || v === null) return v;
  if (Array.isArray(v)) return v.slice(0, 500).map((x) => limpiar(x, prof + 1));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v).slice(0, 80)) if (!/^__|^\$/.test(k)) o[k.slice(0, 60)] = limpiar(x, prof + 1); return o; }
  return null;
}
export function validarContenido(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error("El contenido no es válido.");
  const l = limpiar(c);
  if (Buffer.byteLength(JSON.stringify(l)) > MAX_BYTES) throw new Error("El contenido es demasiado extenso (máximo 400 KB).");
  const f = (x) => x == null || x === "" || /^\d{4}-\d{2}-\d{2}$/.test(x);
  if (!f(l.inicio) || !f(l.fin)) throw new Error("Las fechas deben tener formato AAAA-MM-DD.");
  if (l.inicio && l.fin && l.fin < l.inicio) throw new Error("La fecha de término es anterior a la de inicio.");
  return l;
}

// ---------- Eventos publicados, para la página «Eventos» y la portada del sitio ----------
export async function eventosDeModulos() {
  const salida = [];
  for (const r of (await listarRegistros()).filter((x) => x.estado === "publicado" && x.enSitio === true)) {
    const c = (await contenidoStore().get(r.slug, { type: "json" }))?.contenido;
    if (!c?.inicio) continue;
    const parrafo = (t) => String(t || "").split(/\n{2,}/)[0].slice(0, 400);
    salida.push({ id: "mod-" + r.slug, titulo: c.nombre?.es || r.slug, tituloEn: c.nombre?.en || "", tipo: "Evento", inicio: c.inicio, fin: c.fin || "",
      lugar: c.lugar?.es || "", lugarEn: c.lugar?.en || "", descripcion: parrafo(c.objetivo?.es), descripcionEn: parrafo(c.objetivo?.en), enlace: `/${r.slug}/`, enlaceEn: `/${r.slug}/en`, publicar: true });
  }
  return salida;
}

// ---------- Correo de invitación a administradores ----------
const ROL_ES = { responsable: "responsable (administra el evento y a sus administradores)", colaborador: "colaborador (edita el contenido y las inscripciones)" };
const ROL_EN = { responsable: "lead administrator (manages the event and its administrators)", colaborador: "collaborator (edits the content and the registrations)" };
const COMITE_ES = { cientifico: "Comité Científico", organizador: "Comité Organizador", ambos: "Comité Científico y Organizador" };
const COMITE_EN = { cientifico: "Scientific Committee", organizador: "Organizing Committee", ambos: "Scientific and Organizing Committee" };
const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// «del 13 al 15 de enero de 2027» / «from January 13 to 15, 2027» (null si no hay fecha de inicio)
export function fechasTexto(inicio, fin, en) {
  const p = (f) => (/^\d{4}-\d{2}-\d{2}$/.test(f || "") ? f.split("-").map(Number) : null);
  const a = p(inicio), b = p(fin) || a;
  if (!a) return null;
  const [ya, ma, da] = a, [yb, mb, db] = b;
  if (en) {
    if (ya === yb && ma === mb) return da === db ? `on ${MESES_EN[ma - 1]} ${da}, ${ya}` : `from ${MESES_EN[ma - 1]} ${da} to ${db}, ${ya}`;
    return `from ${MESES_EN[ma - 1]} ${da}${ya !== yb ? ", " + ya : ""} to ${MESES_EN[mb - 1]} ${db}, ${yb}`;
  }
  if (ya === yb && ma === mb) return da === db ? `el ${da} de ${MESES_ES[ma - 1]} de ${ya}` : `del ${da} al ${db} de ${MESES_ES[ma - 1]} de ${ya}`;
  return `del ${da} de ${MESES_ES[ma - 1]}${ya !== yb ? " de " + ya : ""} al ${db} de ${MESES_ES[mb - 1]} de ${yb}`;
}
// Correo en HTML: cabecera del evento (si tiene) y párrafos con enlaces activos. Igual al de los correos a inscritos.
const escH = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function htmlCorreoEvento(cuerpo, cabecera) {
  const enlazar = (s) => escH(s).replace(/\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)»]/g, (u) => `<a href="${u}" style="color:#1a4269">${u}</a>`);
  const parrafos = String(cuerpo).split(/\n\s*\n/).map((p) => `<p style="margin:0 0 14px;font:15px/1.5 Arial,Helvetica,sans-serif;color:#26292c">${enlazar(p).replace(/\n/g, "<br>")}</p>`);
  const img = cabecera ? `<img src="${escH(cabecera)}" alt="" width="640" style="width:100%;max-width:640px;height:auto;display:block;margin:0 0 20px;border:0">` : "";
  return `<div style="max-width:640px">${img}${parrafos.join("")}</div>`;
}
const urlAbsoluta = (ruta, origen) => (!ruta ? null : /^https?:\/\//.test(ruta) ? ruta : /^\//.test(ruta) ? origen + ruta : null);
export const cabeceraCorreoEvento = (c, origen) => urlAbsoluta(c?.cabeceraCorreo || c?.imagenPortada, origen);

// Fila del comité (científico u organizador) que corresponde a un correo: { fila, comite } o null.
export function filaComite(c, email) {
  const e = String(email || "").trim().toLowerCase();
  if (!c || !e) return null;
  const busca = (arr) => (arr || []).find((m) => String(m?.email || "").trim().toLowerCase() === e);
  const fc = busca(c.cientifico);
  if (fc) return { fila: fc, comite: c.comiteUnico ? "ambos" : (busca(c.organizadores) ? "ambos" : "cientifico") };
  const fo = c.comiteUnico ? null : busca(c.organizadores);
  return fo ? { fila: fo, comite: "organizador" } : null;
}

// Primeras colaboraciones que se piden a los integrantes de los comités (mientras se definen las tareas de cada uno)
export const ESPEC_LOGO_ES = "idealmente PNG con fondo transparente (o JPG con fondo blanco), versión horizontal y a color, de al menos 800 píxeles de ancho y hasta 4 MB";
export const ESPEC_LOGO_EN = "ideally a PNG with a transparent background (or a JPG on white), horizontal and in color, at least 800 pixels wide and up to 4 MB";
const TAREAS_ES = (pagina, comite) => `Mientras definimos las tareas de cada comité, te pedimos tu ayuda con lo siguiente:

– Revisar la página del evento, ${pagina} (con la sesión iniciada en el panel se ve completa, aunque aún no esté publicada), y contarnos cualquier corrección o sugerencia.
– Revisar el formulario de inscripción (sección «Inscripción» de la página, visible como vista previa) y avisarnos si falta algún campo.
– Verificar que tu nombre e institución estén bien escritos, en la pestaña «Organización» del panel.
${comite === "organizador" ? "" : `– Si tu institución apoya el coloquio, subir su logo en «Organización» → «Apoyan» (botón «Subir…») o enviárnoslo respondiendo este correo: ${ESPEC_LOGO_ES}.
`}– Ayudarnos a difundir el coloquio: en «Recursos» → «Difusión en redes sociales» encontrarás el afiche para redes y un texto listo para compartir.`;
const TAREAS_EN = (pagina, comite) => `While we define the tasks of each committee, we would appreciate your help with the following:

– Review the event page, ${pagina} (when signed in to the panel you can see it in full, even before it is published), and let us know of any corrections or suggestions.
– Review the registration form (the "Registration" section of the page, shown as a preview) and tell us if any field is missing.
– Check that your name and institution are spelled correctly, in the "Organización" tab of the panel.
${comite === "organizador" ? "" : `– If your institution supports the colloquium, upload its logo under "Organización" → "Apoyan" ("Subir…" button) or send it to us by replying to this email: ${ESPEC_LOGO_EN}.
`}– Help us spread the word: under "Recursos" → "Difusión en redes sociales" you will find the poster for social media and a ready-to-share text.`;

// Invitación al panel. Si la persona viene de un comité (comite = cientifico | organizador | ambos), es un correo de
// bienvenida a ese comité, en un solo idioma (el elegido en su fila), con el saludo elegido (Estimado / Estimada), las
// fechas y el lugar del evento, firmado por quien invita y con respuesta dirigida a esa persona.
// Sin comité: invitación genérica a administrar la página, en español e inglés (como antes).
export async function invitarAdmin({ origen, slug, email, rol, por, contenido, comite, persona = {}, invitante = {}, nombre: nombreDado }) {
  const c = contenido || {};
  const enlace = `${origen}/${slug}/admin/`, pagina = `${origen}/${slug}/`;
  const en = persona.idioma === "en";
  const nombreEs = c.nombre?.es || nombreDado || slug, nombreEn = c.nombre?.en || nombreEs, nombre = en ? nombreEn : nombreEs;
  const fechas = fechasTexto(c.inicio, c.fin, en), lugar = (en ? c.lugar?.en || c.lugar?.es : c.lugar?.es) || "";
  const nombrePersona = String(persona.nombre || "").trim();
  const firmante = String(invitante.nombre || "").trim();
  let asunto, texto_;
  if (comite && COMITE_ES[comite]) {
    if (en) {
      const cuando = (fechas ? `, which will take place ${fechas}` : "") + (lugar ? ` (${lugar})` : "");
      asunto = `Invitation to the ${COMITE_EN[comite]} of the ${nombreEn}`;
      texto_ = `${nombrePersona ? `Dear ${nombrePersona},` : "Dear colleague,"}

Thank you very much for being part of the ${COMITE_EN[comite]} of the ${nombreEn}${cuando}.

To support the work of the Committee, you have access to the event's administration panel, where you will be able to contribute to the preparation of the event: completing its information and reviewing registrations.

To sign in, open the following link:

${enlace}

You can sign in with the Google account associated with this email address (${email}) or, if you prefer, request on that same page an access link that will be sent to this address.

${TAREAS_EN(pagina, comite)}

We are pleased to welcome you. If you have any questions, simply reply to this email.

Best regards,
${firmante ? firmante + "\n" : ""}${firmante ? "on behalf of the " : ""}${comite === "ambos" ? COMITE_EN.ambos : "Organizing Committee"}
${nombreEn}`;
    } else {
      const cuando = (fechas ? `, que se realizará ${fechas}` : "") + (lugar ? ` (${lugar})` : "");
      const saludo = persona.saludo === "Estimada" || persona.saludo === "Estimado" ? persona.saludo : "Estimado/a";
      asunto = `Invitación al ${COMITE_ES[comite]} del ${nombreEs}`;
      texto_ = `${nombrePersona ? `${saludo} ${nombrePersona}:` : `${saludo}:`}

Muchas gracias por formar parte del ${COMITE_ES[comite]} del ${nombreEs}${cuando}.

Para facilitar el trabajo del Comité, tienes acceso al panel de administración del evento, donde podrás colaborar en su preparación: completar su información y revisar las inscripciones.

Para ingresar, abre el siguiente enlace:

${enlace}

Puedes entrar con la cuenta de Google asociada a este correo (${email}) o, si prefieres, pedir en esa misma página un enlace de acceso que llegará a este correo.

${TAREAS_ES(pagina, comite)}

Te damos la bienvenida. Ante cualquier consulta, basta con responder este correo.

Saludos cordiales,
${firmante ? firmante + "\n" : ""}${firmante ? "en nombre del " : ""}${comite === "ambos" ? COMITE_ES.ambos : "Comité Organizador"}
${nombreEs}`;
    }
  } else {
    const saludoEs = nombrePersona ? `Estimado/a ${nombrePersona}:` : "Estimado/a:";
    const saludoEn = nombrePersona ? `Dear ${nombrePersona},` : "Dear colleague,";
    asunto = `Invitación a administrar el evento «${nombreEs}» / Invitation to administer "${nombreEn}"`;
    texto_ = `${saludoEs}

${por} le ha invitado a administrar la página del evento «${nombre}» en el sitio de Dinámica Porteña, con el rol de ${ROL_ES[rol] || rol}.

Para ingresar, abra el siguiente enlace y use la cuenta de Google asociada a este correo (${email}):

${enlace}

Desde ese panel podrá completar la información del evento (fechas, conferencistas, programa, información práctica) y gestionar las inscripciones.

Saludos cordiales,
Dinámica Porteña

—

${saludoEn}

${por} has invited you to administer the page of the event "${nombre}" on the Dinámica Porteña website, as ${ROL_EN[rol] || rol}.

To sign in, open the link above and use the Google account associated with this email address (${email}).

Best regards,
Dinámica Porteña

(Si su correo no está asociado a una cuenta de Google, en esa misma página puede pedir un enlace de acceso que llegará a este correo. / If your email is not associated with a Google account, you can request an access link on that same page.)`;
  }
  const html = htmlCorreoEvento(texto_, cabeceraCorreoEvento(c, origen));
  if (!correoConfigurado()) return { enviado: false, enlace, motivo: "El envío de correos no está configurado en el sitio." };
  try {
    const t = crearTransporte(), marca = (en ? c.marca?.en : c.marca?.es) || c.marca?.es || "";
    await t.sendMail({ from: remitente().replace(/^"[^"]*"/, (marca ? `"${marca.replace(/"/g, "")} · Dinámica Porteña"` : '"Dinámica Porteña · Eventos"')), to: email,
      ...(emailValido(por || "") && por !== email ? { replyTo: por } : {}), subject: asunto, text: texto_, html });
    if (t.close) t.close();
    return { enviado: true, enlace, asunto };
  } catch (e) { return { enviado: false, enlace, motivo: e.message }; }
}

// ---------- Acceso al panel con un enlace enviado por correo (alternativa a Google) ----------
// Enlace firmado, válido 30 minutos y de un solo uso, que solo se envía a correos que ya son administradores del evento.
export const accesosStore = () => almacen("ev-accesos");
const VIGENCIA_ENLACE_S = 30 * 60;
export function crearTokenAcceso(email, slug, recordar = false) {
  const datos = Buffer.from(JSON.stringify({ email, slug, exp: Math.floor(Date.now() / 1000) + VIGENCIA_ENLACE_S, n: randomBytes(12).toString("base64url"), ...(recordar ? { r: 1 } : {}) })).toString("base64url");
  return `${datos}.${firmar("acceso:" + datos)}`;
}
export function leerTokenAcceso(token) {
  const [datos, firma] = String(token || "").split(".");
  if (!datos || !firma) return null;
  const a = Buffer.from(firma), b = Buffer.from(firmar("acceso:" + datos));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let info; try { info = JSON.parse(Buffer.from(datos, "base64url").toString()); } catch { return null; }
  return info?.email && info?.slug && info?.n && info.exp >= Date.now() / 1000 ? info : null;
}
export async function enviarEnlaceAcceso({ origen, slug, email, contenido, idioma, recordar }) {
  const c = contenido || {}, en = idioma === "en";
  const nombre = (en ? c.nombre?.en : c.nombre?.es) || c.nombre?.es || slug;
  const enlace = `${origen}/${slug}/admin/?acceso=${crearTokenAcceso(email, slug, recordar)}`;
  const texto_ = en ? `Hello,

Use the following link to sign in to the administration panel of the ${nombre}. It is valid for 30 minutes and can be used only once${recordar ? "; this device will stay signed in for 30 days" : ""}:

${enlace}

If you did not request it, you can ignore this email.

Dinámica Porteña` : `Hola:

Usa el siguiente enlace para entrar al panel de administración del ${nombre}. Es válido por 30 minutos y se puede usar una sola vez${recordar ? "; el equipo en que lo abras quedará con la sesión abierta por 30 días" : ""}:

${enlace}

Si no lo solicitaste, puedes ignorar este correo.

Dinámica Porteña`;
  if (!correoConfigurado()) throw new Error("El envío de correos no está configurado en el sitio.");
  const t = crearTransporte();
  await t.sendMail({ from: remitente().replace(/^"[^"]*"/, '"Dinámica Porteña · Eventos"'), to: email,
    subject: en ? `Access link — ${nombre}` : `Enlace de acceso — ${nombre}`, text: texto_, html: htmlCorreoEvento(texto_, null) });
  if (t.close) t.close();
}
export { emailValido };

// ---------- Imágenes subidas desde el panel del evento (logos, banner, afiche, cabecera de correos) ----------
// Almacén «ev-archivos», clave = «slug/id». Solo PNG, JPG o WebP (sin SVG: podría contener código), hasta 4 MB.
// Se sirven en /api/evento/<slug>/archivo/<id> (función ev-archivo).
export const archivosStore = () => almacen("ev-archivos");
const FIRMAS_IMG = { "image/png": [0x89, 0x50, 0x4e, 0x47], "image/jpeg": [0xff, 0xd8, 0xff], "image/webp": [0x52, 0x49, 0x46, 0x46] };
export const MAX_ARCHIVO_BYTES = 4 * 1024 * 1024;
export async function guardarArchivoEvento(slug, dataURL) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataURL || ""));
  if (!m) throw new Error("Formato no válido: use una imagen PNG, JPG o WebP.");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_ARCHIVO_BYTES) throw new Error("La imagen supera el tamaño máximo de 4 MB.");
  if (!FIRMAS_IMG[m[1]].every((b, i) => bytes[i] === b)) throw new Error("El archivo no corresponde a una imagen válida.");
  const id = randomBytes(9).toString("base64url") + (m[1] === "image/png" ? ".png" : m[1] === "image/webp" ? ".webp" : ".jpg");
  await archivosStore().set(`${slug}/${id}`, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), { metadata: { tipo: m[1] } });
  return `/api/evento/${slug}/archivo/${id}`;
}
