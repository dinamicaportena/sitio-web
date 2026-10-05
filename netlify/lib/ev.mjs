// Páginas de evento dentro de dinamicaportena.cl (p. ej. dinamicaportena.cl/lxiv-coloquio/).
// Cada evento tiene su propio contenido, sus inscripciones y sus administradores, separados del panel central del sitio.
//   Almacén «ev-registro»      clave = slug → { slug, estado, creado, creadoPor, admins: [{ email, rol, agregado, agregadoPor }] }
//   Almacén «ev-contenido»     clave = slug → { contenido, actualizado, actualizadoPor }
//   Almacén «ev-inscripciones» clave = «slug/id» → ficha de inscripción
// Roles: «central» (administradores del sitio; entran a cualquier evento), «responsable» (administra el evento y a sus
// administradores) y «colaborador» (edita contenido e inscripciones).
import { createHmac, timingSafeEqual } from "node:crypto";
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
export function crearCookieEv(email) {
  const datos = Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + DURACION_S })).toString("base64url");
  return `${COOKIE}=${datos}.${firmar(datos)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DURACION_S}`;
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
    nombre: bi(nombre), marca: bi(nombre), eyebrow: bi(), institucion: bi(),
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
export async function invitarAdmin({ origen, slug, nombre, email, rol, por }) {
  const enlace = `${origen}/${slug}/admin/`;
  const texto_ = `Estimado/a:

${por} le ha invitado a administrar la página del evento «${nombre}» en el sitio de Dinámica Porteña, con el rol de ${ROL_ES[rol] || rol}.

Para ingresar, abra el siguiente enlace y use la cuenta de Google asociada a este correo (${email}):

${enlace}

Desde ese panel podrá completar la información del evento (fechas, conferencistas, programa, información práctica) y gestionar las inscripciones.

Saludos cordiales,
Dinámica Porteña

—

Dear colleague,

${por} has invited you to administer the page of the event "${nombre}" on the Dinámica Porteña website, as ${ROL_EN[rol] || rol}.

To sign in, open the link above and use the Google account associated with this email address (${email}).

Best regards,
Dinámica Porteña`;
  if (!correoConfigurado()) return { enviado: false, enlace, motivo: "El envío de correos no está configurado en el sitio." };
  try {
    const t = crearTransporte();
    await t.sendMail({ from: remitente().replace(/^"[^"]*"/, '"Dinámica Porteña · Eventos"'), to: email, subject: `Invitación a administrar el evento «${nombre}» / Invitation to administer "${nombre}"`, text: texto_ });
    if (t.close) t.close();
    return { enviado: true, enlace };
  } catch (e) { return { enviado: false, enlace, motivo: e.message }; }
}
export { emailValido };
