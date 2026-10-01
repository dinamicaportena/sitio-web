// Revisión diaria (a la hora configurada en el panel, hora de Chile): anuncios programados, recordatorios, certificados
// y reanudación de envíos a la lista que hayan quedado pendientes.
import { almacen, hoyChile } from "./comun.mjs";
import { listarSesiones, procesarSesion, horaChile } from "./difusion.mjs";
import { envios, despertarTrabajador, baseSitio } from "./envios.mjs";

const registro = () => almacen("revision");

export async function ejecutarRevision({ origen, manual = false } = {}) {
  const hoy = hoyChile(), base = baseSitio(origen), inicio = new Date().toISOString(), acciones = [];
  // 1. Sesiones aprobadas de hoy en adelante: anuncio y recordatorio que correspondan
  for (const s of (await listarSesiones()).filter((x) => x.aprobada && x.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    try {
      for (const [tipo, r] of await procesarSesion(s.fecha, base)) acciones.push({ sesion: s.fecha, tipo, ok: r.ok, total: r.total ?? 0, motivo: r.motivo || null });
    } catch (e) { acciones.push({ sesion: s.fecha, tipo: "error", ok: false, motivo: e.message }); }
  }
  // 2. Certificados de las charlas de ayer (tarea 6)
  try {
    const { enviarCertificadosPendientes } = await import("./certificados.mjs");
    for (const r of await enviarCertificadosPendientes(base)) acciones.push(r);
  } catch (e) { if (!/Cannot find module|ERR_MODULE_NOT_FOUND/.test(e.message)) acciones.push({ tipo: "certificados", ok: false, motivo: e.message }); }
  // 3. Envíos a la lista que hayan quedado incompletos
  const { blobs } = await envios().list();
  const pendientes = (await Promise.all(blobs.map((b) => envios().get(b.key, { type: "json" })))).filter((t) => t && t.estado !== "completado");
  if (pendientes.length) { await despertarTrabajador(base); acciones.push({ tipo: "reanudar-envios", ok: true, total: pendientes.length }); }
  const r = { fecha: hoy, inicio, hora: horaChile(), manual, acciones };
  await registro().setJSON("ultima", r);
  if (!manual) await registro().setJSON("dia-" + hoy, r);
  return r;
}
export async function ultimaRevision() { return registro().get("ultima", { type: "json" }); }
export async function yaSeRevisoHoy() { return Boolean(await registro().get("dia-" + hoyChile(), { type: "json" })); }
