// Exportación e importación del registro completo (personas, instituciones, afiliaciones, roles, charlas y
// suscripción) como libro Excel. Las columnas son las mismas en ambos sentidos: un Excel descargado del panel,
// corregido y vuelto a importar, actualiza el registro. El navegador convierte el Excel a/desde estas filas.
import { charlas as almacenCharlas, listarCharlas, texto } from "./comun.mjs";
import { listarEventos, limpiarEvento, eventosStore, generadorIdEvento } from "./eventos.mjs";
import {
  listarPersonas, listarInstituciones, personasStore, correosStore, institucionesStore, idDe, limpiarPersona, limpiarInstitucion,
  evento, claveEvento, ultimoEvento, correoPrincipal, indicesCharlas, resumen, enTandas, fecha, EVENTOS, versionar,
  generadorIdPersona, generadorIdInstitucion,
} from "./personas.mjs";

export const HOJAS = {
  Personas: ["ID persona", "Nombre normalizado", "Variantes del nombre (en fuentes)", "Correo principal", "Otros correos (separados por ;)",
    "Institución vigente", "País (institución vigente)", "Investigador/a", "Colaborador/a", "Estudiante", "Graduado/a", "N.º charlas",
    "Primera charla", "Última charla", "Suscripción a correos", "Publicar en el sitio", "Foto autorizada", "Foto (archivo)", "ORCID",
    "zbMATH (ID autor)", "Enlaces públicos (texto | URL; …)", "Fuentes de los datos", "Pendientes de revisión", "Notas", "ID institución vigente"],
  Instituciones: ["ID institución", "Nombre normalizado", "Nombre en inglés", "Sigla", "Ciudad", "País", "Formas registradas en las fuentes", "N.º charlas",
    "N.º personas con afiliación vigente", "Notas"],
  Afiliaciones: ["ID persona", "Nombre", "ID institución", "Institución", "Unidad / programa", "Desde", "Hasta", "Primera evidencia (charla)",
    "Vigente (Sí/No)", "Última evidencia (charla)", "Fuente"],
  Roles: ["ID persona", "Nombre", "Rol", "Detalle (programa, tipo de colaboración)", "Director/a de tesis", "Desde", "Hasta", "Estado",
    "Motivo / nota del cambio", "Fuente"],
  Charlas: ["ID charla", "Serie", "Fecha", "Hora", "Título", "ID persona", "Expositor/a (nombre normalizado)", "Expositor/a (como figura en la fuente)",
    "Institución declarada (texto original)", "ID institución", "Institución normalizada", "ID institución 2", "País (de la institución)", "Lugar",
    "Resumen", "Notas", "Fuente", "Estado"],
  "Suscripción": ["ID persona", "Nombre", "Correo", "Evento", "Fecha", "Origen", "Consentimiento / nota"],
  Eventos: ["ID evento", "Título", "Título en inglés", "Tipo", "Inicio", "Término", "Lugar", "Descripción", "Descripción en inglés", "Enlace", "Publicar en el sitio"],
  Historial: ["ID persona", "Nombre", "Fecha", "Quién", "Origen", "Cambio", "Campo", "Antes", "Después"],
};
const SI = (b) => (b ? "Sí" : "No");
const SERIE = "Seminario Dinámica Porteña";

