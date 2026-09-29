// Acceso al panel: /api/auth/login (POST), /api/auth/logout (POST), /api/auth/me (GET).
import { json, error, leerJSON, verificarGoogle, correosAutorizados, crearCookieSesion, cookieCierre, sesion } from "../lib/comun.mjs";

export default async (req) => {
  const ruta = new URL(req.url).pathname;

  if (ruta.endsWith("/me") && req.method === "GET") {
    const email = sesion(req);
    return email ? json({ email }) : error("Sin sesión", 401);
  }
  if (ruta.endsWith("/logout") && req.method === "POST") {
    return json({ ok: true }, 200, { "Set-Cookie": cookieCierre() });
  }
  if (ruta.endsWith("/login") && req.method === "POST") {
    const cuerpo = await leerJSON(req);
    const email = await verificarGoogle(cuerpo?.credential);
    if (!email) return error("No fue posible verificar la cuenta de Google.", 401);
    if (!correosAutorizados().includes(email)) return error(`La cuenta ${email} no está autorizada para administrar el sitio.`, 403);
    return json({ email }, 200, { "Set-Cookie": crearCookieSesion(email) });
  }
  return error("Ruta no encontrada", 404);
};
export const config = { path: ["/api/auth/login", "/api/auth/logout", "/api/auth/me"] };
