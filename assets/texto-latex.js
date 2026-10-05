// Interpreta los resúmenes y títulos de las charlas, que los expositores suelen escribir con comandos de LaTeX.
// Un mismo análisis lo usan el sitio y el panel (navegador, window.DPTexto) y el generador de afiches y anuncios
// (servidor, globalThis.DPTexto), para que el texto se vea igual en todas partes.
//
// Admite:
//   · fórmulas en línea $…$ y \(…\); fórmulas destacadas $$…$$, \[…\] y los entornos equation, align, gather y multline
//   · negrita \textbf{…}, {\bf …} y **…**; cursiva \emph{…}, \textit{…}, \textsl{…}, {\it …}, {\em …}
//   · espacio irrompible ~, guiones -- (–) y --- (—), comillas ``…'' (“…”), \ldots (…)
//   · acentos y letras especiales: \'a, \"o, \~n, \^e, \`a, \c{c}, \v{s}, \ss (ß), \o, \aa, \ae, \oe, \l, etc.
//   · caracteres escapados: \% \& \# \_ \{ \} \$
// Lo que no reconoce se deja tal cual, para que se note y pueda corregirse.
(function (raiz) {
  "use strict";
  const NBSP = " ";
  const ACENTOS = { "'": "́", "`": "̀", "^": "̂", '"': "̈", "~": "̃", "=": "̄", ".": "̇",
                    c: "̧", v: "̌", H: "̋", u: "̆", k: "̨", r: "̊", d: "̣", b: "̱" };
  const LETRAS = { ss: "ß", o: "ø", O: "Ø", aa: "å", AA: "Å", ae: "æ", AE: "Æ", oe: "œ", OE: "Œ", l: "ł", L: "Ł", i: "ı", j: "ȷ",
                   ldots: "…", dots: "…", textellipsis: "…", textendash: "–", textemdash: "—", S: "§", P: "¶", copyright: "©",
                   LaTeX: "LaTeX", TeX: "TeX", textquoteleft: "‘", textquoteright: "’", textquotedblleft: "“", textquotedblright: "”",
                   guillemotleft: "«", guillemotright: "»", textbackslash: "\\", euro: "€", pounds: "£", quad: " ", qquad: "  " };
  const NEGRITA = new Set(["textbf", "mathbf"]), CURSIVA = new Set(["emph", "textit", "textsl"]),
        NEUTRO = new Set(["textrm", "textsf", "texttt", "textup", "textmd", "textnormal", "textsc", "underline", "mbox", "text"]),
        DECL_N = new Set(["bf", "bfseries"]), DECL_C = new Set(["it", "itshape", "em", "sl", "slshape"]), DECL_0 = new Set(["rm", "normalfont", "upshape", "mdseries", "sc", "tt", "sf"]);
  const ENTORNOS = /^(equation|align|gather|multline|eqnarray|flalign|alignat)\*?$/;
  const IGNORAR = new Set(["noindent", "par", "newline", "linebreak", "smallskip", "medskip", "bigskip", "vspace", "hspace", "indent", "centering", "/", "@"]);

  // Busca el cierre de una fórmula a partir de i (sin contar los escapados «\$»)
  function cierre(s, i, fin) {
    for (let k = i; k < s.length; k++) {
      if (s[k] === "\\" && fin !== "\\]" && fin !== "\\)" && s[k + 1] === "$") { k++; continue; }
      if (s.startsWith(fin, k)) return k;
    }
    return -1;
  }
  // Lee un argumento entre llaves que empieza en i («{…}», con llaves anidadas). Devuelve [contenido, posición siguiente] o null.
  function argumento(s, i) {
    while (s[i] === " ") i++;
    if (s[i] !== "{") return null;
    let n = 0;
    for (let k = i; k < s.length; k++) {
      if (s[k] === "\\") { k++; continue; }
      if (s[k] === "{") n++;
      else if (s[k] === "}" && --n === 0) return [s.slice(i + 1, k), k + 1];
    }
    return null;
  }

  // Texto → bloques: { tipo: "p", piezas: [{ t, negrita, cursiva } | { m }], sigue } | { tipo: "formula", m }
  // «sigue» indica que el bloque continúa el párrafo anterior (texto después de una fórmula destacada).
  function analizar(fuente) {
    const s = String(fuente || "").replace(/\r\n?/g, "\n");
    const bloques = [];
    let piezas = [], buf = "", sigue = false;
    const marcos = [{ negrita: false, cursiva: false, llave: false }];     // pila de grupos {…}
    let estrellas = false;                                                    // **…** (sintaxis anterior del sitio)
    const estilo = () => { const m = marcos[marcos.length - 1]; return { negrita: m.negrita || estrellas, cursiva: m.cursiva }; };
    const volcar = () => {
      if (!buf) return;
      const e = estilo(), u = piezas[piezas.length - 1];
      if (u && u.t !== undefined && u.negrita === e.negrita && u.cursiva === e.cursiva) u.t += buf; else piezas.push({ t: buf, ...e });
      buf = "";
    };
    const cerrarParrafo = (siguiente) => {
      volcar();
      if (piezas.some((p) => p.m !== undefined || p.t.trim())) bloques.push({ tipo: "p", piezas, sigue });
      piezas = []; sigue = siguiente;
    };
    const formulaDestacada = (tex) => { cerrarParrafo(true); if (tex.trim()) bloques.push({ tipo: "formula", m: tex.trim() }); };
    const formulaEnLinea = (tex) => { volcar(); piezas.push({ m: tex }); };

    let i = 0;
    while (i < s.length) {
      const c = s[i];
      // párrafo nuevo: línea en blanco
      if (c === "\n") {
        const m = /^\n[ \t]*\n\s*/.exec(s.slice(i));
        if (m) { cerrarParrafo(false); i += m[0].length; continue; }
        buf += " "; i++; continue;
      }
      // fórmulas
      if (s.startsWith("$$", i)) { const k = cierre(s, i + 2, "$$"); if (k > 0) { formulaDestacada(s.slice(i + 2, k)); i = k + 2; continue; } }
      if (s.startsWith("\\[", i)) { const k = cierre(s, i + 2, "\\]"); if (k > 0) { formulaDestacada(s.slice(i + 2, k)); i = k + 2; continue; } }
      if (s.startsWith("\\(", i)) { const k = cierre(s, i + 2, "\\)"); if (k > 0) { formulaEnLinea(s.slice(i + 2, k)); i = k + 2; continue; } }
      if (c === "$") { const k = cierre(s, i + 1, "$"); if (k > i + 1) { formulaEnLinea(s.slice(i + 1, k)); i = k + 1; continue; } }
      if (s.startsWith("\\begin{", i)) {
        const a = argumento(s, i + 6);
        if (a && ENTORNOS.test(a[0])) {
          const fin = `\\end{${a[0]}}`, k = s.indexOf(fin, a[1]);
          if (k > 0) { formulaDestacada(s.slice(i, k + fin.length)); i = k + fin.length; continue; }
        }
      }
      if (s.startsWith("**", i)) { volcar(); estrellas = !estrellas; i += 2; continue; }
      // llaves: «{\bf …}», «Fe{\ss}ler» agrupan; llaves sueltas en el texto («C^{1+a}» fuera de $…$) se muestran tal cual
      if (c === "{") {
        const agrupa = /^\{\s*\\/.test(s.slice(i)) || s[i + 1] === "}";
        volcar(); const m = marcos[marcos.length - 1]; marcos.push({ ...m, llave: true, literal: !agrupa });
        if (!agrupa) buf += "{";
        i++; continue;
      }
      if (c === "}" && marcos.length > 1) { if (marcos[marcos.length - 1].literal) buf += "}"; volcar(); marcos.pop(); i++; continue; }
      if (c === "~") { buf += NBSP; i++; continue; }
      if (s.startsWith("---", i)) { buf += "—"; i += 3; continue; }
      if (s.startsWith("--", i)) { buf += "–"; i += 2; continue; }
      if (s.startsWith("``", i)) { buf += "“"; i += 2; continue; }
      if (s.startsWith("''", i)) { buf += "”"; i += 2; continue; }
      if (c === "\\") {
        const sig = s[i + 1] || "";
        if ("%&#_{}$".includes(sig) && sig) { buf += sig; i += 2; continue; }
        if (sig === "\\") { buf += " "; i += 2; continue; }                            // salto de línea forzado → espacio
        if (sig === " " || sig === "," || sig === ";" || sig === ":") { buf += sig === "," ? " " : " "; i += 2; continue; }
        if (sig === "-") { i += 2; continue; }                                         // guion opcional de partición
        // acentos de un símbolo: \'a  \'{a}  \"{\i}
        if (ACENTOS[sig] && /[^a-zA-Z]/.test(sig)) {
          const a = argumento(s, i + 2); let base, fin;
          if (a) { base = a[0].replace(/^\\i$/, "i").replace(/^\\j$/, "j"); fin = a[1]; }
          else if (s.startsWith("\\i", i + 2)) { base = "i"; fin = i + 4; }
          else { base = s[i + 2] || ""; fin = i + 3; }
          if (/^[a-zA-Z]$/.test(base)) { buf += (base + ACENTOS[sig]).normalize("NFC"); i = fin; continue; }
        }
        const m = /^[a-zA-Z]+/.exec(s.slice(i + 1));
        if (m) {
          const nombre = m[0]; let j = i + 1 + nombre.length;
          // acentos con letra: \c{c} \v s \H{o}
          if (ACENTOS[nombre] && nombre.length === 1) {
            const a = argumento(s, j);
            const base = a ? a[0] : (s[j] === " " ? s[j + 1] : "");
            if (/^[a-zA-Z]$/.test(base || "")) { buf += (base + ACENTOS[nombre]).normalize("NFC"); i = a ? a[1] : j + 2; continue; }
          }
          if (LETRAS[nombre] !== undefined && !/[a-zA-Z]/.test(s[j] || "")) {
            buf += LETRAS[nombre];
            if (s.startsWith("{}", j)) j += 2; else if (s[j] === " " && nombre.length > 1 && !/^(quad|qquad)$/.test(nombre)) j += 1;   // «\ss ler» → «ßler»
            i = j; continue;
          }
          if (NEGRITA.has(nombre) || CURSIVA.has(nombre) || NEUTRO.has(nombre)) {
            const k = (() => { let x = j; while (s[x] === " ") x++; return s[x] === "{" ? x : -1; })();
            if (k >= 0) {
              volcar(); const p = marcos[marcos.length - 1];
              marcos.push({ negrita: p.negrita || NEGRITA.has(nombre), cursiva: CURSIVA.has(nombre) ? !p.cursiva : p.cursiva, llave: true });
              i = k + 1; continue;
            }
          }
          if (DECL_N.has(nombre) || DECL_C.has(nombre) || DECL_0.has(nombre)) {
            volcar(); const p = marcos[marcos.length - 1];
            if (DECL_N.has(nombre)) p.negrita = true; else if (DECL_C.has(nombre)) p.cursiva = true; else { p.negrita = false; p.cursiva = false; }
            i = j; while (s[i] === " ") i++; continue;
          }
          if (IGNORAR.has(nombre)) { i = j; const a = argumento(s, i); if (a && /skip|space/.test(nombre)) i = a[1]; while (s[i] === " ") i++; continue; }
          if (nombre === "url") { const a = argumento(s, j); if (a) { buf += a[0]; i = a[1]; continue; } }
          if (nombre === "href") { const a = argumento(s, j), b = a && argumento(s, a[1]); if (b) { buf += b[0]; i = b[1]; continue; } }   // \href{url}{texto} → texto
        }
      }
      buf += c; i++;
    }
    cerrarParrafo(false);
    // espacios: se colapsan y se quitan al inicio y al final de cada párrafo
    for (const b of bloques) {
      if (b.tipo !== "p") continue;
      for (const p of b.piezas) if (p.t !== undefined) p.t = p.t.replace(/[ \t\n]+/g, " ");
      const t0 = b.piezas.find((p) => p.t !== undefined || p.m !== undefined), tn = [...b.piezas].reverse().find((p) => p.t !== undefined || p.m !== undefined);
      if (t0 && t0.t !== undefined) t0.t = t0.t.replace(/^ +/, "");
      if (tn && tn.t !== undefined) tn.t = tn.t.replace(/ +$/, "");
      b.piezas = b.piezas.filter((p) => p.m !== undefined || p.t);
    }
    return bloques;
  }

  // ---------- Navegador: escribe el texto en un elemento, con <strong>/<em> y fórmulas para MathJax ----------
  // Las fórmulas quedan como $…$ y \[…\] (el «$» del texto se escapa como \$); luego hay que llamar a
  // MathJax.typesetPromise([elemento]). Todo se inserta como texto (nodos de texto), nunca como HTML: lo escribe el expositor.
  // enLinea: sin separar párrafos (para títulos).
  function escribir(elemento, fuente, { enLinea = false } = {}) {
    const doc = elemento.ownerDocument;
    elemento.textContent = "";
    const piezasEn = (caja, piezas) => {
      for (const p of piezas) {
        if (p.m !== undefined) { caja.append(doc.createTextNode("$" + p.m + "$")); continue; }
        let nodo = doc.createTextNode(p.t.replace(/\$/g, "\\$"));
        if (p.cursiva) { const e = doc.createElement("em"); e.append(nodo); nodo = e; }
        if (p.negrita) { const e = doc.createElement("strong"); e.append(nodo); nodo = e; }
        caja.append(nodo);
      }
    };
    analizar(fuente).forEach((b, n) => {
      if (enLinea) {
        if (n) elemento.append(doc.createTextNode(" "));
        if (b.tipo === "formula") elemento.append(doc.createTextNode("$" + b.m + "$")); else piezasEn(elemento, b.piezas);
        return;
      }
      const caja = doc.createElement("span");
      caja.className = b.tipo === "formula" ? "texto-formula" : "texto-parrafo";
      caja.style.display = "block";
      if (b.tipo === "formula") { caja.style.margin = "0.4em 0"; caja.style.overflowX = "auto"; caja.textContent = "\\[" + b.m + "\\]"; }
      else { if (n && !b.sigue) caja.style.marginTop = "0.6em"; piezasEn(caja, b.piezas); }
      elemento.append(caja);
    });
  }
  // Texto plano (para buscadores, atributos alt, etc.)
  function plano(fuente) {
    return analizar(fuente).map((b) => b.tipo === "formula" ? b.m : b.piezas.map((p) => (p.m !== undefined ? p.m : p.t)).join("")).join("\n\n");
  }
  const tieneFormulas = (fuente) => analizar(fuente).some((b) => b.tipo === "formula" || b.piezas.some((p) => p.m !== undefined));

  raiz.DPTexto = { analizar, escribir, plano, tieneFormulas };
})(typeof globalThis !== "undefined" ? globalThis : this);
