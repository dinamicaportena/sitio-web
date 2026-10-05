// Panel de administración de UN evento (dinamicaportena.cl/<dirección>/admin): edita el contenido, gestiona las inscripciones y
// los administradores del evento. Es independiente del panel central del sitio.
(function () {
  "use strict";
  const SLUG = (location.pathname.split("/").filter(Boolean)[0] || "").toLowerCase();
  const API = "/api/evadmin/" + encodeURIComponent(SLUG);
  let YO = { email: "", rol: "", estado: "borrador" };
  const esResp = () => YO.rol === "responsable" || YO.rol === "central";
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...hijos) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...hijos.filter((h) => h !== null && h !== undefined)); return e; };
  const aviso = (cont, tipo, m) => { const c = $(cont); c.replaceChildren(); if (m) c.append(el("div", { className: "aviso " + tipo, textContent: m })); };
  const setAbierto = (o, v) => Object.defineProperty(o, "_abierto", { value: v, writable: true, configurable: true, enumerable: false });
  const idNuevo = () => Math.random().toString(36).slice(2, 8);

  let D = null, original = null, vista = "general", inscripciones = [], VERSION = null, reintentar = false;

  // ---------- estado y guardado ----------
  function marcar() {
    const sucio = JSON.stringify(D) !== original;
    $("barra-guardar").classList.toggle("oculto", !sucio);
    $("estado-guardado").textContent = "Hay cambios sin guardar.";
  }
  window.addEventListener("beforeunload", (e) => { if (D && JSON.stringify(D) !== original) { e.preventDefault(); e.returnValue = ""; } });

  async function guardar(forzar = false) {
    const b = $("guardar"); b.disabled = true;
    try {
      const r = await DP.api(API + "/contenido", { method: "PUT", body: { contenido: D, base: VERSION, forzar: forzar === true } });
      VERSION = r.actualizado; original = JSON.stringify(D); marcar(); rotular();
      aviso("aviso-panel", "ok", YO.estado === "publicado" ? "Cambios guardados. La página pública los mostrará en uno o dos minutos." : "Cambios guardados. El evento está en borrador: solo lo ven sus administradores hasta que el responsable lo publique.");
    } catch (e) {
      if (e.estado === 401) {                      // sesión vencida: se conserva lo editado, se pide ingresar de nuevo y se reintenta
        reintentar = true; b.disabled = false; sesionVencida(); return;
      }
      if (e.estado === 409) {                      // otro administrador guardó después de que se cargó esta versión
        b.disabled = false;
        if (confirm(e.message + "\n\n¿Guardar de todas formas su versión? (Aceptar: reemplaza los cambios del otro administrador. Cancelar: no guarda; puede copiar lo suyo y usar «Descartar cambios» para cargar la versión actual.)")) return guardar(true);
        aviso("aviso-panel", "error", "No se guardó. " + e.message); return;
      }
      aviso("aviso-panel", "error", e.message);
    }
    b.disabled = false; window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Sesión vencida con el panel abierto: se conserva lo editado, se pide ingresar de nuevo (y, si se estaba guardando, se reintenta)
  function sesionVencida() {
    aviso("aviso-panel", "error", "Su sesión venció. Ingrese nuevamente con Google (arriba); sus cambios no se han perdido" + (reintentar ? " y se guardarán al ingresar." : "."));
    mostrarAcceso(); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- constructores de campos ----------
  function asegurarBi(obj, key) {
    if (typeof obj[key] === "string") obj[key] = { es: obj[key], en: "" };
    else if (!obj[key] || typeof obj[key] !== "object") obj[key] = { es: "", en: "" };
    return obj[key];
  }
  function campo(etiqueta, obj, key, { tipo = "text", area = false, alto = false, ayuda = "", ph = "", max } = {}) {
    const id = "f" + idNuevo();
    const ctl = area ? el("textarea", { id, className: alto ? "alto" : "" }) : el("input", { id, type: tipo });
    ctl.value = obj[key] ?? ""; if (ph) ctl.placeholder = ph; if (max) ctl.maxLength = max;
    ctl.addEventListener("input", () => { obj[key] = ctl.value; marcar(); });
    return el("div", { className: "campo" }, el("label", { htmlFor: id, textContent: etiqueta }), ctl, ayuda ? el("div", { className: "ayuda", textContent: ayuda }) : null);
  }
  function bi(etiqueta, obj, key, opts = {}) {
    const o = asegurarBi(obj, key);
    const f = el("div", { className: "fila2" });
    f.append(campo(etiqueta + " (español)", o, "es", opts), campo(etiqueta + " (English)", o, "en", opts));
    return f;
  }
  function casilla(etiqueta, obj, key) {
    const c = el("input", { type: "checkbox", checked: Boolean(obj[key]) });
    c.addEventListener("change", () => { obj[key] = c.checked; marcar(); });
    return el("label", { className: "casilla" }, c, el("span", { textContent: etiqueta }));
  }
  function seleccion(etiqueta, obj, key, opciones) {
    const id = "f" + idNuevo(), s = el("select", { id });
    opciones.forEach(([v, t]) => s.append(el("option", { value: v, textContent: t })));
    s.value = obj[key] ?? opciones[0][0];
    s.addEventListener("change", () => { obj[key] = s.value; marcar(); });
    return el("div", { className: "campo" }, el("label", { htmlFor: id, textContent: etiqueta }), s);
  }
  const bloque = (titulo, ...hijos) => el("div", { className: "bloque" }, titulo ? el("h3", { textContent: titulo }) : null, ...hijos);
  const mover = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; marcar(); dibujar(); };
  const quitar = (arr, i, que) => { if (confirm(`¿Eliminar ${que}?`)) { arr.splice(i, 1); marcar(); dibujar(); } };
  function accionesItem(arr, i, que) {
    const b = (t, c, fn) => el("button", { type: "button", className: "boton " + c, textContent: t, onclick: fn });
    return el("div", { className: "acciones-item" }, b("↑ Subir", "sec peq", () => mover(arr, i, -1)), b("↓ Bajar", "sec peq", () => mover(arr, i, 1)), b("Eliminar", "peligro", () => quitar(arr, i, que)));
  }
  const tx = (v) => (typeof v === "string" ? v : (v && (v.es || v.en)) || "");

  // ---------- vistas ----------
  function vGeneral() {
    const v = el("div");
    const ins = (D.inscripcion = D.inscripcion || {}), cont = (D.contacto = D.contacto || {});
    D.pieEnlace = D.pieEnlace || { texto: { es: "", en: "" }, url: "" };
    const enlaces = (D.enlaces = D.enlaces || []);
    v.append(
      bloque("Datos del evento",
        bi("Nombre del evento", D, "nombre"),
        el("div", { className: "fila2" }, campo("Fecha de inicio", D, "inicio", { tipo: "date" }), campo("Fecha de término", D, "fin", { tipo: "date" })),
        bi("Lugar", D, "lugar"),
        campo("Dirección", D, "direccion"),
        bi("Objetivo", D, "objetivo", { area: true, alto: true, ayuda: "Una línea en blanco separa los párrafos. Las direcciones web se convierten en enlaces." })),
      bloque("Inscripción",
        casilla("La inscripción está abierta (muestra el formulario en el sitio)", ins, "abierta"),
        el("div", { className: "fila2" }, campo("Fecha límite (opcional)", ins, "fechaLimite", { tipo: "date" }),
          campo("Formulario externo (opcional)", ins, "formularioExterno", { ph: "https://…", ayuda: "Si lo completa, el sitio mostrará un botón a este enlace en vez del formulario propio." })),
        bi("Texto de la sección", ins, "texto", { area: true })),
      bloque("Contacto", campo("Correo de contacto del evento", cont, "email", { tipo: "email" })),
      bloque("Identidad del evento",
        el("p", { className: "nota-ayuda", textContent: "Nombre corto de la cabecera, institución anfitriona, texto sobre el título y los enlaces del menú y del pie. " }),
        bi("Nombre corto (cabecera)", D, "marca"), bi("Institución anfitriona", D, "institucion"), bi("Texto sobre el título", D, "eyebrow"),
        el("h4", { textContent: "Enlaces del menú superior", style: "margin:14px 0 6px" }),
        tablaFilas(enlaces, [["Texto (ES)", "texto", "es"], ["Text (EN)", "texto", "en"], ["Enlace (https://…)", "url"]], () => ({ texto: { es: "", en: "" }, url: "" }), "+ Agregar enlace"),
        el("h4", { textContent: "Enlace del pie de página", style: "margin:14px 0 6px" }),
        bi("Texto del enlace", D.pieEnlace, "texto"), campo("Dirección del enlace", D.pieEnlace, "url", { ph: "https://… (vacío = sin enlace)" })),
      bloque("Secciones de la página",
        el("p", { className: "nota-ayuda", textContent: "Elija qué secciones se muestran y, si lo desea, cambie su título (vacío = título estándar)." }),
        ...SECCIONES.map(([id, nombre]) => { const k = ((D.secciones = D.secciones || {})[id] = D.secciones[id] || { visible: true, titulo: { es: "", en: "" } }); return el("div", { className: "sec-fila" }, casilla(nombre, k, "visible"), bi("Título", k, "titulo")); })),
      bloque("Copia de seguridad",
        el("p", { className: "nota-ayuda", textContent: "Descargue el contenido actual como archivo, o cargue uno anterior (quedará como cambio sin guardar hasta que pulse «Guardar cambios»)." }),
        el("div", { className: "acciones-seccion" },
          el("button", { type: "button", className: "boton sec peq", textContent: "Descargar contenido (JSON)", onclick: () => descargar(SLUG + ".json", JSON.stringify(D, null, 2), "application/json") }),
          el("button", { type: "button", className: "boton sec peq", textContent: "Cargar contenido desde archivo…", onclick: () => $("f-import").click() }),
          el("input", { type: "file", id: "f-import", accept: "application/json,.json", className: "oculto", onchange: importar }))));
    return v;
  }
  const SECCIONES = [["objetivo", "Objetivo"], ["conferencistas", "Conferencistas"], ["programa", "Programa"], ["participantes", "Participantes"], ["inscripcion", "Inscripción"], ["info", "Información práctica"], ["organizacion", "Organización"]];
  function descargar(nombre, contenido, tipo) {
    const a = el("a", { href: URL.createObjectURL(new Blob([contenido], { type: tipo + ";charset=utf-8" })), download: nombre }); document.body.append(a); a.click(); a.remove();
  }
  async function importar(ev) {
    const f = ev.target.files[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); if (!j || typeof j !== "object" || Array.isArray(j)) throw 0; D = j; marcar(); dibujar(); aviso("aviso-panel", "ok", "Contenido cargado. Revíselo y pulse «Guardar cambios»."); }
    catch { aviso("aviso-panel", "error", "El archivo no es un contenido válido."); }
  }

  const TIPOS_CONF = [["plenaria", "Plenaria"], ["invitada", "Invitada"], ["otra", "Otra"]];
  function vConferencistas() {
    const lista = (D.conferencistas = D.conferencistas || []), v = el("div");
    v.append(el("p", { className: "nota-ayuda", textContent: "Las fórmulas pueden escribirse en LaTeX entre signos $…$. Las charlas del programa se vinculan a estos conferencistas." }));
    lista.forEach((c, i) => {
      c.id = c.id || idNuevo();
      const d = el("details", { className: "item-lista", open: c._abierto }, el("summary", {}, el("span", { textContent: c.nombre || "(sin nombre)" }), el("span", { className: "sub", textContent: [c.institucion, tx(c.titulo)].filter(Boolean).join(" · ") })));
      d.addEventListener("toggle", () => setAbierto(c, d.open));
      d.append(el("div", { className: "cuerpo-item" },
        el("div", { className: "fila2" }, campo("Nombre", c, "nombre"), seleccion("Tipo de charla", c, "tipo", TIPOS_CONF)),
        el("div", { className: "fila2" }, campo("Institución", c, "institucion"), campo("País", c, "pais")),
        campo("Foto (opcional)", c, "foto", { ph: "https://… o assets/fotos/nombre.jpg", ayuda: "Sin foto se muestran las iniciales." }),
        bi("Título de la charla", c, "titulo"),
        bi("Resumen", c, "resumen", { area: true }),
        accionesItem(lista, i, "este conferencista")));
      v.append(d);
    });
    v.append(el("button", { type: "button", className: "boton sec", textContent: "+ Agregar conferencista", onclick: () => { lista.push({ id: idNuevo(), nombre: "", institucion: "", pais: "", tipo: "invitada", foto: "", titulo: { es: "", en: "" }, resumen: { es: "", en: "" } }); setAbierto(lista[lista.length - 1], true); marcar(); dibujar(); } }));
    return v;
  }

  const TIPOS_SLOT = [["charla", "Charla"], ["pausa", "Pausa café"], ["almuerzo", "Almuerzo"], ["otro", "Otro"]];
  function vPrograma() {
    const dias = (D.programa = D.programa || []), v = el("div");
    v.append(el("p", { className: "nota-ayuda", textContent: "Cada día tiene bloques con hora. En una charla, elija al conferencista (se mostrará su nombre, institución y el título de su charla); el título del bloque es opcional y tiene prioridad." }));
    const confs = (D.conferencistas || []).filter((c) => c.nombre);
    dias.forEach((dia, di) => {
      const bloques = (dia.bloques = dia.bloques || []);
      const tabla = el("table", { className: "mini-tabla slots" }, el("thead", {}, el("tr", {}, ...["Hora", "Tipo", "Conferencista / título / lugar", ""].map((t) => el("th", { textContent: t })))));
      const tb = el("tbody");
      bloques.forEach((b, bi_) => {
        const hora = el("input", { type: "text", value: b.hora || "", placeholder: "10:00 – 11:00" }); hora.oninput = () => { b.hora = hora.value; marcar(); };
        const tipo = el("select"); TIPOS_SLOT.forEach(([x, t]) => tipo.append(el("option", { value: x, textContent: t }))); tipo.value = b.tipo || "charla"; tipo.onchange = () => { b.tipo = tipo.value; marcar(); };
        const conf = el("select", {}, el("option", { value: "", textContent: "— sin conferencista —" }), ...confs.map((c) => el("option", { value: c.id, textContent: c.nombre })));
        conf.value = b.conferencista || ""; conf.onchange = () => { b.conferencista = conf.value; marcar(); };
        const t = asegurarBi(b, "titulo");
        const tes = el("input", { type: "text", value: t.es || "", placeholder: "Título del bloque (ES, opcional)" }); tes.oninput = () => { t.es = tes.value; marcar(); };
        const ten = el("input", { type: "text", value: t.en || "", placeholder: "Block title (EN, optional)" }); ten.oninput = () => { t.en = ten.value; marcar(); };
        const lug = el("input", { type: "text", value: b.lugar || "", placeholder: "Sala (opcional)" }); lug.oninput = () => { b.lugar = lug.value; marcar(); };
        const btn = (txt, fn, t_) => el("button", { type: "button", className: "quitar", textContent: txt, title: t_, onclick: fn });
        tb.append(el("tr", {}, el("td", { className: "c-hora" }, hora), el("td", { className: "c-tipo" }, tipo), el("td", {}, conf, tes, ten, lug),
          el("td", { className: "c-mover" }, btn("↑", () => mover(bloques, bi_, -1), "Subir"), btn("↓", () => mover(bloques, bi_, 1), "Bajar"), btn("×", () => quitar(bloques, bi_, "este bloque"), "Eliminar"))));
      });
      tabla.append(tb);
      v.append(bloque("", el("div", { className: "fila2" }, campo("Fecha del día", dia, "fecha", { tipo: "date" }), el("div")), tabla,
        el("div", { className: "acciones-seccion" },
          el("button", { type: "button", className: "boton sec peq", textContent: "+ Agregar bloque", onclick: () => { bloques.push({ hora: "", tipo: "charla", conferencista: "", titulo: { es: "", en: "" }, lugar: "" }); marcar(); dibujar(); } }),
          el("button", { type: "button", className: "boton peligro", textContent: "Eliminar día", onclick: () => quitar(dias, di, "este día del programa") }))));
    });
    v.append(el("button", { type: "button", className: "boton sec", textContent: "+ Agregar día", onclick: () => { dias.push({ fecha: D.inicio || "", bloques: [] }); marcar(); dibujar(); } }));
    return v;
  }

  function vInfo() {
    const lista = (D.info = D.info || []), v = el("div");
    v.append(el("p", { className: "nota-ayuda", textContent: "Tarjetas de la sección «Información práctica»: transporte, alojamiento, alimentación, qué ver en Valparaíso, etc." }));
    lista.forEach((x, i) => {
      const d = el("details", { className: "item-lista", open: x._abierto }, el("summary", {}, el("span", { textContent: tx(x.titulo) || "(sin título)" })));
      d.addEventListener("toggle", () => setAbierto(x, d.open));
      d.append(el("div", { className: "cuerpo-item" }, bi("Título", x, "titulo"), bi("Texto", x, "texto", { area: true }), accionesItem(lista, i, "esta tarjeta")));
      v.append(d);
    });
    v.append(el("button", { type: "button", className: "boton sec", textContent: "+ Agregar tarjeta", onclick: () => { lista.push({ titulo: { es: "", en: "" }, texto: { es: "", en: "" } }); setAbierto(lista[lista.length - 1], true); marcar(); dibujar(); } }));
    return v;
  }

  function tablaFilas(arr, columnas, nuevo, textoAgregar) {
    const t = el("table", { className: "mini-tabla" }, el("thead", {}, el("tr", {}, ...columnas.map((c) => el("th", { textContent: c[0] })), el("th"))));
    const tb = el("tbody");
    arr.forEach((fila, i) => {
      const tr = el("tr");
      columnas.forEach(([, key, bil]) => {
        const obj = bil ? asegurarBi(fila, key) : fila, k = bil || key;
        const inp = el("input", { type: "text", value: obj[k] || "" }); inp.oninput = () => { obj[k] = inp.value; marcar(); }; tr.append(el("td", {}, inp));
      });
      tr.append(el("td", {}, el("button", { type: "button", className: "quitar", textContent: "×", title: "Eliminar", onclick: () => quitar(arr, i, "esta fila") })));
      tb.append(tr);
    });
    t.append(tb);
    return el("div", {}, t, el("button", { type: "button", className: "boton sec peq", textContent: textoAgregar, onclick: () => { arr.push(nuevo()); marcar(); dibujar(); } }));
  }
  function vOrganizacion() {
    const cie = (D.cientifico = D.cientifico || []), org = (D.organizadores = D.organizadores || []), aus = (D.auspiciantes = D.auspiciantes || []), part = (D.participantes = D.participantes || []);
    const area = el("textarea", { className: "alto" });
    area.value = part.map((p) => [p.nombre || "", p.institucion || "", p.pais || ""].join("; ")).join("\n");
    area.oninput = () => { D.participantes = area.value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [nombre, institucion = "", pais = ""] = l.split(";").map((x) => x.trim()); return { nombre, institucion, pais }; }); marcar(); };
    const colsComite = [["Nombre", "nombre"], ["Institución", "institucion"], ["Rol (ES)", "rol", "es"], ["Role (EN)", "rol", "en"], ["Correo", "email"], ["Teléfono", "telefono"]];
    const nuevoMiembro = () => ({ nombre: "", institucion: "", rol: { es: "", en: "" }, email: "", telefono: "" });
    return el("div", {},
      bloque("Comité científico", el("p", { className: "nota-ayuda", textContent: "Si queda vacío, la página no muestra este comité. Los correos y teléfonos que escriba aquí SE PUBLICAN en la página del evento." }),
        tablaFilas(cie, colsComite, nuevoMiembro, "+ Agregar integrante")),
      bloque("Comité organizador", el("p", { className: "nota-ayuda", textContent: "Los correos y teléfonos que escriba aquí SE PUBLICAN en la página del evento; déjelos vacíos si no desea mostrarlos." }),
        tablaFilas(org, colsComite, nuevoMiembro, "+ Agregar integrante")),
      bloque("Auspiciantes y colaboradores", tablaFilas(aus, [["Nombre", "nombre"], ["Enlace (https://…)", "url"], ["Logo (URL, opcional)", "logo"]], () => ({ nombre: "", url: "", logo: "" }), "+ Agregar auspiciante")),
      bloque("Participantes ingresados a mano", el("p", { className: "nota-ayuda", textContent: "Una persona por línea, con el formato «Nombre; Institución; País». Se suman a quienes se inscriban en línea, fueran aprobados y autoricen aparecer en la lista." }),
        el("div", { className: "campo" }, area)));
  }

  // ---------- inscripciones ----------
  const NIVELES = { investigador: "Investigador/a o profesor/a", postdoc: "Postdoctorado", doctorado: "Doctorado", magister: "Magíster", pregrado: "Pregrado", otro: "Otra" };
  async function cargarInscripciones() {
    try { inscripciones = await DP.api(API + "/inscripciones"); actualizarPendientes(); if (vista === "inscripciones") dibujar(); }
    catch (e) { if (e.estado === 401) return sesionVencida(); aviso("aviso-panel", "error", e.message); }
  }
  function actualizarPendientes() { const n = inscripciones.filter((i) => i.estado === "pendiente").length; $("n-pend").textContent = n; $("n-pend").classList.toggle("oculto", !n); }
  async function cambiar(i, datos) {
    try { const nueva = await DP.api(API + "/inscripciones/" + i.id, { method: "PATCH", body: datos }); Object.assign(i, nueva); actualizarPendientes(); dibujar(); }
    catch (e) { aviso("aviso-panel", "error", e.message); }
  }
  let filtroEstado = "todas", filtroTexto = "";
  function vInscripciones() {
    const v = el("div"), cuenta = (e) => inscripciones.filter((i) => i.estado === e).length;
    const resumen = el("div", { className: "resumen-insc" });
    [["Total", inscripciones.length], ["Pendientes", cuenta("pendiente")], ["Aprobadas", cuenta("aprobada")], ["Rechazadas", cuenta("rechazada")], ["Con charla/póster", inscripciones.filter((i) => i.charla).length]]
      .forEach(([l, n]) => resumen.append(el("div", { className: "stat" }, el("div", { className: "n", textContent: n }), el("div", { className: "l", textContent: l }))));
    const sel = el("select", {}, ...[["todas", "Todas"], ["pendiente", "Pendientes"], ["aprobada", "Aprobadas"], ["rechazada", "Rechazadas"]].map(([x, t]) => el("option", { value: x, textContent: t })));
    sel.value = filtroEstado; sel.onchange = () => { filtroEstado = sel.value; dibujar(); };
    const q = el("input", { type: "search", placeholder: "Buscar por nombre, institución o país", value: filtroTexto }); q.oninput = () => { filtroTexto = q.value; pintarFilas(); };
    const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const tb = el("tbody");
    function pintarFilas() {
      tb.replaceChildren();
      const lista = inscripciones.filter((i) => (filtroEstado === "todas" || i.estado === filtroEstado) && norm([i.nombre, i.institucion, i.pais, i.email].join(" ")).includes(norm(filtroTexto)));
      if (!lista.length) tb.append(el("tr", {}, el("td", { colSpan: 5, className: "vacio", textContent: inscripciones.length ? "Ninguna inscripción coincide con el filtro." : "Aún no hay inscripciones." })));
      lista.forEach((i) => {
        const b = (t, c, fn) => el("button", { type: "button", className: "boton " + c, textContent: t, onclick: fn });
        const acc = el("div", { className: "acciones" });
        if (i.estado !== "aprobada") acc.append(b("Aprobar", "peq", () => cambiar(i, { estado: "aprobada" })));
        if (i.estado !== "rechazada") acc.append(b("Rechazar", "sec peq", () => cambiar(i, { estado: "rechazada" })));
        if (i.estado !== "pendiente") acc.append(b("A pendiente", "sec peq", () => cambiar(i, { estado: "pendiente" })));
        acc.append(b("Eliminar", "peligro", async () => { if (!confirm(`¿Eliminar la inscripción de ${i.nombre}? Esta acción no se puede deshacer.`)) return; try { await DP.api(API + "/inscripciones/" + i.id, { method: "DELETE" }); inscripciones = inscripciones.filter((x) => x !== i); actualizarPendientes(); dibujar(); } catch (e) { aviso("aviso-panel", "error", e.message); } }));
        const pub = el("input", { type: "checkbox", checked: Boolean(i.publicar), title: "Aparece en la lista pública (si está aprobada)" }); pub.onchange = () => cambiar(i, { publicar: pub.checked });
        tb.append(el("tr", {},
          el("td", {}, el("strong", { textContent: i.nombre }), el("span", { className: "sub", textContent: i.email })),
          el("td", {}, document.createTextNode(i.institucion || ""), el("span", { className: "sub", textContent: [i.pais, NIVELES[i.nivel]].filter(Boolean).join(" · ") })),
          el("td", {}, i.charla ? el("span", {}, el("span", { className: "chip", textContent: "Charla/póster" }), el("span", { className: "sub", textContent: i.tituloCharla || "" })) : document.createTextNode("—"),
            i.observaciones ? el("span", { className: "sub", textContent: "Obs.: " + i.observaciones }) : null,
            i.suscribir ? el("span", { className: "sub", textContent: "Pidió recibir las novedades de Dinámica Porteña" + (i.suscripcion ? ` (${i.suscripcion})` : " (se suscribe al aprobar la inscripción)") }) : null,
            i.anterior ? el("span", { className: "sub", textContent: `Reenviada por la persona; versión anterior: ${i.anterior.nombre} (${i.anterior.institucion}, ${i.anterior.pais}), ${i.anterior.estado}${i.anterior.publicar ? ", publicable" : ""}.` }) : null),
          el("td", {}, el("span", { className: "chip " + (i.estado === "aprobada" ? "ok" : i.estado === "rechazada" ? "no" : "alerta"), textContent: i.estado }), el("label", { className: "sub" }, pub, document.createTextNode(" pública"))),
          el("td", {}, acc)));
      });
    }
    const csv = () => {
      const cols = ["nombre", "email", "institucion", "pais", "nivel", "charla", "tituloCharla", "observaciones", "publicar", "estado", "creada"];
      const esc = (x) => '"' + String(x ?? "").replace(/"/g, '""') + '"';
      descargar(`inscripciones-${SLUG}.csv`, "﻿" + [cols.join(","), ...inscripciones.map((i) => cols.map((c) => esc(i[c])).join(","))].join("\n"), "text/csv");
    };
    const copiar = async () => { const l = inscripciones.filter((i) => i.estado === "aprobada").map((i) => i.email).join(", "); try { await navigator.clipboard.writeText(l); aviso("aviso-panel", "ok", "Correos de las inscripciones aprobadas copiados."); } catch { aviso("aviso-panel", "error", "No se pudo copiar al portapapeles."); } };
    const alta = el("div", { className: "bloque oculto" });
    const f = { nombre: "", email: "", institucion: "", pais: "", nivel: "investigador", charla: false, tituloCharla: "", publicar: false, estado: "aprobada" };
    alta.append(el("h3", { textContent: "Agregar inscripción manualmente" }),
      el("p", { className: "nota-ayuda", textContent: "Funciona aunque el plazo haya terminado o la inscripción esté cerrada. El correo es opcional, pero no puede repetirse." }),
      el("div", { className: "fila2" }, campo("Nombre completo", f, "nombre"), campo("Correo electrónico (opcional)", f, "email", { tipo: "email" })),
      el("div", { className: "fila2" }, campo("Institución", f, "institucion"), campo("País", f, "pais")),
      el("div", { className: "fila2" }, seleccion("Situación académica", f, "nivel", Object.entries(NIVELES)), seleccion("Estado", f, "estado", [["aprobada", "Aprobada"], ["pendiente", "Pendiente"]])),
      casilla("Presentará charla o póster", f, "charla"), campo("Título (opcional)", f, "tituloCharla"),
      casilla("Mostrar nombre e institución en la lista pública (cuenta con su autorización)", f, "publicar"),
      casilla("Pidió recibir las novedades de Dinámica Porteña (se suscribe a la lista si la inscripción queda aprobada)", f, "suscribir"),
      el("div", { className: "acciones-seccion" },
        el("button", { type: "button", className: "boton peq", textContent: "Guardar inscripción", onclick: async () => {
          try { const n = await DP.api(API + "/inscripciones", { method: "POST", body: f }); inscripciones.unshift(n); actualizarPendientes(); dibujar(); aviso("aviso-panel", "ok", "Inscripción agregada."); }
          catch (e) { aviso("aviso-panel", "error", e.message); }
        } }),
        el("button", { type: "button", className: "boton sec peq", textContent: "Cancelar", onclick: () => alta.classList.add("oculto") })));
    v.append(resumen, alta,
      el("div", { className: "herramientas" }, el("button", { type: "button", className: "boton peq", textContent: "+ Agregar inscripción", onclick: () => alta.classList.toggle("oculto") }), sel, q,
        el("button", { type: "button", className: "boton sec peq", textContent: "Descargar CSV", onclick: csv }),
        el("button", { type: "button", className: "boton sec peq", textContent: "Copiar correos de aprobados", onclick: copiar }),
        el("button", { type: "button", className: "boton sec peq", textContent: "Actualizar", onclick: cargarInscripciones })),
      el("table", { className: "tabla tabla-insc" }, el("thead", {}, el("tr", {}, ...["Persona", "Institución", "Charla / observaciones", "Estado", ""].map((t) => el("th", { textContent: t })))), tb));
    pintarFilas();
    return v;
  }

  // ---------- correos ----------
  // A los inscritos (los envía el responsable) o a la lista de Dinámica Porteña (queda por aprobar por un administrador central).
  const borrador = { tipo: "inscritos", estados: { aprobada: true, pendiente: false, rechazada: false }, asunto: "", cuerpo: "", idioma: "es" };
  const ESTADO_MSJ = { enviado: ["Enviado", "ok"], "por-aprobar": ["Por aprobar", "alerta"], rechazado: ["No aprobado", "no"] };
  async function vCorreos() {
    const v = el("div");
    let info; try { info = await DP.api(API + "/mensajes"); } catch (e) { if (e.estado === 401) sesionVencida(); return el("div", { className: "aviso error", textContent: e.message }); }
    const n = info.inscritos, resultado = el("div");
    const cuantos = () => borrador.tipo === "lista" ? info.lista : Object.entries(borrador.estados).filter(([, x]) => x).reduce((a, [k]) => a + (n[k] || 0), 0);
    const total = el("p", { className: "nota-ayuda" });
    const pintarTotal = () => { total.textContent = borrador.tipo === "lista"
      ? `${info.lista} suscriptores de la lista de Dinámica Porteña. El correo quedará por aprobar: un administrador del sitio lo revisa antes de enviarlo, y usted recibirá un aviso.`
      : `${cuantos()} destinatario(s). Cada inscrito recibe el correo por separado (nadie ve los demás correos), con una nota que indica que lo recibe por estar inscrito en el evento.`; };
    const estados = el("div", { className: "fila-casillas" }, ...[["aprobada", "Aprobadas"], ["pendiente", "Pendientes"], ["rechazada", "Rechazadas"]].map(([k, t]) => {
      const c = el("input", { type: "checkbox", checked: borrador.estados[k] }); c.onchange = () => { borrador.estados[k] = c.checked; pintarTotal(); };
      return el("label", { className: "casilla" }, c, el("span", { textContent: `${t} (${n[k] || 0})` }));
    }));
    const tipo = el("select", {}, el("option", { value: "inscritos", textContent: "Inscritos de este evento" }), el("option", { value: "lista", textContent: "Lista de divulgación de Dinámica Porteña (requiere aprobación)" }));
    tipo.value = borrador.tipo; tipo.onchange = () => { borrador.tipo = tipo.value; estados.classList.toggle("oculto", borrador.tipo !== "inscritos"); pintarTotal(); };
    estados.classList.toggle("oculto", borrador.tipo !== "inscritos"); pintarTotal();
    const asunto = el("input", { type: "text", maxLength: 200, value: borrador.asunto }); asunto.oninput = () => { borrador.asunto = asunto.value; };
    const cuerpo = el("textarea", { className: "alto", value: borrador.cuerpo, placeholder: "Estimados/as:\n\n…\n\nSaludos cordiales,\nComité organizador" }); cuerpo.oninput = () => { borrador.cuerpo = cuerpo.value; };
    cuerpo.rows = 12;
    const idioma = el("select", {}, el("option", { value: "es", textContent: "Español" }), el("option", { value: "en", textContent: "Inglés" })); idioma.value = borrador.idioma; idioma.onchange = () => { borrador.idioma = idioma.value; };
    const cuerpoEnvio = (prueba) => ({ prueba, asunto: borrador.asunto, cuerpo: borrador.cuerpo, idioma: borrador.idioma,
      destino: { tipo: borrador.tipo, estados: Object.entries(borrador.estados).filter(([, x]) => x).map(([k]) => k) } });
    const enviarBtn = el("button", { type: "button", className: "boton", textContent: "Enviar", disabled: !info.puedeEnviar });
    enviarBtn.onclick = async () => {
      const k = cuantos();
      if (!confirm(borrador.tipo === "lista" ? `¿Pedir el envío de «${borrador.asunto}» a la lista de Dinámica Porteña (${k} suscriptores)? Un administrador del sitio debe aprobarlo.` : `¿Enviar «${borrador.asunto}» a ${k} inscrito(s)? No se puede deshacer.`)) return;
      enviarBtn.disabled = true;
      try {
        const m = await DP.api(API + "/mensajes", { method: "POST", body: cuerpoEnvio(false) });
        Object.assign(borrador, { asunto: "", cuerpo: "" }); await dibujarVista();
        aviso("aviso-panel", "ok", m.estado === "por-aprobar" ? "Solicitud enviada: el correo quedó por aprobar por un administrador de Dinámica Porteña." : `Correo en envío a ${m.total} destinatario(s).`);
      } catch (e) { enviarBtn.disabled = false; if (e.estado === 401) return sesionVencida(); aviso("aviso-panel", "error", e.message); }
    };
    const pruebaBtn = el("button", { type: "button", className: "boton sec", textContent: "Enviarme una prueba", onclick: async () => {
      try { const r = await DP.api(API + "/mensajes", { method: "POST", body: cuerpoEnvio(true) }); aviso("aviso-panel", "ok", `Prueba enviada a ${r.prueba}.`); }
      catch (e) { if (e.estado === 401) return sesionVencida(); aviso("aviso-panel", "error", e.message); } } });
    v.append(el("p", { className: "nota-ayuda", textContent: "Los correos salen desde la cuenta de Dinámica Porteña, con el nombre del evento como remitente. Las respuestas llegan al correo de contacto del evento (pestaña Organización) o, si no hay, al suyo." }),
      bloque("Escribir un correo",
        el("div", { className: "fila2" }, el("div", { className: "campo" }, el("label", { textContent: "Destinatarios" }), tipo), el("div", { className: "campo" }, el("label", { textContent: "Idioma del pie del correo" }), idioma)),
        estados, total,
        el("div", { className: "campo" }, el("label", { textContent: "Asunto" }), asunto),
        el("div", { className: "campo" }, el("label", { textContent: "Texto" }), cuerpo, el("div", { className: "ayuda", textContent: "Texto simple: deje una línea en blanco entre párrafos. Las direcciones web (https://…) quedan como enlaces." })),
        el("div", { className: "acciones-seccion" }, pruebaBtn, enviarBtn),
        info.puedeEnviar ? null : el("p", { className: "vacio", textContent: "Solo el responsable del evento puede enviar correos; usted puede enviarse una prueba y pedirle que lo envíe." })),
      resultado);
    const tb = el("tbody");
    if (!info.mensajes.length) tb.append(el("tr", {}, el("td", { colSpan: 4, className: "vacio", textContent: "Aún no se han enviado correos desde este evento." })));
    info.mensajes.forEach((m) => { const [t, c] = ESTADO_MSJ[m.estado] || [m.estado, ""];
      tb.append(el("tr", {}, el("td", { textContent: DP.fechaLarga(m.creado) }), el("td", {}, el("strong", { textContent: m.asunto }), el("span", { className: "sub", textContent: `${m.descripcion} · por ${m.autor}` }), m.motivo ? el("span", { className: "sub", textContent: "Motivo: " + m.motivo } ) : null),
        el("td", { textContent: m.total ?? "—" }), el("td", {}, el("span", { className: "chip " + c, textContent: t })))); });
    v.append(bloque("Correos enviados", el("table", { className: "tabla tabla-insc" }, el("thead", {}, el("tr", {}, ...["Fecha", "Correo", "Destinatarios", "Estado"].map((x) => el("th", { textContent: x })))), tb)));
    return v;
  }

  // ---------- administradores del evento ----------
  const ROLES = { responsable: "Responsable", colaborador: "Colaborador", central: "Administrador central" };
  async function vAdmins() {
    const v = el("div");
    let lista = []; try { lista = await DP.api(API + "/admins"); } catch (e) { return el("div", { className: "aviso error", textContent: e.message }); }
    const resultado = el("div");
    const mostrarInvitacion = (inv, email) => {
      resultado.replaceChildren();
      if (!inv) return;
      if (inv.enviado) resultado.append(el("div", { className: "aviso ok", textContent: `Invitación enviada a ${email}.` }));
      else resultado.append(el("div", { className: "aviso info" }, document.createTextNode(`No se pudo enviar el correo (${inv.motivo || "motivo desconocido"}). Comparta este enlace con ${email}: `), el("a", { href: inv.enlace, textContent: inv.enlace })));
    };
    v.append(el("p", { className: "nota-ayuda", textContent: "Los administradores ingresan con su cuenta de Google (el correo invitado) y solo ven este evento. El responsable invita y quita colaboradores; los colaboradores editan contenido e inscripciones. Los administradores del sitio Dinámica Porteña también pueden entrar." }));
    const tb = el("tbody");
    lista.forEach((a) => {
      const acc = el("td");
      if (esResp() && a.rol === "colaborador") {
        acc.append(el("button", { type: "button", className: "boton sec peq", textContent: "Reenviar invitación", onclick: async () => { try { const r = await DP.api(API + "/admins", { method: "POST", body: { email: a.email, reenviar: true } }); mostrarInvitacion(r.invitacion, a.email); } catch (e) { aviso("aviso-panel", "error", e.message); } } }), document.createTextNode(" "),
          el("button", { type: "button", className: "boton peligro", textContent: "Quitar acceso", onclick: async () => { if (!confirm(`¿Quitar el acceso de ${a.email} a este evento?`)) return; try { await DP.api(API + "/admins", { method: "DELETE", body: { email: a.email } }); dibujar(); } catch (e) { aviso("aviso-panel", "error", e.message); } } }));
      }
      tb.append(el("tr", {}, el("td", {}, el("strong", { textContent: a.email }), el("span", { className: "sub", textContent: a.agregadoPor ? "Invitado por " + a.agregadoPor : "" })),
        el("td", {}, el("span", { className: "chip" + (a.rol === "responsable" ? "" : " confirmar"), textContent: ROLES[a.rol] || a.rol })), acc));
    });
    v.append(el("table", { className: "tabla tabla-insc" }, el("thead", {}, el("tr", {}, ...["Administrador", "Rol", ""].map((t) => el("th", { textContent: t })))), tb));
    if (esResp()) {
      const f = { email: "" };
      v.append(bloque("Invitar a un administrador",
        el("p", { className: "nota-ayuda", textContent: "Se le enviará un correo con el enlace a este panel. Debe ingresar con la cuenta de Google asociada a ese correo." }),
        campo("Correo electrónico", f, "email", { tipo: "email" }),
        el("button", { type: "button", className: "boton", textContent: "Invitar como colaborador", onclick: async () => {
          try { const r = await DP.api(API + "/admins", { method: "POST", body: { email: f.email } }); await dibujarVista(); mostrarInvitacion(r.invitacion, f.email); } catch (e) { aviso("aviso-panel", "error", e.message); } } })));
    } else v.append(el("p", { className: "vacio", textContent: "Solo el responsable del evento puede invitar o quitar administradores." }));
    v.append(resultado);
    return v;
  }

  const VISTAS = { general: vGeneral, conferencistas: vConferencistas, programa: vPrograma, info: vInfo, organizacion: vOrganizacion, inscripciones: vInscripciones, correos: vCorreos, admins: vAdmins };
  async function dibujarVista() { document.querySelectorAll(".pestana").forEach((p) => p.classList.toggle("activa", p.dataset.vista === vista)); $("vista").replaceChildren(await VISTAS[vista]()); }
  const dibujar = dibujarVista;

  // Estado de publicación del evento (solo el responsable o un administrador central lo cambia)
  function pintarEstado() {
    const c = $("estado-evento"), pub = YO.estado === "publicado"; c.replaceChildren();
    c.append(el("span", {}, el("span", { className: "estado " + (pub ? "publicada" : "borrador"), textContent: pub ? "Publicado" : "Borrador" }),
      document.createTextNode(pub ? " La página es pública. " : " Solo los administradores ven la página (vista previa). "),
      el("a", { href: "/" + SLUG + "/", target: "_blank", rel: "noopener", textContent: "Ver la página →" })));
    if (esResp()) c.append(el("button", { type: "button", className: "boton " + (pub ? "sec" : "") + " peq", textContent: pub ? "Retirar de la web" : "Publicar el evento", onclick: async () => {
      if (!confirm(pub ? "¿Retirar la página del evento de la web?" : "¿Publicar la página del evento? Será visible para todo el público.")) return;
      try { const r = await DP.api(API + "/estado", { method: "PUT", body: { estado: pub ? "borrador" : "publicado" } }); YO.estado = r.estado; pintarEstado(); } catch (e) { aviso("aviso-panel", "error", e.message); } } }));
    // Difusión en la pestaña «Eventos» del sitio de Dinámica Porteña (opcional; solo con la página publicada)
    const cb = el("input", { type: "checkbox", id: "en-sitio", checked: YO.enSitio === true, disabled: !esResp() });
    cb.onchange = async () => { try { const r = await DP.api(API + "/estado", { method: "PUT", body: { enSitio: cb.checked } }); YO.enSitio = r.enSitio; pintarEstado(); } catch (e) { cb.checked = !cb.checked; aviso("aviso-panel", "error", e.message); } };
    c.append(el("label", { className: "en-sitio", htmlFor: "en-sitio", style: "display:block;flex-basis:100%;margin-top:8px" }, cb, document.createTextNode(" Mostrar también este evento (nombre, fechas, lugar y breve descripción) en la pestaña «Eventos» y en la portada del sitio de Dinámica Porteña." + (YO.enSitio && !pub ? " Aparecerá cuando publique la página." : ""))));
  }

  // ---------- acceso ----------
  function rotular() { const t = tx(D.marca) || tx(D.nombre); if (t) { document.querySelector(".group-name").textContent = t; document.title = "Panel — " + t; } document.querySelectorAll(".ver-sitio").forEach((a) => { a.href = "/" + SLUG + "/"; }); }
  async function iniciar(quien) {
    YO = quien; $("acceso").classList.add("oculto"); $("panel").classList.remove("oculto");
    $("usuario").textContent = `${quien.email} · ${ROLES[quien.rol] || quien.rol}`;
    try { const r = await DP.api(API + "/contenido"); D = r.contenido || {}; VERSION = r.actualizado; YO.estado = r.estado; YO.enSitio = r.enSitio; }
    catch (e) { if (e.estado === 401) return location.reload(); aviso("aviso-panel", "error", e.message); D = {}; }
    original = JSON.stringify(D); marcar(); pintarEstado(); await dibujar(); cargarInscripciones(); rotular();
  }
  async function mostrarAcceso() {
    $("acceso").classList.remove("oculto");
    let clientId; try { clientId = (await DP.api("/api/config")).googleClientId; } catch (e) { return aviso("aviso-acceso", "error", "El sitio aún no está configurado para el acceso con Google (falta GOOGLE_CLIENT_ID en Netlify)."); }
    await new Promise((ok) => { const t = setInterval(() => { if (window.google && google.accounts) { clearInterval(t); ok(); } }, 100); });
    google.accounts.id.initialize({ client_id: clientId, ux_mode: "popup", callback: async (resp) => {
      try {
        const r = await DP.api("/api/evauth/login", { method: "POST", body: { credential: resp.credential, slug: SLUG } });
        if (D) {                                     // el panel ya estaba abierto (sesión vencida): se conserva lo editado
          YO = { ...YO, ...r }; $("acceso").classList.add("oculto"); aviso("aviso-acceso", "", ""); aviso("aviso-panel", "", "");
          if (reintentar) { reintentar = false; guardar(); }
          cargarInscripciones();
        } else iniciar(r);
      }
      catch (e) { aviso("aviso-acceso", "error", e.message); }
    } });
    google.accounts.id.renderButton($("boton-google"), { theme: "outline", size: "large", text: "signin_with", locale: "es" });
  }

  $("pestanas").addEventListener("click", (e) => { const b = e.target.closest(".pestana"); if (!b) return; vista = b.dataset.vista; aviso("aviso-panel", "", ""); dibujar(); });
  $("guardar").onclick = () => guardar();
  $("descartar").onclick = async () => { if (!confirm("¿Descartar los cambios sin guardar?")) return; try { const r = await DP.api(API + "/contenido"); D = r.contenido || D; VERSION = r.actualizado; original = JSON.stringify(D); marcar(); dibujar(); } catch (e) { aviso("aviso-panel", "error", e.message); } };
  $("salir").onclick = async () => { try { await DP.api("/api/evauth/logout", { method: "POST", body: {} }); } catch (e) {} if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); location.reload(); };
  (async () => {
    try { iniciar(await DP.api("/api/evauth/me?slug=" + encodeURIComponent(SLUG))); }
    catch (e) { if (e.estado === 403 || e.estado === 404) { $("acceso").classList.remove("oculto"); aviso("aviso-acceso", "error", e.message); } await mostrarAcceso(); }
  })();
})();