// ---------- Exportación ----------
export async function exportar() {
  const [personas, instituciones, charlas, eventos] = await Promise.all([listarPersonas(), listarInstituciones(), listarCharlas(), listarEventos()]);
  const inst = new Map(instituciones.map((i) => [i.id, i])), ch = indicesCharlas(charlas), nombre = new Map(personas.map((p) => [p.id, p.nombre]));
  personas.sort((a, b) => a.id.localeCompare(b.id));
  const filas = { Personas: [], Instituciones: [], Afiliaciones: [], Roles: [], Charlas: [], "Suscripción": [], Eventos: [], Historial: [] };
  for (const p of personas) {
    const r = resumen(p, inst, ch), ev = ultimoEvento(p);
    filas.Personas.push([p.id, p.nombre, (p.variantes || []).join("; "), correoPrincipal(p),
      (p.correos || []).filter((c) => !c.principal).map((c) => c.email).join("; "), r.institucion, r.pais, r.investigador ? "Sí" : "",
      r.colaborador, r.estudiante, r.graduado ? "Sí" : "", r.charlas, r.primeraCharla, r.ultimaCharla, ev ? EVENTOS[ev.evento] : "Sin registro",
      SI(p.publicar), SI(p.fotoAutorizada), p.foto ? "Sí (subida en el panel)" : p.fotoArchivo || "", p.orcid || "", p.zbmath || "",
      (p.enlaces || []).map((x) => `${x.texto} | ${x.url}`).join("; "), p.fuentes || "", p.pendientes || "",
      p.notas || "", r.institucionId]);
    for (const a of p.afiliaciones || [])
      filas.Afiliaciones.push([p.id, p.nombre, a.inst, inst.get(a.inst)?.nombre || "", a.unidad, a.desde, a.hasta, a.primera, SI(a.vigente), a.ultima, a.fuente]);
    for (const x of p.roles || [])
      filas.Roles.push([p.id, p.nombre, x.rol, x.detalle, x.directorTesis, x.desde, x.hasta, x.estado, x.nota, x.fuente]);
    for (const h of p.historial || []) {
      const base = [p.id, p.nombre, h.el.slice(0, 16).replace("T", " "), h.por || "", h.origen || "", h.cambio || ""];
      if (!(h.cambios || []).length) filas.Historial.push([...base, "", "", ""]);
      else for (const d of h.cambios) filas.Historial.push([...base, d.etiqueta, d.antes, d.despues]);
    }
    for (const e of p.suscripcion || [])
      filas["Suscripción"].push([p.id, p.nombre, e.email, EVENTOS[e.evento], e.fecha.slice(0, 10), e.origen, e.nota]);
  }
  for (const i of instituciones) {
    const nCh = charlas.filter((c) => !c.cancelada && c.estado === "publicada" && (c.instituciones || []).includes(i.id)).length;
    const nVig = personas.filter((p) => (p.afiliaciones || []).some((a) => a.vigente && a.inst === i.id)).length;
    filas.Instituciones.push([i.id, i.nombre, i.nombreEn || "", i.sigla || "", i.ciudad || "", i.pais, (i.variantes || []).join("; "), nCh, nVig, i.notas || ""]);
  }
  for (const c of [...charlas].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))) {
    const [i1, i2] = c.instituciones || [];
    const pais = [i1, i2].filter(Boolean).map((x) => inst.get(x)?.pais).filter(Boolean).join(" / ");
    const estado = c.cancelada ? "Cancelada" : c.estado === "publicada" ? "Publicada" : "En preparación";
    filas.Charlas.push([c.id, c.serie || SERIE, c.fecha, c.hora || "", c.titulo || "", c.personaId || "", nombre.get(c.personaId) || "", c.expositor || "",
      c.institucion || "", i1 || "", inst.get(i1)?.nombre || "", i2 || "", pais, c.sala || "", c.resumen || "", c.notas || "",
      c.historica ? "Archivo histórico del seminario" : "Panel", estado]);
  }
  for (const e of [...eventos].sort((a, b) => a.inicio.localeCompare(b.inicio)))
    filas.Eventos.push([e.id, e.titulo, e.tituloEn, e.tipo, e.inicio, e.fin, e.lugar, e.descripcion, e.descripcionEn, e.enlace, SI(e.publicar)]);
  return { generado: new Date().toISOString(), hojas: Object.entries(HOJAS).map(([nombre, columnas]) => ({ nombre, columnas, filas: filas[nombre] })) };
}

