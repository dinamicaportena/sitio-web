// GET /api/config — datos públicos que necesita el navegador (ID de cliente de Google).
import { json, variable } from "../lib/comun.mjs";
export default async () => json({ googleClientId: variable("GOOGLE_CLIENT_ID") });
export const config = { path: "/api/config" };
