// Cola de envíos masivos. Cada envío a la lista se guarda como un «trabajo» y lo procesa la función
// en segundo plano envios-background (hasta 15 minutos), un correo por destinatario con su enlace de baja.
import { createHmac } from "node:crypto";
import { almacen, nuevoId, variable } from "./comun.mjs";

export const envios = () => almacen("envios");
export const claveTrabajador = () => createHmac("sha256", variable("SESSION_SECRET")).update("trabajador-envios").digest("hex");
export const baseSitio = (origen) => process.env.URL || globalThis.Netlify?.env?.get?.("URL") || origen;

// trabajo: { tipo, idioma, asunto, texto, html?, adjuntos?: [{nombre, tipo, clave, cid?}], destinatarios: [correos], charlas?: [ids] }
export async function encolarEnvio(trabajo, origen) {
  const id = nuevoId();
  const t = { id, creado: new Date().toISOString(), estado: "pendiente", enviados: [], fallidos: [], ...trabajo,
              destinatarios: [...new Set(trabajo.destinatarios)] };
  await envios().setJSON(id, t);
  await despertarTrabajador(origen);
  return { id, total: t.destinatarios.length };
}
export async function despertarTrabajador(origen) {
  try {
    await fetch(`${baseSitio(origen)}/.netlify/functions/envios-background`, {
      method: "POST", headers: { "x-clave-trabajador": claveTrabajador() }, body: "{}" });
  } catch (e) { console.error("No se pudo iniciar el envío en segundo plano:", e.message); }
}
export async function listarEnvios(max = 20) {
  const { blobs } = await envios().list();
  const todos = await Promise.all(blobs.map((b) => envios().get(b.key, { type: "json" })));
  return todos.filter(Boolean).sort((a, b) => b.creado.localeCompare(a.creado)).slice(0, max)
    .map((t) => ({ id: t.id, creado: t.creado, tipo: t.tipo, asunto: t.asunto, estado: t.estado,
                   total: t.destinatarios.length, enviados: t.enviados.length, fallidos: t.fallidos.length, terminado: t.terminado || null }));
}
