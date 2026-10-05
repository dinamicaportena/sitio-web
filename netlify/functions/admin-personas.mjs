// Registro de personas desde el panel (requiere sesión de administrador).
//   GET    /api/admin/personas                    lista resumida (con institución vigente, roles, charlas y suscripción)
//   POST   /api/admin/personas                    crea una ficha
//   POST   /api/admin/personas/suscribir          {texto, reactivarBajas?, origen?, nota?}  agrega correos pegados o importados
//   GET    /api/admin/personas/:id                ficha completa y sus charlas
//   PUT    /api/admin/personas/:id                guarda la ficha (datos, correos, afiliaciones, roles)
//   DELETE /api/admin/personas/:id                elimina (solo si no tiene charlas)
//   POST   /api/admin/personas/:id/suscripcion    {evento: alta|baja|reactivacion, email?, origen?, nota?}
//   POST   /api/admin/personas/:id/fusionar       {con: ID}  incorpora la ficha «con» en esta
//   POST   /api/admin/personas/:id/enlace         {enviar?, idioma?, anular?}  enlace para que la persona actualice sus datos
//   POST   /api/admin/personas/:id/solicitud      {id, estado: resuelta|descartada, nota?}  cierra una solicitud de la persona
//   POST   /api/admin/personas/enlaces            {ids, idioma}  envía a cada persona su enlace (envío masivo, en cola)
import { json, error, leerJSON, sesion, listarCharlas, guardarFoto, borrarFoto } from "../lib/comun.mjs";
import { interpretar } from "../lib/suscriptores.mjs";
import { crearEnlace, anularEnlace, enviarEnlace, enviarEnlaces, textoEnlace } from "../lib/datos-personales.mjs";
import {
  listarPersonas, listarInstituciones, obtenerPersona, limpiarPersona, guardarPersona, crearPersona, eliminarPersona,
  registrarEvento, fusionarPersonas, personaPorCorreo, estadoSuscripcion, migrarSuscriptoresAntiguos, indicesCharlas, resumen, evento,
} from "../lib/personas.mjs";

const EDITABLES = ["nombre", "variantes", "correos", "afiliaciones", "roles", "publicar", "fotoAutorizada", "orcid", "zbmath", "enlaces", "fotoArchivo", "notas", "pendientes", "fuentes"];
const ETIQUETAS = { nombre: "nombre", variantes: "variantes", correos: "correos", afiliaciones: "afiliaciones", roles: "roles", publicar: "publicación",
                    fotoAutorizada: "autorización de foto", orcid: "ORCID", zbmath: "zbMATH", enlaces: "enlaces", fotoArchivo: "foto del sitio", fuentes: "fuentes", notas: "notas", pendientes: "pendientes", foto: "foto" };
const cambios = (a, b) => Object.keys(ETIQUETAS).filter((k) => JSON.stringify(a?.[k] ?? null) !== JSON.stringify(b?.[k] ?? null)).map((k) => ETIQUETAS[k]);

async function comprobarInstituciones(p) {
  const ids = new Set((await listarInstituciones()).map((i) => i.id));
  const malas = (p.afiliaciones || []).filter((a) => !ids.has(a.inst)).map((a) => a.inst);
  if (malas.length) throw new Error(`Institución inexistente: ${malas.join(", ")}.`);
}
const soloEditables = (cuerpo) => Object.fromEntries(EDITABLES.filter((k) => k in cuerpo).map((k) => [k, cuerpo[k]]));

