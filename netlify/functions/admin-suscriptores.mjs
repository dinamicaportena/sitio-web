// Obsoleto: la lista de suscriptores pasó al registro de personas (/api/admin/personas).
// Este archivo se mantiene solo para reemplazar la versión anterior en el repositorio; puede eliminarse.
export default async () => new Response(JSON.stringify({ error: "Esta sección pasó a «Personas» del panel." }), { status: 410, headers: { "Content-Type": "application/json; charset=utf-8" } });
export const config = { path: "/api/admin/suscriptores" };
