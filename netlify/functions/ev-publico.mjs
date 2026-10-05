// Parte pública de una página de evento:
//   GET  /api/evento/:slug               contenido publicado + lista pública de participantes (solo nombre, institución y país)
//   POST /api/evento/:slug/inscripcion   inscripción (se rechaza si el evento no está publicado, la inscripción está cerrada o venció el plazo)
// Un evento en borrador solo lo ve (vista previa) quien tiene permiso sobre él.
import { json, error, leerJSON, texto, emailValido, sha256 } from "../lib/comun.mjs";
import { leerRegistro, permiso, contenidoStore, inscStore, validarSlug } from "../lib/ev.mjs";

const NIVELES = ["investigador", "postdoc", "doctorado", "magister", "pregrado", "otro"];
const hoyChile = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

async function inscritosPublicos(slug) {
  const s = inscStore(), { blobs } = await s.list({ prefix: slug + "/" });
  const todos = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
  return todos.filter((i) => i && i.estado === "aprobada" && i.publicar).map((i) => ({ nombre: i.nombre, institucion: i.institucion, pais: i.pais }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export default async (req, context) => {
  let slug; try { slug = validarSlug(context.params?.slug); } catch { return error("El evento no existe.", 404); }
  const reg = await leerRegistro(slug);
  if (!reg) return error("El evento no existe.", 404);
  const p = permiso(req, reg), publicado = reg.estado === "publicado";
  const guardado = await contenidoStore().get(slug, { type: "json" });

  if (new URL(req.url).pathname.endsWith("/inscripcion")) {
    if (req.method !== "POST") return error("Método no permitido.", 405);
    if (!publicado) return error("La inscripción no está disponible.", 403);
    const c = await leerJSON(req);
    if (!c) return error("Solicitud no válida.");
    if (c.web) return json({ ok: true });                       // campo trampa para robots
    const insc = guardado?.contenido?.inscripcion;
    if (!insc || insc.abierta !== true) return error("La inscripción está cerrada.", 403);
    if (insc.fechaLimite && hoyChile() > insc.fechaLimite) return error("El plazo de inscripción ha terminado.", 403);
    const nombre = texto(c.nombre, 120), institucion = texto(c.institucion, 160), pais = texto(c.pais, 80), email = texto(c.email, 160).toLowerCase();
    if (!nombre || !institucion || !pais) return error("Complete nombre, institución y país.");
    if (!emailValido(email)) return error("Ingrese un correo electrónico válido.");
    if (!c.privacidad) return error("Debe aceptar el tratamiento de sus datos para inscribirse.");
    const id = sha256(email).slice(0, 24), s = inscStore(), previa = await s.get(`${slug}/${id}`, { type: "json" }), ahora = new Date().toISOString();
    const nueva = { id, nombre, institucion, pais, email, nivel: NIVELES.includes(c.nivel) ? c.nivel : "otro",
      charla: Boolean(c.charla), tituloCharla: texto(c.tituloCharla, 250), observaciones: texto(c.observaciones, 600), publicar: Boolean(c.publicar),
      suscribir: Boolean(c.suscribir),                           // se suscribe a la lista de Dinámica Porteña cuando se aprueba la inscripción
      idioma: c.idioma === "en" ? "en" : "es", estado: "pendiente", creada: previa?.creada || ahora, actualizada: ahora };
    // Si el correo ya estaba inscrito, la nueva versión vuelve a revisión (no hereda la aprobación) y se guarda la anterior,
    // para que nadie pueda cambiar el nombre publicado de otra persona inscribiéndose con su correo.
    if (previa) nueva.anterior = { nombre: previa.nombre, institucion: previa.institucion, pais: previa.pais, estado: previa.estado, publicar: previa.publicar, actualizada: previa.actualizada || previa.creada };
    await s.setJSON(`${slug}/${id}`, nueva);
    return json({ ok: true }, 201);                              // misma respuesta exista o no la inscripción previa
  }

  if (req.method !== "GET") return error("Método no permitido.", 405);
  if (!publicado && !p) return error("Este evento aún no está publicado.", 404);
  let inscritos = []; try { inscritos = await inscritosPublicos(slug); } catch { /* lista vacía */ }
  const cuerpo = { slug, estado: reg.estado, contenido: guardado?.contenido || null, inscritos, vistaPrevia: !publicado };
  return json(cuerpo, 200, publicado && !p
    ? { "Cache-Control": "public, max-age=30", "Netlify-CDN-Cache-Control": "public, durable, max-age=60, stale-while-revalidate=120" } : {});   // cambios visibles en 1–3 minutos
};
export const config = { path: ["/api/evento/:slug", "/api/evento/:slug/inscripcion"] };