export default async (req, context) => {
  const admin = sesion(req);
  if (!admin) return error("Debe iniciar sesión.", 401);
  const { id, accion } = context.params || {};

  try {
    // ----- Colección -----
    if (!id && req.method === "GET") {
      await migrarSuscriptoresAntiguos();
      const [personas, instituciones, charlas] = await Promise.all([listarPersonas(), listarInstituciones(), listarCharlas()]);
      const inst = new Map(instituciones.map((i) => [i.id, i])), ch = indicesCharlas(charlas);
      return json(personas.map((p) => resumen(p, inst, ch)).sort((a, b) => (a.nombre || a.correo).localeCompare(b.nombre || b.correo, "es")));
    }
    if (!id && req.method === "POST") {
      const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
      const datos = soloEditables(cuerpo);
      const previa = limpiarPersona(datos, {}); await comprobarInstituciones(previa);
      const p = await crearPersona(datos, { por: admin });
      if (cuerpo.foto && String(cuerpo.foto).startsWith("data:")) { p.foto = await guardarFoto(cuerpo.foto); await guardarPersona(p, { por: admin }); }
      return json(p, 201);
    }

    // ----- Agregar suscriptores (texto pegado o importado) -----
    if (id === "suscribir" && !accion && req.method === "POST") {
      const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
      const { validos, invalidos } = interpretar(cuerpo.texto);
      if (!validos.length) return error(invalidos.length ? "No se reconoció ningún correo válido." : "Pegue al menos un correo.");
      const origen = String(cuerpo.origen || "Panel (agregado por un administrador)").slice(0, 120), nota = String(cuerpo.nota || "").slice(0, 300);
      const r = { agregados: 0, nuevasFichas: 0, existentes: 0, bajasOmitidas: [], reactivados: 0, invalidos };
      const vistos = new Set();
      for (const v of validos) {                       // en orden: así las fichas nuevas reciben IDs consecutivos
        if (vistos.has(v.email)) { r.existentes++; continue; } vistos.add(v.email);
        let p = await personaPorCorreo(v.email);
        if (!p) {
          p = await crearPersona({ nombre: v.nombre || "", correos: [{ email: v.email, principal: true }], fuentes: origen },
                                 { por: admin, cambio: "Ficha creada al agregar suscriptores" });
          r.nuevasFichas++;
        } else if (!p.nombre && v.nombre) p.nombre = v.nombre;
        const estado = estadoSuscripcion(p);
        if (estado === "activo") { r.existentes++; continue; }
        if (estado === "baja" && !cuerpo.reactivarBajas) { r.bajasOmitidas.push(v.email); continue; }
        await registrarEvento(p, { evento: estado === "baja" ? "reactivacion" : "alta", email: v.email, origen, nota }, admin);
        estado === "baja" ? r.reactivados++ : r.agregados++;
      }
      return json(r);
    }

    // ----- Envío masivo de enlaces para actualizar datos -----
    if (id === "enlaces" && !accion && req.method === "POST") {
      const cuerpo = await leerJSON(req); if (!Array.isArray(cuerpo?.ids) || !cuerpo.ids.length) return error("Elija al menos una persona.");
      if (cuerpo.ids.length > 400) return error("Envíe como máximo 400 enlaces a la vez.");
      const personas = (await Promise.all(cuerpo.ids.map((x) => obtenerPersona(String(x))))).filter((x) => x && !x.reservado);
      return json(await enviarEnlaces(personas, { por: admin, origen: new URL(req.url).origin, idioma: cuerpo.idioma === "en" ? "en" : "es" }));
    }

    // ----- Ficha -----
    const p = await obtenerPersona(id);
    if (!p || p.reservado) return error("La persona no existe.", 404);

    if (!accion && req.method === "GET") {
      const charlas = (await listarCharlas()).filter((c) => c.personaId === id)
        .map((c) => ({ id: c.id, fecha: c.fecha, hora: c.hora, titulo: c.titulo, serie: c.serie || "Seminario Dinámica Porteña",
                       institucion: c.institucion, estado: c.estado, cancelada: Boolean(c.cancelada) }))
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
      return json({ ...p, enlaceDatos: p.enlaceDatos ? { ...p.enlaceDatos, hash: undefined, activo: Boolean(p.enlaceDatos.hash) && p.enlaceDatos.expira > new Date().toISOString() } : null, fotoUrl: p.foto ? `/api/foto/${p.foto}` : p.fotoArchivo ? `/assets/fotos/${encodeURIComponent(p.fotoArchivo)}` : null, estadoSuscripcion: estadoSuscripcion(p), charlas });
    }
    if (!accion && req.method === "PUT") {
      const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
      const nueva = limpiarPersona(soloEditables(cuerpo), structuredClone(p));
      await comprobarInstituciones(nueva);
      if (cuerpo.foto === null && p.foto) { await borrarFoto(p.foto); nueva.foto = null; }
      else if (typeof cuerpo.foto === "string" && cuerpo.foto.startsWith("data:")) { nueva.foto = await guardarFoto(cuerpo.foto); await borrarFoto(p.foto); }
      const lista = cambios(p, nueva);
      await guardarPersona(nueva, { por: admin, anterior: p, cambio: lista.length ? "Editó: " + lista.join(", ") : null, origen: "Panel" });
      return json(nueva);
    }
    if (!accion && req.method === "DELETE") { await eliminarPersona(id); return json({ ok: true }); }

    if (accion === "suscripcion" && req.method === "POST") {
      const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
      const ev = evento({ ...cuerpo, fecha: null });                           // valida el tipo de evento
      const estado = estadoSuscripcion(p);
      if (ev.evento === "baja" && estado !== "activo") return error("La persona no está suscrita.");
      if (ev.evento === "alta" && estado !== "sin") return error(estado === "baja" ? "La persona se dio de baja: use «Reactivar», solo si lo pidió expresamente." : "La persona ya está suscrita.");
      if (ev.evento === "reactivacion" && estado !== "baja") return error("Solo se reactiva a quien se dio de baja.");
      return json(await registrarEvento(p, { ...cuerpo, evento: ev.evento }, admin));
    }
    if (accion === "enlace" && req.method === "POST") {
      const cuerpo = (await leerJSON(req)) || {}, origen = new URL(req.url).origin, idioma = cuerpo.idioma === "en" ? "en" : "es";
      if (cuerpo.anular) { await anularEnlace(p); await guardarPersona(p, { por: admin, cambio: "Enlace para actualizar datos anulado", origen: "Panel" }); return json({ ok: true }); }
      if (cuerpo.enviar) return json(await enviarEnlace(p, { por: admin, origen, idioma }));
      const r = await crearEnlace(p, { por: admin, origen });
      await guardarPersona(p, { por: admin, cambio: "Enlace para actualizar datos generado (para copiar)", origen: "Panel" });
      return json({ ...r, mensaje: await textoEnlace(p, r.enlace, r.expira, idioma) });
    }
    if (accion === "solicitud" && req.method === "POST") {
      const cuerpo = await leerJSON(req); if (!cuerpo?.id) return error("Solicitud no válida.");
      const sol = (p.solicitudes || []).find((x) => x.id === cuerpo.id); if (!sol) return error("La solicitud no existe.", 404);
      if (!["resuelta", "descartada"].includes(cuerpo.estado)) return error("Estado no válido.");
      Object.assign(sol, { estado: cuerpo.estado, cerradaEl: new Date().toISOString(), cerradaPor: admin, nota: String(cuerpo.nota || "").slice(0, 300) });
      await guardarPersona(p, { por: admin, cambio: `Solicitud «${sol.tipo}» marcada como ${cuerpo.estado}`, origen: "Panel" });
      return json(p);
    }
    if (accion === "fusionar" && req.method === "POST") {
      const cuerpo = await leerJSON(req); if (!cuerpo?.con) return error("Indique la ficha que se incorporará.");
      return json(await fusionarPersonas(id, String(cuerpo.con), admin));
    }
    return error("Ruta o método no permitido.", 405);
  } catch (e) {
    return error(e.message || String(e));
  }
};
export const config = { path: ["/api/admin/personas", "/api/admin/personas/:id", "/api/admin/personas/:id/:accion"] };
