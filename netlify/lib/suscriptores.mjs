// Lista de suscriptores del seminario (un solo documento JSON en Netlify Blobs, con escritura condicional).
import { createHmac } from "node:crypto";
import { almacen, sha256, variable, emailValido } from "./comun.mjs";

// Un documento por suscriptor (clave = id derivado del correo): sin conflictos entre escrituras simultáneas.
const tienda = () => almacen("suscriptores");
export const idDe = (email) => sha256(email.trim().toLowerCase()).slice(0, 24);

async function enTandas(items, fn, tam = 40) {
  const out = [];
  for (let i = 0; i < items.length; i += tam) out.push(...(await Promise.all(items.slice(i, i + tam).map(fn))));
  return out;
}
export async function leerTodos() {
  const { blobs } = await tienda().list();
  return (await enTandas(blobs, (b) => tienda().get(b.key, { type: "json" }))).filter(Boolean);
}
export const obtener = (id) => tienda().get(id, { type: "json" });
export const guardar = (s) => tienda().setJSON(s.id, s);
export const borrar = (id) => tienda().delete(id);
export { enTandas };
export async function correosActivos() {
  return (await leerTodos()).filter((s) => s.estado === "activo").map((s) => s.email);
}

// Interpreta texto pegado: un correo por línea o separados por comas/punto y coma; admite «Nombre <correo>».
export function interpretar(texto) {
  const partes = String(texto || "").split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
  const validos = [], invalidos = [];
  for (const p of partes.slice(0, 5000)) {
    const m = /^(.*?)<\s*([^<>\s]+)\s*>$/.exec(p);
    const email = (m ? m[2] : p).replace(/^mailto:/i, "").trim().toLowerCase();
    const nombre = m ? m[1].replace(/["']/g, "").trim().slice(0, 120) : "";
    if (emailValido(email) && email.length <= 200) validos.push({ email, nombre }); else invalidos.push(p.slice(0, 200));
  }
  return { validos, invalidos };
}

// Enlace personal para darse de baja (firmado: no requiere guardar tokens)
export const firmaBaja = (id) => createHmac("sha256", variable("SESSION_SECRET")).update("baja:" + id).digest("base64url").slice(0, 32);
export const enlaceBaja = (email, base) => { const id = idDe(email); return `${base}/baja/?c=${id}&t=${firmaBaja(id)}`; };
export const enlaceBajaDirecto = (email, base) => { const id = idDe(email); return `${base}/api/baja?c=${id}&t=${firmaBaja(id)}`; };
