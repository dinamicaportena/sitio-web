// Formulario del expositor (sin cuenta; se accede con el enlace de invitación).
//   GET  /api/invitacion?t=TOKEN   datos de la charla para completar el formulario
//   POST /api/invitacion           {t, expositor, institucion, titulo, resumen, foto?}
import { json, error, leerJSON, charlas, invitaciones, sha256, texto, guardarFoto, borrarFoto } from "../lib/comun.mjs";
import { avisarEnvioExpositor } from "../lib/correo.mjs";

async function charlaDeToken(token) {
  if (!token || typeof token !== "string" || token.length > 100) return null;
  const hash = sha256(token);
  const inv = await invitaciones().get(hash, { type: "json" });
  if (!inv || inv.expira < new Date().toISOString()) return null;
  const c = await charlas().get(inv.charla, { type: "json" });
  if (!c || c.invitacion?.hash !== hash || !["invitada", "pendiente"].includes(c.estado)) return null;
  return c;
}
const vista = (c) => ({ fecha: c.fecha, hora: c.hora, sala: c.sala, expositor: c.expositor, institucion: c.institucion,
                        titulo: c.titulo, resumen: c.resumen, tieneFoto: Boolean(c.foto), enviada: c.estado === "pendiente",
                        vence: c.invitacion.expira });

export default async (req) => {
  if (req.method === "GET") {
    const c = await charlaDeToken(new URL(req.url).searchParams.get("t"));
    return c ? json(vista(c)) : error("El enlace no es válido o ya venció.", 404);
  }
  if (req.method === "POST") {
    const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
    const c = await charlaDeToken(cuerpo.t);
    if (!c) return error("El enlace no es válido o ya venció.", 404);
    const expositor = texto(cuerpo.expositor, 120), titulo = texto(cuerpo.titulo, 300);
    const resumen = texto(cuerpo.resumen, 5000), institucion = texto(cuerpo.institucion, 200);
    if (!expositor || !titulo || !resumen || !institucion) return error("Complete nombre, institución, título y resumen.");
    if (cuerpo.foto) {
      try { const nueva = await guardarFoto(cuerpo.foto); await borrarFoto(c.foto); c.foto = nueva; }
      catch (e) { return error(e.message); }
    }
    const correccion = c.estado === "pendiente";
    Object.assign(c, { expositor, institucion, titulo, resumen, estado: "pendiente",
                       enviadaPorExpositor: new Date().toISOString(), actualizada: new Date().toISOString(), actualizadaPor: "expositor" });
    await charlas().setJSON(c.id, c);
    try { await avisarEnvioExpositor(c, { origen: new URL(req.url).origin, correccion }); }
    catch (e) { console.error("No se pudo enviar el aviso por correo:", e.message); }   // la charla ya quedó guardada
    return json({ ok: true, ...vista(c) });
  }
  return error("Método no permitido.", 405);
};
export const config = { path: "/api/invitacion" };
