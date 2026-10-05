// Vínculo entre las charlas del panel y el registro de personas.
// Cada charla publicada queda asociada a una ficha (la elegida en el editor, la que tiene el mismo correo o el mismo
// nombre, o una ficha nueva) y a las instituciones del catálogo que coincidan con la institución declarada.
// La institución declarada se conserva tal cual en la charla; si difiere de la vigente de la persona, se anota como
// pendiente de revisión en su ficha (no se cambia sola).
import { fechaLarga } from "./comun.mjs";
import { listarPersonas, listarInstituciones, obtenerPersona, personaPorCorreo, crearPersona, guardarPersona, afiliacionVigente } from "./personas.mjs";

export const normal = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Instituciones del catálogo que corresponden a un texto como «UFRJ, Brasil» o «Hebrew University / PUC»
export function institucionesDesdeTexto(texto, instituciones) {
  const formas = new Map();
  for (const i of instituciones)
    for (const f of [i.nombre, i.sigla, ...(i.variantes || []), i.sigla && `${i.nombre} ${i.sigla}`]) if (f && normal(f)) formas.set(normal(f), formas.get(normal(f)) || i.id);
  const ids = [];
  for (const parte of String(texto || "").split(/\s+[\/&]\s+/)) {
    const trozos = parte.split(",");
    for (let k = trozos.length; k > 0; k--) {                 // «Universidad X, Santiago, Chile» → prueba quitando el final
      const id = formas.get(normal(trozos.slice(0, k).join(",")));
      if (id) { if (!ids.includes(id)) ids.push(id); break; }
    }
  }
  return ids;
}

// Vincula la charla c (la modifica: personaId, instituciones). crear=true crea una ficha si no hay coincidencia.
// Devuelve { persona: {id, nombre} | null, avisos: [] }.
export async function vincularCharla(c, { por = "", crear = false } = {}) {
  const avisos = [];
  let p = c.personaId ? await obtenerPersona(c.personaId) : null;
  if (!p && c.email) p = await personaPorCorreo(c.email);
  if (!p && c.expositor) {
    const n = normal(c.expositor), todas = await listarPersonas();
    const iguales = todas.filter((x) => normal(x.nombre) === n || (x.variantes || []).some((v) => normal(v) === n));
    if (iguales.length === 1) p = iguales[0];
    else if (iguales.length > 1) avisos.push(`Hay ${iguales.length} fichas con el nombre «${c.expositor}»: elija la correcta en el editor de la charla.`);
  }
  if (!p && crear && c.expositor && !avisos.length)
    p = await crearPersona({ nombre: c.expositor, correos: c.email ? [{ email: c.email, principal: true }] : [], fuentes: "Charla del panel" },
                           { por, cambio: `Ficha creada al publicar la charla del ${c.fecha}` });
  if (!p) { c.instituciones = c.instituciones || []; return { persona: null, avisos }; }

  c.personaId = p.id;
  const notas = [], antes = JSON.stringify(p);
  if (c.email && !(p.correos || []).some((x) => x.email === c.email)) {
    const otra = await personaPorCorreo(c.email);
    if (otra && otra.id !== p.id) avisos.push(`El correo ${c.email} pertenece a otra ficha (${otra.nombre}, ${otra.id}); no se agregó a ${p.nombre}.`);
    else p.correos = [...(p.correos || []), { email: c.email, principal: !(p.correos || []).length }];
  }
  if (c.expositor && c.expositor !== p.nombre && !(p.variantes || []).includes(c.expositor)) p.variantes = [...(p.variantes || []), c.expositor];
  if (c.institucion) {
    const ids = institucionesDesdeTexto(c.institucion, await listarInstituciones());
    c.instituciones = ids;
    const vig = afiliacionVigente(p), cuando = fechaLarga(c.fecha);
    if (!ids.length) notas.push(`La institución «${c.institucion}» (charla del ${cuando}) no está en el catálogo: agréguela en «Instituciones» y vincúlela.`);
    else if (!(p.afiliaciones || []).length)
      p.afiliaciones = [{ inst: ids[0], unidad: "", desde: "", hasta: "", vigente: true, primera: c.fecha, ultima: c.fecha, fuente: `Declarada en la charla del ${c.fecha}` }];
    else if (!vig || vig.inst !== ids[0]) notas.push(`En la charla del ${cuando} declaró «${c.institucion}»: revisar si cambió de institución.`);
  } else c.instituciones = [];
  const nuevas = notas.filter((x) => !(p.pendientes || "").includes(x));
  if (nuevas.length) p.pendientes = [p.pendientes, ...nuevas].filter(Boolean).join("\n");
  if (JSON.stringify(p) !== antes) {
    try { await guardarPersona(p, { por, cambio: `Vinculada a la charla del ${c.fecha}` }); }
    catch (e) { avisos.push(e.message); }
  }
  return { persona: { id: p.id, nombre: p.nombre }, avisos };
}
