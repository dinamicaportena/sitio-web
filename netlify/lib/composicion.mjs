// Motor de composición de textos para los materiales del seminario (afiche, anuncio, certificado).
// Mide el texto con la fuente Roboto (tipografía institucional de las normas gráficas PUCV), compone fórmulas LaTeX con MathJax
// y produce fragmentos SVG con ajuste de líneas, justificación y reducción automática de tamaño.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import opentype from "opentype.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

// Ubica los recursos tanto en desarrollo como en la función desplegada (included_files en netlify.toml)
const aqui = path.dirname(fileURLToPath(import.meta.url));
export function rutaRecurso(nombre) {
  const candidatos = [path.join(aqui, nombre), path.join(process.cwd(), "netlify/lib", nombre),
                      path.join(aqui, "../../netlify/lib", nombre), path.join("/var/task/netlify/lib", nombre)];
  return candidatos.find((c) => existsSync(c)) || candidatos[0];
}
export const RUTA_FUENTES = rutaRecurso("fuentes");
const cargar = (n) => { const b = readFileSync(path.join(RUTA_FUENTES, n)); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const FUENTE = { normal: cargar("Roboto-Regular.ttf"), negrita: cargar("Roboto-Bold.ttf"), cursiva: cargar("Roboto-Italic.ttf") };
const ESTILO = { normal: 'font-weight="400"', negrita: 'font-weight="700"', cursiva: 'font-style="italic"' };

const adaptor = liteAdaptor(); RegisterHTMLHandler(adaptor);
const MACROS = { Z: "{\\mathbb{Z}}", R: "{\\mathbb{R}}", N: "{\\mathbb{N}}", Q: "{\\mathbb{Q}}", C: "{\\mathbb{C}}", T: "{\\mathbb{T}}", P: "{\\mathcal{P}}" };
// Seguridad: sin los paquetes html (\href, \style, \class, \cssId), require ni autoload: el texto de las charlas lo escriben los expositores.
const PAQUETES = AllPackages.filter((p) => !["html", "require", "autoload", "action"].includes(p));
const docMath = mathjax.document("", { InputJax: new TeX({ packages: PAQUETES, macros: MACROS }), OutputJax: new SVG({ fontCache: "none" }) });

export const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Solo elementos gráficos que produce MathJax, sin «<» ni «&» sueltos en atributos (el texto de las fórmulas lo escriben los expositores)
const ETIQUETAS_SVG = new Set(["svg", "g", "path", "rect", "text", "line", "ellipse", "polygon", "title", "defs", "use"]);
function svgSeguro(svg) {
  for (const m of svg.matchAll(/<([a-zA-Z][\w:-]*)/g)) if (!ETIQUETAS_SVG.has(m[1])) return false;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(svg) || /<(?!\/?[a-zA-Z])/.test(svg) || /="[^"]*</.test(svg) || /javascript:/i.test(svg)) return false;
  for (const m of svg.matchAll(/&(#x[0-9a-f]+|#\d+|[a-z]+)?;?/gi)) {           // entidades: solo las de XML y caracteres válidos
    const e = m[1] || "";
    if (!m[0].endsWith(";") || !e) return false;
    if (e[0] !== "#") { if (!["amp", "lt", "gt", "quot", "apos"].includes(e)) return false; continue; }
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    if (!(n === 9 || n === 10 || n === 13 || (n >= 0x20 && n <= 0xD7FF) || (n >= 0xE000 && n <= 0xFFFD) || (n >= 0x10000 && n <= 0x10FFFF))) return false;
  }
  return true;
}

// Fórmula LaTeX → {svg interno, ancho, alto, bajada} en píxeles para un tamaño de letra dado
const cacheMath = new Map();
function formula(tex, tam) {
  const clave = tex + "|" + tam;
  if (cacheMath.has(clave)) return cacheMath.get(clave);
  let r;
  try {
    const nodo = docMath.convert(tex, { display: false, em: tam, ex: tam * 0.52, containerWidth: 4000 });
    const svg = adaptor.serializeXML(adaptor.firstChild(nodo));   // serializeXML escapa las comillas de los atributos
    const ex = tam * 0.52, num = (a) => parseFloat((new RegExp(a + '="([-\\d.]+)ex"').exec(svg) || [])[1] || "0");
    const va = parseFloat((/vertical-align:\s*([-\d.]+)ex/.exec(svg) || [])[1] || "0");
    r = { svg, ancho: num("width") * ex, alto: num("height") * ex, bajada: -va * ex };
    if (/data-mjx-error|merror/.test(svg) || !svgSeguro(svg)) throw new Error("tex");
  } catch (e) { r = null; }
  cacheMath.set(clave, r);
  return r;
}

// Divide un texto en fichas: palabras (con estilo) y fórmulas. Admite **negrita** y $…$.
function fichas(texto, estiloBase) {
  const out = [];
  const partes = String(texto).split(/(\$[^$]+\$|\*\*)/);
  let estilo = estiloBase;
  for (const p of partes) {
    if (p === "**") { estilo = estilo === "negrita" ? estiloBase : "negrita"; continue; }
    if (/^\$[^$]+\$$/.test(p)) { out.push({ math: p.slice(1, -1), estilo, pegado: false }); continue; }
    // conserva si la palabra va pegada a lo anterior (sin espacio), p. ej. «$f$,» o «(caso $n=1$)»
    const trozos = p.split(/(\s+)/);
    trozos.forEach((w, i) => { if (!w) return; if (/^\s+$/.test(w)) { out.push({ espacio: true }); return; } out.push({ texto: w, estilo }); });
  }
  return out;
}

// Compone un bloque de texto. Devuelve { svg, alto, lineas }.
export function bloque(texto, o) {
  const { x, y, ancho, tam, estilo = "normal", color = "#000", alinear = "izquierda", interlineado = 1.35, justificar = false } = o;
  const parrafos = String(texto || "").replace(/\r/g, "").split(/\n\s*\n/);
  const esp = FUENTE.normal.getAdvanceWidth(" ", tam);
  const lineas = [];
  for (const par of parrafos) {
    const fs = fichas(par.replace(/\s*\n\s*/g, " ").trim(), estilo);
    let linea = [], w = 0, pendienteEspacio = false;
    for (const f of fs) {
      if (f.espacio) { pendienteEspacio = true; continue; }
      let ancho_f;
      if (f.math !== undefined) { const m = formula(f.math, tam); if (m) { f.m = m; ancho_f = m.ancho; } else { f.texto = "$" + f.math + "$"; delete f.math; } }
      if (f.texto !== undefined) ancho_f = FUENTE[f.estilo].getAdvanceWidth(f.texto, tam);
      f.w = ancho_f; f.esp = linea.length && pendienteEspacio;
      const extra = (f.esp ? esp : 0) + f.w;
      if (linea.length && w + extra > ancho) { lineas.push({ fichas: linea, w, fin: false }); linea = []; w = 0; f.esp = false; }
      linea.push(f); w += (f.esp ? esp : 0) + f.w; pendienteEspacio = false;
    }
    lineas.push({ fichas: linea, w, fin: true, parrafo: true });
  }
  const alto_l = tam * interlineado;
  let svg = "", yy = y + tam * 0.95;
  lineas.forEach((l, i) => {
    const huecos = l.fichas.filter((f) => f.esp).length;
    const extraEsp = justificar && !l.fin && huecos ? (ancho - l.w) / huecos : 0;
    let xx = alinear === "centro" ? x + (ancho - l.w) / 2 : alinear === "derecha" ? x + ancho - l.w : x;
    for (const f of l.fichas) {
      if (f.esp) xx += esp + extraEsp;
      if (f.m) {
        const top = yy + f.m.bajada - f.m.alto;
        svg += f.m.svg.replace(/^<svg([^>]*)>/, (m0, attrs) => `<svg${attrs.replace(/\s(width|height|style)="[^"]*"/g, "")} x="${xx.toFixed(1)}" y="${top.toFixed(1)}" width="${f.m.ancho.toFixed(1)}" height="${f.m.alto.toFixed(1)}" color="${color}">`);
      } else {
        svg += `<text x="${xx.toFixed(1)}" y="${yy.toFixed(1)}" font-family="Roboto" font-size="${tam}" ${ESTILO[f.estilo]} fill="${color}">${esc(f.texto)}</text>`;
      }
      xx += f.w;
    }
    yy += alto_l + (l.parrafo && i < lineas.length - 1 ? tam * 0.55 : 0);
  });
  const alto = lineas.length * alto_l + (parrafos.length - 1) * tam * 0.55;
  return { svg, alto, lineas: lineas.length };
}

// Busca el mayor tamaño (entre max y min) con el que el bloque cabe en la altura disponible.
export function bloqueAjustado(texto, o, altoMax, min = 18) {
  for (let t = o.tam; t >= min; t -= Math.max(1, Math.round(t * 0.05))) {
    const b = bloque(texto, { ...o, tam: t });
    if (b.alto <= altoMax) return { ...b, tam: t };
  }
  return { ...bloque(texto, { ...o, tam: min }), tam: min };
}
