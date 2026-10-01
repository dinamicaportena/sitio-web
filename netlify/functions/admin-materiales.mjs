// Vista previa y descarga de materiales (requiere sesión de administrador).
//   GET /api/admin/materiales?fecha=AAAA-MM-DD&tipo=anuncio|afiche|afiche-png
//   GET /api/admin/materiales?charla=ID&tipo=certificado|certificado-png
//   GET /api/admin/materiales?muestra=1&tipo=…   (datos de ejemplo, para revisar las plantillas)
import { error, sesion, charlas as almacenCharlas, fechaValida } from "../lib/comun.mjs";
import { materialesDelDia, certificado, fotoURI } from "../lib/sesiones.mjs";
import { svgAfiche, svgAnuncio, svgCertificado, aPNG, aPDF, aJPEG } from "../lib/materiales.mjs";
import { configuracionDocumentos } from "../lib/plantillas.mjs";

const EJEMPLO = [
  { fecha: "2026-09-04", hora: "11:00", sala: "Sala 2-2, Instituto de Matemáticas", expositor: "Nombre Apellido", institucion: "Universidad, País", idioma: "es",
    titulo: "Título de ejemplo de una charla del seminario", resumen: "Resumen de ejemplo. Sea $f\\colon M\\to M$ un difeomorfismo parcialmente hiperbólico con $\\dim E^c = 1$. Este texto sirve solo para revisar el diseño de las plantillas." },
];

export default async (req) => {
  if (!sesion(req)) return error("Debe iniciar sesión.", 401);
  const q = new URL(req.url).searchParams, tipo = q.get("tipo") || "anuncio";
  const descarga = q.get("descargar") === "1";
  let r = null;
  try {
    if (q.get("muestra")) {
      const cfg = await configuracionDocumentos(), c = EJEMPLO;
      if (tipo === "anuncio") r = { tipo: "image/jpeg", nombre: "muestra-anuncio.jpg", datos: Buffer.from(aJPEG(svgAnuncio(c, "es", cfg), 1200)) };
      else if (tipo === "afiche") r = { tipo: "application/pdf", nombre: "muestra-afiche.pdf", datos: await aPDF(svgAfiche(c, "es", cfg)) };
      else if (tipo === "afiche-png") r = { tipo: "image/png", nombre: "muestra-afiche.png", datos: aPNG(svgAfiche(c, "es", cfg), 1240) };
      else if (tipo === "certificado") r = { tipo: "application/pdf", nombre: "muestra-certificado.pdf", datos: await aPDF(svgCertificado(c[0], "es", cfg)) };
      else if (tipo === "certificado-png") r = { tipo: "image/png", nombre: "muestra-certificado.png", datos: aPNG(svgCertificado(c[0], "es", cfg), 1240) };
    } else if (tipo.startsWith("certificado")) {
      const c = await almacenCharlas().get(q.get("charla") || "", { type: "json" });
      if (!c) return error("La charla no existe.", 404);
      r = await certificado({ ...c, fotoURI: await fotoURI(c.foto) }, tipo === "certificado-png" ? "png" : "pdf");
    } else {
      const fecha = q.get("fecha") || "";
      if (!fechaValida(fecha)) return error("Fecha no válida.");
      r = await materialesDelDia(fecha, tipo);
      if (!r) return error("No hay charlas publicadas vigentes en esa fecha.", 404);
    }
  } catch (e) { console.error(e); return error("No se pudo generar el documento: " + e.message, 500); }
  if (!r) return error("Tipo de documento no reconocido.");
  return new Response(r.datos, { headers: { "Content-Type": r.tipo, "Cache-Control": "no-store",
    "Content-Disposition": `${descarga ? "attachment" : "inline"}; filename="${r.nombre}"` } });
};
export const config = { path: "/api/admin/materiales" };
