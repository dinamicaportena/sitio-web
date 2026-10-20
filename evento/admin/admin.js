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
  // Bloques del panel plegables: clic en el título; el estado se recuerda en este navegador (por evento y título)
  const plegados = (() => { try { return new Set(JSON.parse(localStorage.getItem("dp-ev-plegados-" + SLUG) || "[]")); } catch (e) { return new Set(); } })();
  const guardarPlegados = () => { try { localStorage.setItem("dp-ev-plegados-" + SLUG, JSON.stringify([...plegados])); } catch (e) { /* sin almacenamiento */ } };
  function bloque(titulo, ...hijos) {
    const b = el("div", { className: "bloque" }, ...hijos);
    if (!titulo) return b;
    const clave = vista + "|" + titulo;
    const h = el("h3", { className: "bloque-titulo", tabIndex: 0, title: "Mostrar u ocultar", textContent: titulo });
    const alternar = () => { const p = b.classList.toggle("plegado"); if (p) plegados.add(clave); else plegados.delete(clave); guardarPlegados(); };
    h.addEventListener("click", alternar);
    h.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(); } });
    b.prepend(h); if (plegados.has(clave)) b.classList.add("plegado");
    return b;
  }

  // Subir una imagen (PNG, JPG o WebP, hasta 4 MB) al almacén del evento; devuelve su dirección pública
  function elegirImagen() {
    return new Promise((ok, mal) => {
      const f = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp" });
      f.onchange = () => {
        const a = f.files && f.files[0]; if (!a) return ok(null);
        if (!/^image\/(png|jpeg|webp)$/.test(a.type)) return mal(new Error("Use una imagen PNG, JPG o WebP."));
        if (a.size > 4 * 1024 * 1024) return mal(new Error("La imagen supera el tamaño máximo de 4 MB."));
        const r = new FileReader();
        r.onload = async () => { try { ok((await DP.api(API + "/archivos", { method: "POST", body: { datos: r.result } })).url); } catch (e) { mal(e); } };
        r.onerror = () => mal(new Error("No se pudo leer el archivo.")); r.readAsDataURL(a);
      };
      f.click();
    });
  }
  function botonSubir(alSubir, texto = "Subir imagen…") {
    const b = el("button", { type: "button", className: "boton sec peq", textContent: texto });
    b.onclick = async () => {
      b.disabled = true; const t = b.textContent; b.textContent = "Subiendo…";
      try { const url = await elegirImagen(); if (url) alSubir(url); } catch (e) { aviso("aviso-panel", "error", e.message); window.scrollTo({ top: 0, behavior: "smooth" }); }
      b.disabled = false; b.textContent = t;
    };
    return b;
  }
  // Campo de imagen: dirección (editable) + «Subir imagen…» + miniatura
  function campoImagen(etiqueta, obj, key, opts = {}) {
    const c = campo(etiqueta, obj, key, opts), inp = c.querySelector("input");
    const mini = el("img", { className: "mini-imagen", alt: "" });
    const ver = () => { const u = obj[key] || ""; mini.hidden = !/^(https?:\/\/|\/)/.test(u); if (!mini.hidden) mini.src = u; };
    inp.addEventListener("input", ver); ver();
    const fila = el("div", { className: "fila-imagen" }, botonSubir((url) => { obj[key] = url; inp.value = url; ver(); marcar(); }), mini);
    inp.after(fila);
    return c;
  }
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
      bloque("Contacto y redes sociales", campo("Correo de contacto del evento", cont, "email", { tipo: "email" }),
        el("p", { className: "nota-ayuda", textContent: "Cuentas del evento o del grupo en redes sociales (dirección completa, https://…). Se muestran en la página como «Síguenos»; vacío = no se muestra." }),
        (() => { const r = (D.redes = D.redes || {}); return el("div", { className: "fila2" },
          campo("Instagram", r, "instagram", { ph: "https://www.instagram.com/…" }), campo("Facebook", r, "facebook", { ph: "https://www.facebook.com/…" }),
          campo("X (Twitter)", r, "x", { ph: "https://x.com/…" }), campo("LinkedIn", r, "linkedin", { ph: "https://www.linkedin.com/…" }),
          campo("YouTube", r, "youtube", { ph: "https://www.youtube.com/…" })); })()),
      bloque("Identidad del evento",
        el("p", { className: "nota-ayuda", textContent: "Nombre corto de la cabecera, institución anfitriona, texto sobre el título y los enlaces del menú y del pie. Si deja el nombre corto vacío, se usa el nombre completo del evento." }),
        bi("Nombre corto (cabecera)", D, "marca"), bi("Institución anfitriona", D, "institucion"), bi("Texto sobre el título", D, "eyebrow"),
        el("p", { className: "nota-ayuda", textContent: "El banner, el afiche y la cabecera de los correos están en la pestaña «Recursos»." }),
        el("h4", { textContent: "Enlaces del menú superior", style: "margin:14px 0 6px" }),
        tablaFilas(enlaces, [["Texto (ES)", "texto", "es"], ["Text (EN)", "texto", "en"], ["Enlace (https://…)", "url"]], () => ({ texto: { es: "", en: "" }, url: "" }), "+ Agregar enlace"),
        el("h4", { textContent: "Enlace del pie de página", style: "margin:14px 0 6px" }),
        bi("Texto del enlace", D.pieEnlace, "texto"), campo("Dirección del enlace", D.pieEnlace, "url", { ph: "https://… (vacío = sin enlace)" })),
      bloque("Secciones de la página",
        el("p", { className: "nota-ayuda", textContent: "Elija qué secciones se muestran, cuáles aparecen desplegadas al abrir la página (las demás se abren con un clic en su título o desde el menú) y, si lo desea, cambie su título (vacío = título estándar)." }),
        ...SECCIONES.map(([id, nombre]) => {
          const k = ((D.secciones = D.secciones || {})[id] = D.secciones[id] || { visible: true, titulo: { es: "", en: "" } });
          if (k.abierta === undefined) k.abierta = ABIERTA_POR_DEFECTO.includes(id);
          const c = casilla(nombre, k, "visible");
          c.querySelector("input").addEventListener("change", () => pintarEstado());
          const a = casilla("Desplegada al abrir la página", k, "abierta");
          a.classList.add("sub-casilla");
          return el("div", { className: "sec-fila" }, el("div", { className: "sec-casillas" }, c, a), bi("Título", k, "titulo"));
        })),
      bloque("Copia de seguridad",
        el("p", { className: "nota-ayuda", textContent: "Descargue el contenido actual como archivo, o cargue uno anterior (quedará como cambio sin guardar hasta que pulse «Guardar cambios»)." }),
        el("div", { className: "acciones-seccion" },
          el("button", { type: "button", className: "boton sec peq", textContent: "Descargar contenido (JSON)", onclick: () => descargar(SLUG + ".json", JSON.stringify(D, null, 2), "application/json") }),
          el("button", { type: "button", className: "boton sec peq", textContent: "Cargar contenido desde archivo…", onclick: () => $("f-import").click() }),
          el("input", { type: "file", id: "f-import", accept: "application/json,.json", className: "oculto", onchange: importar }))));
    return v;
  }
  // Secciones que la página muestra desplegadas si el panel no indica otra cosa (igual que en assets/evento.js)
  const ABIERTA_POR_DEFECTO = ["objetivo", "conferencistas", "programa", "info"];
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

  const icono = (texto) => el("span", { className: "icono-info", title: texto, textContent: "i" });
  function tablaFilas(arr, columnas, nuevo, textoAgregar, extra, arrastrable) {
    const t = el("table", { className: "mini-tabla" }, el("thead", {}, el("tr", {},
      arrastrable ? el("th", { style: "width:22px" }) : null,
      ...columnas.map((c) => el("th", {}, c[0], c[3] ? icono(c[3]) : null)),
      extra ? el("th") : null, el("th"))));
    const tb = el("tbody");
    let arrastrando = null;
    arr.forEach((fila, i) => {
      const tr = el("tr");
      if (arrastrable) {
        tr.draggable = true;
        tr.append(el("td", { className: "asa-arrastre", title: "Arrastrar para reordenar", textContent: "⠿" }));
        tr.addEventListener("dragstart", (ev) => { arrastrando = i; tr.classList.add("arrastrando"); ev.dataTransfer.effectAllowed = "move"; });
        tr.addEventListener("dragend", () => { tr.classList.remove("arrastrando"); arrastrando = null; });
        tr.addEventListener("dragover", (ev) => { ev.preventDefault(); tr.classList.add("sobre-arrastre"); });
        tr.addEventListener("dragleave", () => tr.classList.remove("sobre-arrastre"));
        tr.addEventListener("drop", (ev) => {
          ev.preventDefault(); tr.classList.remove("sobre-arrastre");
          if (arrastrando === null || arrastrando === i) return;
          const [mov] = arr.splice(arrastrando, 1); arr.splice(i, 0, mov);
          marcar(); dibujar();
        });
      }
      columnas.forEach(([, key, bil, , opciones, imagen]) => {
        const obj = bil ? asegurarBi(fila, key) : fila, k = bil || key;
        if (opciones) {                                // columna con lista desplegable: [[valor, texto], …]
          const sel = el("select", {}, ...opciones.map(([v, t]) => el("option", { value: v, textContent: t })));
          sel.value = obj[k] || ""; sel.onchange = () => { obj[k] = sel.value; marcar(); }; tr.append(el("td", {}, sel));
          return;
        }
        const inp = el("input", { type: "text", value: obj[k] || "" }); inp.oninput = () => { obj[k] = inp.value; marcar(); };
        if (imagen) {                                  // columna de imagen: dirección + «Subir…» + miniatura
          const mini = el("img", { className: "mini-imagen", alt: "" });
          const ver = () => { const u = obj[k] || ""; mini.hidden = !/^(https?:\/\/|\/)/.test(u); if (!mini.hidden) mini.src = u; };
          inp.addEventListener("input", ver); ver();
          tr.append(el("td", {}, el("div", { className: "celda-imagen" }, mini, inp, botonSubir((url) => { obj[k] = url; inp.value = url; ver(); marcar(); }, "Subir…"))));
          return;
        }
        tr.append(el("td", {}, inp));
      });
      if (extra) tr.append(el("td", {}, extra(fila) || ""));
      tr.append(el("td", {}, el("button", { type: "button", className: "quitar", textContent: "×", title: "Eliminar", onclick: () => quitar(arr, i, "esta fila") })));
      tb.append(tr);
    });
    t.append(tb);
    return el("div", {}, el("div", { className: "tabla-desplazable" }, t), el("button", { type: "button", className: "boton sec peq", textContent: textoAgregar, onclick: () => { arr.push(nuevo()); marcar(); dibujar(); } }));
  }
  async function vOrganizacion() {
    const cie = (D.cientifico = D.cientifico || []), org = (D.organizadores = D.organizadores || []), aus = (D.auspiciantes = D.auspiciantes || []), part = (D.participantes = D.participantes || []);
    const area = el("textarea", { className: "alto" });
    area.value = part.map((p) => [p.nombre || "", p.institucion || "", p.pais || ""].join("; ")).join("\n");
    area.oninput = () => { D.participantes = area.value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [nombre, institucion = "", pais = ""] = l.split(";").map((x) => x.trim()); return { nombre, institucion, pais }; }); marcar(); };
    const nuevoMiembro = () => ({ nombre: "", institucion: "", rol: { es: "", en: "" }, email: "", telefono: "", saludo: "", idioma: "es" });
    const unico = Boolean(D.comiteUnico);
    const toggleUnico = casilla("Un solo comité para ambas funciones (científico y organizador)", D, "comiteUnico");
    toggleUnico.querySelector("input").addEventListener("change", () => { marcar(); dibujar(); });

    // Acceso al panel directo desde el comité: si la ficha tiene un correo válido, se puede invitar a esa persona como colaborador/a
    let admins = []; try { admins = await DP.api(API + "/admins"); } catch (e) { /* sin lista: no se ofrece la acción */ }
    const porCorreo = new Map(admins.map((a) => [a.email.toLowerCase(), a]));
    const ROL_CHIP = { responsable: "Responsable", colaborador: "Con acceso al panel", central: "Admin. central" };
    const accionAdmin = (tipoComite, fila) => {
      const email = String(fila.email || "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
      const a = porCorreo.get(email);
      const chip = a ? el("span", { className: "chip ok", textContent: ROL_CHIP[a.rol] || a.rol }) : null;
      if (a && (!esResp() || a.rol !== "colaborador")) return chip;
      if (!esResp()) return null;
      // Sin acceso: «Invitar al panel». Con acceso (colaborador): «Reenviar», con los mismos datos de la ficha.
      const b = el("button", { type: "button", className: "boton sec peq", textContent: a ? "Reenviar" : "Invitar al panel", title: a ? "Reenviar la invitación al panel" : "", onclick: async (ev) => {
        ev.stopPropagation(); b.disabled = true;
        try {
          const r = await DP.api(API + "/admins", { method: "POST", body: { email, nombrePersona: fila.nombre || "", comite: tipoComite, saludo: fila.saludo || "", idioma: fila.idioma || "es", ...(a ? { reenviar: true } : {}) } });
          aviso("aviso-panel", "ok", r.invitacion?.enviado ? `Invitación enviada a ${email}.` : `No se pudo enviar el correo (${r.invitacion?.motivo || "motivo desconocido"}). Comparta este enlace: ${r.invitacion?.enlace}`); window.scrollTo({ top: 0, behavior: "smooth" });
          dibujar();
        } catch (e) { b.disabled = false; aviso("aviso-panel", "error", e.message); }
      } });
      return a ? el("span", { className: "acceso-ficha" }, chip, b) : b;
    };

    // Integrantes como fichas desplegables (resumen: nombre, institución y acceso; al abrir, todos los datos). Se reordenan arrastrando.
    function fichasComite(arr, tipoComite) {
      const lista = el("div", { className: "fichas" });
      let arrastrando = null;
      arr.forEach((m, i) => {
        if (m._abierto === undefined) setAbierto(m, !m.nombre);
        const f = el("div", { className: "ficha" + (m._abierto ? " abierta" : "") });
        f.draggable = true;
        f.addEventListener("dragstart", (ev) => { arrastrando = i; f.classList.add("arrastrando"); ev.dataTransfer.effectAllowed = "move"; });
        f.addEventListener("dragend", () => { f.classList.remove("arrastrando"); arrastrando = null; });
        f.addEventListener("dragover", (ev) => { ev.preventDefault(); f.classList.add("sobre-arrastre"); });
        f.addEventListener("dragleave", () => f.classList.remove("sobre-arrastre"));
        f.addEventListener("drop", (ev) => { ev.preventDefault(); f.classList.remove("sobre-arrastre"); if (arrastrando === null || arrastrando === i) return; const [mv] = arr.splice(arrastrando, 1); arr.splice(i, 0, mv); marcar(); dibujar(); });
        const nombre = el("strong", { textContent: m.nombre || "(sin nombre)" }), inst = el("span", { className: "sub", textContent: m.institucion || "" });
        const cab = el("div", { className: "ficha-cab", title: "Clic para ver o editar los datos" },
          el("span", { className: "asa-arrastre", title: "Arrastrar para reordenar", textContent: "⠿" }),
          el("span", { className: "ficha-nombre" }, nombre, inst),
          accionAdmin(tipoComite, m),
          el("span", { className: "ficha-flecha", textContent: "▾" }),
          el("button", { type: "button", className: "quitar", textContent: "×", title: "Eliminar", onclick: (ev) => { ev.stopPropagation(); quitar(arr, i, "a " + (m.nombre || "este integrante")); } }));
        cab.addEventListener("click", (ev) => { if (ev.target.closest("button")) return; setAbierto(m, !m._abierto); f.classList.toggle("abierta", m._abierto); });
        const rol = asegurarBi(m, "rol");
        const cuerpo = el("div", { className: "ficha-cuerpo" },
          el("div", { className: "fila2" }, campo("Nombre", m, "nombre"), campo("Institución", m, "institucion")),
          el("div", { className: "fila2" }, campo("Rol (ES)", rol, "es", { ayuda: "Bajo el nombre; vacío = sin rol." }), campo("Role (EN)", rol, "en")),
          el("div", { className: "fila2" }, campo("Correo", m, "email", { tipo: "email", ayuda: "Se publica. Permite invitar al panel." }), campo("Teléfono", m, "telefono", { ayuda: "Se publica." })),
          el("div", { className: "fila2" }, seleccion("Saludo en la invitación", m, "saludo", [["", "Estimado/a"], ["Estimado", "Estimado"], ["Estimada", "Estimada"]]),
            seleccion("Idioma de la invitación", m, "idioma", [["es", "Español"], ["en", "English"]])));
        cuerpo.querySelectorAll("input").forEach((x) => x.addEventListener("input", () => { nombre.textContent = m.nombre || "(sin nombre)"; inst.textContent = m.institucion || ""; }));
        f.append(cab, cuerpo); lista.append(f);
      });
      return el("div", {}, lista, el("button", { type: "button", className: "boton sec peq", textContent: "+ Agregar integrante", onclick: () => { const n = nuevoMiembro(); setAbierto(n, true); arr.push(n); marcar(); dibujar(); } }));
    }
    const nota = el("p", { className: "nota-ayuda", textContent: "Los correos y teléfonos SE PUBLICAN en la página del evento (déjelos vacíos si no desea mostrarlos). Con un correo válido, puede invitar a esa persona al panel; el saludo y el idioma de la invitación no se publican." });

    return el("div", {},
      bloque("Comités", toggleUnico, nota,
        unico
          ? el("div", { className: "comite-unico" }, el("h4", { textContent: "Comité científico y organizador" }), fichasComite(cie, "ambos"))
          : el("div", { className: "columnas-comite" },
              el("div", {}, el("h4", { textContent: "Comité científico" }), fichasComite(cie, "cientifico")),
              el("div", {}, el("h4", { textContent: "Comité organizador" }),
                cie.length && !org.length ? el("button", { type: "button", className: "boton sec peq", style: "margin-bottom:8px", textContent: "Copiar el comité científico aquí", onclick: () => { D.organizadores = cie.map((m) => ({ ...m, rol: { ...m.rol } })); marcar(); dibujar(); } }) : null,
                fichasComite(org, "organizador")))),
      bloque("Apoyan (logos de instituciones y grupos)",
        el("p", { className: "nota-ayuda", textContent: "Logo: suba un archivo (idealmente PNG con fondo transparente, o JPG con fondo blanco; versión horizontal y a color; al menos 800 píxeles de ancho y hasta 4 MB) o pegue su dirección. Cualquier integrante de los comités puede agregar el de su institución." }),
        tablaFilas(aus, [["Nombre", "nombre"], ["Enlace (https://…)", "url"], ["Logo", "logo", null, null, null, true]], () => ({ nombre: "", url: "", logo: "" }), "+ Agregar institución")),
      bloque("Participantes ingresados a mano", el("p", { className: "nota-ayuda", textContent: "Una persona por línea, con el formato «Nombre; Institución; País». Se suman a quienes se inscriban en línea, fueran aprobados y autoricen aparecer en la lista." }),
        el("div", { className: "campo" }, area)));
  }


  // ---------- inscripciones ----------
  const NIVELES = { investigador: "Investigador/a o profesor/a", postdoc: "Postdoctorado", doctorado: "Doctorado", magister: "Magíster", pregrado: "Pregrado", otro: "Otra" };
  const TIPO_PRES_LABEL = { charla: "Charla", poster: "Póster" };
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
          el("td", {}, i.tipoPresentacion ? el("span", {}, el("span", { className: "chip", textContent: TIPO_PRES_LABEL[i.tipoPresentacion] || "Charla/póster" }),
              i.tituloCharla ? el("span", { className: "sub", textContent: i.tituloCharla }) : null,
              i.resumen ? el("span", { className: "sub", title: i.resumen, textContent: i.resumen.length > 140 ? i.resumen.slice(0, 140) + "…" : i.resumen }) : null)
            : i.charla ? el("span", {}, el("span", { className: "chip", textContent: "Charla/póster" }), el("span", { className: "sub", textContent: i.tituloCharla || "" })) : document.createTextNode("—"),
            i.observaciones ? el("span", { className: "sub", textContent: "Obs.: " + i.observaciones }) : null,
            i.suscribir ? el("span", { className: "sub", textContent: "Pidió recibir las novedades de Dinámica Porteña" + (i.suscripcion ? ` (${i.suscripcion})` : " (se suscribe al aprobar la inscripción)") }) : null,
            i.anterior ? el("span", { className: "sub", textContent: `Reenviada por la persona; versión anterior: ${i.anterior.nombre} (${i.anterior.institucion}, ${i.anterior.pais}), ${i.anterior.estado}${i.anterior.publicar ? ", publicable" : ""}.` }) : null),
          el("td", {}, el("span", { className: "chip " + (i.estado === "aprobada" ? "ok" : i.estado === "rechazada" ? "no" : "alerta"), textContent: i.estado }), el("label", { className: "sub" }, pub, document.createTextNode(" pública"))),
          el("td", {}, acc)));
      });
    }
    const csv = () => {
      const cols = ["nombre", "email", "institucion", "pais", "nivel", "tipoPresentacion", "tituloCharla", "resumen", "observaciones", "publicar", "estado", "creada"];
      const esc = (x) => '"' + String(x ?? "").replace(/"/g, '""') + '"';
      descargar(`inscripciones-${SLUG}.csv`, "﻿" + [cols.join(","), ...inscripciones.map((i) => cols.map((c) => esc(i[c])).join(","))].join("\n"), "text/csv");
    };
    const copiar = async () => { const l = inscripciones.filter((i) => i.estado === "aprobada").map((i) => i.email).join(", "); try { await navigator.clipboard.writeText(l); aviso("aviso-panel", "ok", "Correos de las inscripciones aprobadas copiados."); } catch { aviso("aviso-panel", "error", "No se pudo copiar al portapapeles."); } };
    const alta = el("div", { className: "bloque oculto" });
    const f = { nombre: "", email: "", institucion: "", pais: "", nivel: "investigador", tipoPresentacion: "", tituloCharla: "", resumen: "", publicar: false, estado: "aprobada" };
    alta.append(el("h3", { textContent: "Agregar inscripción manualmente" }),
      el("p", { className: "nota-ayuda", textContent: "Funciona aunque el plazo haya terminado o la inscripción esté cerrada. El correo es opcional, pero no puede repetirse." }),
      el("div", { className: "fila2" }, campo("Nombre completo", f, "nombre"), campo("Correo electrónico (opcional)", f, "email", { tipo: "email" })),
      el("div", { className: "fila2" }, campo("Institución", f, "institucion"), campo("País", f, "pais")),
      el("div", { className: "fila2" }, seleccion("Situación académica", f, "nivel", Object.entries(NIVELES)), seleccion("Estado", f, "estado", [["aprobada", "Aprobada"], ["pendiente", "Pendiente"]])),
      seleccion("¿Charla o póster?", f, "tipoPresentacion", [["", "No"], ["charla", "Charla"], ["poster", "Póster"]]),
      campo("Título (opcional)", f, "tituloCharla"), campo("Resumen (opcional)", f, "resumen", { area: true }),
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
  const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const MESES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function rangoFechasSimple(inicio, fin, en) {
    if (!inicio) return en ? "dates to be confirmed" : "fechas por confirmar";
    const p = (f) => ({ a: f.slice(0, 4), m: Number(f.slice(5, 7)), d: f.length > 7 ? Number(f.slice(8, 10)) : null });
    const i = p(inicio), f = fin ? p(fin) : i, meses = en ? MESES_EN : MESES_ES;
    if (en) return i.a === f.a && i.m === f.m && i.d && f.d ? `${meses[i.m - 1]} ${i.d}${f.d !== i.d ? "–" + f.d : ""}, ${i.a}` : i.d ? `${meses[i.m - 1]} ${i.d}, ${i.a}` : `${meses[i.m - 1]} ${i.a}`;
    return i.a === f.a && i.m === f.m && i.d && f.d ? `${f.d !== i.d ? i.d + " al " + f.d : i.d} de ${meses[i.m - 1]} de ${i.a}` : i.d ? `${i.d} de ${meses[i.m - 1]} de ${i.a}` : `${meses[i.m - 1]} de ${i.a}`;
  }
  // Fecha con la preposición correcta: «el 13 de enero…» (un día), «del 13 al 15 de enero…» (rango), «en enero de 2027» (sin día)
  function fraseFechas(inicio, fin, en) {
    const f = rangoFechasSimple(inicio, fin, en);
    if (!inicio) return en ? f : f;
    const p = (x) => ({ a: x.slice(0, 4), m: Number(x.slice(5, 7)), d: x.length > 7 ? Number(x.slice(8, 10)) : null });
    const i = p(inicio), j = fin ? p(fin) : i;
    if (!i.d) return (en ? "in " : "en ") + f;
    const rango = fin && (i.d !== j.d || i.m !== j.m || i.a !== j.a);
    return en ? (rango ? f : "on " + f) : (rango ? "del " : "el ") + f;
  }
  // Plantilla «Save the date»: asunto y cuerpo listos para la lista de Dinámica Porteña, con los datos ya cargados del evento.
  function plantillaSaveTheDate(en) {
    const nombreEv = tx(D.nombre) || tx(D.marca) || (en ? "the event" : "el evento");
    const fechas = fraseFechas(D.inicio, D.fin, en), lugar = tx(D.lugar);
    const asunto = `Save the date — ${nombreEv}`;
    const enlace = `${location.origin}/${SLUG}/${en ? "en" : ""}`;
    const cuerpo = en
      ? `Dear colleagues,\n\nWe are writing to let you know that ${nombreEv} will take place ${fechas}${lugar ? `, at ${lugar}` : ""}.\n\nSave the date. More information will be published soon on the event's website:\n\n${enlace}\n\nBest regards,\nOrganizing committee`
      : `Estimados/as:\n\nLes escribimos para contarles que ${nombreEv} se realizará ${fechas}${lugar ? `, en el ${lugar}` : ""}.\n\nGuarden la fecha. Pronto se publicará más información en el sitio del evento:\n\n${enlace}\n\nSaludos cordiales,\nComité organizador`;
    return { asunto, cuerpo };
  }
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
    const plantillaBtn = el("button", { type: "button", className: "boton sec peq", textContent: "Usar plantilla: Save the date", onclick: () => {
      if ((borrador.asunto || borrador.cuerpo) && !confirm("Esto reemplaza el asunto y el texto escritos. ¿Continuar?")) return;
      const p = plantillaSaveTheDate(idioma.value === "en");
      borrador.tipo = "lista"; tipo.value = "lista"; estados.classList.add("oculto");
      borrador.asunto = asunto.value = p.asunto; borrador.cuerpo = cuerpo.value = p.cuerpo;
      pintarTotal();
    } });
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
        el("div", { className: "acciones-seccion", style: "margin-bottom:10px" }, plantillaBtn),
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

  // ---------- Recursos: afiche (automático o archivo), banner, cabecera de correos y logos ----------
  const AFICHE_AUTO = "/api/evento/" + SLUG + "/afiche.jpg";
  const tr2 = (v) => (typeof v === "string" ? v : (v && (v.es || v.en)) || "");
  // Mismos valores por omisión que el servidor (netlify/lib/afiche-evento.mjs), para mostrarlos como sugerencia
  function plantillaPorDefecto() {
    const nombre = tr2(D.nombre).trim(), m = /^([IVXLCDM]+)\s+(.*)$/i.exec(nombre), resto = m ? m[2] : nombre, i = resto.toLowerCase().lastIndexOf(" de ");
    return { numeral: m ? m[1].toUpperCase() : "", superior: i > 0 ? resto.slice(0, i + 3) : "", titulo: i > 0 ? resto.slice(i + 4) : resto,
      lugar: [tr2(D.lugar), D.direccion].filter(Boolean).join("\n") };
  }
  // Texto sugerido para publicar en redes (Instagram, Facebook, LinkedIn…), con la imagen 4:5 del afiche
  function textoDifusion() {
    const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const f = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x || "") ? x.split("-").map(Number) : null), a = f(D.inicio), b = f(D.fin) || a;
    const fechas = !a ? "" : a[1] === b[1] && a[0] === b[0] ? `${a[2]}${b[2] !== a[2] ? " al " + b[2] : ""} de ${MES[a[1] - 1]} de ${a[0]}` : `${a[2]} de ${MES[a[1] - 1]} al ${b[2]} de ${MES[b[1] - 1]} de ${b[0]}`;
    const i = D.inscripcion || {}, url = "dinamicaportena.cl/" + SLUG;
    return [tr2(D.nombre), [fechas, tr2(D.lugar)].filter(Boolean).join(" · "), "",
      i.abierta ? (i.fechaLimite ? `Inscripciones abiertas hasta el ${f(i.fechaLimite) ? f(i.fechaLimite)[2] + " de " + MES[f(i.fechaLimite)[1] - 1] : i.fechaLimite}.` : "Inscripciones abiertas.") : "Pronto más información.",
      `Información: ${url}`, "", "#SistemasDinámicos #Matemáticas #DinámicaPorteña"].join("\n");
  }
  function difusion() {
    const area = el("textarea", { className: "alto" }); area.value = D.textoDifusion || textoDifusion();
    area.oninput = () => { D.textoDifusion = area.value; marcar(); };
    const imgRedes = D.afiche === AFICHE_AUTO ? "/api/evento/" + SLUG + "/afiche-redes.jpg" : D.afiche || "";
    const copiar = el("button", { type: "button", className: "boton sec peq", textContent: "Copiar texto", onclick: async () => { try { await navigator.clipboard.writeText(area.value); copiar.textContent = "Texto copiado"; } catch (e) { area.select(); } } });
    const compartirB = el("button", { type: "button", className: "boton peq", textContent: "Compartir (teléfono)…", onclick: async () => {
      try {
        const blob = await (await fetch(imgRedes)).blob(), f = new File([blob], "afiche.jpg", { type: blob.type || "image/jpeg" });
        if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], text: area.value });
        else aviso("aviso-panel", "info", "Este navegador no permite compartir imágenes directamente: descargue la imagen y copie el texto.");
      } catch (e) { /* cancelado */ }
    } });
    return [
      el("p", { className: "nota-ayuda", textContent: "Para publicar en Instagram, Facebook, LinkedIn o X: descargue la imagen para redes (4:5, 1080 × 1350, el formato vertical de Instagram) y copie el texto sugerido. Desde un teléfono, «Compartir» abre el menú del sistema con la imagen y el texto, y permite elegir la red. La página del evento tiene además botones para compartir el enlace." }),
      el("div", { className: "campo" }, el("label", { textContent: "Texto sugerido (editable)" }), area,
        el("div", { className: "ayuda", textContent: "Se arma con el nombre, las fechas, el lugar y la inscripción; si lo modifica, se guarda con «Guardar cambios». Para volver al texto automático, bórrelo y guarde." })),
      el("div", { className: "acciones-seccion" }, copiar,
        imgRedes ? el("a", { className: "boton sec peq", href: imgRedes, download: "afiche-redes.jpg", textContent: "Descargar imagen para redes" }) : null,
        imgRedes && navigator.share ? compartirB : null)];
  }
  function vRecursos() {
    const sucio = JSON.stringify(D) !== original;            // antes de crear valores por omisión
    const v = el("div"), A = (D.afichePlantilla = D.afichePlantilla || {}), def = plantillaPorDefecto();
    const modo = D.afiche === AFICHE_AUTO ? "auto" : D.afiche ? "archivo" : "ninguno";
    const sel = el("select", {}, el("option", { value: "auto", textContent: "Automático: se arma con la información del panel (recomendado)" }),
      el("option", { value: "archivo", textContent: "Imagen propia (subir un archivo)" }), el("option", { value: "ninguno", textContent: "Sin afiche" }));
    sel.value = modo;
    sel.onchange = () => { D.afiche = sel.value === "auto" ? AFICHE_AUTO : sel.value === "ninguno" ? "" : (D.afiche === AFICHE_AUTO ? "" : D.afiche || ""); marcar(); dibujar(); };
    const texto = (etq, key, opts = {}) => {
      const c = campo(etq, A, key, opts), ctl = c.querySelector("input,textarea");
      if (A[key] === undefined) { ctl.value = ""; ctl.placeholder = (def[key] || "").replace(/\n/g, " / ") || opts.ph || ""; }
      return c;
    };
    const incluir = (etq, key) => {                          // marcadas por omisión (vacío = incluir)
      const c = el("input", { type: "checkbox", checked: A[key] !== false });
      c.addEventListener("change", () => { A[key] = c.checked; marcar(); });
      return el("label", { className: "casilla" }, c, el("span", { textContent: etq }));
    };
    let bloqueAfiche;
    if (modo === "auto") {
      const marca = () => "?v=" + Date.now();
      const imgC = el("img", { className: "afiche-previa", alt: "Vista previa del afiche (carta)", src: AFICHE_AUTO + marca() });
      const imgR = el("img", { className: "afiche-previa redes", alt: "Vista previa del afiche (redes)", src: "/api/evento/" + SLUG + "/afiche-redes.jpg" + marca() });
      const actualizar = () => { const m = marca(); imgC.src = AFICHE_AUTO + m; imgR.src = "/api/evento/" + SLUG + "/afiche-redes.jpg" + m; };
      bloqueAfiche = el("div", {},
        el("p", { className: "nota-ayuda", textContent: "El afiche se arma solo con lo que haya en el panel: nombre, fechas y lugar, conferencistas, comités, logos de quienes apoyan, inscripción y un código QR a la página. Cada vez que se guarda un cambio (por ejemplo, un nuevo integrante o un logo), el afiche se actualiza; en la página, los correos y al compartir el enlace se usa siempre la versión vigente." }),
        el("div", { className: "fila2" }, texto("Número o edición", "numeral", { ph: "LXIV" }), texto("Línea superior", "superior", { ph: "Coloquio de" })),
        el("div", { className: "fila2" }, texto("Título (una línea por renglón)", "titulo", { area: true }), texto("Lugar (una línea por renglón)", "lugar", { area: true })),
        el("p", { className: "nota-ayuda", textContent: "Si deja un campo vacío, se usa lo que aparece en gris (tomado del nombre y el lugar del evento)." }),
        campoImagen("Imagen de fondo", A, "fondo", { ph: "/assets/…jpg o «Subir imagen…»", ayuda: "Vertical, idealmente con espacio libre arriba a la derecha para el título (como el fractal del 64coloquio). Vacío = fondo blanco." }),
        el("div", { className: "casillas-afiche" }, incluir("Conferencistas", "conferencistas"), incluir("Comités", "comites"), incluir("Logos de quienes apoyan", "logos"), incluir("Inscripción, dirección y código QR", "inscripcion")),
        el("p", { className: "nota-ayuda", textContent: "Si la información no cabe, el afiche reduce el tamaño de la letra y, como último recurso, omite primero el comité organizador y luego el científico (sobre todo en la versión para redes)." }),
        sucio ? el("div", { className: "aviso info", textContent: "Hay cambios sin guardar: la vista previa muestra la última versión guardada. Guarde y pulse «Actualizar vista previa»." }) : null,
        el("div", { className: "acciones-seccion" },
          el("button", { type: "button", className: "boton sec peq", textContent: "Actualizar vista previa", onclick: actualizar }),
          el("a", { className: "boton sec peq", href: "/api/evento/" + SLUG + "/afiche.pdf", target: "_blank", rel: "noopener", textContent: "PDF para imprimir (carta)" }),
          el("a", { className: "boton sec peq", href: AFICHE_AUTO, target: "_blank", rel: "noopener", textContent: "Imagen (JPG)" }),
          el("a", { className: "boton sec peq", href: "/api/evento/" + SLUG + "/afiche-redes.jpg", target: "_blank", rel: "noopener", textContent: "Versión para redes (4:5)" })),
        el("div", { className: "previas-afiche" }, el("figure", {}, imgC, el("figcaption", { textContent: "Carta (PDF e imagen)" })), el("figure", {}, imgR, el("figcaption", { textContent: "Redes sociales (4:5)" }))));
    } else if (modo === "archivo") {
      bloqueAfiche = campoImagen("Afiche (imagen)", D, "afiche", { ph: "https://…, /assets/…jpg o «Subir imagen…»" });
    }
    v.append(
      bloque("Afiche",
        el("p", { className: "nota-ayuda", textContent: "El afiche agrega el botón «Descargar afiche» en la página, es la imagen que aparece al compartir el enlace (WhatsApp, redes) y se adjunta en los correos a los inscritos." }),
        el("div", { className: "campo" }, el("label", { textContent: "Origen del afiche" }), sel), bloqueAfiche || null),
      bloque("Difusión en redes sociales", ...difusion()),
      bloque("Banner de la página",
        campoImagen("Imagen de portada (banner)", D, "imagenPortada", { ph: "https://…, /assets/…jpg o «Subir imagen…»", ayuda: "Fondo del encabezado de la página. Vacío = fondo liso." }),
        casilla("El banner ya incluye el nombre del evento, las fechas y el lugar escritos en la imagen", D, "bannerConTitulo"),
        el("p", { className: "nota-ayuda", textContent: "Con la casilla marcada, el banner se muestra completo y sin capa oscura, y la página no repite encima el título, las fechas y el lugar. Sin marcar, se le pone una capa oscura y el título en blanco encima." })),
      bloque("Cabecera de los correos",
        campoImagen("Imagen de cabecera", D, "cabeceraCorreo", { ph: "https://…, /assets/…jpg o «Subir imagen…»", ayuda: "Encabeza los correos del evento (lista de Dinámica Porteña, inscritos e invitaciones al panel). Conviene una versión más baja del banner (por ejemplo 1280 × 380 px). Vacío = se usa el banner." })),
      bloque("Logos de quienes apoyan",
        el("p", { className: "nota-ayuda", textContent: "Se editan en la pestaña «Organización»; aparecen en la página y en el afiche." }),
        el("div", { className: "logos-recursos" }, ...((D.auspiciantes || []).filter((a) => a && a.nombre).map((a) => el("figure", {},
          a.logo ? el("img", { src: a.logo, alt: a.nombre }) : el("div", { className: "sin-logo", textContent: "Sin logo" }), el("figcaption", { textContent: a.nombre })))))));
    return v;
  }

  const VISTAS = { recursos: vRecursos, general: vGeneral, conferencistas: vConferencistas, programa: vPrograma, info: vInfo, organizacion: vOrganizacion, inscripciones: vInscripciones, correos: vCorreos, admins: vAdmins };
  async function dibujarVista() {
    if (vista === "admins" && !esResp()) vista = "general"; document.querySelectorAll(".pestana").forEach((p) => p.classList.toggle("activa", p.dataset.vista === vista)); $("vista").replaceChildren(await VISTAS[vista]()); }
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
    if (D) {
      const cfg = D.secciones || {}, ocultas = SECCIONES.filter(([id]) => (cfg[id] || {}).visible === false);
      if (ocultas.length) c.append(el("div", { className: "aviso info", style: "flex-basis:100%;margin-top:8px" },
        el("strong", { textContent: `${ocultas.length} de ${SECCIONES.length} secciones ocultas: ` }),
        document.createTextNode(ocultas.map(([, n]) => n).join(", ") + ". Revise «Secciones de la página» en General antes de publicar.")));
    }
  }

  // ---------- acceso ----------
  function rotular() { const t = tx(D.marca) || tx(D.nombre); if (t) { document.querySelector(".group-name").textContent = t; document.title = "Panel — " + t; } document.querySelectorAll(".ver-sitio").forEach((a) => { a.href = "/" + SLUG + "/"; }); }
  // Pestaña «Recursos» (afiche, banner, cabecera de correos y logos), antes de «Correos»
  (() => {
    const c = document.querySelector('.pestana[data-vista="correos"]');
    if (!c || document.querySelector('.pestana[data-vista="recursos"]')) return;
    const b = el("button", { className: "pestana", textContent: "Recursos" }); b.dataset.vista = "recursos"; c.before(b);
  })();
  // La pestaña Administradores solo la ven el responsable del evento y los administradores centrales
  function pestanasSegunRol() {
    const t = document.querySelector('.pestana[data-vista="admins"]'); if (t) t.hidden = !esResp();
    if (vista === "admins" && !esResp()) vista = "general";
  }
  async function iniciar(quien) {
    YO = quien; pestanasSegunRol(); $("acceso").classList.add("oculto"); $("panel").classList.remove("oculto");
    $("usuario").textContent = `${quien.email} · ${ROLES[quien.rol] || quien.rol}`;
    try { const r = await DP.api(API + "/contenido"); D = r.contenido || {}; VERSION = r.actualizado; YO.estado = r.estado; YO.enSitio = r.enSitio; }
    catch (e) { if (e.estado === 401) return location.reload(); aviso("aviso-panel", "error", e.message); D = {}; }
    original = JSON.stringify(D); marcar(); pintarEstado(); await dibujar();
    original = JSON.stringify(D); marcar(); cargarInscripciones(); rotular();   // los valores por omisión que crean las vistas no cuentan como cambios
  }
  async function mostrarAcceso() {
    $("acceso").classList.remove("oculto");
    formularioEnlace();
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
  // Alternativa a Google: enlace de acceso enviado al correo con que la persona fue invitada (válido 30 min, un solo uso)
  function formularioEnlace() {
    if ($("acceso-enlace")) return;
    const intro = document.querySelector("#acceso .tarjeta p");
    if (intro) intro.textContent = "Ingrese con la cuenta de Google asociada al correo con que fue invitado/a a administrar este evento, o pida un enlace de acceso a ese correo.";
    const correoIn = el("input", { type: "email", placeholder: "su correo", autocomplete: "email", style: "flex:1;min-width:0" });
    const msg = el("p", { className: "nota-ayuda", style: "margin:8px 0 0" });
    const btn = el("button", { type: "button", className: "boton sec", textContent: "Enviarme un enlace" });
    const recordar = el("input", { type: "checkbox", checked: false, style: "width:auto;margin:0 6px 0 0" });
    btn.onclick = async () => {
      const email = correoIn.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = "Escriba un correo válido."; return; }
      btn.disabled = true;
      try {
        await DP.api("/api/evauth/enlace", { method: "POST", body: { email, slug: SLUG, idioma: (navigator.language || "es").startsWith("en") ? "en" : "es", recordar: recordar.checked } });
        msg.textContent = `Si ${email} está autorizado para administrar este evento, en unos minutos recibirá un correo con un enlace de acceso (válido por 30 minutos). Revise también la carpeta de spam.`;
      } catch (e) { msg.textContent = e.message; }
      setTimeout(() => { btn.disabled = false; }, 60000);
    };
    correoIn.addEventListener("keydown", (e) => { if (e.key === "Enter") btn.click(); });
    $("boton-google").after(el("div", { id: "acceso-enlace", style: "margin-top:22px;padding-top:16px;border-top:1px solid var(--borde);text-align:left" },
      el("p", { style: "margin:0 0 8px;font-size:14.5px", textContent: "¿Su correo no es de Google? Reciba un enlace de acceso:" }),
      el("div", { style: "display:flex;gap:8px;flex-wrap:wrap" }, correoIn, btn),
      el("label", { style: "display:flex;align-items:center;margin:10px 0 0;font-size:13.5px;color:var(--texto-suave);cursor:pointer" }, recordar,
        "Recordar este equipo por 30 días (no lo marque en un computador compartido)"), msg));
  }

  $("pestanas").addEventListener("click", (e) => { const b = e.target.closest(".pestana"); if (!b) return; vista = b.dataset.vista; aviso("aviso-panel", "", ""); dibujar(); });
  $("guardar").onclick = () => guardar();
  $("descartar").onclick = async () => { if (!confirm("¿Descartar los cambios sin guardar?")) return; try { const r = await DP.api(API + "/contenido"); D = r.contenido || D; VERSION = r.actualizado; original = JSON.stringify(D); marcar(); dibujar(); } catch (e) { aviso("aviso-panel", "error", e.message); } };
  $("salir").onclick = async () => { try { await DP.api("/api/evauth/logout", { method: "POST", body: {} }); } catch (e) {} if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); location.reload(); };
  (async () => {
    // Entrada con un enlace de acceso (?acceso=…): se canjea una sola vez y se quita de la dirección
    const token = new URLSearchParams(location.search).get("acceso");
    if (token) {
      history.replaceState(null, "", location.pathname + location.hash);
      try { return iniciar(await DP.api("/api/evauth/acceso", { method: "POST", body: { token, slug: SLUG } })); }
      catch (e) { $("acceso").classList.remove("oculto"); aviso("aviso-acceso", "error", e.message); formularioEnlace(); return mostrarAcceso(); }
    }
    try { iniciar(await DP.api("/api/evauth/me?slug=" + encodeURIComponent(SLUG))); }
    catch (e) { if (e.estado === 403 || e.estado === 404) { $("acceso").classList.remove("oculto"); aviso("aviso-acceso", "error", e.message); } await mostrarAcceso(); }
  })();
})();
