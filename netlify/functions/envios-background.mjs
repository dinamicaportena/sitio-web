// Trabajador en segundo plano: procesa los envíos pendientes a la lista de suscriptores.
// Cada destinatario recibe su propio correo con un enlace personal para darse de baja.
import { timingSafeEqual } from "node:crypto";
import { envios, claveTrabajador, baseSitio, despertarTrabajador } from "../lib/envios.mjs";
import { crearTransporte, enviar } from "../lib/correo.mjs";
import { enlaceBaja, enlaceBajaDirecto, correosActivos } from "../lib/suscriptores.mjs";
import { almacen } from "../lib/comun.mjs";

const PIE = {
  es: (e) => `\n\n—\nRecibe este correo por estar suscrito/a a los anuncios del Seminario Dinámica Porteña.\nPara dejar de recibirlos: ${e}`,
  en: (e) => `\n\n—\nYou receive this email because you subscribed to the Dinámica Porteña Seminar announcements.\nTo unsubscribe: ${e}`,
};
const PIE_HTML = {
  es: (e) => `<p style="font:12px Arial,sans-serif;color:#777;margin-top:28px">Recibe este correo por estar suscrito/a a los anuncios del Seminario Dinámica Porteña. <a href="${e}" style="color:#777">Dejar de recibirlos</a>.</p>`,
  en: (e) => `<p style="font:12px Arial,sans-serif;color:#777;margin-top:28px">You receive this email because you subscribed to the Dinámica Porteña Seminar announcements. <a href="${e}" style="color:#777">Unsubscribe</a>.</p>`,
};

async function adjuntosDe(t) {
  if (!t.adjuntos?.length) return [];
  const archivos = almacen("materiales");
  return Promise.all(t.adjuntos.map(async (a) => ({
    filename: a.nombre, contentType: a.tipo, ...(a.cid ? { cid: a.cid } : {}),
    content: Buffer.from(await archivos.get(a.clave, { type: "arrayBuffer" })),
  })));
}

export default async (req) => {
  const clave = req.headers.get("x-clave-trabajador") || "";
  const esperada = claveTrabajador();
  if (clave.length !== esperada.length || !timingSafeEqual(Buffer.from(clave), Buffer.from(esperada))) return new Response("", { status: 403 });

  const base = baseSitio(new URL(req.url).origin);
  const tienda = envios();
  const { blobs } = await tienda.list();
  const inicio = Date.now();
  const transporte = crearTransporte(true);
  try {
    for (const b of blobs) {
      const t = await tienda.get(b.key, { type: "json" });
      if (!t || t.estado === "completado") continue;
      t.estado = "enviando"; await tienda.setJSON(t.id, t);
      const activos = new Set(await correosActivos());
      const adjuntos = await adjuntosDe(t);
      const hechos = new Set([...t.enviados, ...t.fallidos.map((f) => f.email)]);
      let cambios = 0;
      for (const para of t.destinatarios) {
        if (hechos.has(para)) continue;
        if (!activos.has(para)) { t.fallidos.push({ email: para, error: "dado de baja antes del envío" }); continue; }
        if (Date.now() - inicio > 13 * 60 * 1000) {        // margen antes del límite de 15 minutos: guarda y continúa en otra ejecución
          await tienda.setJSON(t.id, t); await despertarTrabajador(base); return new Response("pausa");
        }
        const idioma = t.idioma === "en" ? "en" : "es", enlace = enlaceBaja(para, base);
        try {
          await enviar({ para, asunto: t.asunto, texto: t.texto + PIE[idioma](enlace),
                         html: t.html ? t.html + PIE_HTML[idioma](enlace) : undefined, adjuntos,
                         cabeceras: { "List-Unsubscribe": `<${enlaceBajaDirecto(para, base)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } },
                       transporte);
          t.enviados.push(para);
        } catch (e) { t.fallidos.push({ email: para, error: String(e.message).slice(0, 200) }); }
        if (++cambios % 20 === 0) await tienda.setJSON(t.id, t);
      }
      t.estado = "completado"; t.terminado = new Date().toISOString();
      await tienda.setJSON(t.id, t);
    }
  } finally { transporte.close(); }
  return new Response("ok");
};
