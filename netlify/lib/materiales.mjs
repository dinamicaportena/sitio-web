// Composición del afiche (PDF/PNG, A4), el anuncio (imagen 16:9) y el certificado (PDF, A4) del seminario.
// Todas las piezas se generan como SVG a partir de componentes gráficos y luego se convierten a PNG o PDF.
import { readFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import jpeg from "jpeg-js";
import { bloque, bloqueAjustado, esc, RUTA_FUENTES, rutaRecurso } from "./composicion.mjs";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { fechaLarga } from "./comun.mjs";

const RUTA = rutaRecurso("plantillas");
const dataURI = (archivo, tipo = "image/png") => `data:${tipo};base64,` + readFileSync(path.join(RUTA, archivo)).toString("base64");
let COMP = null;
export const COMPONENTES = {       // nombre → [archivo por defecto, descripción]
  cabecera: ["cabecera.jpg", "Cabecera del afiche y del certificado (título e ilustración)"],
  anuncioTitulo: ["anuncio-titulo.png", "Anuncio: bloque de título «Seminario Dinámica Porteña»"],
  anuncioIlustracion: ["anuncio-ilustracion.jpg", "Anuncio: ilustración del ascensor"],
  pucv: ["logo-pucv-centenario.png", "Logo PUCV 100 años, a color"],
  pucvBlanco: ["logo-pucv-centenario-blanco.png", "Logo PUCV 100 años, monocromo blanco"],
  ima: ["logo-ima.png", "Logo del IMA, a color"],
  imaBlanco: ["logo-ima-blanco.png", "Logo del IMA, blanco"],
  grilla: ["grilla-color.png", "Grilla del centenario, a color"],
  grillaBlanca: ["grilla-blanca.png", "Grilla del centenario, blanca"],
};
const componentes = (propios = {}) => (COMP ||= {
  cabecera: dataURI("cabecera.jpg", "image/jpeg"), anuncioTitulo: dataURI("anuncio-titulo.png"), anuncioIlustracion: dataURI("anuncio-ilustracion.jpg", "image/jpeg"),
  pucv: dataURI("logo-pucv-centenario.png"), pucvBlanco: dataURI("logo-pucv-centenario-blanco.png"),
  ima: dataURI("logo-ima.png"), imaBlanco: dataURI("logo-ima-blanco.png"),
  grilla: dataURI("grilla-color.png"), grillaBlanca: dataURI("grilla-blanca.png") }, { ...COMP, ...propios });

export const CONFIG_BASE = {
  azul: "#1E5273",            // azul de la plantilla del seminario
  azulOscuro: "#1a4269",      // mismos tonos que el sitio web
  rojo: "#e73a34", rojoTexto: "#c62d28", grisFondo: "#f3f5f8", texto: "#26292c",
  firmaNombre: "Felipe Riquelme",
  firmaCargo: { es: "Organizador del Seminario", en: "Seminar Organizer" },
  ciudad: "Valparaíso",
  institucion: { es: "Instituto de Matemáticas · Pontificia Universidad Católica de Valparaíso", en: "Institute of Mathematics · Pontificia Universidad Católica de Valparaíso" },
  direccion: "Blanco Viel 596, Cerro Barón, Valparaíso, Chile",
  web: "www.dinamicaportena.cl",
  email: "dinamica.portena@pucv.cl",
};
const T = {
  es: { quien: "A quien corresponda", sesion: (f) => `Sesión del ${f}`, ima: "Instituto de Matemáticas, PUCV.", contacto: "Contacto",
        cert: (c, f) => `Por medio de la presente, certifico que **${c.expositor}**${c.institucion ? `, de **${c.institucion}**` : ""}, participó el ${f} en el Seminario Dinámica Porteña. Su charla se tituló` },
  en: { quien: "To whom it may concern", sesion: (f) => `Session of ${f}`, ima: "Institute of Mathematics, PUCV.", contacto: "Contact",
        cert: (c, f) => `This is to certify that **${c.expositor}**${c.institucion ? `, from **${c.institucion}**` : ""}, gave a talk on ${f} at the Dinámica Porteña Seminar, entitled` },
};
const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sinDia = (f) => f.replace(/^\S+,? /, "");                       // «viernes 4 de…» → «4 de…»
const sinDia2 = (f) => f.replace(/ de \d{4}$/, "").replace(/,? \d{4}$/, "");   // quita el año
const salaCorta = (sala) => String(sala || "").split(",")[0];
const lineaFecha = (c, idioma) => `${mayus(fechaLarga(c.fecha, "", idioma))}, ${c.sala}, ${c.hora} ${idioma === "en" ? "h" : "hrs"}.`;
const lineaFechaCorta = (c, idioma) => `${mayus(fechaLarga(c.fecha, "", idioma).replace(/ de \d{4}$/, "").replace(/,? \d{4}$/, ""))}, ${salaCorta(c.sala)}, ${c.hora} ${idioma === "en" ? "h" : "hrs"}.`;

// ---------- Piezas comunes ----------
// Cabecera de la plantilla con la dirección web actualizada
function cabecera(K, C, W) {
  // la cabecera conserva el título y la ilustración; los datos del Instituto y la web van al pie
  return `<image href="${K.cabecera}" x="0" y="0" width="${W}" height="1170"/>` +
    `<rect x="110" y="540" width="1060" height="170" fill="#fff"/>`;
}
// Fila de logos: PUCV (centenario) + IMA, alineada a la derecha
function filaLogos(K, xDer, y, alto, blanco = false) {
  const wP = alto * 900 / 395, hI = alto * 0.62, wI = hI * 735 / 315, sep = alto * 0.35;
  const xI = xDer - wI, xP = xI - sep - wP;
  return `<image href="${blanco ? K.pucvBlanco : K.pucv}" x="${xP}" y="${y}" width="${wP}" height="${alto}"/>` +
         `<image href="${blanco ? K.imaBlanco : K.ima}" x="${xI}" y="${y + (alto - hI) / 2 - alto * 0.06}" width="${wI}" height="${hI}"/>`;
}
// Pie con institución, dirección, contacto y logos (documentos A4), centrado verticalmente con los logos
function pieA4(K, C, idioma, W, H, M, conLinea = true) {
  const altoLogos = 190, yLogos = H - 360, tam = 34, int = tam * 1.42;
  const y0 = yLogos + (altoLogos - 3 * int) / 2 - tam * 0.12;
  return (conLinea ? `<line x1="${M}" y1="${H - 410}" x2="${W - M}" y2="${H - 410}" stroke="${C.azul}" stroke-width="2.5"/>` : "") +
    bloque(C.institucion[idioma], { x: M, y: y0, ancho: 1450, tam, estilo: "negrita", color: C.azul, interlineado: 1.42 }).svg +
    bloque(C.direccion, { x: M, y: y0 + int, ancho: 1450, tam, color: C.azul, interlineado: 1.42 }).svg +
    bloque(`${C.email}   ·   ${C.web}`, { x: M, y: y0 + 2 * int, ancho: 1450, tam, color: C.azul, interlineado: 1.42 }).svg +
    filaLogos(K, W - M, yLogos, altoLogos) +
    `<image href="${K.grilla}" x="0" y="${H - 100}" width="${W}" height="${W * 125 / 2483}" preserveAspectRatio="none"/>`;
}

// Foto circular del expositor (si la hay)
let nClip = 0;
function fotoCircular(uri, cx, cy, r, borde = "#fff") {
  const id = "clip" + (++nClip);
  return `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>` +
    `<image href="${uri}" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${borde}" stroke-width="6"/>`;
}

// ---------- Afiche (A4 a 300 ppp: 2482 × 3509) ----------
// Banda azul con fecha y sala; cada charla en una tarjeta con el estilo del sitio (barra roja, hora en rojo);
// pie con institución, dirección, contacto, logos y grilla del centenario.
export function svgAfiche(charlas, idioma = "es", cfg = {}) {
  const C = { ...CONFIG_BASE, ...cfg }, K = componentes(cfg.componentes), W = 2482, H = 3509, M = 117, AN = W - 2 * M;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`;
  s += cabecera(K, C, W);
  const c0 = charlas[0], hrs = idioma === "en" ? "h" : "hrs";
  const banda = `${mayus(sinDia2(fechaLarga(c0.fecha, "", idioma)))} · ${salaCorta(c0.sala)}`;
  s += `<rect x="${M}" y="1182" width="${AN}" height="190" fill="${C.azul}"/>`;
  s += bloqueAjustado(banda, { x: M + 60, y: 1240, ancho: AN - 120, tam: 62, estilo: "negrita", color: "#fff", alinear: "centro" }, 80, 36).svg;
  const y0 = 1470, piso = H - 470, sepTarjetas = 70, pad = 60;
  for (let base = charlas.length > 1 ? 42 : 48; base >= 22; base -= 2) {
    let y = y0, t = "";
    for (const c of charlas) {
      const conFoto = Boolean(c.fotoURI), rFoto = base * 2.6;
      const xT = M + pad + 18, anT = AN - 2 * pad - 18, anCab = conFoto ? anT - 2 * rFoto - 50 : anT;
      let yy = y + pad, cont = "";
      const hh = bloque(`${c.hora} ${hrs}`.toUpperCase(), { x: xT, y: yy, ancho: anCab, tam: base * 0.8, estilo: "negrita", color: C.rojoTexto });
      cont += hh.svg; yy += hh.alto + base * 0.25;
      const tt = bloque(c.titulo, { x: xT, y: yy, ancho: anCab, tam: base * 1.3, estilo: "negrita", color: C.azulOscuro, interlineado: 1.15 });
      cont += tt.svg; yy += tt.alto + base * 0.3;
      const qq = bloque(`**${c.expositor}**${c.institucion ? " — " + c.institucion : ""}`, { x: xT, y: yy, ancho: anCab, tam: base * 0.95, color: C.azul });
      cont += qq.svg; yy += qq.alto;
      if (conFoto) { const cy = y + pad + rFoto; cont += fotoCircular(c.fotoURI, xT + anT - rFoto, cy, rFoto); yy = Math.max(yy, cy + rFoto); }
      yy += base * 0.9;
      const rr = bloque(c.resumen || "", { x: xT, y: yy, ancho: anT, tam: base, justificar: true, interlineado: 1.5, color: C.texto });
      cont += rr.svg; yy += rr.alto + pad * 0.8;
      t += `<rect x="${M}" y="${y}" width="${AN}" height="${yy - y}" rx="14" fill="${C.grisFondo}"/>` +
           `<rect x="${M}" y="${y}" width="16" height="${yy - y}" fill="${C.rojo}"/>` + cont;
      y = yy + sepTarjetas;
    }
    if (y - sepTarjetas <= piso || base <= 22) { s += t; break; }
  }
  s += pieA4(K, C, idioma, W, H, M);
  return s + "</svg>";
}

// ---------- Anuncio (imagen 2917 × 1667, como la plantilla de título) ----------
// Formato vertical 4:5 (1080 × 1350 al exportar), pensado para leerse bien dentro de un correo y en redes sociales.
export const ANUNCIO = { W: 2160, H: 2700 };
export function svgAnuncio(charlas, idioma = "es", cfg = {}) {
  const C = { ...CONFIG_BASE, ...cfg }, K = componentes(cfg.componentes), { W, H } = ANUNCIO, X = 110, AN = W - 2 * X;
  const AZUL = "rgb(29,81,114)";
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${AZUL}"/>`;
  // cabecera: ilustración a la derecha y bloque de título a la izquierda (piezas de la plantilla original)
  const wI = 980, hI = wI * 1322 / 1258;
  s += `<image href="${K.anuncioIlustracion}" x="${W - wI - 40}" y="40" width="${wI}" height="${hI}"/>`;
  const wT = 1250, hT = wT * 528 / 1548;
  s += `<image href="${K.anuncioTitulo}" x="0" y="70" width="${wT}" height="${hT}"/>`;
  // pie: institución, dirección y contacto; logos; grilla completa al borde inferior
  const hG = W * 126 / 2483, yG = H - hG - 44, altoLogos = 170, yLog = yG - 70 - altoLogos, tp = 40, ip = tp * 1.42;
  s += `<line x1="${X}" y1="${yLog - 60}" x2="${W - X}" y2="${yLog - 60}" stroke="#fff" stroke-opacity=".35" stroke-width="3"/>`;
  const lineas = [...C.institucion[idioma].split(" · ").map((l, n) => (n === 0 ? `**${l}**` : l)), C.direccion, `${C.email} · ${C.web}`];
  const yp = yLog + (altoLogos - lineas.length * ip) / 2 - tp * 0.1;
  lineas.forEach((l, n) => { s += bloque(l, { x: X, y: yp + n * ip, ancho: 1250, tam: tp, color: "#fff" }).svg; });
  s += filaLogos(K, W - X, yLog, altoLogos, true);
  s += `<image href="${K.grillaBlanca}" x="0" y="${yG}" width="${W}" height="${hG}" preserveAspectRatio="none"/>`;
  // contenido: fecha y sala; cada charla con su foto a la izquierda y la información a la derecha
  const hrs = idioma === "en" ? "h" : "hrs";
  // fecha y sala en la columna izquierda, junto a la ilustración
  const anCol = W - wI - 40 - X - 50, yF = 70 + hT + 110;
  const f = mayus(sinDia2(fechaLarga(charlas[0].fecha, "", idioma)));
  const bf = bloqueAjustado(f, { x: X, y: yF, ancho: anCol, tam: 72, estilo: "negrita", color: "#fff", interlineado: 1.15 }, 190, 44);
  s += bf.svg;
  s += bloque(salaCorta(charlas[0].sala), { x: X, y: yF + bf.alto + 20, ancho: anCol, tam: 56, color: "#fff" }).svg;
  // charlas: foto a la izquierda, información a la derecha; se agrandan hasta llenar el espacio y se centran verticalmente
  const Y0 = 40 + hI + 80, Y1 = yLog - 110;
  let mejor = null;
  for (let k = charlas.length === 1 ? 1.7 : 2; k >= 0.5; k -= 0.04) {
    let y = Y0, t = "";
    for (const c of charlas) {
      const rF = 110 * k, conFoto = Boolean(c.fotoURI), xq = conFoto ? X + 2 * rF + 50 * k : X, anq = AN - (xq - X), y1 = y;
      const a = bloque(`${c.hora} ${hrs} · **${c.expositor}**${c.institucion ? " (" + c.institucion + ")" : ""}`, { x: xq, y, ancho: anq, tam: 46 * k, color: "#fff" });
      t += a.svg; y += a.alto + 12 * k;
      const b = bloque(c.titulo, { x: xq, y, ancho: anq, tam: 66 * k, estilo: "negrita", color: "#fff", interlineado: 1.13 });
      t += b.svg; y += b.alto;
      if (conFoto) { t += fotoCircular(c.fotoURI, X + rF, Math.max(y1 + rF, (y1 + y) / 2), rF); y = Math.max(y, y1 + 2 * rF); }
      y += 90 * k;
    }
    const fin = y - 90 * k;
    if (fin <= Y1 || k <= 0.5) { mejor = { t, alto: fin - Y0 }; break; }
  }
  s += `<g transform="translate(0 ${Math.max(0, (Y1 - Y0 - mejor.alto) / 2).toFixed(1)})">${mejor.t}</g>`;
  return s + "</svg>";
}

// ---------- Certificado (A4: 2482 × 3509) ----------
export function svgCertificado(c, idioma = "es", cfg = {}, fechaEmision = new Date()) {
  const C = { ...CONFIG_BASE, ...cfg }, K = componentes(cfg.componentes), W = 2482, H = 3509, M = 117, AN = W - 2 * M, TX = 340, ATX = W - 2 * TX;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`;
  s += cabecera(K, C, W);
  s += bloque(T[idioma].quien, { x: M, y: 1400, ancho: AN, tam: 64, estilo: "negrita", color: C.azul, alinear: "centro" }).svg;
  let y = 1640;
  const cuerpo = bloque(T[idioma].cert(c, sinDia(fechaLarga(c.fecha, "", idioma))), { x: TX, y, ancho: ATX, tam: 52, justificar: true, interlineado: 1.45 });
  s += cuerpo.svg; y += cuerpo.alto + 110;
  const tit = bloqueAjustado(c.titulo + ".", { x: TX, y, ancho: ATX, tam: 62, estilo: "negrita", alinear: "centro", interlineado: 1.2 }, 360, 40);
  s += tit.svg; y = Math.max(y + tit.alto + 380, 2450);
  // espacio para la firma (se agrega la imagen cuando esté disponible)
  if (C.firma) s += `<image href="${C.firma}" x="${W / 2 - 330}" y="${y - 330}" width="660" height="300" preserveAspectRatio="xMidYMax meet"/>`;
  s += `<line x1="${W / 2 - 330}" y1="${y}" x2="${W / 2 + 330}" y2="${y}" stroke="#333" stroke-width="3"/>`;
  s += bloque(C.firmaNombre, { x: M, y: y + 20, ancho: AN, tam: 50, estilo: "negrita", color: C.azul, alinear: "centro" }).svg;
  s += bloque(C.firmaCargo[idioma], { x: M, y: y + 88, ancho: AN, tam: 50, estilo: "negrita", color: C.azul, alinear: "centro" }).svg;
  const emision = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(fechaEmision);
  s += bloque(`${C.ciudad}, ${sinDia(fechaLarga(emision, "", idioma))}.`, { x: M, y: H - 560, ancho: 1100, tam: 42 }).svg;
  s += pieA4(K, C, idioma, W, H, M);
  return s + "</svg>";
}

// ---------- Conversión ----------
export function aPDF(svg, ancho = 2482, alto = 3509) {
  return new Promise((ok, mal) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: "Seminario Dinámica Porteña", Author: "Instituto de Matemáticas PUCV" } });
    doc.registerFont("Roboto", path.join(RUTA_FUENTES, "Roboto-Regular.ttf"));
    doc.registerFont("Roboto-Bold", path.join(RUTA_FUENTES, "Roboto-Bold.ttf"));
    doc.registerFont("Roboto-Italic", path.join(RUTA_FUENTES, "Roboto-Italic.ttf"));
    const partes = []; doc.on("data", (b) => partes.push(b)); doc.on("end", () => ok(Buffer.concat(partes))); doc.on("error", mal);
    SVGtoPDF(doc, svg, 0, 0, { width: 595.28, height: 841.89, preserveAspectRatio: "xMidYMid meet",
      fontCallback: (familia, negrita, cursiva) => (negrita ? "Roboto-Bold" : cursiva ? "Roboto-Italic" : "Roboto") });
    doc.end();
  });
}
// JPEG (más liviano para el correo): se rasteriza con resvg y se codifica con jpeg-js
export function aJPEG(svg, ancho, calidad = 86) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: ancho }, background: "#ffffff",
    font: { fontDirs: [RUTA_FUENTES], defaultFontFamily: "Roboto", loadSystemFonts: false } }).render();
  return jpeg.encode({ data: r.pixels, width: r.width, height: r.height }, calidad).data;
}
export function aPNG(svg, ancho) {
  const r = new Resvg(svg, { fitTo: ancho ? { mode: "width", value: ancho } : { mode: "original" },
    font: { fontDirs: [RUTA_FUENTES], defaultFontFamily: "Roboto", loadSystemFonts: false } });
  return r.render().asPng();
}
