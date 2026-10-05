// GET /api/eventos — eventos publicados: { proximos (del más cercano al más lejano), anteriores (del más reciente al más antiguo) }
import { json, hoyChile } from "../lib/comun.mjs";
import { listarEventos, publico, terminoDe } from "../lib/eventos.mjs";
import { eventosDeModulos } from "../lib/ev.mjs";

export default async () => {
  const hoy = hoyChile(), todos = [...(await listarEventos()).filter((e) => e.publicar), ...(await eventosDeModulos().catch(() => []))];
  const proximos = todos.filter((e) => terminoDe(e) >= hoy).sort((a, b) => a.inicio.localeCompare(b.inicio)).map(publico);
  const anteriores = todos.filter((e) => terminoDe(e) < hoy).sort((a, b) => b.inicio.localeCompare(a.inicio)).map(publico);
  return json({ disponible: todos.length > 0, proximos, anteriores }, 200,
              { "Cache-Control": "public, max-age=120", "Netlify-CDN-Cache-Control": "public, durable, max-age=300, stale-while-revalidate=3600" });
};
export const config = { path: "/api/eventos" };
