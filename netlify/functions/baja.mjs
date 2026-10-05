// Baja de la lista de suscriptores (enlace personal incluido en cada correo).
//   GET  /api/baja?c=ID&t=FIRMA  → indica si el enlace es válido (la página /baja/ pide confirmar)
//   POST /api/baja               → confirma la baja (también acepta la baja «en un clic» de Gmail)
// La baja queda registrada en el historial de suscripción de la persona y se respeta aunque cambie de correo.
import { timingSafeEqual } from "node:crypto";
import { json, error } from "../lib/comun.mjs";
import { firmaBaja } from "../lib/suscriptores.mjs";
import { correosStore, obtenerPersona, estadoSuscripcion, registrarEvento, migrarSuscriptoresAntiguos } from "../lib/personas.mjs";

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
  await migrarSuscriptoresAntiguos();
  const ix = await correosStore().get(c, { type: "json" });
  const p = ix ? await obtenerPersona(ix.persona) : null;
  if (!p) return error("No se encontró la suscripción.", 404);
  const estado = estadoSuscripcion(p) === "baja" ? "baja" : "activo";
  if (req.method === "GET") return json({ email: oculto(ix.email), estado });
  if (req.method === "POST") {
    if (estado !== "baja") await registrarEvento(p, { evento: "baja", email: ix.email, origen: "Enlace de baja" }, "la propia persona");
    return json({ ok: true });
  }
  return error("Método no permitido.", 405);
};
export const config = { path: "/api/baja" };
