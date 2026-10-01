// Baja de la lista de suscriptores.
//   GET  /api/baja?c=ID&t=FIRMA  → indica si el enlace es válido (la página /baja/ pide confirmar)
//   POST /api/baja               → confirma la baja (también acepta la baja «en un clic» de Gmail)
import { timingSafeEqual } from "node:crypto";
import { json, error } from "../lib/comun.mjs";
import { firmaBaja, obtener, guardar } from "../lib/suscriptores.mjs";

const valida = (c, t) => {
  if (!/^[0-9a-f]{24}$/.test(c || "") || !t) return false;
  const a = Buffer.from(t), b = Buffer.from(firmaBaja(c));
  return a.length === b.length && timingSafeEqual(a, b);
};
const oculto = (email) => email.replace(/^(.).*?(.)?@/, (m, x, y) => `${x}•••${y || ""}@`);

export default async (req) => {
  const url = new URL(req.url);
  let c = url.searchParams.get("c"), t = url.searchParams.get("t");
  if (req.method === "POST" && (req.headers.get("content-type") || "").includes("application/json")) {
    try { const b = await req.json(); c = b.c || c; t = b.t || t; } catch {}
  }
  if (!valida(c, t)) return error("El enlace no es válido.", 400);
  if (req.method === "GET") {
    const s = await obtener(c);
    return s ? json({ email: oculto(s.email), estado: s.estado }) : error("No se encontró la suscripción.", 404);
  }
  if (req.method === "POST") {
    const s = await obtener(c); if (!s) return error("No se encontró la suscripción.", 404);
    if (s.estado !== "baja") { s.estado = "baja"; s.baja = new Date().toISOString(); await guardar(s); }
    return json({ ok: true });
  }
  return error("Método no permitido.", 405);
};
export const config = { path: "/api/baja" };
