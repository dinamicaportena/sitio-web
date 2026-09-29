// Utilidades compartidas por las funciones del panel de Dinámica Porteña.
// Ninguna clave se escribe en el código: todas se leen de las variables de
// entorno de Netlify (GOOGLE_CLIENT_ID, ADMIN_EMAILS, SESSION_SECRET).
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

export const SALA_POR_DEFECTO = "Sala 2-2, Instituto de Matemáticas";
const COOKIE = "dp_sesion";
const DURACION_SESION_S = 8 * 60 * 60;          // 8 horas
export const DURACION_INVITACION_DIAS = 30;
const MAX_FOTO_BYTES = 2 * 1024 * 1024;          // 2 MB (el navegador ya la reduce)

// ---------- Respuestas ----------
export function json(datos, estado = 200, extra = {}) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}
export const error = (mensaje, estado = 400) => json({ error: mensaje }, estado);

export function variable(nombre) {
  const v = process.env[nombre] ?? (globalThis.Netlify?.env?.get?.(nombre));
  if (!v) throw new Error(`Falta la variable de entorno ${nombre}`);
  return v;
}

// ---------- Almacenamiento (Netlify Blobs) ----------
export const almacen = (nombre) => getStore({ name: nombre, consistency: "strong" });
export const charlas = () => almacen("charlas");
export const fotos = () => almacen("fotos");
export const invitaciones = () => almacen("invitaciones");

// ---------- Utilidades ----------
export const sha256 = (texto) => createHash("sha256").update(texto).digest("hex");
export const tokenAleatorio = (bytes = 24) => randomBytes(bytes).toString("base64url");
export const nuevoId = () => new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + randomBytes(5).toString("hex");

export function texto(valor, max) {
  if (valor === undefined || valor === null) return "";
  return String(valor).replace(/\r\n/g, "\n").trim().slice(0, max);
}
export const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f + "T00:00:00Z"));
export const emailValido = (e) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);

// Fecha legible, igual que en el panel: «viernes 9 de octubre de 2026 · 12:30 hrs»
const MESES = { es: ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"],
                en: ["January","February","March","April","May","June","July","August","September","October","November","December"] };
const DIAS = { es: ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"],
               en: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] };
export function fechaLarga(fecha, hora, idioma = "es") {
  const [a, m, d] = fecha.split("-").map(Number);
  const dia = DIAS[idioma][new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  const f = idioma === "es" ? `${dia} ${d} de ${MESES.es[m - 1]} de ${a}` : `${dia}, ${MESES.en[m - 1]} ${d}, ${a}`;
  return hora ? `${f} · ${hora} ${idioma === "es" ? "hrs" : "h"}` : f;
}
export const horaValida = (h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);

export async function leerJSON(req) {
  const tipo = req.headers.get("content-type") || "";
  if (!tipo.includes("application/json")) return null;   // exige JSON: bloquea envíos desde formularios de otros sitios
  try { return await req.json(); } catch { return null; }
}

// ---------- Sesiones firmadas ----------
function firmar(contenido) {
  return createHmac("sha256", variable("SESSION_SECRET")).update(contenido).digest("base64url");
}
export function crearCookieSesion(email) {
  const datos = Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + DURACION_SESION_S })).toString("base64url");
  const valor = `${datos}.${firmar(datos)}`;
  return `${COOKIE}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DURACION_SESION_S}`;
}
export const cookieCierre = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function correosAutorizados() {
  return variable("ADMIN_EMAILS").split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
}

export function sesion(req) {
  const cookies = Object.fromEntries((req.headers.get("cookie") || "").split(";").map((c) => {
    const i = c.indexOf("="); return i < 0 ? [c.trim(), ""] : [c.slice(0, i).trim(), c.slice(i + 1).trim()];
  }));
  const valor = cookies[COOKIE];
  if (!valor || !valor.includes(".")) return null;
  const [datos, firma] = valor.split(".");
  const esperada = firmar(datos);
  const a = Buffer.from(firma), b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let info; try { info = JSON.parse(Buffer.from(datos, "base64url").toString()); } catch { return null; }
  if (!info?.email || info.exp < Date.now() / 1000) return null;
  if (!correosAutorizados().includes(info.email)) return null;   // quitar un correo de ADMIN_EMAILS revoca su sesión
  return info.email;
}

// ---------- Verificación del acceso con Google ----------
export async function verificarGoogle(credencial) {
  if (!credencial || typeof credencial !== "string" || credencial.length > 5000) return null;
  const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credencial));
  if (!r.ok) return null;
  const t = await r.json();
  const emisorOk = t.iss === "accounts.google.com" || t.iss === "https://accounts.google.com";
  const verificado = t.email_verified === true || t.email_verified === "true";
  if (!emisorOk || t.aud !== variable("GOOGLE_CLIENT_ID") || !verificado) return null;
  if (Number(t.exp) < Date.now() / 1000) return null;
  return String(t.email).toLowerCase();
}

// ---------- Fotos ----------
const FIRMAS = { "image/jpeg": [0xff, 0xd8, 0xff], "image/png": [0x89, 0x50, 0x4e, 0x47], "image/webp": [0x52, 0x49, 0x46, 0x46] };
export async function guardarFoto(dataURL) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataURL || "");
  if (!m) throw new Error("Formato de foto no válido (use JPG, PNG o WebP).");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_FOTO_BYTES) throw new Error("La foto supera el tamaño máximo de 2 MB.");
  if (!FIRMAS[m[1]].every((b, i) => bytes[i] === b)) throw new Error("El archivo no corresponde a una imagen válida.");
  const id = nuevoId();
  await fotos().set(id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), { metadata: { tipo: m[1] } });
  return id;
}
export async function borrarFoto(id) { if (id) await fotos().delete(id); }

// ---------- Charlas ----------
export const ESTADOS = ["borrador", "invitada", "pendiente", "publicada"];

// Versión pública de una charla (sin datos internos)
export function publica(c) {
  return { id: c.id, fecha: c.fecha, hora: c.hora, sala: c.sala, expositor: c.expositor, institucion: c.institucion,
           titulo: c.titulo, resumen: c.resumen, foto: c.foto ? `/api/foto/${c.foto}` : null };
}
// Versión para el panel (incluye estado, sin el hash de la invitación)
export function paraPanel(c) {
  return { ...publica(c), estado: c.estado, creada: c.creada, actualizada: c.actualizada,
           email: c.email || "", idioma: c.idioma || "es",
           invitacionVence: c.invitacion?.expira || null, invitacionEnviadaA: c.invitacion?.enviadaA || null,
           enviadaPorExpositor: c.enviadaPorExpositor || null };
}
export async function listarCharlas() {
  const almacenC = charlas();
  const { blobs } = await almacenC.list();
  const todas = await Promise.all(blobs.map((b) => almacenC.get(b.key, { type: "json" })));
  return todas.filter(Boolean).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
}