// ---------- Importación ----------
// hojas: { "Personas": [ {encabezado: valor, …}, … ], … } (filas tal como las lee el navegador). Hojas ausentes no se tocan.
export async function importar(hojas, { aplicar = false, por = "" } = {}) {
  const errores = [], avisos = [];
  const err = (hoja, fila, m) => errores.length < 200 && errores.push({ hoja, fila, mensaje: m });
  const clave = (fila, col) => Object.keys(fila).find((x) => x.trim().toLowerCase() === col.toLowerCase());
  const val = (fila, col) => { const k = clave(fila, col); return k ? String(fila[k] ?? "").trim() : ""; };
  // solo se toman las columnas presentes: un Excel antiguo sin una columna no borra ese dato
  const presentes = (fila, pares) => Object.fromEntries(pares.filter(([, col]) => clave(fila, col)).map(([k, col]) => [k, val(fila, col)]));
  const filas = (h) => (Array.isArray(hojas?.[h]) ? hojas[h] : null);
  const vacia = (f) => !Object.values(f || {}).some((v) => String(v ?? "").trim());

  const [personas, instituciones, charlas] = await Promise.all([listarPersonas(), listarInstituciones(), listarCharlas()]);
  const P = new Map(personas.map((p) => [p.id, p])), I = new Map(instituciones.map((i) => [i.id, i])), C = new Map(charlas.map((c) => [c.id, c]));
  const nuevasP = new Map(), nuevasI = new Map(), nuevasC = new Map();      // id → objeto final (solo lo que cambia o se crea)
  const conteo = { instituciones: { nuevas: 0, modificadas: 0, sinCambios: 0 }, personas: { nuevas: 0, modificadas: 0, sinCambios: 0 },
                   charlas: { nuevas: 0, modificadas: 0, sinCambios: 0 }, eventos: { nuevas: 0, modificadas: 0, sinCambios: 0 }, eventosNuevos: 0 };

  // 1) Instituciones
  const sigI = await generadorIdInstitucion(); let kI = 0;
  (filas("Instituciones") || []).forEach((f, n) => {
    if (vacia(f)) return;
    let id = val(f, "ID institución");
    if (id && !/^I\d{3,}$/.test(id)) return err("Instituciones", n + 2, `ID no válido «${id}» (formato I001).`);
    try {
      const datos = presentes(f, [["nombre", "Nombre normalizado"], ["nombreEn", "Nombre en inglés"], ["sigla", "Sigla"], ["ciudad", "Ciudad"],
                                  ["pais", "País"], ["variantes", "Formas registradas en las fuentes"], ["notas", "Notas"]]);
      const base = id ? I.get(id) : null;
      if (!id) { id = sigI(++kI); avisos.push(`Instituciones, fila ${n + 2}: institución nueva sin ID; se le asignará ${id}.`); }
      if (nuevasI.has(id)) return err("Instituciones", n + 2, `ID repetido ${id}.`);
      const i = { ...limpiarInstitucion(datos, base || {}), id };
      if (!base) { nuevasI.set(id, i); conteo.instituciones.nuevas++; }
      else if (JSON.stringify(i) !== JSON.stringify({ ...limpiarInstitucion({}, base), id })) { nuevasI.set(id, i); conteo.instituciones.modificadas++; }
      else conteo.instituciones.sinCambios++;
    } catch (e) { err("Instituciones", n + 2, e.message); }
  });
  const instExiste = (id) => I.has(id) || nuevasI.has(id);

  // 2) Personas (datos de la ficha)
  const sigP = await generadorIdPersona(); let kP = 0;
  const destino = new Map();                    // id → ficha final de cada persona presente en el libro
  const comparable = (p) => JSON.stringify(["nombre", "variantes", "correos", "afiliaciones", "roles", "publicar", "fotoAutorizada", "fotoArchivo", "orcid", "zbmath", "enlaces",
    "notas", "pendientes", "fuentes", "suscripcion"].map((k) => p?.[k] ?? null));
  (filas("Personas") || []).forEach((f, n) => {
    if (vacia(f)) return;
    let id = val(f, "ID persona");
    if (id && !/^P\d{4,}$/.test(id)) return err("Personas", n + 2, `ID no válido «${id}» (formato P0001).`);
    if (id && destino.has(id)) return err("Personas", n + 2, `ID repetido ${id}.`);
    const otros = val(f, "Otros correos (separados por ;)").split(/[;,\s]+/).filter(Boolean);
    const principal = val(f, "Correo principal");
    const datos = presentes(f, [["nombre", "Nombre normalizado"], ["variantes", "Variantes del nombre (en fuentes)"], ["publicar", "Publicar en el sitio"],
      ["fotoAutorizada", "Foto autorizada"], ["fotoArchivo", "Foto (archivo)"], ["orcid", "ORCID"], ["zbmath", "zbMATH (ID autor)"], ["enlaces", "Enlaces públicos (texto | URL; …)"],
      ["notas", "Notas"], ["pendientes", "Pendientes de revisión"], ["fuentes", "Fuentes de los datos"]]);
    if (clave(f, "Correo principal") || clave(f, "Otros correos (separados por ;)"))
      datos.correos = [principal, ...otros].filter(Boolean).map((email, k) => ({ email, principal: k === 0 && Boolean(principal) }));
    if (!id) { id = sigP(++kP); avisos.push(`Personas, fila ${n + 2}: persona nueva sin ID (${datos.nombre || principal}); se le asignará ${id}.`); }
    try { destino.set(id, limpiarPersona(datos, structuredClone(P.get(id) || { id }))); }
    catch (e) { err("Personas", n + 2, e.message); }
  });
  const fichaDe = (id) => destino.get(id) || (P.has(id) ? (destino.set(id, structuredClone(P.get(id))), destino.get(id)) : null);

  // 3) Afiliaciones y roles: reemplazan el historial de cada persona que aparece en la hoja o en «Personas»
  for (const [hoja, campo, leer] of [
    ["Afiliaciones", "afiliaciones", (f) => ({ inst: val(f, "ID institución"), unidad: val(f, "Unidad / programa"), desde: val(f, "Desde"), hasta: val(f, "Hasta"),
      vigente: val(f, "Vigente (Sí/No)"), primera: val(f, "Primera evidencia (charla)"), ultima: val(f, "Última evidencia (charla)"), fuente: val(f, "Fuente") })],
    ["Roles", "roles", (f) => ({ rol: val(f, "Rol"), detalle: val(f, "Detalle (programa, tipo de colaboración)"), directorTesis: val(f, "Director/a de tesis"),
      desde: val(f, "Desde"), hasta: val(f, "Hasta"), estado: val(f, "Estado") || "Vigente", nota: val(f, "Motivo / nota del cambio"), fuente: val(f, "Fuente") })],
  ]) {
    const fs = filas(hoja); if (!fs) continue;
    const grupos = new Map([...destino.keys()].map((id) => [id, []]));
    fs.forEach((f, n) => {
      if (vacia(f)) return;
      const id = val(f, "ID persona");
      if (!fichaDe(id)) return err(hoja, n + 2, `La persona ${id || "(sin ID)"} no existe en el registro ni en la hoja Personas.`);
      const x = leer(f);
      if (hoja === "Afiliaciones" && !instExiste(x.inst)) return err(hoja, n + 2, `Institución inexistente «${x.inst}».`);
      (grupos.get(id) || grupos.set(id, []).get(id)).push({ ...x, fila: n + 2 });
    });
    for (const [id, xs] of grupos) {
      try { const p = fichaDe(id); destino.set(id, limpiarPersona({ [campo]: xs }, p)); }
      catch (e) { err(hoja, xs[0]?.fila || 0, `${id}: ${e.message}`); }
    }
  }

  // 4) Suscripción: los eventos se agregan (nunca se borran); un correo nuevo se incorpora a la ficha
  (filas("Suscripción") || []).forEach((f, n) => {
    if (vacia(f)) return;
    const id = val(f, "ID persona"), p = fichaDe(id);
    if (!p) return err("Suscripción", n + 2, `La persona ${id || "(sin ID)"} no existe.`);
    try {
      const ev = evento({ evento: val(f, "Evento"), fecha: val(f, "Fecha") || null, email: val(f, "Correo") || correoPrincipal(p),
                          origen: val(f, "Origen"), nota: val(f, "Consentimiento / nota"), por });
      if (!ev.email) return err("Suscripción", n + 2, `${id}: falta el correo.`);
      if (!val(f, "Fecha")) avisos.push(`Suscripción, fila ${n + 2}: sin fecha; se usará la fecha de la importación.`);
      if ((p.suscripcion || []).some((e) => claveEvento(e) === claveEvento(ev))) return;
      if (!(p.correos || []).some((c) => c.email === ev.email)) {
        p.correos = [...(p.correos || []), { email: ev.email, principal: !(p.correos || []).length }];
        avisos.push(`Suscripción, fila ${n + 2}: ${ev.email} se agregó a los correos de ${id}.`);
      }
      p.suscripcion = [...(p.suscripcion || []), ev]; conteo.eventosNuevos++;
    } catch (e) { err("Suscripción", n + 2, `${id}: ${e.message}`); }
  });

  // 5) Correos únicos: un correo pertenece a una sola persona
  const duenos = new Map();
  for (const p of [...personas.filter((x) => !destino.has(x.id)), ...destino.values()])
    for (const { email } of p.correos || []) {
      if (duenos.has(email) && duenos.get(email) !== p.id) err("Personas", 0, `El correo ${email} aparece en ${duenos.get(email)} y en ${p.id}.`);
      duenos.set(email, p.id);
    }
  for (const [id, p] of destino) {
    if (!P.has(id)) { nuevasP.set(id, p); conteo.personas.nuevas++; }
    else if (comparable(p) !== comparable(limpiarPersona({}, structuredClone(P.get(id))))) { nuevasP.set(id, p); conteo.personas.modificadas++; }
    else conteo.personas.sinCambios++;
  }
  const personaExiste = (id) => P.has(id) || destino.has(id);

  // 6) Charlas
  (filas("Charlas") || []).forEach((f, n) => {
    if (vacia(f)) return;
    const id = val(f, "ID charla"), base = C.get(id);
    if (!id) return err("Charlas", n + 2, "Falta el ID de la charla.");
    if (!base && !/^C\d{4,}$/.test(id)) { avisos.push(`Charlas, fila ${n + 2}: la charla ${id} ya no existe en el panel; se omite.`); return; }
    const pid = val(f, "ID persona"), i1 = val(f, "ID institución"), i2 = val(f, "ID institución 2");
    if (pid && !personaExiste(pid)) return err("Charlas", n + 2, `Persona inexistente «${pid}».`);
    for (const x of [i1, i2].filter(Boolean)) if (!instExiste(x)) return err("Charlas", n + 2, `Institución inexistente «${x}».`);
    if (!pid) avisos.push(`Charlas, fila ${n + 2}: la charla ${id} no está vinculada a ninguna persona.`);
    try {
      const c = structuredClone(base || { id, estado: "publicada", historica: true, foto: null, invitacion: null, certificado: { omitido: "archivo histórico" },
                                         creada: new Date().toISOString(), creadaPor: por || "importación" });
      c.personaId = pid || null; c.instituciones = [i1, i2].filter(Boolean); c.serie = val(f, "Serie") || SERIE;
      if (c.historica) {                                    // las charlas del archivo histórico se corrigen desde el Excel
        c.fecha = fecha(val(f, "Fecha")); if (!c.fecha) throw new Error("falta la fecha");
        c.hora = val(f, "Hora").slice(0, 5); c.titulo = texto(val(f, "Título"), 300); c.resumen = texto(val(f, "Resumen"), 5000);
        c.expositor = texto(val(f, "Expositor/a (como figura en la fuente)"), 120); c.institucion = texto(val(f, "Institución declarada (texto original)"), 200);
        c.sala = texto(val(f, "Lugar"), 120); c.notas = texto(val(f, "Notas"), 500);
        if (!c.titulo) throw new Error("falta el título");
      }
      const norm = base && { ...base, personaId: base.personaId || null, instituciones: base.instituciones || [], serie: base.serie || SERIE };
      const antes = base ? JSON.stringify(norm) : null; c.actualizada = base?.actualizada;
      if (!base) { c.actualizada = c.creada; nuevasC.set(id, c); conteo.charlas.nuevas++; }
      else if (JSON.stringify(c) !== antes) { c.actualizada = new Date().toISOString(); c.actualizadaPor = por; nuevasC.set(id, c); conteo.charlas.modificadas++; }
      else conteo.charlas.sinCambios++;
    } catch (e) { err("Charlas", n + 2, `${id}: ${e.message}`); }
  });

  // 7) Eventos (por ID; una fila sin ID es un evento nuevo)
  const E = new Map((await listarEventos()).map((e) => [e.id, e])), nuevosE = new Map();
  const sigE = await generadorIdEvento(); let kE = 0;
  (filas("Eventos") || []).forEach((f, n) => {
    if (vacia(f)) return;
    let id = val(f, "ID evento");
    if (id && !/^E\d{3,}$/.test(id)) return err("Eventos", n + 2, `ID no válido «${id}» (formato E001).`);
    try {
      const datos = presentes(f, [["titulo", "Título"], ["tituloEn", "Título en inglés"], ["tipo", "Tipo"], ["inicio", "Inicio"], ["fin", "Término"], ["lugar", "Lugar"],
        ["descripcion", "Descripción"], ["descripcionEn", "Descripción en inglés"], ["enlace", "Enlace"], ["publicar", "Publicar en el sitio"]]);
      for (const k of ["inicio", "fin"]) if (datos[k] && /^\d+$/.test(datos[k])) datos[k] = fecha(Number(datos[k]));
      const base = id ? E.get(id) : null;
      if (!id) { id = sigE(++kE); avisos.push(`Eventos, fila ${n + 2}: evento nuevo sin ID; se le asignará ${id}.`); }
      if (nuevosE.has(id)) return err("Eventos", n + 2, `ID repetido ${id}.`);
      const e = { ...limpiarEvento(datos, base || {}), id };
      const comparableE = (x) => JSON.stringify(["titulo", "tituloEn", "tipo", "inicio", "fin", "lugar", "descripcion", "descripcionEn", "enlace", "publicar"].map((k) => x?.[k] ?? ""));
      if (!base) { nuevosE.set(id, { ...e, creado: new Date().toISOString(), creadoPor: por }); conteo.eventos.nuevas++; }
      else if (comparableE(e) !== comparableE(limpiarEvento({}, base))) { nuevosE.set(id, { ...e, actualizado: new Date().toISOString(), actualizadoPor: por }); conteo.eventos.modificadas++; }
      else conteo.eventos.sinCambios++;
    } catch (x) { err("Eventos", n + 2, x.message); }
  });

  const informe = { ok: !errores.length, aplicado: false, conteo, errores, avisos: avisos.slice(0, 200), totalAvisos: avisos.length };
  if (!aplicar || errores.length) return informe;

  // ---------- Escritura ----------
  await enTandas([...nuevasI.values()], (i) => institucionesStore().setJSON(i.id, i));
  const ahora = new Date().toISOString();
  await enTandas([...nuevasP.values()], async (p) => {
    const previa = P.get(p.id);
    if (!previa) p.creada = ahora;
    if (previa) await versionar(previa, p, { por, cambio: "Actualizada al importar el registro (Excel)", origen: "Importación del registro" });
    else { p.historial = [...(p.historial || []), { el: ahora, por, cambio: "Ficha creada al importar el registro (Excel)", origen: "Importación del registro" }];
           p.actualizada = ahora; p.actualizadaPor = por; }
    await personasStore().setJSON(p.id, p);
    const nuevos = (p.correos || []).map((c) => c.email), viejos = (previa?.correos || []).map((c) => c.email);
    await Promise.all(nuevos.map((email) => correosStore().setJSON(idDe(email), { persona: p.id, email })));
    await Promise.all(viejos.filter((x) => !nuevos.includes(x)).map((email) => correosStore().delete(idDe(email))));
  });
  await enTandas([...nuevasC.values()], (c) => almacenCharlas().setJSON(c.id, c));
  await enTandas([...nuevosE.values()], (e) => eventosStore().setJSON(e.id, e));
  informe.aplicado = true;
  return informe;
}
