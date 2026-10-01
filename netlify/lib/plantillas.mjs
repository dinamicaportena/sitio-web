// Plantillas editables desde el panel: datos fijos, textos de los correos y componentes gráficos.
// Lo que el administrador guarda se combina con los valores por defecto definidos aquí y en materiales.mjs.
import { almacen } from "./comun.mjs";
import { CONFIG_BASE, COMPONENTES } from "./materiales.mjs";

const tienda = () => almacen("config");
const componentesPropios = () => almacen("componentes");

export const DATOS_BASE = {
  firmaNombre: CONFIG_BASE.firmaNombre, firmaCargo: CONFIG_BASE.firmaCargo, ciudad: CONFIG_BASE.ciudad,
  institucion: CONFIG_BASE.institucion, direccion: CONFIG_BASE.direccion, web: CONFIG_BASE.web, email: CONFIG_BASE.email,
  organizadorEmail: "dinamica.portena@pucv.cl",          // recibe copia de los certificados
  horaEnvio: "08:00",
};

// Textos de los correos. Marcadores: {fecha} {sala} {charlas} {expositor} {titulo} {institucion}
// {fecha_anterior} {web} {email}. {charlas} se reemplaza por la lista de charlas del día.
export const TEXTOS_BASE = {
  anuncio: {
    es: { asunto: "Seminario Dinámica Porteña — {fecha}", cuerpo: "Estimados/as:\n\nLes invitamos a la próxima sesión del Seminario Dinámica Porteña, el {fecha}, en {sala}.\n\nEn el afiche adjunto encontrarán el resumen de cada charla.\n\nSaludos cordiales,\nSeminario Dinámica Porteña\n{web}" },
    en: { asunto: "Dinámica Porteña Seminar — {fecha}", cuerpo: "Dear all,\n\nYou are cordially invited to the next session of the Dinámica Porteña Seminar, on {fecha}, in {sala}.\n\nThe attached poster includes the abstract of each talk.\n\nBest regards,\nDinámica Porteña Seminar\n{web}" },
  },
  recordatorio: {
    es: { asunto: "Hoy: Seminario Dinámica Porteña — {fecha}", cuerpo: "Estimados/as:\n\nLes recordamos que hoy, {fecha}, tendremos una sesión del Seminario Dinámica Porteña, en {sala}.\n\nLes esperamos.\n\nSeminario Dinámica Porteña\n{web}" },
    en: { asunto: "Today: Dinámica Porteña Seminar — {fecha}", cuerpo: "Dear all,\n\nThis is a reminder that today, {fecha}, there is a session of the Dinámica Porteña Seminar, in {sala}.\n\nWe look forward to seeing you.\n\nDinámica Porteña Seminar\n{web}" },
  },
  certificado: {
    es: { asunto: "Certificado de participación — Seminario Dinámica Porteña", cuerpo: "Estimado/a {expositor}:\n\nMuchas gracias por su charla «{titulo}» en el Seminario Dinámica Porteña, el {fecha}. Adjuntamos el certificado correspondiente.\n\nSaludos cordiales,\nSeminario Dinámica Porteña" },
    en: { asunto: "Certificate of participation — Dinámica Porteña Seminar", cuerpo: "Dear {expositor},\n\nThank you very much for your talk “{titulo}” at the Dinámica Porteña Seminar on {fecha}. Please find attached the corresponding certificate.\n\nBest regards,\nDinámica Porteña Seminar" },
  },
  cancelada: {
    es: { asunto: "Sesión cancelada: Seminario Dinámica Porteña — {fecha}", cuerpo: "Estimados/as:\n\nPor razones de fuerza mayor, la sesión del Seminario Dinámica Porteña programada para el {fecha}, con la charla «{titulo}» de {expositor}, ha sido cancelada.\n\nLamentamos los inconvenientes.\n\nSaludos cordiales,\nSeminario Dinámica Porteña" },
    en: { asunto: "Session cancelled: Dinámica Porteña Seminar — {fecha}", cuerpo: "Dear all,\n\nDue to unforeseen circumstances, the session of the Dinámica Porteña Seminar scheduled for {fecha}, with the talk “{titulo}” by {expositor}, has been cancelled.\n\nWe apologize for any inconvenience.\n\nBest regards,\nDinámica Porteña Seminar" },
  },
  reprogramada: {
    es: { asunto: "Sesión reprogramada: Seminario Dinámica Porteña — ahora el {fecha}", cuerpo: "Estimados/as:\n\nPor razones de fuerza mayor, la sesión del Seminario Dinámica Porteña programada para el {fecha_anterior}, con la charla «{titulo}» de {expositor}, ha sido reprogramada para el {fecha}, en {sala}.\n\nLamentamos los inconvenientes.\n\nSaludos cordiales,\nSeminario Dinámica Porteña" },
    en: { asunto: "Session rescheduled: Dinámica Porteña Seminar — now {fecha}", cuerpo: "Dear all,\n\nDue to unforeseen circumstances, the session of the Dinámica Porteña Seminar scheduled for {fecha_anterior}, with the talk “{titulo}” by {expositor}, has been rescheduled to {fecha}, in {sala}.\n\nWe apologize for any inconvenience.\n\nBest regards,\nDinámica Porteña Seminar" },
  },
};
export const NOMBRES_TEXTOS = { anuncio: "Anuncio a la lista", recordatorio: "Recordatorio del día", certificado: "Envío del certificado al expositor",
                                cancelada: "Aviso de cancelación", reprogramada: "Aviso de reprogramación" };

