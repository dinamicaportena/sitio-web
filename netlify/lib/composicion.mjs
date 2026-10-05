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
import "../../assets/texto-latex.js";          // define globalThis.DPTexto (el mismo intérprete que usa el sitio)
const { DPTexto } = globalThis;

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
function formula(tex, tam, destacada = false) {
  const clave = tex + "|" + tam + "|" + destacada;
  if (cacheMath.has(clave)) return cacheMath.get(clave);
  let r;
  try {
    const nodo = docMath.convert(tex, { display: destacada, em: tam, ex: tam * 0.52, containerWidth: 4000 });
    const svg = adaptor.serializeXML(adaptor.firstChild(nodo));   // serializeXML escapa las comillas de los atributos
    const ex = tam * 0.52, num = (a) => parseFloat((new RegExp(a + '="([-\\d.]+)ex"').exec(svg) || [])[1] || "0");
    const va = parseFloat((/vertical-align:\s*([-\d.]+)ex/.exec(svg) || [])[1] || "0");
    r = { svg, ancho: num("width") * ex, alto: num("height") * ex, bajada: -va * ex };
    if (/data-mjx-error|merror/.test(svg) || !svgSeguro(svg)) throw new Error("tex");
  } catch (e) { r = null; }
  cacheMath.set(clave, r);
  return r;
}

// Divide un párrafo (ya interpretado por DPTexto: negrita, cursiva, fórmulas, comandos de LaTeX) en fichas:
// palabras con su estilo y fórmulas, indicando si van separadas por un espacio de lo anterior.
// El espacio irrompible (~) une palabras en una sola ficha.
function fichas(piezas, estiloBase) {
  const out = [];
  for (const p of piezas) {
    if (p.m !== undefined) { out.push({ math: p.m }); continue; }
    const estilo = p.negrita ? "negrita" : p.cursiva ? (estiloBase === "negrita" ? "negrita" : "cursiva") : estiloBase;
    for (const w of p.t.split(/([ \t\n]+)/)) {
      if (!w) continue;
      if (/^[ \t\n]+$/.test(w)) out.push({ espacio: true }); else out.push({ texto: w, estilo });
    }
  }
  return out;
}
const medir = (f, tam) => FUENTE[f.estilo].getAdvanceWidth(f.texto.replace(/\u00A0/g, " ").replace(/\u2009/g, " "), tam);

// Compone un bloque de texto. Devuelve { svg, alto, lineas }.
// Acepta los comandos de LaTeX que interpreta assets/texto-latex.js (\textbf, \emph, ~, ---, \ss, \[…\], etc.) y **negrita**.
export function bloque(texto, o) {
  const { x, y, ancho, tam, estilo = "normal", color = "#000", alinear = "izquierda", interlineado = 1.35, justificar = false } = o;
  const bloques = DPTexto.analizar(texto);
  const esp = FUENTE.normal.getAdvanceWidth(" ", tam);
  const lineas = [];
  for (const [n, b] of bloques.entries()) {
    const sep = n === 0 ? 0 : b.tipo === "formula" || b.sigue ? tam * 0.25 : tam * 0.55;   // espacio antes del bloque
    if (b.tipo === "formula") {
      const m = formula(b.m, tam, true);
      if (m) { lineas.push({ formula: m, sep }); continue; }
      b.piezas = [{ t: "\\[" + b.m + "\\]", negrita: false, cursiva: false }];            // fórmula con error: se muestra tal cual
    }
    const fs = fichas(b.piezas, estilo);
    let linea = [], w = 0, pendienteEspacio = false, primera = true;
    const cerrar = (fin) => { lineas.push({ fichas: linea, w, fin, sep: primera ? sep : 0 }); primera = false; linea = []; w = 0; };
    for (const f of fs) {
      if (f.espacio) { pendienteEspacio = true; continue; }
      let ancho_f;
      if (f.math !== undefined) { const m = formula(f.math, tam); if (m) { f.m = m; ancho_f = m.ancho; } else { f.texto = "$" + f.math + "$"; f.estilo = estilo; delete f.math; } }
      if (f.texto !== undefined) ancho_f = medir(f, tam);
      f.w = ancho_f; f.esp = linea.length && pendienteEspacio;
      const extra = (f.esp ? esp : 0) + f.w;
      if (linea.length && w + extra > ancho) { cerrar(false); f.esp = false; }
      linea.push(f); w += (f.esp ? esp : 0) + f.w; pendienteEspacio = false;
    }
    cerrar(true);
  }
  const alto_l = tam * interlineado;
  let svg = "", yy = y, alto = 0;
  lineas.forEach((l) => {
    yy += l.sep; alto += l.sep;
    if (l.formula) {                                  // fórmula destacada: centrada en su propia línea (reducida si no cabe)
      const k = Math.min(1, ancho / l.formula.ancho), an = l.formula.ancho * k, al = l.formula.alto * k;
      const h = Math.max(alto_l, al + tam * 0.5), top = yy + (h - al) / 2;
      svg += l.formula.svg.replace(/^<svg([^>]*)>/, (m0, attrs) => `<svg${attrs.replace(/\s(width|height|style)="[^"]*"/g, "")} x="${(x + (ancho - an) / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${an.toFixed(1)}" height="${al.toFixed(1)}" color="${color}">`);
      yy += h; alto += h; return;
    }
    const base = yy + tam * 0.95;
    const huecos = l.fichas.filter((f) => f.esp).length;
    const extraEsp = justificar && !l.fin && huecos ? (ancho - l.w) / huecos : 0;
    let xx = alinear === "centro" ? x + (ancho - l.w) / 2 : alinear === "derecha" ? x + ancho - l.w : x;
    for (const f of l.fichas) {
      if (f.esp) xx += esp + extraEsp;
      if (f.m) {
        const top = base + f.m.bajada - f.m.alto;
        svg += f.m.svg.replace(/^<svg([^>]*)>/, (m0, attrs) => `<svg${attrs.replace(/\s(width|height|style)="[^"]*"/g, "")} x="${xx.toFixed(1)}" y="${top.toFixed(1)}" width="${f.m.ancho.toFixed(1)}" height="${f.m.alto.toFixed(1)}" color="${color}">`)
      } else {
        svg += `<text x="${xx.toFixed(1)}" y="${base.toFixed(1)}" font-family="Roboto" font-size="${tam}" ${ESTILO[f.estilo]} fill="${color}" xml:space="preserve">${esc(f.texto.replace(/\u00A0/g, " ").replace(/\u2009/g, " "))}</text>`;
      }
      xx += f.w;
    }
    yy += alto_l; alto += alto_l;
  });
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
