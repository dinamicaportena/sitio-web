// Eventos del grupo (conferencias, workshops, escuelas, coloquios): se administran en la pestaña «Eventos» del panel
// y se muestran en la página Eventos y en la portada. Almacén «eventos», clave = ID (E001…).
import { almacen, texto } from "./comun.mjs";
import { enTandas } from "./personas.mjs";

export const eventosStore = () => almacen("eventos");
export const TIPOS = ["Conferencia", "Workshop", "Escuela", "Coloquio", "Encuentro", "Minicurso", "Otro"];
const fechaParcial = (v, campo) => {             // AAAA-MM o AAAA-MM-DD
  const s = texto(v, 10);
  if (!s) return "";
  if (!/^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/.test(s)) throw new Error(`${campo}: use el formato AAAA-MM-DD (o AAAA-MM si no se conoce el día).`);
  return s;
};
const bool = (v) => v === true || /^(s[ií]|true|1|x)$/i.test(String(v ?? "").trim());

export function limpiarEvento(e, base = {}) {
  const x = { ...base };
  for (const [k, max] of [["titulo", 300], ["tituloEn", 300], ["lugar", 200], ["descripcion", 3000], ["descripcionEn", 3000], ["enlace", 400]]) if (k in e) x[k] = texto(e[k], max);
  if ("tipo" in e) x.tipo = TIPOS.find((t) => t.toLowerCase() === String(e.tipo || "").trim().toLowerCase()) || "Otro";
  if ("inicio" in e) x.inicio = fechaParcial(e.inicio, "Inicio");
  if ("fin" in e) x.fin = fechaParcial(e.fin, "Término");
  if ("publicar" in e) x.publicar = bool(e.publicar);
  if (!x.titulo) throw new Error("Indique el título del evento.");
  if (!x.inicio) throw new Error("Indique la fecha de inicio del evento.");
  if (x.fin && x.fin < x.inicio) throw new Error("La fecha de término es anterior a la de inicio.");
  if (x.enlace && !/^https?:\/\/[^\s<>"]+$/.test(x.enlace)) throw new Error("El enlace debe comenzar con https://");
  for (const k of ["tituloEn", "lugar", "descripcion", "descripcionEn", "enlace", "fin"]) x[k] = x[k] || "";
  x.tipo = x.tipo || "Otro"; x.publicar = Boolean(x.publicar);
  return x;
}
export async function listarEventos() {
  const s = eventosStore(); const { blobs } = await s.list();
  return (await enTandas(blobs, (b) => s.get(b.key, { type: "json" }))).filter((e) => e && !e.reservado)
    .sort((a, b) => b.inicio.localeCompare(a.inicio) || a.id.localeCompare(b.id));
}
export async function generadorIdEvento() {
  const { blobs } = await eventosStore().list();
  const max = blobs.map((b) => Number((b.key.match(/^E(\d+)$/) || [])[1] || 0)).reduce((a, b) => Math.max(a, b), 0);
  return (k) => "E" + String(max + k).padStart(3, "0");
}
// Fecha de término efectiva (para separar próximos y anteriores): fin o inicio; AAAA-MM cuenta hasta fin de mes
export const terminoDe = (e) => { const f = e.fin || e.inicio; return f.length === 7 ? f + "-31" : f; };
export const publico = (e) => ({ id: e.id, titulo: e.titulo, tituloEn: e.tituloEn, tipo: e.tipo, inicio: e.inicio, fin: e.fin, lugar: e.lugar,
                                 descripcion: e.descripcion, descripcionEn: e.descripcionEn, enlace: e.enlace,
                                 ...(e.enlaceEn ? { enlaceEn: e.enlaceEn } : {}), ...(e.lugarEn ? { lugarEn: e.lugarEn } : {}) });   // enlaceEn/lugarEn: páginas de evento
