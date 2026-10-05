// Suscriptores del seminario: lectura de listas de correos y enlaces de baja.
import { createHmac } from "node:crypto";
import { variable, emailValido } from "./comun.mjs";

// La lista de suscriptores vive ahora en el registro de personas (lib/personas.mjs): cada persona tiene su
// historial de suscripción (alta, baja, reactivación). Este módulo conserva el lector de correos pegados o
// importados y los enlaces personales de baja.
import { idDe, correosActivos } from "./personas.mjs";
export { idDe, correosActivos };

// Interpreta texto pegado o importado: un correo por línea, listas separadas por comas o punto y coma,
// «Nombre <correo>» (como los copia Gmail), o una planilla (CSV, o filas copiadas desde Excel).
// En planillas se usa la fila de encabezado si existe (columnas Nombre/Apellido/Correo); si no, el nombre
// es el texto de las columnas anteriores a la del correo.
const RE_CORREO = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ES_NOMBRE = /^(nombres?|name|first ?name|nombre completo|full ?name)$/i;
const ES_APELLIDO = /^(apellidos?|last ?name|surname|apellido paterno|apellido materno)$/i;
const ES_CORREO = /^(correo|correo electr[oó]nico|e-?mail|mail|email address)$/i;
const ES_ENCABEZADO = (x) => ES_NOMBRE.test(x) || ES_APELLIDO.test(x) || ES_CORREO.test(x) || /^(instituci[oó]n|afiliaci[oó]n|pa[ií]s|tel[eé]fono|cargo)$/i.test(x);

function separarFila(linea, sep) {               // CSV tolerante: respeta comillas dobles
  const celdas = []; let actual = "", comillas = false;
  for (let k = 0; k < linea.length; k++) {
    const ch = linea[k];
    if (ch === '"') { if (comillas && linea[k + 1] === '"') { actual += '"'; k++; } else comillas = !comillas; }
    else if (ch === sep && !comillas) { celdas.push(actual.trim()); actual = ""; }
    else actual += ch;
  }
  celdas.push(actual.trim());
  return celdas;
}
const limpiarNombre = (x) => x.replace(/["'<>()]/g, " ").replace(/mailto:/gi, " ").replace(/\s+/g, " ").trim().slice(0, 120);

export function interpretar(texto) {
  const validos = [], invalidos = [];
  const lineas = String(texto || "").replace(/^\ufeff/, "").replace(/\r/g, "").split("\n").filter((l) => l.trim()).slice(0, 5000);
  const todo = lineas.join("\n");
  const sep = todo.includes("\t") ? "\t" : (todo.split(";").length > todo.split(",").length ? ";" : ",");
  let cab = null;                                      // índices de columnas según el encabezado
  lineas.forEach((linea, n) => {
    const celdas = separarFila(linea, sep);
    const correosFila = celdas.map((c) => c.match(RE_CORREO) || []);
    const total = correosFila.reduce((a, b) => a + b.length, 0);
    if (!total) {
      const encabezado = celdas.filter(Boolean).length && celdas.filter(Boolean).every((c) => ES_ENCABEZADO(c.replace(/["']/g, "").trim()));
      if (encabezado && n === 0) cab = { nombre: celdas.findIndex((c) => ES_NOMBRE.test(c)), apellido: celdas.findIndex((c) => ES_APELLIDO.test(c)) };
      else if (!encabezado) invalidos.push(linea.trim().slice(0, 200));
      return;
    }
    const agregar = (email, nombre) => {
      email = email.toLowerCase().replace(/^['.]+|['.]+$/g, "");
      if (emailValido(email) && email.length <= 200) validos.push({ email, nombre: limpiarNombre(nombre || "") }); else invalidos.push(email);
    };
    if (total === 1) {                                 // una persona por fila (planilla o «Nombre <correo>»)
      const k = correosFila.findIndex((c) => c.length), email = correosFila[k][0];
      let nombre;
      if (cab && (cab.nombre >= 0 || cab.apellido >= 0)) nombre = [cab.nombre, cab.apellido].filter((x) => x >= 0).map((x) => celdas[x] || "").join(" ");
      else nombre = [...celdas.slice(0, k), celdas[k].replace(RE_CORREO, " ")].join(" ");
      agregar(email, nombre);
    } else {                                           // varias personas en la fila: cada celda por separado
      celdas.flatMap((c) => c.split(/[;,]/)).map((c) => c.trim()).filter(Boolean).forEach((c) => {
        const m = c.match(RE_CORREO) || [];
        if (!m.length) { if (!ES_ENCABEZADO(c.replace(/["']/g, ""))) invalidos.push(c.slice(0, 200)); return; }
        m.forEach((e) => agregar(e, m.length === 1 ? c.replace(RE_CORREO, " ") : ""));
      });
    }
  });
  return { validos, invalidos };
}

// Enlace personal para darse de baja (firmado: no requiere guardar tokens)
export const firmaBaja = (id) => createHmac("sha256", variable("SESSION_SECRET")).update("baja:" + id).digest("base64url").slice(0, 32);
export const enlaceBaja = (email, base) => { const id = idDe(email); return `${base}/baja/?c=${id}&t=${firmaBaja(id)}`; };
export const enlaceBajaDirecto = (email, base) => { const id = idDe(email); return `${base}/api/baja?c=${id}&t=${firmaBaja(id)}`; };
