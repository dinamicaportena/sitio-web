// GET /api/charlas — charlas publicadas (para la portada, Seminario y el archivo).
import { json, listarCharlas, publica } from "../lib/comun.mjs";
export default async () => {
  const lista = (await listarCharlas()).filter((c) => c.estado === "publicada").map(publica);
  return json(lista, 200, { "Cache-Control": "public, max-age=60" });
};
export const config = { path: "/api/charlas" };
