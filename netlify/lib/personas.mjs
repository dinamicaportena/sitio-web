// Registro de personas de Dinámica Porteña: una ficha única por persona (investigadores, colaboradores,
// estudiantes, graduados, expositores y suscriptores), con su historial de correos, afiliaciones, roles y
// suscripción. Nada se borra del historial: los cambios cierran el registro anterior y agregan uno nuevo.
//
// Almacenes (Netlify Blobs):
//   personas      clave = ID de persona (P0001…)            ficha completa
//   correos       clave = idDe(correo) (24 hex)              índice correo → persona (un correo pertenece a una sola persona)
//   instituciones clave = ID de institución (I001…)          catálogo de instituciones
import { almacen, sha256, texto, emailValido, fechaValida, listarCharlas, charlas as almacenCharlas } from "./comun.mjs";

export const personasStore = () => almacen("personas");
export const correosStore = () => almacen("correos");
export const institucionesStore = () => almacen("instituciones");

export const idDe = (email) => sha256(String(email).trim().toLowerCase()).slice(0, 24);

export const ROLES = ["Director", "Co-director", "Investigador", "Colaborador nacional", "Colaborador internacional", "Postdoctorado",
  "Estudiante de magíster", "Estudiante de doctorado", "Graduado de magíster", "Graduado de doctorado", "Estudiante o graduado (por precisar)"];
export const ESTADOS_ROL = ["Vigente", "Finalizado", "Retiro voluntario", "Por confirmar"];
export const EVENTOS = { alta: "Alta", baja: "Baja", reactivacion: "Reactivación" };
const HISTORIAL_MAX = 300;
// Copia completa de la ficha antes de cada cambio (clave «P0001/fecha ISO»): respaldo de todas las versiones anteriores
export const versionesStore = () => almacen("versiones");

// ---------- Diferencias legibles entre dos versiones de una ficha ----------
export const CAMPOS = { nombre: "Nombre", variantes: "Otras formas del nombre", correos: "Correos", afiliaciones: "Instituciones", roles: "Roles",
  publicar: "Publicar en el sitio", fotoAutorizada: "Foto autorizada", foto: "Foto subida", fotoArchivo: "Foto del sitio", orcid: "ORCID",
  zbmath: "zbMATH", enlaces: "Enlaces públicos", notas: "Notas internas", pendientes: "Pendientes de revisión", fuentes: "Fuentes de los datos" };
const periodo = (x) => (x.desde || x.hasta ? ` ${x.desde || "…"}→${x.hasta || ""}` : "");
function legible(campo, v) {
  if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return "";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (campo === "correos") return v.map((c) => c.email + (c.principal ? " (principal)" : "")).join("; ");
  if (campo === "afiliaciones") return v.map((a) => `${a.inst}${a.unidad ? " · " + a.unidad : ""}${periodo(a)}${a.vigente ? " (vigente)" : ""}`).join("; ");
  if (campo === "roles") return v.map((r) => `${r.rol}${r.detalle ? " · " + r.detalle : ""} (${r.estado}${periodo(r)})${r.nota ? " — " + r.nota : ""}`).join("; ");
  if (campo === "enlaces") return v.map((e) => `${e.texto} | ${e.url}`).join("; ");
  if (campo === "foto") return "foto " + String(v).slice(-6);
  return Array.isArray(v) ? v.join("; ") : String(v);
}
export function diferencias(a, b) {
  return Object.entries(CAMPOS).map(([campo, etiqueta]) => ({ campo, etiqueta, antes: legible(campo, a?.[campo]).slice(0, 3000), despues: legible(campo, b?.[campo]).slice(0, 3000) }))
    .filter((d) => d.antes !== d.despues);
}

export async function enTandas(items, fn, tam = 40) {
  const out = [];
  for (let i = 0; i < items.length; i += tam) out.push(...(await Promise.all(items.slice(i, i + tam).map(fn))));
  return out;
}
const unicos = (xs) => [...new Set(xs)];
const lista = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === "" ? [] : String(v).split(/\s*;\s*/));
const bool = (v) => v === true || /^(s[ií]|true|1|x)$/i.test(String(v ?? "").trim());

// Fecha AAAA-MM-DD (acepta fechas ISO completas y números de serie de Excel); "" si no hay
export function fecha(v) {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v === "number" && v > 59 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
  const s = String(v).trim().slice(0, 10);
  if (!fechaValida(s)) throw new Error(`fecha no válida: «${v}»`);
  return s;
}

