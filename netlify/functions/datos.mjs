// Formulario para que una persona actualice sus datos (sin cuenta; con su enlace personal de un solo uso).
//   GET  /api/datos?t=TOKEN   datos actuales de la persona y catálogo de instituciones
//   POST /api/datos           {t, nombre, correoPrincipal, otrosCorreos, institucion, …}  aplica (y anula el enlace)
import { json, error, leerJSON } from "../lib/comun.mjs";
import { personaDeToken, vista, aplicar } from "../lib/datos-personales.mjs";

const INVALIDO = "El enlace no es válido, ya se usó o venció. Si necesita uno nuevo, escriba a dinamica.portena@pucv.cl.";
export default async (req) => {
  try {
    if (req.method === "GET") {
      const p = await personaDeToken(new URL(req.url).searchParams.get("t"));
      return p ? json(await vista(p)) : error(INVALIDO, 404);
    }
    if (req.method === "POST") {
      const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
      const p = await personaDeToken(cuerpo.t); if (!p) return error(INVALIDO, 404);
      return json({ ok: true, ...(await aplicar(p, cuerpo, { origen: new URL(req.url).origin })) });
    }
    return error("Método no permitido.", 405);
  } catch (e) { return error(e.message); }
};
export const config = { path: "/api/datos" };
