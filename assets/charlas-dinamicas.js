// Muestra en el sitio las charlas publicadas desde el panel de administración.
// Portada y Seminario: próxima(s) charla(s) o, si no hay, las más recientes.
// Seminario (Seminarios anteriores) y Archivo: agrega las charlas ya realizadas.
// Si el servicio no responde, las páginas se muestran tal como están escritas.
(function () {
  const EN = (document.documentElement.lang || "es").toLowerCase().startsWith("en");
  const T = EN
    ? { reagendada: "Rescheduled", ver: "View abstract &#9662;", ocultar: "Hide abstract &#9652;", prox: ["Next talks", "Next talk"], ult: ["Last talks", "Last talk"],
        charlas: (n) => `${n} ${n === 1 ? "talk" : "talks"}` }
    : { reagendada: "Reagendada", ver: "Ver resumen &#9662;", ocultar: "Ocultar resumen &#9652;", prox: ["Próximas charlas", "Próxima charla"], ult: ["Últimas charlas", "Última charla"],
        charlas: (n) => `${n} ${n === 1 ? "charla" : "charlas"}` };
  const MESES = EN ? ["January","February","March","April","May","June","July","August","September","October","November","December"]
                   : ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const DIAS = EN ? ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
                  : ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  function fechaLarga(f, h) {
    const [a, m, d] = f.split("-").map(Number);
    const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
    const t = EN ? `${dia}, ${MESES[m - 1]} ${d}, ${a}` : `${dia} ${d} de ${MESES[m - 1]} de ${a}`;
    return h ? `${t} · ${h} ${EN ? "h" : "hrs"}` : t;
  }
  const hoy = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  let n = 0;
  const el = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto !== undefined) e.textContent = texto; return e; };

  // Etiqueta «Reagendada» para las charlas próximas cuya fecha cambió (sin mostrar la fecha anterior)
  function etiqueta(c) {
    if (!c.reprogramadaDesde || c.fecha < hoy) return [];
    const e = el("span", "etiqueta-estado", T.reagendada);
    e.style.cssText = "display:inline-block;margin:0 0 6px;padding:2px 9px;border-radius:10px;font:700 11.5px 'Roboto Condensed',Arial,sans-serif;" +
      "letter-spacing:.04em;text-transform:uppercase;background:#efe6f7;color:#5b2d82";
    return [e];
  }
  const tachar = (nodo) => nodo;

  // Bloques comunes: expositor (con foto si existe) y resumen desplegable
  function expositor(c, claseP) {
    const p = el("p", claseP, [c.expositor, c.institucion].filter(Boolean).join(" — "));
    if (!c.foto) return p;
    const caja = el("div", "expositor-foto"), img = el("img", "foto-expositor");
    img.src = c.foto; img.alt = c.expositor; img.loading = "lazy"; caja.append(img, p); return caja;
  }
  function resumen(c, abierto) {
    if (!c.resumen) return [];
    const id = "res-din-" + (++n), b = el("button", "resumen-toggle"), p = el("p", "archive-resumen", c.resumen);
    b.type = "button"; b.setAttribute("aria-controls", id); b.setAttribute("aria-expanded", String(abierto));
    b.innerHTML = abierto ? T.ocultar : T.ver; b.setAttribute("onclick", "toggleResumen(this)");
    p.id = id; if (abierto) p.style.display = "block";
    return [b, p];
  }
  function tarjeta(c) {             // formato de la portada y de «Últimas charlas»
    const d = el("div", "seminar-card"); d.dataset.seminarDate = c.fecha;
    d.append(...etiqueta(c), tachar(el("div", "fecha", fechaLarga(c.fecha, c.hora)), c), el("h3", "", c.titulo), expositor(c, "expositor"),
             ...resumen(c, !c.cancelada), el("p", "lugar", c.sala));
    return d;
  }
  function entrada(c, archivo) {    // formato de «Seminarios anteriores» y del archivo
    const d = el("div", archivo ? "event-item archive-entry" : "event-item");
    if (archivo) d.dataset.search = [c.titulo, c.expositor, c.institucion].join(" ").toLowerCase();
    d.append(...(archivo ? [] : etiqueta(c)), el("div", "fecha", fechaLarga(c.fecha, archivo ? c.hora : "")), el("h3", "", c.titulo), expositor(c, ""), ...resumen(c, !archivo));
    return d;
  }
  // Convierte una tarjeta escrita en la página en una entrada de «Seminarios anteriores»
  function tarjetaAEntrada(card) {
    const d = card.cloneNode(true);
    d.className = "event-item"; d.removeAttribute("data-seminar-date"); d.style.marginTop = "";
    d.querySelector(".lugar")?.remove();
    const f = d.querySelector(".fecha"); if (f) f.textContent = f.textContent.split("·")[0].trim();
    return d;
  }

  // Elige qué mostrar como próximas o últimas charlas
  function destacadas(publicadas, fechaFija, max) {
    const futuras = publicadas.filter((c) => c.fecha >= hoy).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    if (futuras.length) {                                // próxima fecha con charlas vigentes, más las cancelaciones anteriores a ella
      const vigentes = futuras.filter((c) => !c.cancelada), f = (vigentes[0] || futuras[0]).fecha;
      return { lista: futuras.filter((c) => c.fecha === f || (c.cancelada && c.fecha < f)).slice(0, max), proximas: true };
    }
    const pasadas = publicadas.filter((c) => c.fecha < hoy && !c.cancelada);
    if (!pasadas.length) return null;
    const f = pasadas.reduce((m, c) => (c.fecha > m ? c.fecha : m), "");
    if (fechaFija && f < fechaFija) return null;           // lo escrito en la página es más reciente
    return { lista: pasadas.filter((c) => c.fecha === f).sort((a, b) => a.hora.localeCompare(b.hora)).slice(0, max), proximas: false };
  }
  function rotulo(elem, sel) { if (elem) elem.textContent = (sel.proximas ? T.prox : T.ult)[sel.lista.length > 1 ? 0 : 1]; }

  function portada(publicadas) {
    const grid = document.querySelector(".talk-grid"); if (!grid) return [];
    const fija = grid.querySelector("[data-seminar-date]")?.dataset.seminarDate || "";
    const sel = destacadas(publicadas, fija, 2); if (!sel) return [];
    grid.replaceChildren(...sel.lista.map(tarjeta)); rotulo(document.getElementById("home-talk-label"), sel);
    return [grid];
  }
  function seminario(publicadas) {
    const etiqueta = document.getElementById("seminar-label") || document.getElementById("seminar-label-en"); if (!etiqueta) return [];
    const cuerpo = etiqueta.parentElement.querySelector(".details-body");
    const fijas = [...cuerpo.querySelectorAll(".seminar-card")];
    const sel = destacadas(publicadas, fijas[0]?.dataset.seminarDate || "", 3);
    const anteriores = document.querySelector('[data-charlas="anteriores"] .details-body');
    const nuevas = [];
    if (sel) {
      const ids = new Set(sel.lista.map((c) => c.id));
      const tarjetas = sel.lista.map(tarjeta); tarjetas.forEach((t, i) => i && (t.style.marginTop = "14px"));
      if (anteriores) {                                     // las tarjetas escritas pasan a «Seminarios anteriores»
        const ref = anteriores.querySelector(".event-item");
        fijas.forEach((f) => { const e = tarjetaAEntrada(f); anteriores.insertBefore(e, ref); nuevas.push(e); });
      }
      fijas.forEach((f) => f.remove());
      cuerpo.prepend(...tarjetas); nuevas.push(...tarjetas); rotulo(etiqueta, sel);
      publicadas = publicadas.filter((c) => !ids.has(c.id));
    }
    if (anteriores) {                                       // charlas ya realizadas, de la más reciente a la más antigua
      const ref = anteriores.querySelector(".event-item");
      publicadas.filter((c) => c.fecha < hoy && !c.cancelada).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora))
        .forEach((c) => { const e = entrada(c, false); anteriores.insertBefore(e, ref); nuevas.push(e); });
    }
    return nuevas;
  }
  function archivo(publicadas) {
    const primero = document.querySelector(".archive-year"); if (!primero) return [];
    const nuevas = [];
    publicadas.filter((c) => c.fecha < hoy && !c.cancelada).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)).forEach((c) => {
      const anio = c.fecha.slice(0, 4);
      let bloque = document.querySelector(`.archive-year[data-year="${anio}"]`);
      if (!bloque) {
        bloque = el("details", "block archive-year"); bloque.dataset.year = anio;
        const s = el("summary"); s.append(anio + " ", el("span", "year-count", ""));
        bloque.append(s, el("div", "details-body"));
        const posterior = [...document.querySelectorAll(".archive-year")].find((b) => b.dataset.year < anio);
        posterior ? posterior.before(bloque) : primero.parentElement.appendChild(bloque);
      }
      const e = entrada(c, true); bloque.querySelector(".details-body").prepend(e); nuevas.push(e);
    });
    document.querySelectorAll(".archive-year").forEach((b) => {
      const k = b.querySelectorAll(".archive-entry").length, s = b.querySelector(".year-count");
      if (s) s.textContent = "— " + T.charlas(k);
    });
    if (typeof window.actualizarArchivo === "function") window.actualizarArchivo();
    return nuevas;
  }

  // Fórmulas: usa MathJax si la página ya lo carga; si no, lo carga solo cuando hace falta
  function formulas(nodos) {
    if (!nodos.length || !nodos.some((x) => x.textContent.includes("$"))) return;
    const componer = () => MathJax.startup.promise.then(() => MathJax.typesetPromise(nodos)).catch(() => {});
    if (window.MathJax && MathJax.startup) return componer();
    const base = document.querySelector('script[src$="charlas-dinamicas.js"]').src.replace(/charlas-dinamicas\.js.*$/, "");
    const cfg = document.createElement("script"); cfg.src = base + "mathjax-config.js";
    cfg.onload = () => { const mj = document.createElement("script"); mj.src = base + "mathjax.js"; mj.onload = componer; document.head.appendChild(mj); };
    document.head.appendChild(cfg);
  }


  // ---------- Cifras (charlas, expositores distintos, países) ----------
  const sinTildes = (x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function claveExpositor(nombre) {         // nombre + primer apellido, sin iniciales ni tildes
    const t = sinTildes(nombre).replace(/\b[a-z]\.\s*/g, "").replace(/[^a-z\s-]/g, " ").split(/\s+/).filter(Boolean);
    return t.slice(0, 2).join(" ");
  }
  const PAISES = {
    "chile": "Chile", "brasil": "Brasil", "brazil": "Brasil", "francia": "Francia", "france": "Francia",
    "estados unidos": "Estados Unidos", "eeuu": "Estados Unidos", "ee uu": "Estados Unidos", "usa": "Estados Unidos", "us": "Estados Unidos",
    "united states": "Estados Unidos", "united states of america": "Estados Unidos", "uruguay": "Uruguay", "mexico": "México",
    "reino unido": "Reino Unido", "united kingdom": "Reino Unido", "uk": "Reino Unido", "inglaterra": "Reino Unido", "england": "Reino Unido",
    "escocia": "Reino Unido", "scotland": "Reino Unido", "gales": "Reino Unido", "wales": "Reino Unido", "portugal": "Portugal",
    "venezuela": "Venezuela", "colombia": "Colombia", "espana": "España", "spain": "España", "alemania": "Alemania", "germany": "Alemania",
    "costa rica": "Costa Rica", "israel": "Israel", "peru": "Perú", "finlandia": "Finlandia", "finland": "Finlandia", "suiza": "Suiza",
    "switzerland": "Suiza", "nueva zelanda": "Nueva Zelanda", "new zealand": "Nueva Zelanda", "japon": "Japón", "japan": "Japón",
    "argentina": "Argentina", "suecia": "Suecia", "sweden": "Suecia", "polonia": "Polonia", "poland": "Polonia", "canada": "Canadá",
    "italia": "Italia", "italy": "Italia", "china": "China", "rusia": "Rusia", "russia": "Rusia", "belgica": "Bélgica", "belgium": "Bélgica",
    "paises bajos": "Países Bajos", "holanda": "Países Bajos", "netherlands": "Países Bajos", "the netherlands": "Países Bajos",
    "austria": "Austria", "corea del sur": "Corea del Sur", "corea": "Corea del Sur", "south korea": "Corea del Sur", "korea": "Corea del Sur",
    "india": "India", "australia": "Australia", "ecuador": "Ecuador", "bolivia": "Bolivia", "paraguay": "Paraguay", "cuba": "Cuba",
    "dinamarca": "Dinamarca", "denmark": "Dinamarca", "noruega": "Noruega", "norway": "Noruega", "irlanda": "Irlanda", "ireland": "Irlanda",
    "grecia": "Grecia", "greece": "Grecia", "turquia": "Turquía", "turkey": "Turquía", "iran": "Irán", "hungria": "Hungría", "hungary": "Hungría",
    "republica checa": "República Checa", "czech republic": "República Checa", "czechia": "República Checa", "rumania": "Rumania", "romania": "Rumania",
    "sudafrica": "Sudáfrica", "south africa": "Sudáfrica", "singapur": "Singapur", "singapore": "Singapur", "taiwan": "Taiwán",
    "panama": "Panamá", "guatemala": "Guatemala", "puerto rico": "Puerto Rico", "ucrania": "Ucrania", "ukraine": "Ucrania",
  };
  function paisesDe(institucion) {          // el país va al final: «UFRJ, Brasil»
    const ultimo = (institucion || "").split(",").pop().replace(/\(.*?\)/g, "");
    return ultimo.split("/").map((x) => PAISES[sinTildes(x).replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim()]).filter(Boolean);
  }
  async function cifras(publicadas) {
    const marcas = document.querySelectorAll("[data-cifra]"); if (!marcas.length) return;
    const realizadas = publicadas.filter((c) => c.fecha < hoy && !c.cancelada); if (!realizadas.length) return;
    const base = document.querySelector('script[src$="charlas-dinamicas.js"]').src.replace(/charlas-dinamicas\.js.*$/, "");
    let b; try { b = await (await fetch(base + "cifras-base.json")).json(); } catch (e) { return; }
    const expositores = new Set(b.expositores), paises = new Set(b.paises);
    realizadas.forEach((c) => { expositores.add(claveExpositor(c.expositor)); paisesDe(c.institucion).forEach((p) => paises.add(p)); });
    const valores = { charlas: b.charlas + realizadas.length, expositores: expositores.size, paises: paises.size,
                      anio: Math.max(b.anioFinal, ...realizadas.map((c) => Number(c.fecha.slice(0, 4)))) };
    marcas.forEach((m) => { if (m.dataset.cifra in valores) m.textContent = valores[m.dataset.cifra]; });
  }

  fetch("/api/charlas").then((r) => (r.ok ? r.json() : [])).then((publicadas) => {
    if (!Array.isArray(publicadas)) return;
    publicadas = publicadas.filter((c) => !c.cancelada);        // las charlas canceladas no se muestran en el sitio
    if (!publicadas.length) return;
    formulas([...portada(publicadas), ...seminario(publicadas), ...archivo(publicadas)]);
    cifras(publicadas);
  }).catch(() => {});
})();
