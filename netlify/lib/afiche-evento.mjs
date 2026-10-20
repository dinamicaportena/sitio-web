// Afiche automático de una página de evento: se arma con los datos del panel (nombre, fechas, lugar, conferencistas,
// comités, logos de auspiciantes, inscripción, dirección de la página y código QR) sobre una imagen de fondo.
// Se regenera cada vez que se pide, así que siempre refleja la información guardada en el panel.
//   formato «carta»: vertical, tamaño carta (PDF para imprimir, o JPG)    formato «redes»: 4:5 (1080 × 1350)
// Todo el texto se dibuja como trazos (opentype.js), de modo que el PDF y la imagen se ven idénticos.
import { readFileSync } from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import { Resvg } from "@resvg/resvg-js";
import jpeg from "jpeg-js";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { RUTA_FUENTES } from "./composicion.mjs";

import qrcode from "./vendor/qrcode-generator.cjs";     // Kazuhiko Arase, licencia MIT

export const FORMATOS = { carta: { W: 1700, H: 2200 }, redes: { W: 1080, H: 1350 } };
const AZUL = "#245cb8", AZUL_LINEA = "#346ec8", NEGRO = "#0e182c", GRIS = "#4a5060", GRIS_CLARO = "#5c6270";

// ---------- fuentes y texto como trazos ----------
const FUENTES = {};
function fuente(n) {
  if (!FUENTES[n]) { const b = readFileSync(path.join(RUTA_FUENTES, n)); FUENTES[n] = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
  return FUENTES[n];
}
const F = {
  numeral: () => fuente("Barlow-ExtraLight.ttf"), fina: () => fuente("BarlowCondensed-Light.ttf"),
  normal: () => fuente("BarlowCondensed-Regular.ttf"), media: () => fuente("BarlowCondensed-Medium.ttf"), gruesa: () => fuente("BarlowCondensed-SemiBold.ttf"),
};
const cap = (f, tam) => (f.tables.os2?.sCapHeight || f.unitsPerEm * 0.7) / f.unitsPerEm * tam;   // alto de mayúscula
function ancho(txt, f, tam, esp = 0) { let w = 0; for (const c of txt) w += f.getAdvanceWidth(c, tam); return w + esp * Math.max(0, [...txt].length - 1); }
function trazo(txt, x, y, f, tam, color, esp = 0) {
  let d = "";
  if (!esp) d = f.getPath(txt, x, y, tam).toPathData(1);
  else for (const c of txt) { d += f.getPath(c, x, y, tam).toPathData(1); x += f.getAdvanceWidth(c, tam) + esp; }
  return d ? `<path d="${d}" fill="${color}"/>` : "";
}
// Tamaño para que «txt» tenga mayúsculas de alto «alto», reducido si no cabe en «max»
function ajustar(txt, f, alto, max, espEm = 0) {
  let tam = alto / (cap(f, 1000) / 1000);
  while (tam > 6 && ancho(txt, f, tam, espEm * tam) > max) tam *= 0.97;
  return tam;
}

// ---------- datos ----------
const tr = (v) => (typeof v === "string" ? v : (v && (v.es || v.en)) || "");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function fechas(inicio, fin) {
  const p = (f) => (/^\d{4}-\d{2}-\d{2}$/.test(f || "") ? f.split("-").map(Number) : null);
  const a = p(inicio), b = p(fin) || a; if (!a) return "";
  if (a[0] === b[0] && a[1] === b[1]) return a[2] === b[2] ? `${a[2]} de ${MESES[a[1] - 1]} de ${a[0]}` : `${a[2]} al ${b[2]} de ${MESES[a[1] - 1]} de ${a[0]}`;
  return `${a[2]} de ${MESES[a[1] - 1]}${a[0] !== b[0] ? " de " + a[0] : ""} al ${b[2]} de ${MESES[b[1] - 1]} de ${b[0]}`;
}
const fechaLarga = (f) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f || ""); return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : ""; };
// Valores por omisión de la plantilla, deducidos del nombre y del lugar del evento («LXIV Coloquio … de Sistemas Dinámicos»)
export function plantillaAfiche(c) {
  const a = c.afichePlantilla || {}, nombre = tr(c.nombre).trim();
  const m = /^([IVXLCDM]+)\s+(.*)$/i.exec(nombre), resto = m ? m[2] : nombre, i = resto.toLowerCase().lastIndexOf(" de ");
  return {
    numeral: a.numeral ?? (m ? m[1].toUpperCase() : ""),
    superior: a.superior ?? (i > 0 ? resto.slice(0, i + 3) : ""),
    titulo: a.titulo ?? (i > 0 ? resto.slice(i + 4) : resto),
    lugar: a.lugar ?? [tr(c.lugar), c.direccion].filter(Boolean).join("\n"),
    fondo: a.fondo ?? "",
    comites: a.comites !== false, conferencistas: a.conferencistas !== false, logos: a.logos !== false, inscripcion: a.inscripcion !== false,
  };
}

