// Sesiones del seminario: charlas publicadas de un mismo día y generación de sus materiales.
import { listarCharlas, fotos } from "./comun.mjs";
import { svgAfiche, svgAnuncio, svgCertificado, aPNG, aPDF, aJPEG } from "./materiales.mjs";
import { configuracionDocumentos } from "./plantillas.mjs";

export async function fotoURI(idFoto) {
  if (!idFoto) return null;
  const r = await fotos().getWithMetadata(idFoto, { type: "arrayBuffer" });
  return r ? `data:${r.metadata?.tipo || "image/jpeg"};base64,` + Buffer.from(r.data).toString("base64") : null;
}
const conFoto = async (c) => ({ ...c, fotoURI: await fotoURI(c.foto) });

// Charlas vigentes (publicadas, no canceladas) de una fecha, ordenadas por hora
export async function charlasDelDia(fecha, todas) {
  const lista = (todas || (await listarCharlas())).filter((c) => c.estado === "publicada" && !c.cancelada && c.fecha === fecha)
    .sort((a, b) => a.hora.localeCompare(b.hora));
  return Promise.all(lista.map(conFoto));
}
// Los materiales del día van en inglés solo si todas las charlas del día están en inglés
export const idiomaDelDia = (charlas) => (charlas.length && charlas.every((c) => c.idioma === "en") ? "en" : "es");

export async function materialesDelDia(fecha, tipo, cfg) {
  const charlas = await charlasDelDia(fecha);
  if (!charlas.length) return null;
  const config = cfg || (await configuracionDocumentos()), idioma = idiomaDelDia(charlas);
  if (tipo === "anuncio") return { tipo: "image/jpeg", nombre: `anuncio-${fecha}.jpg`, datos: Buffer.from(aJPEG(svgAnuncio(charlas, idioma, config), 1200)), idioma, charlas };
  if (tipo === "afiche-png") return { tipo: "image/png", nombre: `afiche-${fecha}.png`, datos: aPNG(svgAfiche(charlas, idioma, config), 1240), idioma, charlas };
  if (tipo === "afiche") return { tipo: "application/pdf", nombre: `afiche-${fecha}.pdf`, datos: await aPDF(svgAfiche(charlas, idioma, config)), idioma, charlas };
  return null;
}
export async function certificado(c, formato = "pdf", cfg) {
  const config = cfg || (await configuracionDocumentos()), idioma = c.idioma === "en" ? "en" : "es";
  const svg = svgCertificado(c, idioma, config);
  const base = `certificado-${c.fecha}-${(c.expositor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-")}`;
  return formato === "png" ? { tipo: "image/png", nombre: base + ".png", datos: aPNG(svg, 1240) }
                           : { tipo: "application/pdf", nombre: base + ".pdf", datos: await aPDF(svg) };
}
