// Registro completo en Excel (requiere sesión de administrador).
//   GET  /api/admin/registro            datos de todas las hojas (el navegador arma el archivo Excel)
//   POST /api/admin/registro/importar   {hojas, aplicar}  revisa (aplicar=false) o aplica un Excel del registro
import { json, error, leerJSON, sesion } from "../lib/comun.mjs";
import { exportar, importar } from "../lib/registro.mjs";

export default async (req, context) => {
  const admin = sesion(req);
  if (!admin) return error("Debe iniciar sesión.", 401);
  const { accion } = context.params || {};
  try {
    if (!accion && req.method === "GET") return json(await exportar());
    if (accion === "importar" && req.method === "POST") {
      const cuerpo = await leerJSON(req); if (!cuerpo?.hojas) return error("Solicitud no válida.");
      return json(await importar(cuerpo.hojas, { aplicar: cuerpo.aplicar === true, por: admin }));
    }
    return error("Ruta o método no permitido.", 405);
  } catch (e) { console.error(e); return error(e.message); }
};
export const config = { path: ["/api/admin/registro", "/api/admin/registro/:accion"] };