// ---------- imágenes (fondo y logos): se leen por su dirección y se incrustan ----------
function dimensiones(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), tipo: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const mk = b[i + 1], len = b.readUInt16BE(i + 2);
      if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5), tipo: "image/jpeg" };
      i += 2 + len;
    }
  }
  return null;
}
async function imagen(url, origen) {
  if (!url) return null;
  const abs = /^https?:\/\//.test(url) ? url : /^\//.test(url) ? origen + url : null;
  if (!abs) return null;
  try {
    const r = await fetch(abs); if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer()), d = dimensiones(b);
    return d ? { ...d, uri: `data:${d.tipo};base64,${b.toString("base64")}` } : null;
  } catch { return null; }
}
function qrSVG(texto, x, y, lado, color = NEGRO) {
  const q = qrcode(0, "M"); q.addData(texto); q.make();
  const n = q.getModuleCount(), m = lado / (n + 2); let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${(x + (c + 1) * m).toFixed(2)} ${(y + (r + 1) * m).toFixed(2)}h${m.toFixed(2)}v${m.toFixed(2)}h-${m.toFixed(2)}z`;
  return `<rect x="${x}" y="${y}" width="${lado}" height="${lado}" fill="#fff"/><path d="${d}" fill="${color}"/>`;
}

// Título en líneas: las que el panel indique (saltos de línea) o, si no, en dos líneas de largo parecido
function partirTitulo(t) {
  const l = t.split("\n").map((x) => x.trim()).filter(Boolean);
  if (l.length !== 1) return l;
  const p = l[0].split(/\s+/); if (p.length < 2) return l;
  let mejor = 1, dif = Infinity;
  for (let i = 1; i < p.length; i++) { const d = Math.abs(p.slice(0, i).join(" ").length - p.slice(i).join(" ").length); if (d < dif) { dif = d; mejor = i; } }
  return [p.slice(0, mejor).join(" "), p.slice(mejor).join(" ")];
}

// ---------- composición ----------
export async function svgAficheEvento(c, { formato = "carta", origen, slug }) {
  const { W, H } = FORMATOS[formato] || FORMATOS.carta, redes = formato === "redes";
  const P = plantillaAfiche(c);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;

  // Fondo: cubre el ancho; se recorta un poco arriba y más abajo (el pie lo tapa)
  const fondo = await imagen(P.fondo, origen);
  if (fondo) {
    const alto = W * fondo.h / fondo.w, y = Math.min(0, -(alto - H) * 0.35);
    s += `<image x="0" y="${y.toFixed(1)}" width="${W}" height="${alto.toFixed(1)}" preserveAspectRatio="none" xlink:href="${fondo.uri}" href="${fondo.uri}"/>`;
  }

  // Bloque del título (arriba a la derecha)
  const X0 = W * 0.535, MAX = W * 0.425;
  let y = H * (redes ? 0.065 : 0.07);
  if (P.numeral) {
    const f = F.numeral(), t = ajustar(P.numeral, f, H * 0.052, MAX, 0.06);
    y += cap(f, t); s += trazo(P.numeral, X0, y, f, t, AZUL, 0.06 * t); y += H * 0.022;
  }
  if (P.superior) {
    const f = F.fina(), txt = P.superior.toUpperCase(), t = ajustar(txt, f, H * 0.019, MAX, 0.2);
    y += cap(f, t); s += trazo(txt, X0, y, f, t, NEGRO, 0.2 * t); y += H * 0.03;
  }
  const lineasTit = partirTitulo((P.titulo || "").toUpperCase());
  if (lineasTit.length) {
    const f = F.gruesa(), largo = lineasTit.reduce((a, l) => (ancho(l, f, 100) > ancho(a, f, 100) ? l : a), "");
    const t = ajustar(largo, f, H * 0.042, MAX, 0.012);
    lineasTit.forEach((l, i) => { y += cap(f, t); s += trazo(l, X0, y, f, t, NEGRO, 0.012 * t); y += i < lineasTit.length - 1 ? H * 0.016 : 0; });
  }
  y += H * 0.03; s += `<rect x="${X0 + 2}" y="${y.toFixed(1)}" width="${(W * 0.15).toFixed(1)}" height="${Math.max(2, H * 0.0016).toFixed(1)}" fill="${AZUL_LINEA}"/>`;
  y += H * 0.045;
  const textoFechas = fechas(c.inicio, c.fin).toUpperCase();
  if (textoFechas) { const f = F.fina(), t = ajustar(textoFechas, f, H * 0.019, MAX, 0.04); y += cap(f, t); s += trazo(textoFechas, X0, y, f, t, NEGRO, 0.04 * t); y += H * 0.014; }
  const lineasLugar = String(P.lugar || "").split("\n").map((x) => x.trim().toUpperCase()).filter(Boolean).slice(0, 3);
  if (lineasLugar.length) {           // todas las líneas del lugar con el mismo tamaño (el de la más larga)
    const f = F.fina(), t = Math.min(...lineasLugar.map((l) => ajustar(l, f, H * 0.0125, MAX, 0.07)));
    for (const l of lineasLugar) { y += cap(f, t) + H * 0.01; s += trazo(l, X0, y, f, t, GRIS_CLARO, 0.07 * t); }
  }
  const finTitulo = y;

  // Recuadro de información (conferencistas y comités), a la derecha, sobre fondo blanco translúcido
  const secciones = [];
  const persona = (x) => ({ nombre: String(x.nombre || "").trim(), inst: String(x.institucion || "").trim() });
  if (P.conferencistas) {
    const conf = (c.conferencistas || []).filter((x) => x && x.nombre).map(persona);
    if (conf.length) secciones.push({ rotulo: "Conferencistas", lista: conf, prioridad: 1 });
  }
  if (P.comites) {
    const cie = (c.cientifico || []).filter((x) => x && x.nombre).map(persona), org = (c.organizadores || []).filter((x) => x && x.nombre).map(persona);
    if (c.comiteUnico) { if (cie.length) secciones.push({ rotulo: "Comité científico y organizador", lista: cie, prioridad: 2, comite: true }); }
    else {
      if (cie.length) secciones.push({ rotulo: "Comité científico", lista: cie, prioridad: 2, comite: true });
      if (org.length) secciones.push({ rotulo: "Comité organizador", lista: org, prioridad: 3, comite: true });
    }
  }
  const pieAlto = H * (redes ? 0.15 : 0.125), pieY = H - pieAlto;
  const cajaY = finTitulo + H * 0.04, cajaX = X0 - W * 0.025, cajaW = W - cajaX - W * 0.03, cajaH = pieY - H * 0.025 - cajaY;
  const minTam = H * (redes ? 0.0125 : 0.0095);
  // Distribución: cada sección con su rótulo; las listas largas en dos columnas; se reduce el tamaño hasta que quepa
  // Comités: siempre en dos columnas (nombre y, debajo, institución); otras listas, en dos columnas si son largas
  function medir(secs, tam) {
    const lin = tam * 1.32, rot = tam * 1.05, gap = tam * 1.2;
    let h = 0;
    for (const sc of secs) { const cols = sc.comite ? (sc.lista.length > 1 ? 2 : 1) : (sc.lista.length > 4 ? 2 : 1); h += rot + tam * 0.6 + Math.ceil(sc.lista.length / cols) * lin * (cols === 2 ? 1.9 : 1) + gap; sc._cols = cols; }
    return h - gap;
  }
  let secs = [...secciones], tam = H * 0.0145;
  while (secs.length) {
    while (tam > minTam && medir(secs, tam) > cajaH - tam * 2) tam *= 0.95;
    if (medir(secs, tam) <= cajaH - tam * 2) break;
    secs = secs.filter((x) => x !== secs.reduce((a, b) => (b.prioridad > a.prioridad ? b : a)));   // sin espacio: se omite la de menor prioridad
    tam = H * 0.0145;
  }
  if (secs.length) {
    const alto = medir(secs, tam) + tam * 2.2;
    s += `<rect x="${cajaX.toFixed(1)}" y="${cajaY.toFixed(1)}" width="${cajaW.toFixed(1)}" height="${alto.toFixed(1)}" rx="${(W * 0.008).toFixed(1)}" fill="#ffffff" fill-opacity="0.9"/>`;
    let yy = cajaY + tam * 1.1;
    const xx = cajaX + W * 0.025, colW = (cajaW - W * 0.05) / 2;
    for (const sc of secs) {
      const fr = F.gruesa(), rot = sc.rotulo.toUpperCase(), tr_ = tam * 0.98;
      yy += cap(fr, tr_); s += trazo(rot, xx, yy, fr, tr_, AZUL, 0.08 * tr_); yy += tam * 0.75;
      const cols = sc._cols, porCol = Math.ceil(sc.lista.length / cols), lin = tam * 1.32;
      sc.lista.forEach((p, i) => {
        const col = cols === 2 ? Math.floor(i / porCol) : 0, fila = cols === 2 ? i % porCol : i;
        const x = xx + col * colW, maxW = (cols === 2 ? colW : cajaW - W * 0.05) - tam * 0.5;
        if (cols === 2) {               // nombre y, debajo, institución
          const y1 = yy + fila * lin * 1.9 + cap(F.media(), tam);
          const tN = Math.min(tam, ajustar(p.nombre, F.media(), cap(F.media(), tam), maxW) );
          s += trazo(p.nombre, x, y1, F.media(), tN, NEGRO);
          if (p.inst) { const tI = Math.min(tam * 0.86, ajustar(p.inst, F.normal(), cap(F.normal(), tam * 0.86), maxW)); s += trazo(p.inst, x, y1 + lin * 0.86, F.normal(), tI, GRIS); }
        } else {                        // «Nombre · Institución» en una línea
          const y1 = yy + fila * lin + cap(F.media(), tam);
          let tN = tam; const sep = p.inst ? "  ·  " + p.inst : "";
          while (tN > 6 && ancho(p.nombre, F.media(), tN) + ancho(sep, F.normal(), tN) > maxW) tN *= 0.97;
          s += trazo(p.nombre, x, y1, F.media(), tN, NEGRO);
          if (sep) s += trazo(sep, x + ancho(p.nombre, F.media(), tN), y1, F.normal(), tN, GRIS);
        }
      });
      yy += porCol * lin * (cols === 2 ? 1.9 : 1) + tam * 1.2;
    }
  }

  // Pie blanco: logos a la izquierda; inscripción, dirección de la página y QR a la derecha
  s += `<rect x="0" y="${pieY.toFixed(1)}" width="${W}" height="${pieAlto.toFixed(1)}" fill="#ffffff"/>`;
  s += `<rect x="0" y="${pieY.toFixed(1)}" width="${W}" height="${Math.max(2, H * 0.002).toFixed(1)}" fill="${AZUL_LINEA}"/>`;
  const M = W * 0.05, qrLado = pieAlto * 0.72, qrX = W - M - qrLado, qrY = pieY + (pieAlto - qrLado) / 2;
  const host = "dinamicaportena.cl";              // dirección pública del sitio (también en vistas previas y pruebas)
  let xLogosFin = qrX - W * 0.03;
  if (P.inscripcion) {
    s += qrSVG(`https://${host}/${slug}/`, qrX, qrY, qrLado);
    const i = c.inscripcion || {}, hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
    const abierta = i.abierta && !(i.fechaLimite && hoy > i.fechaLimite);
    const l1 = abierta ? (i.fechaLimite ? `Inscripciones hasta el ${fechaLarga(i.fechaLimite)}` : "Inscripciones abiertas") : "Inscripciones próximamente";
    // Junto al QR (que lleva a la página del evento): el estado de la inscripción y la dirección de la página
    const l2 = `${host}/${slug}`;
    const xr = qrX - W * 0.02, fT = F.media(), fS = F.gruesa();
    const t1 = Math.min(H * 0.0135, ajustar(l1, fT, H * 0.0135 * 0.7, W * 0.32)), t2 = Math.min(H * 0.016, ajustar(l2, fS, H * 0.016 * 0.7, W * 0.32));
    const yc = pieY + pieAlto / 2;
    s += trazo(l1, xr - ancho(l1, fT, t1), yc - t1 * 0.25, fT, t1, GRIS);
    s += trazo(l2, xr - ancho(l2, fS, t2), yc + t2 * 1.0, fS, t2, AZUL);
    xLogosFin = xr - Math.max(ancho(l1, fT, t1), ancho(l2, fS, t2)) - W * 0.04;
  }
  if (P.logos) {
    const logos = (await Promise.all((c.auspiciantes || []).filter((a) => a && a.logo).slice(0, 6).map((a) => imagen(a.logo, origen)))).filter(Boolean);
    if (logos.length) {
      let altoL = pieAlto * 0.5; const gap = W * 0.035, disp = xLogosFin - M;
      const total = (h) => logos.reduce((t, l) => t + l.w * h / l.h, 0) + gap * (logos.length - 1);
      while (altoL > pieAlto * 0.2 && total(altoL) > disp) altoL *= 0.95;
      let x = M; const yL = pieY + (pieAlto - altoL) / 2;
      for (const l of logos) { const w = l.w * altoL / l.h; s += `<image x="${x.toFixed(1)}" y="${yL.toFixed(1)}" width="${w.toFixed(1)}" height="${altoL.toFixed(1)}" xlink:href="${l.uri}" href="${l.uri}"/>`; x += w + gap; }
    }
  }
  return s + "</svg>";
}

// ---------- conversión ----------
export function aficheJPEG(svg, ancho, calidad = 88) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: ancho }, background: "#ffffff", font: { loadSystemFonts: false } }).render();
  return Buffer.from(jpeg.encode({ data: r.pixels, width: r.width, height: r.height }, calidad).data);
}
export function afichePDF(svg, nombre = "Afiche") {
  return new Promise((ok, mal) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 0, info: { Title: nombre, Author: "Dinámica Porteña" } });
    const partes = []; doc.on("data", (b) => partes.push(b)); doc.on("end", () => ok(Buffer.concat(partes))); doc.on("error", mal);
    SVGtoPDF(doc, svg, 0, 0, { width: 612, height: 792, preserveAspectRatio: "xMidYMid meet" });
    doc.end();
  });
}
