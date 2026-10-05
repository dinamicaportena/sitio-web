// Página pública de un evento (dinamicaportena.cl/<dirección>/). Lee el contenido de /api/evento/<dirección>, que cada
// evento edita desde su propio panel (/<dirección>/admin).
(function () {
  "use strict";
  const EN = (document.documentElement.lang || "es").toLowerCase().startsWith("en");
  const L = EN ? "en" : "es";
  const SLUG = (location.pathname.split("/").filter(Boolean)[0] || "").toLowerCase();
  const T = EN ? {
    porConfirmar: "To be confirmed", fechasPC: "Dates to be confirmed",
    sinConf: "The list of speakers will be announced soon.", sinProg: "The program will be published soon.",
    sinPart: "The list of participants will be published once registrations are confirmed.", sinInfo: "More information will be posted soon.",
    sinOrg: "To be announced.", verRes: "View abstract ▾", ocultarRes: "Hide abstract ▴",
    plenaria: "Plenary speakers", invitada: "Invited speakers", otra: "Speakers",
    buscar: "Search by name or institution", cuenta: (n, t) => (n === t ? `${t} participants` : `${n} of ${t} participants`),
    abierta: "Registration open", cerrada: "Registration closed", hasta: (f) => `Registration open until ${f}`,
    sinResultados: "No participants match your search.",
    contacto: "For questions, write to", pagina: "Website", noEncontrado: "This event page does not exist or is not published yet.",
    enviando: "Sending…", okNuevo: "Thank you! Your registration was received. The organizers will confirm it by email.",
    errGeneral: "The registration could not be sent. Please try again or write to the organizers.",
    errCampos: "Please complete name, institution, country and a valid email, and accept the data policy.",
    insCerrada: "Registration is not open at the moment.", irFormulario: "Open the registration form →",
    cafe: "Coffee break", almuerzo: "Lunch", sinTitulo: "Session",
  } : {
    porConfirmar: "Por confirmar", fechasPC: "Fechas por confirmar",
    sinConf: "Los conferencistas se anunciarán próximamente.", sinProg: "El programa se publicará próximamente.",
    sinPart: "La lista de participantes se publicará cuando se confirmen las inscripciones.", sinInfo: "Pronto se publicará más información.",
    sinOrg: "Por anunciar.", verRes: "Ver resumen ▾", ocultarRes: "Ocultar resumen ▴",
    plenaria: "Conferencias plenarias", invitada: "Conferencistas invitados", otra: "Conferencistas",
    buscar: "Buscar por nombre o institución", cuenta: (n, t) => (n === t ? `${t} participantes` : `${n} de ${t} participantes`),
    abierta: "Inscripción abierta", cerrada: "Inscripción cerrada", hasta: (f) => `Inscripción abierta hasta el ${f}`,
    sinResultados: "Ningún participante coincide con la búsqueda.",
    contacto: "Para consultas, escriba a", pagina: "Sitio web", noEncontrado: "Esta página de evento no existe o aún no está publicada.",
    enviando: "Enviando…", okNuevo: "¡Gracias! Su inscripción fue recibida. La organización se la confirmará por correo.",
    errGeneral: "No se pudo enviar la inscripción. Intente nuevamente o escriba a la organización.",
    errCampos: "Complete nombre, institución, país y un correo válido, y acepte el uso de los datos.",
    insCerrada: "La inscripción no está abierta por el momento.", irFormulario: "Abrir el formulario de inscripción →",
    cafe: "Pausa café", almuerzo: "Almuerzo", sinTitulo: "Sesión",
  };
  const MESES = EN ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    : ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIAS = EN ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    : ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  // ---------- utilidades ----------
  const $ = (id) => document.getElementById(id);
  const el = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto !== undefined && texto !== null) e.textContent = texto; return e; };
  const tr = (v) => (v == null ? "" : typeof v === "string" ? v : v[L] || v.es || v.en || "");
  const dp = (f) => { const [a, m, d] = f.split("-").map(Number); return { a, m, d }; };
  const soloHttp = (u) => (/^(https?:\/\/|\/(?!\/))/i.test(u || "") ? u : "");

  function fechaCorta(f) { const x = dp(f); return EN ? `${MESES[x.m - 1]} ${x.d}, ${x.a}` : `${x.d} de ${MESES[x.m - 1]} de ${x.a}`; }
  function fechaLarga(f) {
    const x = dp(f), dia = DIAS[new Date(Date.UTC(x.a, x.m - 1, x.d)).getUTCDay()];
    return EN ? `${dia}, ${MESES[x.m - 1]} ${x.d}, ${x.a}` : `${dia} ${x.d} de ${MESES[x.m - 1]} de ${x.a}`;
  }
  function rangoFechas(i, f) {
    if (!i) return T.fechasPC;
    if (!f || f === i) return fechaCorta(i);
    const a = dp(i), b = dp(f);
    if (a.a === b.a && a.m === b.m) return EN ? `${MESES[a.m - 1]} ${a.d}–${b.d}, ${a.a}` : `${a.d} al ${b.d} de ${MESES[a.m - 1]} de ${a.a}`;
    return `${fechaCorta(i)} ${EN ? "–" : "al"} ${fechaCorta(f)}`;
  }
  // Texto en párrafos (línea en blanco = párrafo nuevo); los enlaces http(s) se vuelven clicables.
  function parrafos(contenedor, texto) {
    String(texto || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).forEach((p) => {
      const n = el("p");
      p.split(/(https?:\/\/[^\s<>"']+)/g).forEach((trozo, i) => {
        if (i % 2) { const a = el("a", "", trozo); a.href = trozo; a.target = "_blank"; a.rel = "noopener"; n.append(a); }
        else n.append(document.createTextNode(trozo));
      });
      contenedor.append(n);
    });
  }
  const vacio = (c, msg) => c.replaceChildren(el("p", "vacio-nota", msg));
  const iniciales = (n) => (n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  // ---------- secciones ----------
  const SECCIONES = ["objetivo", "conferencistas", "programa", "participantes", "inscripcion", "info", "organizacion"];
  // Identidad del evento y estructura (marca, institución, menú, pie, secciones visibles y sus títulos): todo editable desde el panel.
  function identidad(c) {
    if (tr(c.marca)) $("c-marca").textContent = tr(c.marca);
    if (c.institucion !== undefined) { $("c-inst").textContent = tr(c.institucion); $("c-pie-inst").textContent = tr(c.institucion); }
    if (c.eyebrow !== undefined) $("c-eyebrow").textContent = tr(c.eyebrow);
    if (Array.isArray(c.enlaces)) {
      const nav = $("c-nav"), items = c.enlaces.filter((e) => e && soloHttp(e.url) && tr(e.texto));
      nav.replaceChildren(...items.map((e) => { const a = el("a", "", tr(e.texto)); a.href = e.url; return a; }));
    }
    const pe = c.pieEnlace;
    if (pe && soloHttp(pe.url) && tr(pe.texto)) { const a = el("a", "", tr(pe.texto)); a.href = pe.url; $("c-pie-enlace").replaceChildren(a); }
    else if (pe && !pe.url) $("c-pie-enlace").replaceChildren();
    const cfg = c.secciones || {};
    SECCIONES.forEach((id) => {
      const sec = $(id), k = cfg[id] || {}, visible = k.visible !== false;
      if (sec) sec.hidden = !visible;
      document.querySelectorAll(`.subnav a[href="#${id}"], .hero a[href="#${id}"]`).forEach((a) => { a.hidden = !visible; });
      if (visible && tr(k.titulo)) {
        $("t-" + id).textContent = tr(k.titulo);
        document.querySelectorAll(`.subnav a[href="#${id}"]`).forEach((a) => { a.textContent = tr(k.titulo); });
      }
    });
  }

  function portada(c) {
    const nombre = tr(c.nombre) || document.title;
    document.title = nombre; $("c-nombre").textContent = nombre;
    const meta = $("c-meta"); meta.replaceChildren();
    const item = (k, v) => { const d = el("div", "item"); d.append(el("span", "k", k), el("span", "v", v)); meta.append(d); };
    item(EN ? "Dates" : "Fechas", rangoFechas(c.inicio, c.fin));
    if (tr(c.lugar)) item(EN ? "Venue" : "Lugar", tr(c.lugar));
    const i = c.inscripcion || {}, est = $("c-estado-insc");
    const vencida = i.fechaLimite && new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }) > i.fechaLimite;
    est.textContent = i.abierta && !vencida ? (i.fechaLimite ? T.hasta(fechaCorta(i.fechaLimite)) : T.abierta) : T.cerrada;
    const d = document.querySelector('meta[name="description"]');
    if (d && c.inicio) d.content = `${nombre} · ${rangoFechas(c.inicio, c.fin)} · ${tr(c.lugar)}`;
  }

  function objetivo(c) {
    const o = $("c-objetivo"); o.replaceChildren(); parrafos(o, tr(c.objetivo));
    const clave = $("c-clave"); clave.replaceChildren();
    const dato = (k, v) => { const d = el("div", "dato-clave"); d.append(el("div", "k", k), el("div", "v", v)); clave.append(d); };
    dato(EN ? "Dates" : "Fechas", rangoFechas(c.inicio, c.fin));
    if (tr(c.lugar)) dato(EN ? "Venue" : "Lugar", tr(c.lugar));
    if (c.direccion) dato(EN ? "Address" : "Dirección", c.direccion);
    const pie = $("c-pie-dir"); if (pie && c.direccion) pie.textContent = c.direccion;
  }

  function conferencistas(c) {
    const cont = $("c-conferencistas"), lista = (c.conferencistas || []).filter((x) => x && x.nombre);
    cont.replaceChildren();
    if (!lista.length) return vacio(cont, T.sinConf);
    const grupos = [["plenaria", T.plenaria], ["invitada", T.invitada], ["otra", T.otra]];
    const hayVarios = new Set(lista.map((x) => x.tipo || "otra")).size > 1;
    grupos.forEach(([tipo, rotulo]) => {
      const g = lista.filter((x) => (["plenaria", "invitada"].includes(x.tipo) ? x.tipo : "otra") === tipo);
      if (!g.length) return;
      if (hayVarios) cont.append(el("h3", "conf-grupo", rotulo));
      g.forEach((x) => {
        const s = el("article", "speaker"); s.id = "conf-" + (x.id || "");
        const av = el("div", "avatar");
        if (soloHttp(x.foto) || /^assets\//.test(x.foto || "")) { const im = el("img"); im.src = x.foto; im.alt = x.nombre; im.loading = "lazy"; av.append(im); } else av.textContent = iniciales(x.nombre);
        const cu = el("div", "cuerpo");
        cu.append(el("div", "nombre", x.nombre), el("div", "institucion", [x.institucion, x.pais].filter(Boolean).join(", ")));
        if (tr(x.titulo)) cu.append(el("div", "titulo-charla", tr(x.titulo)));
        if (tr(x.resumen)) {
          const r = el("div", "resumen"); parrafos(r, tr(x.resumen)); r.id = "res-" + (x.id || x.nombre);
          const b = el("button", "resumen-toggle", T.verRes); b.type = "button"; b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-controls", r.id);
          b.onclick = () => { const ab = s.classList.toggle("abierto"); b.textContent = ab ? T.ocultarRes : T.verRes; b.setAttribute("aria-expanded", String(ab)); };
          cu.append(b, r);
        }
        s.append(av, cu); cont.append(s);
      });
    });
  }

  function programa(c) {
    const cont = $("c-programa"), dias = (c.programa || []).filter((d) => d && d.fecha);
    cont.replaceChildren();
    if (!dias.length) return vacio(cont, T.sinProg);
    const porId = Object.fromEntries((c.conferencistas || []).map((x) => [x.id, x]));
    dias.sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((d) => {
      const dia = el("div", "dia"); dia.append(el("h3", "", fechaLarga(d.fecha)));
      (d.bloques || []).forEach((b) => {
        const conf = porId[b.conferencista], tipo = b.tipo || "charla";
        const s = el("div", "slot " + (tipo === "charla" && conf && conf.tipo === "plenaria" ? "plenaria " : "") + tipo);
        s.append(el("div", "hora", b.hora || ""));
        const q = el("div");
        const titulo = tr(b.titulo) || (conf && tr(conf.titulo)) || (tipo === "pausa" ? T.cafe : tipo === "almuerzo" ? T.almuerzo : T.sinTitulo);
        q.append(el("div", "t", titulo));
        if (conf) {
          const quien = el("div", "quien", [conf.nombre, conf.institucion].filter(Boolean).join(" — "));
          q.append(quien);
        }
        if (b.lugar) q.append(el("div", "lugar", b.lugar));
        s.append(q); dia.append(s);
      });
      cont.append(dia);
    });
  }

  function participantes(c, inscritos) {
    const cont = $("c-participantes");
    cont.classList.add("tex2jax_ignore", "mathjax_ignore");   // los nombres los escriben los inscritos: no se procesan como fórmulas
    const vistos = new Set(), todos = [];
    [...(c.participantes || []), ...(inscritos || [])].forEach((p) => {
      if (!p || !p.nombre) return; const k = p.nombre.toLowerCase().replace(/\s+/g, " ").trim();
      if (vistos.has(k)) return; vistos.add(k); todos.push(p);
    });
    cont.replaceChildren();
    if (!todos.length) return vacio(cont, T.sinPart);
    todos.sort((a, b) => a.nombre.localeCompare(b.nombre, L));
    const barra = el("div", "part-bar"), q = el("input"); q.type = "search"; q.placeholder = T.buscar; q.setAttribute("aria-label", T.buscar);
    const cuenta = el("span", "cuenta"); barra.append(q, cuenta);
    const ul = el("ul", "part-lista"), msg = el("p", "vacio-nota", T.sinResultados); msg.hidden = true;
    const items = todos.map((p) => {
      const li = el("li"); li.append(document.createTextNode(p.nombre));
      const inst = [p.institucion, p.pais].filter(Boolean).join(", "); if (inst) li.append(el("span", "inst", inst));
      li.dataset.t = (p.nombre + " " + inst).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); ul.append(li); return li;
    });
    const filtrar = () => {
      const t = q.value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); let n = 0;
      items.forEach((li) => { const ok = !t || li.dataset.t.includes(t); li.hidden = !ok; if (ok) n++; });
      cuenta.textContent = T.cuenta(n, items.length); msg.hidden = n > 0;
    };
    q.addEventListener("input", filtrar); filtrar(); cont.append(barra, ul, msg);
  }

  function inscripcion(c) {
    const i = c.inscripcion || {}, t = $("c-inscripcion-texto"), f = $("c-inscripcion-form");
    t.replaceChildren(); parrafos(t, tr(i.texto));
    const externo = soloHttp(i.formularioExterno);
    const pasado = i.fechaLimite && new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }) > i.fechaLimite;
    if (!i.abierta || pasado) { f.hidden = true; if (!tr(i.texto)) t.append(el("p", "vacio-nota", T.insCerrada)); return; }
    if (externo) { f.replaceChildren(); const a = el("a", "btn", T.irFormulario); a.href = externo; a.target = "_blank"; a.rel = "noopener"; f.append(a); return; }
    f.hidden = false;
  }

  function info(c) {
    const cont = $("c-info"), items = (c.info || []).filter((x) => x && (tr(x.titulo) || tr(x.texto)));
    cont.replaceChildren();
    if (!items.length) return vacio(cont, T.sinInfo);
    const g = el("div", "info-grid");
    items.forEach((x) => { const k = el("div", "info-card"); if (tr(x.titulo)) k.append(el("h3", "", tr(x.titulo))); parrafos(k, tr(x.texto)); g.append(k); });
    cont.append(g);
  }

  function comite(cont, lista) {
    cont.replaceChildren();
    const ul = el("ul", "org-lista");
    lista.forEach((x) => {
      const li = el("li"); li.append(document.createTextNode([x.nombre, x.institucion].filter(Boolean).join(" — ")));
      if (tr(x.rol)) li.append(el("span", "rol", tr(x.rol)));
      if (x.email || x.telefono) {
        const c = el("span", "rol");
        if (x.email) { const a = el("a", "", x.email); a.href = "mailto:" + x.email; c.append(a); }
        if (x.email && x.telefono) c.append(document.createTextNode(" · "));
        if (x.telefono) { const a = el("a", "", x.telefono); a.href = "tel:" + x.telefono.replace(/[^\d+]/g, ""); c.append(a); }
        li.append(c);
      }
      ul.append(li);
    });
    cont.append(ul);
  }
  function organizacion(c) {
    const o = $("c-organizadores"), a = $("c-auspiciantes"), k = $("c-contacto"), ci = $("c-cientifico");
    a.replaceChildren(); k.replaceChildren();
    const cfg = c.secciones || {};
    const sub = (id, def) => { const t = (cfg[id] || {}).titulo; if (t && tr(t)) $("t-" + id).textContent = tr(t); else if (def) $("t-" + id).textContent = def; };
    const cien = (c.cientifico || []).filter((x) => x && x.nombre);
    ci.hidden = $("t-cientifico").hidden = !cien.length;
    if (cien.length) comite(ci, cien);
    const org = (c.organizadores || []).filter((x) => x && x.nombre);
    if (!org.length) vacio(o, T.sinOrg); else comite(o, org);
    sub("cientifico"); sub("organizadores"); sub("auspiciantes");
    const aus = (c.auspiciantes || []).filter((x) => x && x.nombre);
    $("t-auspiciantes").hidden = !aus.length; a.hidden = !aus.length;
    if (aus.length) {
      const w = el("div", "sponsors");
      aus.forEach((x) => {
        const u = soloHttp(x.url), n = el(u ? "a" : "div", "sponsor");
        if (u) { n.href = u; n.target = "_blank"; n.rel = "noopener"; }
        if (soloHttp(x.logo) || /^assets\//.test(x.logo || "")) { const im = el("img"); im.src = x.logo; im.alt = ""; n.append(im); }
        n.append(document.createTextNode(x.nombre)); w.append(n);
      });
      a.append(w);
    }
    const email = (c.contacto && c.contacto.email) || "";
    if (email) { k.append(document.createTextNode(T.contacto + " ")); const l = el("a", "", email); l.href = "mailto:" + email; k.append(l, document.createTextNode(".")); }
  }

  function dibujar(c, inscritos) {
    [identidad, portada, objetivo, conferencistas, programa, inscripcion, info, organizacion].forEach((fn) => { try { fn(c); } catch (e) { console.error(fn.name, e); } });
    try { participantes(c, inscritos); } catch (e) { console.error("participantes", e); }
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise().catch(() => {});
  }

  // ---------- formulario de inscripción ----------
  function formulario() {
    const f = $("form-insc"); if (!f) return;
    const charla = $("i-charla"), campoT = $("i-titulo-campo"), aviso = $("insc-aviso"), boton = $("i-enviar");
    charla.addEventListener("change", () => { campoT.hidden = !charla.checked; });
    const msg = (tipo, m) => { aviso.replaceChildren(); if (m) { const d = el("div", "aviso " + tipo, m); aviso.append(d); d.scrollIntoView({ block: "nearest" }); } };
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault(); msg("", "");
      const d = Object.fromEntries(new FormData(f).entries());
      const cuerpo = { nombre: (d.nombre || "").trim(), email: (d.email || "").trim(), institucion: (d.institucion || "").trim(), pais: (d.pais || "").trim(),
        nivel: d.nivel, charla: charla.checked, tituloCharla: d.tituloCharla || "", observaciones: d.observaciones || "",
        publicar: $("i-publicar").checked, suscribir: $("i-suscribir") ? $("i-suscribir").checked : false, privacidad: $("i-priv").checked, web: d.web || "", idioma: L };
      if (!cuerpo.nombre || !cuerpo.institucion || !cuerpo.pais || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cuerpo.email) || !cuerpo.privacidad) return msg("error", T.errCampos);
      boton.disabled = true; const antes = boton.textContent; boton.textContent = T.enviando;
      try {
        const r = await fetch("/api/evento/" + SLUG + "/inscripcion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || T.errGeneral);
        f.reset(); campoT.hidden = true; msg("ok", T.okNuevo);
      } catch (e) { msg("error", e.message && !/Failed to fetch|NetworkError/.test(e.message) ? e.message : T.errGeneral); }
      boton.disabled = false; boton.textContent = antes;
    });
  }

  // ---------- resalta la sección visible en la barra de anclas ----------
  function barraAnclas() {
    const enlaces = [...document.querySelectorAll(".subnav a")];
    if (!enlaces.length || !("IntersectionObserver" in window)) return;
    const mapa = new Map(enlaces.map((a) => [a.getAttribute("href").slice(1), a]));
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { enlaces.forEach((a) => a.classList.remove("activo")); const a = mapa.get(e.target.id); if (a) { a.classList.add("activo"); a.scrollIntoView({ block: "nearest", inline: "center" }); } } });
    }, { rootMargin: "-20% 0px -70% 0px" });
    mapa.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }

  // ---------- arranque ----------
  function enlacesIdioma() {
    document.querySelectorAll("[data-lang]").forEach((a) => { a.href = a.dataset.lang === "en" ? `/${SLUG}/en` : `/${SLUG}/`; });
  }
  const noIndexar = () => { const m = document.createElement("meta"); m.name = "robots"; m.content = "noindex"; document.head.append(m); };
  function noDisponible(noExiste) {
    if (noExiste) noIndexar();                 // solo si el evento no existe o no está publicado (no por una falla pasajera)
    document.querySelectorAll("main .col-section, .hero.evento, .subnav").forEach((e) => { e.hidden = true; });
    const x = $("c-error"); x.textContent = T.noEncontrado; x.hidden = false;
  }
  async function arrancar() {
    enlacesIdioma(); formulario(); barraAnclas();
    let d = null;
    let estado = 0;
    try { const r = await fetch("/api/evento/" + encodeURIComponent(SLUG)); estado = r.status; if (r.ok) d = await r.json(); } catch (e) { /* sin servicio */ }
    if (!d || !d.contenido) return noDisponible(estado === 404);
    $("c-preview").hidden = !d.vistaPrevia;
    if (d.vistaPrevia) noIndexar();
    dibujar(d.contenido, d.inscritos || []);
  }
  arrancar();
})();