// ---------- Derivados ----------
export const correoPrincipal = (p) => ((p.correos || []).find((c) => c.principal) || (p.correos || [])[0])?.email || "";
export const afiliacionVigente = (p) => (p.afiliaciones || []).find((a) => a.vigente) || null;
export const rolesVigentes = (p) => (p.roles || []).filter((r) => r.estado === "Vigente").map((r) => r.rol);
const ordenEventos = (p) => (p.suscripcion || []).map((e, i) => ({ e, i })).sort((a, b) => a.e.fecha.localeCompare(b.e.fecha) || a.i - b.i).map((x) => x.e);
export function ultimoEvento(p) { const ev = ordenEventos(p); return ev[ev.length - 1] || null; }
// "activo", "baja" o "sin" (nunca suscrita)
export function estadoSuscripcion(p) { const e = ultimoEvento(p); return !e ? "sin" : e.evento === "baja" ? "baja" : "activo"; }
// Correo al que se envían los anuncios: el del último alta o reactivación, si sigue siendo de la persona; si no, el principal
export function correoSuscrito(p) {
  if (estadoSuscripcion(p) !== "activo") return "";
  const e = ultimoEvento(p), propios = (p.correos || []).map((c) => c.email);
  return e?.email && propios.includes(e.email) ? e.email : correoPrincipal(p);
}

