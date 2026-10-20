// Acceso al panel de un evento (cookie distinta de la del panel central):
//   GET  /api/evauth/me?slug=…   quién es y qué rol tiene en ese evento
//   POST /api/evauth/login       { credential, slug } — acceso con Google; solo si el correo es administrador de ese evento
//   POST /api/evauth/logout
//   POST /api/evauth/enlace      { email, slug, idioma, recordar } — envía un enlace de acceso (30 min, un solo uso) si el correo es
//                                administrador del evento; la respuesta es la misma en todos los casos
//   POST /api/evauth/acceso      { token, slug } — entra con ese enlace
import { json, error, leerJSON, verificarGoogle, correosAutorizados, crearCookieSesion, cookieCierre, sesion } from "../lib/comun.mjs";
import { leerRegistro, permiso, crearCookieEv, RECORDAR_S, cookieEvCierre, sesionEv, validarSlug, correo, contenidoStore, accesosStore,
  enviarEnlaceAcceso, leerTokenAcceso } from "../lib/ev.mjs";
import { emailValido, peticionAjena } from "../lib/comun.mjs";
import { createHash } from "node:crypto";
const hash = (x) => createHash("sha256").update(String(x)).digest("hex").slice(0, 40);

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
  if (ruta.endsWith("/enlace") && req.method === "POST") {
    if (peticionAjena(req)) return error("Solicitud no permitida.", 403);
    const c = await leerJSON(req);
    let slug; try { slug = validarSlug(c?.slug); } catch { return error("El evento no existe.", 404); }
    const email = correo(c?.email);
    if (!emailValido(email)) return error("Ingrese un correo electrónico válido.");
    const respuesta = json({ ok: true });                     // misma respuesta exista o no el administrador
    const reg = await leerRegistro(slug);
    if (!reg || !reg.admins.some((x) => x.email === email)) return respuesta;
    // A lo más un enlace por minuto por correo y evento
    const clave = "envio-" + hash(slug + "|" + email), s = accesosStore(), previo = await s.get(clave, { type: "json" });
    if (previo?.t && Date.now() - previo.t < 60 * 1000) return respuesta;
    await s.setJSON(clave, { t: Date.now() });
    try {
      const contenido = (await contenidoStore().get(slug, { type: "json" }))?.contenido;
      await enviarEnlaceAcceso({ origen: url.origin, slug, email, contenido, idioma: c?.idioma === "en" ? "en" : "es", recordar: c?.recordar === true });
    } catch (e) { console.error("enlace de acceso:", e.message); }
    return respuesta;
  }
  if (ruta.endsWith("/acceso") && req.method === "POST") {
    if (peticionAjena(req)) return error("Solicitud no permitida.", 403);
    const c = await leerJSON(req), info = leerTokenAcceso(c?.token);
    const vencido = "El enlace de acceso no es válido o ya venció. Pida uno nuevo.";
    if (!info || info.slug !== c?.slug) return error(vencido, 401);
    const s = accesosStore(), clave = "usado-" + hash(info.n);
    if (await s.get(clave)) return error("Este enlace de acceso ya fue usado. Pida uno nuevo.", 401);
    const reg = await leerRegistro(info.slug), a = reg?.admins.find((x) => x.email === info.email);
    if (!a) return error(`La cuenta ${info.email} ya no está autorizada para administrar este evento.`, 403);
    await s.setJSON(clave, { t: Date.now() });
    return json({ email: info.email, rol: a.rol, estado: reg.estado, slug: reg.slug }, 200, { "Set-Cookie": crearCookieEv(info.email, info.r ? RECORDAR_S : undefined) });
  }
  return error("Ruta no encontrada", 404);
};
export const config = { path: ["/api/evauth/me", "/api/evauth/login", "/api/evauth/logout", "/api/evauth/enlace", "/api/evauth/acceso"] };
