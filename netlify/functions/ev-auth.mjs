// Acceso al panel de un evento (cookie distinta de la del panel central):
//   GET  /api/evauth/me?slug=…   quién es y qué rol tiene en ese evento
//   POST /api/evauth/login       { credential, slug } — acceso con Google; solo si el correo es administrador de ese evento
//   POST /api/evauth/logout
import { json, error, leerJSON, verificarGoogle, correosAutorizados, crearCookieSesion, cookieCierre, sesion } from "../lib/comun.mjs";
import { leerRegistro, permiso, crearCookieEv, cookieEvCierre, sesionEv, validarSlug } from "../lib/ev.mjs";

const quien = (reg, p) => ({ email: p.email, rol: p.rol, estado: reg.estado, slug: reg.slug });

export default async (req) => {
  const url = new URL(req.url), ruta = url.pathname;
  if (ruta.endsWith("/me") && req.method === "GET") {
    let slug; try { slug = validarSlug(url.searchParams.get("slug")); } catch { return error("El evento no existe.", 404); }
    const reg = await leerRegistro(slug);
    if (!reg) return error("El evento no existe.", 404);
    const p = permiso(req, reg);
    if (p) return json(quien(reg, p));
    const e = sesionEv(req);
    return e ? error(`La cuenta ${e} no está autorizada para administrar este evento.`, 403) : error("Sin sesión", 401);
  }
  if (ruta.endsWith("/logout") && req.method === "POST") {
    const h = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    h.append("Set-Cookie", cookieEvCierre());
    if (sesion(req)) h.append("Set-Cookie", cookieCierre());
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: h });
  }
  if (ruta.endsWith("/login") && req.method === "POST") {
    const c = await leerJSON(req);
    let slug; try { slug = validarSlug(c?.slug); } catch { return error("El evento no existe.", 404); }
    const reg = await leerRegistro(slug);
    if (!reg) return error("El evento no existe.", 404);
    const email = await verificarGoogle(c?.credential);
    if (!email) return error("No fue posible verificar la cuenta de Google.", 401);
    if (correosAutorizados().includes(email)) return json({ email, rol: "central", estado: reg.estado, slug }, 200, { "Set-Cookie": crearCookieSesion(email) });
    const a = reg.admins.find((x) => x.email === email);
    if (!a) return error(`La cuenta ${email} no está autorizada para administrar este evento. Pida al responsable que la invite.`, 403);
    return json({ email, rol: a.rol, estado: reg.estado, slug }, 200, { "Set-Cookie": crearCookieEv(email) });
  }
  return error("Ruta no encontrada", 404);
};
export const config = { path: ["/api/evauth/me", "/api/evauth/login", "/api/evauth/logout"] };
