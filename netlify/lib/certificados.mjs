// Certificados de participación: se envían al expositor al día siguiente de su charla (revisión de las 8:00),
// con copia al organizador. También pueden enviarse o reenviarse manualmente desde el panel.
import { charlas, listarCharlas, hoyChile, fechaLarga } from "./comun.mjs";
import { certificado, fotoURI } from "./sesiones.mjs";
import { leerPlantillas, rellenar, configuracionDocumentos } from "./plantillas.mjs";
import { enviar, correoConfigurado } from "./correo.mjs";

const VENTANA_DIAS = 7;   // si una revisión diaria falla, las siguientes recuperan los certificados de la última semana
const restar = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

export async function enviarCertificado(c, cfg) {
  if (!c.email) throw new Error("La charla no tiene correo del expositor.");
  if (!correoConfigurado()) throw new Error("El envío de correos no está configurado.");
  const config = cfg || (await configuracionDocumentos());
  const { textos, datos } = await leerPlantillas();
  const idioma = c.idioma === "en" ? "en" : "es", t = textos.certificado[idioma];
  const vars = { expositor: c.expositor, titulo: c.titulo || "", institucion: c.institucion || "", fecha: fechaLarga(c.fecha, "", idioma),
                 sala: c.sala, web: datos.web, email: datos.email };
  const pdf = await certificado({ ...c, fotoURI: await fotoURI(c.foto) }, "pdf", config);
  const copia = datos.organizadorEmail && datos.organizadorEmail !== c.email ? datos.organizadorEmail : undefined;
  await enviar({ para: c.email, asunto: rellenar(t.asunto, vars), texto: rellenar(t.cuerpo, vars), responderA: datos.organizadorEmail || datos.email,
                 copia,
                 adjuntos: [{ filename: pdf.nombre, contentType: pdf.tipo, content: pdf.datos }] });
  const actual = (await charlas().get(c.id, { type: "json" })) || c;
  actual.certificado = { enviado: new Date().toISOString(), a: c.email, copia: copia || null };
  await charlas().setJSON(c.id, actual);
  return actual.certificado;
}

export async function enviarCertificadosPendientes() {
  const hoy = hoyChile(), desde = restar(hoy, VENTANA_DIAS), resultados = [];
  const pendientes = (await listarCharlas()).filter((c) => c.estado === "publicada" && !c.cancelada && c.fecha < hoy && c.fecha >= desde
                                                      && !c.certificado?.enviado && !c.certificado?.sinCorreo);
  if (!pendientes.length) return resultados;
  const cfg = await configuracionDocumentos();
  for (const c of pendientes) {
    if (!c.email) {                                    // se informa una sola vez
      c.certificado = { sinCorreo: true, el: new Date().toISOString() }; await charlas().setJSON(c.id, c);
      resultados.push({ tipo: "certificado", sesion: c.fecha, ok: false, motivo: `${c.expositor}: la charla no tiene correo del expositor` });
      continue;
    }
    try { await enviarCertificado(c, cfg); resultados.push({ tipo: "certificado", sesion: c.fecha, ok: true, total: 1 }); }
    catch (e) { resultados.push({ tipo: "certificado", sesion: c.fecha, ok: false, motivo: `${c.expositor}: ${e.message}` }); }
  }
  return resultados;
}
