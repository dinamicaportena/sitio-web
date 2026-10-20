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
    comiteUnico: "Scientific and Organizing Committee", organizador: "Organizing committee", apoyan: "Supported by",
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
    comiteUnico: "Comité científico y organizador", organizador: "Comité organizador", apoyan: "Apoyan",
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
  // Igual intérprete que el resto del sitio (\textbf, acentos, ~, --, $…$, etc.); si no cargó, texto plano.
  const escribirTexto = (elemento, fuente, opts) => { if (window.DPTexto) DPTexto.escribir(elemento, fuente, opts); else elemento.textContent = fuente || ""; };
  const vacio = (c, msg) => c.replaceChildren(el("p", "vacio-nota", msg));
  const iniciales = (n) => (n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  // ---------- secciones ----------
  const SECCIONES = ["objetivo", "conferencistas", "programa", "participantes", "inscripcion", "info", "organizacion"];
  // Identidad del evento y estructura (marca, institución, menú, pie, secciones visibles y sus títulos): todo editable desde el panel.
  function identidad(c) {
    $("c-marca").textContent = tr(c.marca) || tr(c.nombre) || "Evento";
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
    const hero = document.querySelector(".hero.evento"), img = soloHttp(c.imagenPortada);
    if (hero) {
      hero.classList.toggle("con-imagen", Boolean(img));
      // Si el banner ya trae el nombre, las fechas y el lugar escritos en la imagen (como el afiche), se oculta el
      // título que normalmente se dibuja encima en blanco, para no repetir la misma información dos veces.
      const conTitulo = Boolean(img && c.bannerConTitulo);
      hero.classList.toggle("banner-con-titulo", conTitulo);
      if (conTitulo) {
        // El banner ya es la portada completa: se muestra entero, sin capa oscura y sin recortes (ver evento.css). Se
        // toman su proporción y el color de sus bordes izquierdo y derecho para rellenar el ancho sobrante en pantallas
        // muy anchas sin que se note el borde de la imagen.
        hero.style.backgroundImage = "";
        hero.style.setProperty("--banner", `url("${img}")`);
        const im = new Image();
        im.onload = () => {
          if (im.naturalWidth && im.naturalHeight) hero.style.setProperty("--banner-ratio", String(im.naturalWidth / im.naturalHeight));
          try {
            const cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
            const cx = cv.getContext("2d"); cx.drawImage(im, 0, 0);
            const col = (x) => { const p = cx.getImageData(x, Math.floor(im.naturalHeight / 2), 1, 1).data; return `rgb(${p[0]},${p[1]},${p[2]})`; };
            hero.style.setProperty("--banner-izq", col(2));
            hero.style.setProperty("--banner-der", col(im.naturalWidth - 3));
          } catch (e) { /* imagen de otro dominio: se usan los colores por defecto */ }
        };
        im.src = img;
      } else {
        hero.style.removeProperty("--banner");
        hero.style.backgroundImage = img ? `linear-gradient(rgba(8,20,45,.6),rgba(8,20,45,.6)), url("${img}")` : "";
      }
    }
    const afiche = $("c-afiche-link"), urlAfiche = soloHttp(c.afiche);
    if (afiche) { afiche.hidden = !urlAfiche; if (urlAfiche) afiche.href = urlAfiche; }
    const meta = $("c-meta"); meta.replaceChildren();
    const item = (k, v) => { const d = el("div", "item"); d.append(el("span", "k", k), el("span", "v", v)); meta.append(d); };
    item(EN ? "Dates" : "Fechas", rangoFechas(c.inicio, c.fin));
    if (tr(c.lugar)) item(EN ? "Venue" : "Lugar", tr(c.lugar));
    const i = c.inscripcion || {}, est = $("c-estado-insc");
    const vencida = i.fechaLimite && new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }) > i.fechaLimite;
    // Botón «Inscripción» solo con la inscripción abierta; el estado solo se muestra si hay fecha límite (si está cerrada no
    // se dice nada: no hay botón y la sección explica cuándo se abrirá)
    const abiertaInsc = Boolean(i.abierta && !vencida);
    document.querySelectorAll('.hero a[href="#inscripcion"]').forEach((a) => { if (!abiertaInsc) a.hidden = true; });
    est.textContent = abiertaInsc && i.fechaLimite ? T.hasta(fechaCorta(i.fechaLimite)) : "";
    est.hidden = !est.textContent;
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
        if (tr(x.titulo)) { const dt = el("div", "titulo-charla"); escribirTexto(dt, tr(x.titulo), { enLinea: true }); cu.append(dt); }
        if (tr(x.resumen)) {
          const r = el("div", "resumen"); escribirTexto(r, tr(x.resumen)); r.id = "res-" + (x.id || x.nombre);
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
        const dt = el("div", "t"); escribirTexto(dt, titulo, { enLinea: true }); q.append(dt);
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

  function inscripcion(c, esAdmin) {
    const i = c.inscripcion || {}, t = $("c-inscripcion-texto"), f = $("c-inscripcion-form");
    t.replaceChildren(); parrafos(t, tr(i.texto));
    const externo = soloHttp(i.formularioExterno);
    const pasado = i.fechaLimite && new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }) > i.fechaLimite;
    if (!i.abierta || pasado) {
      if (esAdmin && !externo) {        // administradores: ven y pueden opinar sobre los campos del formulario aunque aún no esté abierto
        t.prepend(el("p", "aviso-preview", EN ? "Preview: registration is not open to the public yet; this form cannot be submitted." : "Vista previa: la inscripción todavía no está abierta al público; este formulario no se puede enviar."));
        f.hidden = false; return;
      }
      f.hidden = true; if (!tr(i.texto)) t.append(el("p", "vacio-nota", T.insCerrada)); return;
    }
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

  // Integrante: nombre destacado; debajo, institución y rol; correo y teléfono como enlaces discretos
  function comite(cont, lista, dosColumnas) {
    cont.replaceChildren();
    const ul = el("ul", "org-lista" + (dosColumnas ? " dos-columnas" : ""));
    lista.forEach((x) => {
      const li = el("li"); li.append(el("span", "org-nombre", x.nombre));
      const sub = [x.institucion, tr(x.rol)].filter(Boolean).join(" · ");
      if (sub) li.append(el("span", "org-inst", sub));
      if (x.email || x.telefono) {
        const c = el("span", "org-contacto");
        if (x.email) { const e = String(x.email).trim(), a = el("a", "", e); a.href = "mailto:" + e; c.append(a); }
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
    const cien = (c.cientifico || []).filter((x) => x && x.nombre), org = (c.organizadores || []).filter((x) => x && x.nombre);
    // Los dos comités lado a lado en pantallas anchas (uno bajo el otro en celular): se agrupan una sola vez
    let grilla = document.querySelector("#organizacion .comites-grid");
    if (!grilla) {
      grilla = el("div", "comites-grid");
      const colC = el("div", "comite-col"), colO = el("div", "comite-col");
      $("t-cientifico").before(grilla);
      colC.append($("t-cientifico"), ci); colO.append($("t-organizadores"), o); grilla.append(colC, colO);
    }
    if (c.comiteUnico) {                           // una sola lista (comité científico) con ambas funciones, en dos columnas
      ci.hidden = $("t-cientifico").hidden = true;
      $("t-organizadores").textContent = T.comiteUnico;
      grilla.classList.add("unico");
      if (!cien.length) vacio(o, T.sinOrg); else comite(o, cien, true);
    } else {
      ci.hidden = $("t-cientifico").hidden = !cien.length;
      grilla.classList.toggle("unico", !cien.length);
      if (cien.length) comite(ci, cien);
      $("t-organizadores").textContent = T.organizador;
      if (!org.length) vacio(o, T.sinOrg); else comite(o, org);
    }
    sub("auspiciantes", T.apoyan);            // título por omisión: «Apoyan» (editable en el panel)
    const aus = (c.auspiciantes || []).filter((x) => x && x.nombre);
    $("t-auspiciantes").hidden = !aus.length; a.hidden = !aus.length;
    if (aus.length) {
      const w = el("div", "sponsors");
      aus.forEach((x) => {
        const u = soloHttp(x.url), n = el(u ? "a" : "div", "sponsor");
        if (u) { n.href = u; n.target = "_blank"; n.rel = "noopener"; }
        // Con logo, se muestra solo el logo (el nombre queda como texto alternativo y al pasar el mouse); sin logo, el nombre
        if (soloHttp(x.logo) || /^assets\//.test(x.logo || "")) {
          const im = el("img"); im.src = x.logo; im.alt = x.nombre; n.title = x.nombre; n.classList.add("solo-logo"); n.append(im);
        } else n.append(document.createTextNode(x.nombre));
        w.append(n);
      });
      a.append(w);
    }
    const email = (c.contacto && c.contacto.email) || "";
    if (email) { k.append(document.createTextNode(T.contacto + " ")); const l = el("a", "", email); l.href = "mailto:" + email; k.append(l, document.createTextNode(".")); }
  }

  // ---------- secciones desplegables ----------
  // Cada sección se abre o se cierra con un clic en su título. Al cargar, se muestran desplegadas las que el panel indica
  // («Desplegada al abrir la página»); un enlace del menú o de la portada (#programa, #inscripcion…) abre su sección.
  const ABIERTA_POR_DEFECTO = ["objetivo", "conferencistas", "programa", "info"];
  function plegables(c) {
    const cfg = c.secciones || {};
    SECCIONES.forEach((id) => {
      const sec = $(id); if (!sec) return;
      const head = sec.querySelector(".section-head"); if (!head) return;
      if (!sec.querySelector(":scope > .cuerpo-seccion")) {
        const cuerpo = el("div", "cuerpo-seccion"); cuerpo.id = "cuerpo-" + id;
        while (head.nextSibling) cuerpo.append(head.nextSibling);
        sec.append(cuerpo);
        head.classList.add("plegable"); head.setAttribute("role", "button"); head.tabIndex = 0;
        head.setAttribute("aria-controls", cuerpo.id);
        const alternar = () => abrirSeccion(id, sec.classList.contains("plegada"));
        head.addEventListener("click", alternar);
        head.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(); } });
      }
      const k = cfg[id] || {}, abierta = k.abierta === undefined ? ABIERTA_POR_DEFECTO.includes(id) : k.abierta !== false;
      abrirSeccion(id, abierta);
    });
    const h = location.hash.slice(1); if (SECCIONES.includes(h)) abrirSeccion(h, true);
  }
  function abrirSeccion(id, abrir) {
    const sec = $(id); if (!sec) return;
    sec.classList.toggle("plegada", !abrir);
    const head = sec.querySelector(".section-head"); if (head) head.setAttribute("aria-expanded", String(abrir));
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]'); if (!a) return;
    const id = a.getAttribute("href").slice(1); if (SECCIONES.includes(id)) abrirSeccion(id, true);
  });
  window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (SECCIONES.includes(h)) abrirSeccion(h, true); });

  // ---------- compartir y redes sociales ----------
  // Botones para compartir la página (sin cuentas ni permisos: cada red abre su propia ventana para publicar) y, en
  // teléfonos, «Compartir afiche» con el menú del sistema (permite elegir Instagram, WhatsApp, etc. con la imagen 4:5).
  const REDES = [["instagram", "Instagram"], ["facebook", "Facebook"], ["x", "X"], ["linkedin", "LinkedIn"], ["youtube", "YouTube"]];
  function compartir(c) {
    const sec = $("objetivo"); if (!sec) return;
    let caja = $("c-compartir");
    if (!caja) { caja = el("div", "compartir"); caja.id = "c-compartir"; (sec.querySelector(".cuerpo-seccion") || sec).append(caja); }
    caja.replaceChildren();
    const url = location.origin + "/" + SLUG + "/" + (EN ? "en" : ""), titulo = tr(c.nombre) || document.title;
    const texto = [titulo, rangoFechas(c.inicio, c.fin), tr(c.lugar)].filter(Boolean).join(" · ");
    const e = encodeURIComponent;
    const enlace = (txt, href) => { const a = el("a", "btn-compartir", txt); a.href = href; a.target = "_blank"; a.rel = "noopener"; return a; };
    caja.append(el("span", "compartir-rotulo", EN ? "Share:" : "Compartir:"),
      enlace("WhatsApp", `https://wa.me/?text=${e(texto + "\n" + url)}`),
      enlace("Facebook", `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`),
      enlace("X", `https://twitter.com/intent/tweet?text=${e(texto)}&url=${e(url)}`),
      enlace("LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`),
      (() => { const a = el("a", "btn-compartir", EN ? "Email" : "Correo"); a.href = `mailto:?subject=${e(titulo)}&body=${e(texto + "\n\n" + url)}`; return a; })());
    const copiar = el("button", "btn-compartir", EN ? "Copy link" : "Copiar enlace"); copiar.type = "button";
    copiar.onclick = async () => { try { await navigator.clipboard.writeText(url); copiar.textContent = EN ? "Link copied" : "Enlace copiado"; } catch (err) { prompt("", url); } };
    caja.append(copiar);
    // Menú del sistema (teléfonos): comparte la imagen del afiche para redes, lista para Instagram
    const afiche = soloHttp(c.afiche);
    if (navigator.share && afiche) {
      const b = el("button", "btn-compartir destacado", EN ? "Share poster…" : "Compartir afiche…"); b.type = "button";
      b.onclick = async () => {
        try {
          const img = /\/afiche\.jpg$/.test(afiche) ? afiche.replace(/afiche\.jpg$/, "afiche-redes.jpg") : afiche;
          const blob = await (await fetch(img)).blob(), archivo = new File([blob], "afiche.jpg", { type: blob.type || "image/jpeg" });
          const datos = { title: titulo, text: texto + "\n" + url };
          if (navigator.canShare && navigator.canShare({ files: [archivo] })) await navigator.share({ ...datos, files: [archivo] }); else await navigator.share({ ...datos, url });
        } catch (err) { /* cancelado por la persona */ }
      };
      caja.append(b);
    }
    // Redes del evento (si se ingresaron en el panel): «Síguenos»
    const r = c.redes || {}, propias = REDES.filter(([k]) => soloHttp(r[k]));
    if (propias.length) {
      const sig = el("div", "siguenos"); sig.append(el("span", "compartir-rotulo", EN ? "Follow us:" : "Síguenos:"));
      propias.forEach(([k, n]) => sig.append(enlace(n, r[k])));
      caja.append(sig);
    }
  }

  function dibujar(c, inscritos, esAdmin) {
    try { plegables(c); } catch (e) { console.error("plegables", e); }
    try { compartir(c); } catch (e) { console.error("compartir", e); }
    [identidad, portada, objetivo, conferencistas, programa, info, organizacion].forEach((fn) => { try { fn(c); } catch (e) { console.error(fn.name, e); } });
    try { inscripcion(c, esAdmin); } catch (e) { console.error("inscripcion", e); }
    try { participantes(c, inscritos); } catch (e) { console.error("participantes", e); }
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise().catch(() => {});
  }

  // ---------- formulario de inscripción ----------
  function formulario() {
    const f = $("form-insc"); if (!f) return;
    const tipoPres = $("i-tipo"), campoT = $("i-titulo-campo"), campoR = $("i-resumen-campo"), aviso = $("insc-aviso"), boton = $("i-enviar");
    tipoPres.addEventListener("change", () => { const con = Boolean(tipoPres.value); campoT.hidden = !con; campoR.hidden = !con; });
    const msg = (tipo, m) => { aviso.replaceChildren(); if (m) { const d = el("div", "aviso " + tipo, m); aviso.append(d); d.scrollIntoView({ block: "nearest" }); } };
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault(); msg("", "");
      const d = Object.fromEntries(new FormData(f).entries());
      const cuerpo = { nombre: (d.nombre || "").trim(), email: (d.email || "").trim(), institucion: (d.institucion || "").trim(), pais: (d.pais || "").trim(),
        nivel: d.nivel, tipoPresentacion: tipoPres.value, tituloCharla: d.tituloCharla || "", resumen: d.resumen || "", observaciones: d.observaciones || "",
        publicar: $("i-publicar").checked, suscribir: $("i-suscribir") ? $("i-suscribir").checked : false, privacidad: $("i-priv").checked, web: d.web || "", idioma: L };
      if (!cuerpo.nombre || !cuerpo.institucion || !cuerpo.pais || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cuerpo.email) || !cuerpo.privacidad) return msg("error", T.errCampos);
      boton.disabled = true; const antes = boton.textContent; boton.textContent = T.enviando;
      try {
        const r = await fetch("/api/evento/" + SLUG + "/inscripcion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || T.errGeneral);
        f.reset(); campoT.hidden = true; campoR.hidden = true; msg("ok", T.okNuevo);
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
    dibujar(d.contenido, d.inscritos || [], Boolean(d.esAdmin));
  }
  arrancar();
})();
