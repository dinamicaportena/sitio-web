// Módulo «Plantillas» (requiere sesión de administrador).
//   GET    /api/admin/plantillas                       datos, textos, estado de los componentes
//   PUT    /api/admin/plantillas                       {datos?, textos?}  guarda cambios
//   POST   /api/admin/plantillas/componente/:nombre    {imagen: dataURL}  reemplaza un componente
//   DELETE /api/admin/plantillas/componente/:nombre    restaura el componente original
//   GET    /api/admin/plantillas/componente/:nombre    imagen actual del componente (miniatura)
import { readFileSync } from "node:fs";
import path from "node:path";
import { json, error, leerJSON, sesion, texto, emailValido } from "../lib/comun.mjs";
import { leerPlantillas, guardarPlantillas, guardarComponente, restaurarComponente, leerComponentePropio,
         DATOS_BASE, TEXTOS_BASE, NOMBRES_TEXTOS } from "../lib/plantillas.mjs";
import { COMPONENTES } from "../lib/materiales.mjs";
import { rutaRecurso } from "../lib/composicion.mjs";

const COMP = { ...COMPONENTES, firma: [null, "Firma del organizador (PNG con fondo transparente, opcional)"] };

function limpiarDatos(d = {}) {
  const r = {};
  for (const k of ["firmaNombre", "ciudad", "direccion", "web", "email", "organizadorEmail", "horaEnvio"]) if (k in d) r[k] = texto(d[k], 200);
  for (const k of ["firmaCargo", "institucion"]) if (d[k]) r[k] = { es: texto(d[k].es, 200), en: texto(d[k].en, 200) };
  if (r.organizadorEmail && !emailValido(r.organizadorEmail)) throw new Error("El correo del organizador no es válido.");
  if ("horaEnvio" in r && !/^(0[6-9]|1\d|20):00$/.test(r.horaEnvio)) throw new Error("La hora de la revisión debe ser una hora en punto entre 06:00 y 20:00.");
  if (r.email && !emailValido(r.email)) throw new Error("El correo de contacto no es válido.");
  return r;
}
function limpiarTextos(t = {}) {
  const r = {};
  for (const tipo of Object.keys(TEXTOS_BASE)) if (t[tipo]) {
    r[tipo] = {};
    for (const idioma of ["es", "en"]) if (t[tipo][idioma])
      r[tipo][idioma] = { asunto: texto(t[tipo][idioma].asunto, 300), cuerpo: texto(t[tipo][idioma].cuerpo, 5000) };
  }
  return r;
}

export default async (req, context) => {
  if (!sesion(req)) return error("Debe iniciar sesión.", 401);
  const { nombre } = context.params || {};
  if (nombre !== undefined) {
    if (!COMP[nombre]) return error("Componente desconocido.", 404);
    if (req.method === "GET") {
      const propio = await leerComponentePropio(nombre);
      if (propio) return new Response(propio.data, { headers: { "Content-Type": propio.metadata?.tipo || "image/png", "Cache-Control": "no-store" } });
      if (!COMP[nombre][0]) return error("Sin imagen.", 404);
      const archivo = COMP[nombre][0];
      return new Response(readFileSync(path.join(rutaRecurso("plantillas"), archivo)), { headers: { "Content-Type": archivo.endsWith(".jpg") ? "image/jpeg" : "image/png", "Cache-Control": "no-store" } });
    }
    if (req.method === "POST") {
      const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
      try { await guardarComponente(nombre, cuerpo.imagen); } catch (e) { return error(e.message); }
      return json({ ok: true });
    }
    if (req.method === "DELETE") { await restaurarComponente(nombre); return json({ ok: true }); }
    return error("Método no permitido.", 405);
  }
  if (req.method === "GET") {
    const p = await leerPlantillas();
    return json({ datos: p.datos, textos: p.textos, datosBase: DATOS_BASE, textosBase: TEXTOS_BASE, nombresTextos: NOMBRES_TEXTOS,
                  componentes: Object.entries(COMP).map(([k, [archivo, desc]]) => ({ nombre: k, descripcion: desc, propio: Boolean(p.componentesPropios[k]), tieneBase: Boolean(archivo) })) });
  }
  if (req.method === "PUT") {
    const cuerpo = await leerJSON(req); if (!cuerpo) return error("Solicitud no válida.");
    try {
      const p = await leerPlantillas(), cambios = {};
      if (cuerpo.datos) cambios.datos = { ...(await leerPlantillasGuardadas()).datos, ...limpiarDatos(cuerpo.datos) };
      if (cuerpo.textos) cambios.textos = limpiarTextos(cuerpo.textos);
      await guardarPlantillas(cambios);
      return json({ ok: true });
    } catch (e) { return error(e.message); }
  }
  return error("Método no permitido.", 405);
};
async function leerPlantillasGuardadas() { const p = await leerPlantillas(); return { datos: p.datos }; }
export const config = { path: ["/api/admin/plantillas", "/api/admin/plantillas/componente/:nombre"] };
