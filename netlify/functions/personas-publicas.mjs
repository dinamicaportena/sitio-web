// GET /api/personas — integrantes que se muestran en «Quiénes somos», agrupados.
// Solo personas con «Publicar en el sitio» = Sí; se entregan nombre, institución vigente, rol, enlaces y foto
// (solo si la persona autorizó publicarla). Nunca correos ni otros datos internos.
import { json } from "../lib/comun.mjs";
import { listarPersonas, listarInstituciones, afiliacionVigente } from "../lib/personas.mjs";

const vigente = (r) => r.estado === "Vigente" || r.estado === "Por confirmar";
const esEstudiante = (r) => r.rol.startsWith("Estudiante de") && vigente(r);               // magíster o doctorado, en curso
const esGraduado = (r) => r.rol === "Graduado de doctorado";                              // en el sitio solo se muestran doctorados
const porPrecisar = (r) => r.rol === "Estudiante o graduado (por precisar)" && vigente(r);
// Grupo de cada persona (el primero que corresponda), en el orden en que se muestran en el sitio.
// El cargo de director/co-director no se muestra.
const GRUPOS = [
  ["investigadores", (rs) => rs.some((r) => ["Director", "Co-director", "Investigador"].includes(r.rol) && r.estado === "Vigente")],
  ["postdoctorados", (rs) => rs.some((r) => r.rol === "Postdoctorado" && r.estado === "Vigente")],
  ["colaboradores", (rs) => rs.some((r) => r.rol.startsWith("Colaborador") && r.estado === "Vigente")],
  ["graduados", (rs) => rs.some(esGraduado)],
  ["estudiantes", (rs) => rs.some(esEstudiante) || rs.some(porPrecisar)],   // por precisar: provisoriamente con los estudiantes
];
// primer apellido: la primera palabra después del nombre que no sea una inicial («Carlos H. Vásquez» → «vasquez»)
// (se saltan los segundos nombres frecuentes: «María Isabel Cortez» → «cortez»)
const sinTilde = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const SEGUNDOS = new Set(["isabel", "paz", "jose", "maria", "andres", "ignacio", "javier", "alejandro", "alberto", "antonio", "camilo", "eduardo",
  "francisco", "luis", "matias", "pablo", "rusbert", "esteban", "fernanda", "alejandra", "andrea", "elena", "ines", "jesus", "manuel"]);
const apellido = (n) => sinTilde(String(n).split(/\s+/).slice(1).find((t) => !/^\w\.?$/.test(t) && !t.endsWith(".") && !SEGUNDOS.has(sinTilde(t))) || n);

export default async () => {
  const [personas, instituciones] = await Promise.all([listarPersonas(), listarInstituciones()]);
  const inst = new Map(instituciones.map((i) => [i.id, i]));
  const salida = { investigadores: [], postdoctorados: [], colaboradores: [], graduados: [], estudiantes: [] };
  for (const p of personas.filter((x) => x.publicar && x.nombre)) {
    const rs = p.roles || [], g = GRUPOS.find(([, f]) => f(rs)); if (!g) continue;
    // un graduado de doctorado que además es colaborador aparece en ambas secciones (decisión del 05-10-2026)
    const grupos = g[0] === "colaboradores" && rs.some(esGraduado) ? ["colaboradores", "graduados"] : [g[0]];
    const av = afiliacionVigente(p), i = av ? inst.get(av.inst) : null;
    for (const k of grupos) salida[k].push({
      nombre: p.nombre,
      // de los graduados se muestra solo la institución (sin la unidad o programa)
      unidad: k === "graduados" ? "" : av?.unidad || "", institucion: i?.nombre || "", institucionEn: i?.nombreEn || "", pais: i?.pais || "",
      foto: !p.fotoAutorizada ? null : p.foto ? `/api/foto/${p.foto}` : p.fotoArchivo ? `/assets/fotos/${encodeURIComponent(p.fotoArchivo)}` : null,
      enlaces: (p.enlaces || []).filter((e) => /^https?:\/\//.test(e.url)).map((e) => ({ texto: e.texto, url: e.url })),
    });
  }
  for (const k of Object.keys(salida)) salida[k].sort((a, b) => apellido(a.nombre).localeCompare(apellido(b.nombre)));
  const total = Object.values(salida).reduce((n, x) => n + x.length, 0);   // (un graduado-colaborador cuenta dos veces; solo se usa para saber si hay datos)
  return json({ disponible: total > 0, ...salida }, 200,
              { "Cache-Control": "public, max-age=120", "Netlify-CDN-Cache-Control": "public, durable, max-age=300, stale-while-revalidate=3600" });
};
export const config = { path: "/api/personas" };