// ---------- Validación y limpieza de una ficha ----------
// e: datos recibidos (panel o importación); base: ficha existente. Devuelve la ficha limpia o lanza un Error.
export function limpiarPersona(e, base = {}) {
  const p = { ...base };
  if ("nombre" in e) p.nombre = texto(e.nombre, 150);
  if ("variantes" in e) p.variantes = unicos(lista(e.variantes).map((v) => texto(v, 150)).filter((v) => v && v !== p.nombre)).slice(0, 30);
  if ("correos" in e) {
    const cs = []; const vistos = new Set();
    for (const c of e.correos || []) {
      const email = texto(typeof c === "string" ? c : c.email, 200).toLowerCase();
      if (!email || vistos.has(email)) continue;
      if (!emailValido(email)) throw new Error(`Correo no válido: «${email}».`);
      vistos.add(email); cs.push({ email, principal: Boolean(c.principal) });
    }
    if (cs.length && !cs.some((c) => c.principal)) cs[0].principal = true;
    let ya = false; cs.forEach((c) => { if (c.principal && ya) c.principal = false; if (c.principal) ya = true; });
    p.correos = cs;
  }
  if ("afiliaciones" in e) {
    p.afiliaciones = (e.afiliaciones || []).map((a) => {
      const inst = texto(a.inst, 12);
      if (!/^I\d{3,}$/.test(inst)) throw new Error(`Afiliación sin institución válida («${a.inst || ""}»).`);
      return { inst, unidad: texto(a.unidad, 150), desde: fecha(a.desde), hasta: fecha(a.hasta), vigente: bool(a.vigente),
               primera: fecha(a.primera), ultima: fecha(a.ultima), fuente: texto(a.fuente, 300) };
    });
    if (p.afiliaciones.filter((a) => a.vigente).length > 1) throw new Error("Solo una afiliación puede estar vigente.");
  }
  if ("roles" in e) {
    p.roles = (e.roles || []).map((r) => {
      const rol = ROLES.find((x) => x.toLowerCase() === String(r.rol || "").trim().toLowerCase());
      if (!rol) throw new Error(`Rol no reconocido: «${r.rol || ""}».`);
      const estado = ESTADOS_ROL.find((x) => x.toLowerCase() === String(r.estado || "Vigente").trim().toLowerCase());
      if (!estado) throw new Error(`Estado de rol no reconocido: «${r.estado}».`);
      return { rol, detalle: texto(r.detalle, 200), directorTesis: texto(r.directorTesis, 150), desde: fecha(r.desde), hasta: fecha(r.hasta),
               estado, nota: texto(r.nota, 300), fuente: texto(r.fuente, 300) };
    });
  }
  if ("enlaces" in e) {                       // enlaces públicos: [{texto, url}] o «Texto | URL; Texto | URL»
    const xs = Array.isArray(e.enlaces) ? e.enlaces : String(e.enlaces || "").split(/\s*[;\n]\s*/).filter(Boolean).map((t) => {
      const [a, b] = t.split("|").map((x) => x.trim()); return b ? { texto: a, url: b } : { texto: "", url: a }; });
    p.enlaces = xs.map((x) => ({ texto: texto(x.texto, 60) || "Enlace", url: texto(x.url, 400) })).filter((x) => x.url).slice(0, 6);
    const malo = p.enlaces.find((x) => !/^https?:\/\/[^\s<>"]+$/.test(x.url));
    if (malo) throw new Error(`Enlace no válido: «${malo.url}» (debe comenzar con https://).`);
  }
  if ("fotoArchivo" in e) {                   // foto ya publicada en el sitio (carpeta assets/fotos/)
    const f = texto(e.fotoArchivo, 120).replace(/^.*[\\/]/, "");
    if (f && !/^[a-z0-9][a-z0-9._-]*\.(jpe?g|png|webp)$/i.test(f)) { if (!/^s[ií]/i.test(f)) throw new Error(`Nombre de archivo de foto no válido: «${f}».`); }
    else p.fotoArchivo = f;
  }
  for (const k of ["publicar", "fotoAutorizada"]) if (k in e) p[k] = bool(e[k]);
  if ("orcid" in e) {
    p.orcid = texto(e.orcid, 40).replace(/^https?:\/\/orcid\.org\//i, "");
    if (p.orcid && !/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(p.orcid)) throw new Error(`ORCID no válido: «${e.orcid}» (formato 0000-0000-0000-0000).`);
  }
  for (const [k, max] of [["zbmath", 80], ["notas", 2000], ["pendientes", 1000], ["fuentes", 1000]]) if (k in e) p[k] = texto(e[k], max);
  if (!p.nombre && !(p.correos || []).length) throw new Error("La persona necesita al menos un nombre o un correo.");
  for (const k of ["variantes", "correos", "afiliaciones", "roles", "suscripcion", "historial", "enlaces"]) p[k] = p[k] || [];
  for (const k of ["nombre", "orcid", "zbmath", "notas", "pendientes", "fuentes", "fotoArchivo"]) p[k] = p[k] || "";
  for (const k of ["publicar", "fotoAutorizada"]) p[k] = Boolean(p[k]);
  p.foto = p.foto || null;
  return p;
}

// Evento de suscripción ya validado
export function evento({ evento: ev, fecha: f, email, origen, nota, por }) {
  const clave = Object.keys(EVENTOS).find((k) => k === ev || EVENTOS[k].toLowerCase() === String(ev || "").trim().toLowerCase());
  if (!clave) throw new Error(`Evento de suscripción no reconocido: «${ev}».`);
  const correo = texto(email, 200).toLowerCase();
  if (correo && !emailValido(correo)) throw new Error(`Correo no válido: «${email}».`);
  const fe = f ? (String(f).length > 10 ? new Date(f).toISOString() : fecha(f)) : new Date().toISOString();
  return { evento: clave, fecha: fe, email: correo, origen: texto(origen, 120), nota: texto(nota, 300), por: texto(por, 200) };
}
export const claveEvento = (e) => `${e.evento}|${e.fecha.slice(0, 10)}|${e.email}`;

// ---------- Instituciones ----------
export function limpiarInstitucion(e, base = {}) {
  const i = { ...base };
  for (const [k, max] of [["nombre", 200], ["nombreEn", 200], ["sigla", 30], ["ciudad", 80], ["pais", 60], ["notas", 500]]) if (k in e) i[k] = texto(e[k], max);
  if ("variantes" in e) i.variantes = [...new Set((Array.isArray(e.variantes) ? e.variantes : String(e.variantes || "").split(/\s*;\s*/))
    .map((v) => texto(v, 200)).filter((v) => v && v !== i.nombre))].slice(0, 40);
  if (!i.nombre) throw new Error("Indique el nombre de la institución.");
  if (!i.pais) throw new Error("Indique el país de la institución.");
  i.variantes = i.variantes || [];
  for (const k of ["nombreEn", "sigla", "ciudad", "notas"]) i[k] = i[k] || "";
  return i;
}


// ---------- Lectura ----------
export async function listarPersonas() {
  const s = personasStore(); const { blobs } = await s.list();
  return (await enTandas(blobs, (b) => s.get(b.key, { type: "json" }))).filter((p) => p && !p.reservado);
}
export const obtenerPersona = (id) => personasStore().get(id, { type: "json" });
export async function personaPorCorreo(email) {
  const ix = await correosStore().get(idDe(email), { type: "json" });
  return ix ? obtenerPersona(ix.persona) : null;
}
export async function listarInstituciones() {
  const s = institucionesStore(); const { blobs } = await s.list();
  return (await enTandas(blobs, (b) => s.get(b.key, { type: "json" }))).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
}
async function siguienteId(store, prefijo, digitos) {
  const { blobs } = await store.list();
  const max = blobs.map((b) => Number((b.key.match(new RegExp(`^${prefijo}(\\d+)$`)) || [])[1] || 0)).reduce((a, b) => Math.max(a, b), 0);
  return (k) => prefijo + String(max + k).padStart(digitos, "0");
}
export const generadorIdPersona = () => siguienteId(personasStore(), "P", 4);
export const generadorIdInstitucion = () => siguienteId(institucionesStore(), "I", 3);

// ---------- Escritura ----------
function anotar(p, por, cambio, cambios = [], origen = "") {
  const h = { el: new Date().toISOString(), por: por || "", cambio };
  if (cambios.length) h.cambios = cambios;
  if (origen) h.origen = origen;
  p.historial = [...(p.historial || []), h].slice(-HISTORIAL_MAX);
  p.actualizada = h.el; p.actualizadaPor = por || "";
}
// Guarda la versión anterior completa y anota en el historial qué cambió (antes → después)
export async function versionar(previa, p, { por, cambio, origen } = {}) {
  const dif = previa ? diferencias(previa, p) : [];
  if (previa && dif.length) await versionesStore().setJSON(`${p.id}/${new Date().toISOString()}`, previa);
  if (cambio || dif.length) anotar(p, por, cambio || "Editó: " + dif.map((d) => d.etiqueta.toLowerCase()).join(", "), dif, origen);
  return dif;
}
// Guarda una ficha y mantiene el índice de correos. Lanza un Error si un correo ya pertenece a otra persona.
export async function guardarPersona(p, { por, cambio, anterior, origen } = {}) {
  const previa = anterior === undefined ? await obtenerPersona(p.id) : anterior;
  const nuevos = (p.correos || []).map((c) => c.email), viejos = (previa?.correos || []).map((c) => c.email);
  for (const email of nuevos.filter((x) => !viejos.includes(x))) {
    const ix = await correosStore().get(idDe(email), { type: "json" });
    if (ix && ix.persona !== p.id) {
      const otra = await obtenerPersona(ix.persona);
      if (otra) throw new Error(`El correo ${email} ya pertenece a ${otra.nombre || "otra persona"} (${otra.id}). Si es la misma persona, use «Fusionar».`);
    }
  }
  if (!previa) { p.creada = p.creada || new Date().toISOString(); if (cambio) anotar(p, por, cambio, [], origen); }
  else await versionar(previa, p, { por, cambio, origen });
  await personasStore().setJSON(p.id, p);
  await Promise.all(nuevos.map((email) => correosStore().setJSON(idDe(email), { persona: p.id, email })));
  await Promise.all(viejos.filter((x) => !nuevos.includes(x)).map(async (email) => {
    const ix = await correosStore().get(idDe(email), { type: "json" });
    if (ix?.persona === p.id) await correosStore().delete(idDe(email));
  }));
  return p;
}
// Crea una persona con un ID nuevo (reintenta si otro proceso tomó el mismo número)
export async function crearPersona(datos, { por, cambio = "Ficha creada" } = {}) {
  const id = await generadorIdPersona();
  for (let k = 1; k < 50; k++) {
    const p = limpiarPersona(datos, { id: id(k) });
    const r = await personasStore().setJSON(p.id, { id: p.id, reservado: true }, { onlyIfNew: true });
    if (r?.modified === false) continue;
    try { return await guardarPersona(p, { por, cambio, anterior: null }); }
    catch (e) { await personasStore().delete(p.id); throw e; }
  }
  throw new Error("No se pudo asignar un ID nuevo; intente otra vez.");
}
export async function eliminarPersona(id) {
  const p = await obtenerPersona(id); if (!p) return;
  const charlas = (await listarCharlas()).filter((c) => c.personaId === id);
  if (charlas.length) throw new Error(`No se puede eliminar: tiene ${charlas.length} charla(s). Si es un duplicado, use «Fusionar».`);
  await Promise.all((p.correos || []).map(async ({ email }) => {
    const ix = await correosStore().get(idDe(email), { type: "json" });
    if (ix?.persona === id) await correosStore().delete(idDe(email));
  }));
  await personasStore().delete(id);
}

// Agrega un evento de suscripción (alta, baja o reactivación). El correo pasa a la ficha si aún no está.
export async function registrarEvento(p, datos, por) {
  const ev = evento({ ...datos, email: datos.email || correoPrincipal(p), por });
  if (ev.evento !== "baja" && !ev.email) throw new Error("La persona no tiene correo: agréguelo antes de suscribirla.");
  if (ev.email && !(p.correos || []).some((c) => c.email === ev.email))
    p.correos = [...(p.correos || []), { email: ev.email, principal: !(p.correos || []).length }];
  p.suscripcion = [...(p.suscripcion || []), ev];
  const txt = { alta: "Suscripción: alta", baja: "Suscripción: baja", reactivacion: "Suscripción: reactivación" }[ev.evento];
  return guardarPersona(p, { por, cambio: `${txt}${ev.origen ? " (" + ev.origen + ")" : ""}` });
}

// Une la ficha «origenId» dentro de «destinoId» (duplicados): correos, variantes, historial, roles, suscripción y charlas
export async function fusionarPersonas(destinoId, origenId, por) {
  if (destinoId === origenId) throw new Error("Elija dos personas distintas.");
  const [d, o] = await Promise.all([obtenerPersona(destinoId), obtenerPersona(origenId)]);
  if (!d || !o) throw new Error("Una de las personas no existe.");
  // 0) respaldo completo de la ficha que desaparece
  await versionesStore().setJSON(`${o.id}/${new Date().toISOString()}`, { ...o, fusionadaEn: d.id });
  // 1) liberar los correos de la ficha de origen
  await Promise.all((o.correos || []).map(({ email }) => correosStore().delete(idDe(email))));
  const vigenteD = Boolean(afiliacionVigente(d));
  const m = { ...d,
    variantes: unicos([...(d.variantes || []), o.nombre, ...(o.variantes || [])].filter((v) => v && v !== d.nombre)),
    correos: [...(d.correos || []), ...(o.correos || []).filter((c) => !(d.correos || []).some((x) => x.email === c.email)).map((c) => ({ ...c, principal: false }))],
    afiliaciones: [...(d.afiliaciones || []), ...(o.afiliaciones || []).map((a) => ({ ...a, vigente: vigenteD ? false : a.vigente }))],
    roles: [...(d.roles || []), ...(o.roles || [])],
    suscripcion: [...(d.suscripcion || []), ...(o.suscripcion || [])],
    foto: d.foto || o.foto || null, orcid: d.orcid || o.orcid || "", zbmath: d.zbmath || o.zbmath || "",
    publicar: Boolean(d.publicar || o.publicar), fotoAutorizada: Boolean(d.fotoAutorizada || o.fotoAutorizada),
    notas: [d.notas, o.notas].filter(Boolean).join("\n"), fuentes: unicos([d.fuentes, o.fuentes].filter(Boolean).join("; ").split("; ")).join("; "),
    historial: [...(d.historial || []), ...(o.historial || []).map((h) => ({ ...h, cambio: `[${o.id}] ${h.cambio}` }))],
  };
  if ((m.correos || []).filter((c) => c.principal).length !== 1 && m.correos.length) { m.correos.forEach((c, i) => (c.principal = i === 0)); }
  if (m.afiliaciones.filter((a) => a.vigente).length > 1) { let ya = false; m.afiliaciones.forEach((a) => { if (a.vigente && ya) a.vigente = false; if (a.vigente) ya = true; }); }
  // 2) charlas del origen pasan al destino
  const movidas = (await listarCharlas()).filter((c) => c.personaId === origenId);
  await enTandas(movidas, (c) => almacenCharlas().setJSON(c.id, { ...c, personaId: destinoId }));
  await guardarPersona(m, { por, cambio: `Fusión: se incorporó la ficha ${o.id} (${o.nombre || correoPrincipal(o)}) con ${movidas.length} charla(s)` });
  await personasStore().delete(origenId);
  return { persona: m, charlasMovidas: movidas.length };
}

// ---------- Suscriptores ----------
// Correos que reciben los anuncios (personas con suscripción activa)
export async function correosActivos() {
  await migrarSuscriptoresAntiguos();
  return unicos((await listarPersonas()).map(correoSuscrito).filter(Boolean));
}

// La lista anterior («suscriptores», un documento por correo) se traslada una sola vez al registro de personas
export async function migrarSuscriptoresAntiguos() {
  const viejo = almacen("suscriptores"); const { blobs } = await viejo.list();
  if (!blobs.length) return 0;
  let n = 0;
  for (const b of blobs) {
    const s = await viejo.get(b.key, { type: "json" }); if (!s?.email) { await viejo.delete(b.key); continue; }
    let p = await personaPorCorreo(s.email);
    const eventos = [evento({ evento: "alta", fecha: s.alta || new Date().toISOString(), email: s.email, origen: "Lista anterior del panel", por: s.fuente || "" })];
    if (s.reactivado && s.baja) eventos.push(evento({ evento: "baja", fecha: s.baja, email: s.email, origen: "Enlace de baja" }));
    if (s.reactivado) eventos.push(evento({ evento: "reactivacion", fecha: s.reactivado, email: s.email, origen: "Panel" }));
    else if (s.baja) eventos.push(evento({ evento: "baja", fecha: s.baja, email: s.email, origen: "Enlace de baja" }));
    if (!p) p = await crearPersona({ nombre: s.nombre || "", correos: [{ email: s.email, principal: true }], fuentes: "Lista de suscriptores anterior" },
                                   { por: "migración", cambio: "Ficha creada desde la lista de suscriptores anterior" });
    const ya = new Set((p.suscripcion || []).map(claveEvento));
    p.suscripcion = [...(p.suscripcion || []), ...eventos.filter((e) => !ya.has(claveEvento(e)))];
    if (!p.nombre && s.nombre) p.nombre = s.nombre;
    await guardarPersona(p, { por: "migración", cambio: "Suscripción trasladada desde la lista anterior" });
    await viejo.delete(b.key); n++;
  }
  return n;
}

// ---------- Resumen para el panel y la exportación ----------
export function indicesCharlas(charlas) {
  const porPersona = new Map();
  for (const c of charlas) {
    if (!c.personaId || c.estado !== "publicada" || c.cancelada) continue;
    const x = porPersona.get(c.personaId) || { n: 0, primera: "", ultima: "" };
    x.n++; if (!x.primera || c.fecha < x.primera) x.primera = c.fecha; if (c.fecha > x.ultima) x.ultima = c.fecha;
    porPersona.set(c.personaId, x);
  }
  return porPersona;
}
export function resumen(p, instPorId, charlasPorPersona) {
  const av = afiliacionVigente(p), inst = av ? instPorId.get(av.inst) : null, ch = charlasPorPersona.get(p.id) || { n: 0, primera: "", ultima: "" };
  const tiene = (pref, estados = ["Vigente"]) => (p.roles || []).some((r) => r.rol.startsWith(pref) && estados.includes(r.estado));
  return {
    id: p.id, nombre: p.nombre || "", correo: correoPrincipal(p), nCorreos: (p.correos || []).length,
    institucion: inst ? inst.nombre : "", institucionId: av?.inst || "", pais: inst?.pais || "",
    roles: rolesVigentes(p), postdoc: tiene("Postdoctorado"), investigador: tiene("Investigador") || tiene("Director") || tiene("Co-director"),
    colaborador: tiene("Colaborador") ? "Sí" : tiene("Colaborador", ESTADOS_ROL) ? "Antes" : "",
    estudiante: tiene("Estudiante") ? "Sí" : tiene("Estudiante", ["Por confirmar"]) ? "Por confirmar" : "",
    graduado: (p.roles || []).some((r) => r.rol.startsWith("Graduado")),
    charlas: ch.n, primeraCharla: ch.primera, ultimaCharla: ch.ultima,
    solicitudes: (p.solicitudes || []).filter((x) => x.estado === "pendiente").length,
    enlacePendiente: Boolean(p.enlaceDatos?.hash && p.enlaceDatos.enviadoEl && !p.enlaceDatos.usado && p.enlaceDatos.expira > new Date().toISOString()),
    suscripcion: estadoSuscripcion(p), publicar: Boolean(p.publicar), foto: Boolean(p.foto || p.fotoArchivo), pendientes: p.pendientes || "",
    actualizada: p.actualizada || p.creada || "",
  };
}