const fusionar = (base, propio) => {
  if (!propio || typeof base !== "object" || base === null || Array.isArray(base)) return propio ?? base;
  const r = { ...base }; for (const k of Object.keys(propio)) r[k] = fusionar(base[k], propio[k]); return r;
};

export async function leerPlantillas() {
  const guardado = (await tienda().get("plantillas", { type: "json" })) || {};
  return { datos: fusionar(DATOS_BASE, guardado.datos), textos: fusionar(TEXTOS_BASE, guardado.textos),
           componentesPropios: guardado.componentesPropios || {} };
}
export async function guardarPlantillas(cambios) {
  const guardado = (await tienda().get("plantillas", { type: "json" })) || {};
  const nuevo = { ...guardado, ...cambios };
  await tienda().setJSON("plantillas", nuevo);
  return nuevo;
}

// Configuración lista para componer documentos (incluye los componentes subidos como data URI)
export async function configuracionDocumentos() {
  const p = await leerPlantillas();
  const componentes = {};
  for (const [nombre, info] of Object.entries(p.componentesPropios)) {
    if (!COMPONENTES[nombre] && nombre !== "firma") continue;
    const r = await componentesPropios().getWithMetadata(nombre, { type: "arrayBuffer" });
    if (r) componentes[nombre] = `data:${r.metadata?.tipo || info.tipo || "image/png"};base64,` + Buffer.from(r.data).toString("base64");
  }
  const { firma, ...resto } = componentes;
  return { ...p.datos, componentes: resto, ...(firma ? { firma } : {}), textos: p.textos };
}
export async function guardarComponente(nombre, dataURL) {
  const m = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(dataURL || "");
  if (!m) throw new Error("Use una imagen PNG o JPG.");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > 8 * 1024 * 1024) throw new Error("La imagen supera los 8 MB.");
  await componentesPropios().set(nombre, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), { metadata: { tipo: m[1] } });
  const p = await leerPlantillas();
  await guardarPlantillas({ componentesPropios: { ...p.componentesPropios, [nombre]: { tipo: m[1], subido: new Date().toISOString() } } });
}
export async function restaurarComponente(nombre) {
  await componentesPropios().delete(nombre);
  const p = await leerPlantillas(); const cp = { ...p.componentesPropios }; delete cp[nombre];
  await guardarPlantillas({ componentesPropios: cp });
}
export async function leerComponentePropio(nombre) {
  return componentesPropios().getWithMetadata(nombre, { type: "arrayBuffer" });
}

// Reemplaza los marcadores {…} de un texto
export const rellenar = (texto, vars) => String(texto).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
