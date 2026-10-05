// GET /api/cifras — cifras del seminario calculadas desde el registro:
// charlas realizadas, expositores distintos (por ficha de persona) y países (por institución del catálogo).
import { json, listarCharlas, hoyChile } from "../lib/comun.mjs";
import { listarInstituciones } from "../lib/personas.mjs";
import { normal } from "../lib/vinculos.mjs";

const SERIE = "Seminario Dinámica Porteña";
export default async () => {
  const [charlas, instituciones] = await Promise.all([listarCharlas(), listarInstituciones()]);
  const hoy = hoyChile(), pais = new Map(instituciones.map((i) => [i.id, i.pais]));
  const hechas = charlas.filter((c) => c.estado === "publicada" && !c.cancelada && (c.serie || SERIE) === SERIE && c.fecha < hoy);
  if (!hechas.some((c) => c.historica)) return json({ disponible: false }, 200, { "Cache-Control": "public, max-age=60" });
  const expositores = new Set(hechas.map((c) => c.personaId || "nombre:" + normal(c.expositor)));
  const paises = new Set(hechas.flatMap((c) => (c.instituciones || []).map((i) => pais.get(i)).filter(Boolean)));
  return json({ disponible: true, charlas: hechas.length, expositores: expositores.size, paises: paises.size,
                anio: Math.max(...hechas.map((c) => Number(c.fecha.slice(0, 4)))), desde: Math.min(...hechas.map((c) => Number(c.fecha.slice(0, 4)))) },
              200, { "Cache-Control": "public, max-age=120", "Netlify-CDN-Cache-Control": "public, durable, max-age=300, stale-while-revalidate=3600" });
};
export const config = { path: "/api/cifras" };
