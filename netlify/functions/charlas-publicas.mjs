// GET /api/charlas          charlas publicadas desde el panel (portada y Seminario: próximas y recientes)
// GET /api/charlas?todas=1  todas las charlas publicadas del seminario, incluido el archivo histórico (página del archivo)
// Solo datos públicos: nunca correos ni datos internos. El país sale del catálogo de instituciones.
import { json, listarCharlas, publica } from "../lib/comun.mjs";
import { listarInstituciones } from "../lib/personas.mjs";

const SERIE = "Seminario Dinámica Porteña";
export default async (req) => {
  const todas = new URL(req.url).searchParams.get("todas") === "1";
  const [charlas, instituciones] = await Promise.all([listarCharlas(), listarInstituciones()]);
  const pais = new Map(instituciones.map((i) => [i.id, i.pais]));
  const lista = charlas.filter((c) => c.estado === "publicada" && !c.cancelada && (todas ? (c.serie || SERIE) === SERIE : !c.historica))
    .map((c) => ({ ...publica(c), pais: [...new Set((c.instituciones || []).map((i) => pais.get(i)).filter(Boolean))].join(" / ") }));
  return json(lista, 200, todas ? { "Cache-Control": "public, max-age=120", "Netlify-CDN-Cache-Control": "public, durable, max-age=300, stale-while-revalidate=3600" }
                                : { "Cache-Control": "public, max-age=60" });
};
export const config = { path: "/api/charlas" };
