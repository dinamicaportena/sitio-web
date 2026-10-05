// Sección «Personas» del panel: registro único con historial de instituciones, roles, charlas y suscripción;
// alta de suscriptores, fusión de duplicados, catálogo de instituciones y Excel (descarga e importación).
(function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...hijos) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...hijos.filter((h) => h !== null && h !== undefined)); return e; };
  const aviso = (cont, tipo, m) => { const c = $(cont); c.innerHTML = ""; if (m) c.appendChild(el("div", { className: "aviso " + tipo, textContent: m })); };
  const fechaCorta = (f) => (f ? DP.fechaLarga(f).replace(/^\S+ /, "") : "");
  const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const XLSX_CDN = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  const ROLES = ["Director", "Co-director", "Investigador", "Colaborador nacional", "Colaborador internacional", "Postdoctorado", "Estudiante de magíster",
    "Estudiante de doctorado", "Graduado de magíster", "Graduado de doctorado", "Estudiante o graduado (por precisar)"];
  const ESTADOS = ["Vigente", "Finalizado", "Retiro voluntario", "Por confirmar"];
  const SUS = { activo: "Suscrito/a", baja: "Dado/a de baja", sin: "Sin suscripción" };
  const EVENTO = { alta: "Alta", baja: "Baja", reactivacion: "Reactivación" };

  let personas = [], instituciones = [], ficha = null, sucio = false, fotoNueva;

  function errorSesion(e, cont) {
    if (e.estado === 401) { location.reload(); return; }
    aviso(cont, "error", e.message);
  }
  function cargarScript(src) {
    return new Promise((ok, mal) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => mal(new Error("No se pudo cargar el lector de Excel.")); document.head.appendChild(s); });
  }
  const xlsx = async () => { if (!window.XLSX) await cargarScript(XLSX_CDN); return window.XLSX; };

  // ---------- Lista ----------
  async function cargar() {
    try { [personas, instituciones] = await Promise.all([DP.api("/api/admin/personas"), DP.api("/api/admin/instituciones")]); dibujar(); }
    catch (e) { errorSesion(e, "aviso-panel"); }
  }
  document.addEventListener("abrir-personas", cargar);

  const sinTildes = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const FILTROS = {
    investigador: (p) => p.investigador, postdoc: (p) => p.postdoc, colaborador: (p) => p.colaborador === "Sí", "colaborador-antes": (p) => p.colaborador === "Antes",
    estudiante: (p) => p.estudiante, graduado: (p) => p.graduado, expositor: (p) => p.charlas > 0, activo: (p) => p.suscripcion === "activo",
    baja: (p) => p.suscripcion === "baja", "sin-correo": (p) => !p.correo, pendientes: (p) => p.pendientes, publicar: (p) => p.publicar,
    solicitudes: (p) => p.solicitudes > 0, "sin-respuesta": (p) => p.enlacePendiente,
  };
  let filasActuales = [];
  function dibujar() {
    const q = sinTildes($("p-buscar").value.trim()), f = FILTROS[$("p-filtro").value];
    const filas = personas.filter((p) => (!f || f(p)) && (!q || sinTildes([p.nombre, p.correo, p.institucion, p.id].join(" ")).includes(q)));
    filasActuales = filas;
    const activos = personas.filter((p) => p.suscripcion === "activo").length;
    $("p-cuenta").textContent = `${filas.length} de ${personas.length} personas · ${activos} suscritas a los correos`;
    const tb = $("p-tabla").querySelector("tbody"); tb.innerHTML = "";
    if (!filas.length) tb.appendChild(el("tr", {}, el("td", { colSpan: 6, className: "vacio", textContent: personas.length ? "Sin resultados." : "Aún no hay personas en el registro: importe el Excel del registro o agregue personas." })));
    for (const p of filas.slice(0, 500)) {
      const roles = el("td");
      p.roles.forEach((r) => roles.appendChild(el("span", { className: "chip", textContent: r })));
      if (p.colaborador === "Antes") roles.appendChild(el("span", { className: "chip antes", textContent: "Excolaborador/a" }));
      if (p.estudiante === "Por confirmar") roles.appendChild(el("span", { className: "chip confirmar", textContent: "Estudiante o graduado (por precisar)" }));
      if (p.graduado && !p.roles.some((r) => r.startsWith("Graduado"))) roles.appendChild(el("span", { className: "chip antes", textContent: "Graduado/a" }));
      if (p.solicitudes) roles.appendChild(el("span", { className: "chip alerta", textContent: `${p.solicitudes} solicitud(es) por revisar` }));
      if (p.enlacePendiente) roles.appendChild(el("span", { className: "chip confirmar", textContent: "Enlace de datos enviado" }));
      const ver = el("button", { type: "button", className: "boton sec peq", textContent: "Ver ficha" }); ver.onclick = () => abrirFicha(p.id);
      tb.appendChild(el("tr", {},
        el("td", {}, el("b", { textContent: p.nombre || "(sin nombre)" }), el("span", { className: "sub", textContent: [p.id, p.correo].filter(Boolean).join(" · ") })),
        el("td", {}, p.institucion, el("span", { className: "sub", textContent: p.pais })),
        roles,
        el("td", { textContent: p.charlas ? `${p.charlas} (última: ${p.ultimaCharla.slice(0, 4)})` : "" }),
        el("td", {}, el("span", { className: "sus " + p.suscripcion, textContent: SUS[p.suscripcion] })),
        el("td", {}, ver)));
    }
    if (filas.length > 500) tb.appendChild(el("tr", {}, el("td", { colSpan: 6, className: "vacio", textContent: `Se muestran 500 de ${filas.length}; afine la búsqueda.` })));
  }
  $("p-buscar").addEventListener("input", dibujar);
  $("p-filtro").addEventListener("change", dibujar);

  // ---------- Ficha ----------
  const opcionesInst = (sel, valor) => {
    sel.innerHTML = ""; sel.appendChild(el("option", { value: "", textContent: "— elija —" }));
    [...instituciones].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).forEach((i) =>
      sel.appendChild(el("option", { value: i.id, textContent: `${i.nombre}${i.sigla ? " (" + i.sigla + ")" : ""} — ${i.pais}`, selected: i.id === valor })));
  };
  const nombreInst = (id) => instituciones.find((i) => i.id === id)?.nombre || id;

  async function abrirFicha(id) {
    aviso("aviso-ficha", "", ""); sucio = false; fotoNueva = undefined; $("pf-cambio").classList.add("oculto");
    try {
      if (!instituciones.length) instituciones = await DP.api("/api/admin/instituciones");
      ficha = id ? await DP.api("/api/admin/personas/" + id)
                 : { id: null, nombre: "", variantes: [], correos: [], afiliaciones: [], roles: [], suscripcion: [], historial: [], charlas: [], publicar: false, fotoAutorizada: false };
    } catch (e) { return errorSesion(e, "aviso-panel"); }
    $("ficha-titulo").textContent = id ? `${ficha.nombre || "(sin nombre)"} · ${ficha.id}` : "Nueva persona";
    $("pf-nombre").value = ficha.nombre || ""; $("pf-variantes").value = (ficha.variantes || []).join("; ");
    $("pf-orcid").value = ficha.orcid || ""; $("pf-zbmath").value = ficha.zbmath || "";
    $("pf-publicar").checked = Boolean(ficha.publicar); $("pf-foto-autorizada").checked = Boolean(ficha.fotoAutorizada);
    $("pf-pendientes").value = ficha.pendientes || ""; $("pf-notas").value = ficha.notas || "";
    $("pf-foto-archivo").value = ficha.fotoArchivo || ""; $("pf-fuentes").value = ficha.fuentes || "";
    $("pf-enlace-texto").classList.add("oculto"); $("pf-enlace-texto").value = "";
    $("pf-enlaces").value = (ficha.enlaces || []).map((x) => `${x.texto} | ${x.url}`).join("\n");
    $("pf-foto-img").src = ficha.fotoUrl || ""; $("pf-foto-img").classList.toggle("oculto", !ficha.fotoUrl); $("pf-foto-quitar").classList.toggle("oculto", !ficha.fotoUrl);
    $("pf-foto").value = "";
    ["pf-eliminar", "pf-fusionar"].forEach((b) => $(b).classList.toggle("oculto", !id));
    dibujarCorreos(); dibujarAfiliaciones(); dibujarRoles(); dibujarSuscripcion(); dibujarEnlace(); dibujarSolicitudes(); dibujarCharlas(); dibujarHistorial();
    $("ficha").showModal();
  }
  $("p-nueva").addEventListener("click", () => abrirFicha(null));
  const marcar = (ev) => { if (!ev.target.closest("#pf-sus-acciones, #pf-enlace-acciones")) sucio = true; };    // la suscripción se guarda aparte
  $("form-ficha").addEventListener("input", marcar);
  $("form-ficha").addEventListener("change", marcar);
  $("ficha").addEventListener("cancel", (ev) => { if (sucio && !confirm("Hay cambios sin guardar. ¿Cerrar de todos modos?")) ev.preventDefault(); });
  $("ficha").querySelectorAll("[data-cerrar]").forEach((b) => b.addEventListener("click", (ev) => {
    if (sucio && !confirm("Hay cambios sin guardar. ¿Cerrar de todos modos?")) ev.stopImmediatePropagation();
  }, true));

  // correos
  function dibujarCorreos() {
    const c = $("pf-correos"); c.innerHTML = "";
    if (!ficha.correos.length) { c.appendChild(el("p", { className: "vacio", textContent: "Sin correos registrados." })); return; }
    const t = el("table", { className: "mini-tabla" }, el("tr", {}, el("th", { textContent: "Correo" }), el("th", { textContent: "Principal" }), el("th")));
    ficha.correos.forEach((co, k) => {
      const inp = el("input", { type: "email", value: co.email, maxLength: 200 }); inp.oninput = () => (co.email = inp.value.trim().toLowerCase());
      const rad = el("input", { type: "radio", name: "pf-principal", checked: co.principal }); rad.onchange = () => ficha.correos.forEach((x, j) => (x.principal = j === k));
      const q = el("button", { type: "button", className: "quitar", title: "Quitar correo", textContent: "×" });
      q.onclick = () => { if (!confirm(`¿Quitar ${co.email}? La historia de su suscripción se conserva.`)) return; ficha.correos.splice(k, 1);
        if (ficha.correos.length && !ficha.correos.some((x) => x.principal)) ficha.correos[0].principal = true; sucio = true; dibujarCorreos(); };
      t.appendChild(el("tr", {}, el("td", {}, inp), el("td", { style: "width:80px;text-align:center" }, rad), el("td", { style: "width:30px" }, q)));
    });
    c.appendChild(t);
  }
  $("pf-agregar-correo").addEventListener("click", () => { ficha.correos.push({ email: "", principal: !ficha.correos.length }); sucio = true; dibujarCorreos();
    const ins = $("pf-correos").querySelectorAll("input[type=email]"); ins[ins.length - 1].focus(); });

  // afiliaciones
  function dibujarAfiliaciones() {
    const c = $("pf-afiliaciones"); c.innerHTML = "";
    if (!ficha.afiliaciones.length) { c.appendChild(el("p", { className: "vacio", textContent: "Sin instituciones registradas." })); return; }
    const t = el("table", { className: "mini-tabla" }, el("tr", {}, ...["Institución", "Unidad / programa", "Desde", "Hasta", "Vigente", "Fuente", ""].map((h) => el("th", { textContent: h }))));
    ficha.afiliaciones.forEach((a, k) => {
      const sel = el("select"); opcionesInst(sel, a.inst); sel.onchange = () => (a.inst = sel.value);
      const campo = (prop, tipo = "text", ph = "") => { const i = el("input", { type: tipo, value: a[prop] || "", placeholder: ph }); i.oninput = () => (a[prop] = i.value); return i; };
      const vig = el("input", { type: "radio", name: "pf-vigente", checked: a.vigente });
      vig.onchange = () => { ficha.afiliaciones.forEach((x, j) => (x.vigente = j === k)); dibujarAfiliaciones(); sucio = true; };
      const q = el("button", { type: "button", className: "quitar", title: "Quitar (solo para corregir errores de ingreso)", textContent: "×" });
      q.onclick = () => { if (!confirm("¿Quitar esta fila? Hágalo solo para corregir un error de ingreso: un cambio de institución se registra con «Cambió de institución…».")) return;
        ficha.afiliaciones.splice(k, 1); sucio = true; dibujarAfiliaciones(); };
      const evid = a.primera ? `Charlas: ${a.primera.slice(0, 4)}${a.ultima && a.ultima.slice(0, 4) !== a.primera.slice(0, 4) ? "–" + a.ultima.slice(0, 4) : ""}` : "";
      const fuente = el("td", { style: "font-size:12px;color:var(--texto-suave);max-width:180px", textContent: [evid, a.fuente].filter(Boolean).join(" · ") });
      t.appendChild(el("tr", { className: a.vigente ? "" : "cerrada" }, el("td", { style: "min-width:220px" }, sel), el("td", {}, campo("unidad")),
        el("td", {}, campo("desde", "date")), el("td", {}, campo("hasta", "date")), el("td", { style: "text-align:center" }, vig), fuente, el("td", {}, q)));
    });
    c.appendChild(t);
  }
  $("pf-agregar-afil").addEventListener("click", () => { ficha.afiliaciones.push({ inst: "", unidad: "", desde: "", hasta: "", vigente: !ficha.afiliaciones.some((a) => a.vigente), fuente: "Panel" });
    sucio = true; dibujarAfiliaciones(); });
  $("pf-cambiar-inst").addEventListener("click", () => { opcionesInst($("pc-inst"), ""); $("pc-fecha").value = hoy(); $("pc-unidad").value = ""; $("pf-cambio").classList.remove("oculto"); $("pc-inst").focus(); });
  $("pc-cancelar").addEventListener("click", () => $("pf-cambio").classList.add("oculto"));
  $("pc-aplicar").addEventListener("click", () => {
    const inst = $("pc-inst").value, f = $("pc-fecha").value;
    if (!inst) return alert("Elija la nueva institución (si no está en la lista, agréguela en «Instituciones»).");
    ficha.afiliaciones.forEach((a) => { if (a.vigente) { a.vigente = false; a.hasta = a.hasta || f; } });
    ficha.afiliaciones.push({ inst, unidad: $("pc-unidad").value.trim(), desde: f, hasta: "", vigente: true, fuente: "Panel" });
    $("pf-cambio").classList.add("oculto"); sucio = true; dibujarAfiliaciones();
  });

  // roles
  function dibujarRoles() {
    const c = $("pf-roles"); c.innerHTML = "";
    if (!ficha.roles.length) { c.appendChild(el("p", { className: "vacio", textContent: "Sin roles registrados (por ejemplo, un expositor o un suscriptor)." })); return; }
    const t = el("table", { className: "mini-tabla" }, el("tr", {}, ...["Rol", "Detalle", "Director/a de tesis", "Desde", "Hasta", "Estado", "Motivo o nota", ""].map((h) => el("th", { textContent: h }))));
    ficha.roles.forEach((r, k) => {
      const sel = (opciones, prop) => { const s = el("select"); opciones.forEach((o) => s.appendChild(el("option", { value: o, textContent: o, selected: r[prop] === o })));
        s.onchange = () => { r[prop] = s.value; if (prop === "estado" && s.value !== "Vigente" && s.value !== "Por confirmar" && !r.hasta) { r.hasta = hoy(); dibujarRoles(); } }; return s; };
      const campo = (prop, tipo = "text") => { const i = el("input", { type: tipo, value: r[prop] || "" }); i.oninput = () => (r[prop] = i.value); return i; };
      const q = el("button", { type: "button", className: "quitar", title: "Quitar (solo para corregir errores de ingreso)", textContent: "×" });
      q.onclick = () => { if (!confirm("¿Quitar este rol? Hágalo solo para corregir un error: si la persona dejó el rol, cambie el estado a «Finalizado» o «Retiro voluntario».")) return;
        ficha.roles.splice(k, 1); sucio = true; dibujarRoles(); };
      t.appendChild(el("tr", { className: r.estado === "Vigente" || r.estado === "Por confirmar" ? "" : "cerrada" },
        el("td", { style: "min-width:170px" }, sel(ROLES, "rol")), el("td", {}, campo("detalle")), el("td", {}, campo("directorTesis")),
        el("td", {}, campo("desde", "date")), el("td", {}, campo("hasta", "date")), el("td", { style: "min-width:130px" }, sel(ESTADOS, "estado")),
        el("td", {}, campo("nota")), el("td", {}, q)));
    });
    c.appendChild(t);
  }
  $("pf-agregar-rol").addEventListener("click", () => { ficha.roles.push({ rol: "Colaborador nacional", detalle: "", directorTesis: "", desde: hoy(), hasta: "", estado: "Vigente", nota: "", fuente: "Panel" });
    sucio = true; dibujarRoles(); });

  // suscripción (cada acción se guarda de inmediato y queda en el historial)
  function dibujarSuscripcion() {
    const est = ficha.id ? ficha.estadoSuscripcion : "sin";
    $("pf-sus-estado").innerHTML = ""; $("pf-sus-estado").append(el("span", { className: "sus " + est, textContent: SUS[est] }));
    const acc = $("pf-sus-acciones"); acc.innerHTML = "";
    if (ficha.id) {
      const accion = { sin: ["alta", "Suscribir"], activo: ["baja", "Dar de baja"], baja: ["reactivacion", "Reactivar (solo si lo pidió)"] }[est];
      const origen = el("input", { type: "text", placeholder: est === "activo" ? "Motivo (p. ej. pidió la baja por correo)" : "Origen y consentimiento (p. ej. pidió suscribirse por correo)", maxLength: 300, style: "flex:1;min-width:240px" });
      const b = el("button", { type: "button", className: est === "activo" ? "boton peligro" : "boton sec peq", textContent: accion[1] });
      b.onclick = () => eventoSuscripcion(accion[0], origen.value.trim());
      acc.append(el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;align-items:center" }, origen, b));
    } else acc.appendChild(el("p", { className: "vacio", textContent: "Guarde la ficha para poder suscribirla." }));
    const h = $("pf-sus-historial"); h.innerHTML = "";
    const ev = [...(ficha.suscripcion || [])].sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (!ev.length) return;
    const t = el("table", { className: "mini-tabla" }, el("tr", {}, ...["Fecha", "Evento", "Correo", "Origen", "Nota"].map((x) => el("th", { textContent: x }))));
    ev.forEach((e) => t.appendChild(el("tr", {}, el("td", { textContent: fechaCorta(e.fecha) }), el("td", { textContent: EVENTO[e.evento] }), el("td", { textContent: e.email }),
      el("td", { textContent: e.origen }), el("td", { textContent: e.nota }))));
    h.appendChild(t);
  }
  async function eventoSuscripcion(evento, texto) {
    if (sucio) return aviso("aviso-ficha", "error", "Guarde primero los cambios de la ficha.");
    if (evento === "reactivacion" && !confirm("¿Reactivar la suscripción? Hágalo solo si la persona lo solicitó expresamente.")) return;
    try {
      const cuerpo = evento === "baja" ? { evento, origen: "Panel", nota: texto } : { evento, origen: texto || "Panel", nota: "" };
      await DP.api(`/api/admin/personas/${ficha.id}/suscripcion`, { method: "POST", body: cuerpo });
      await abrirFicha(ficha.id); aviso("aviso-ficha", "ok", "Suscripción actualizada."); cargarSilencioso();
    } catch (e) { errorSesion(e, "aviso-ficha"); }
  }

  // enlace para que la persona actualice sus datos (cada acción se guarda de inmediato)
  function dibujarEnlace() {
    const e = ficha.enlaceDatos, est = $("pf-enlace-estado"); est.textContent = "";
    $("pf-enlace-acciones").classList.toggle("oculto", !ficha.id);
    if (!ficha.id) { est.textContent = "Guarde la ficha para poder generar el enlace."; return; }
    if (!e) est.textContent = "Aún no se ha generado un enlace.";
    else if (e.usado) est.textContent = `La persona actualizó sus datos el ${fechaCorta(e.usado)}${e.enviadoA ? " (enlace enviado a " + e.enviadoA + ")" : ""}.`;
    else if (e.activo) est.textContent = `Enlace vigente hasta el ${fechaCorta(e.expira)}${e.enviadoA ? `, enviado a ${e.enviadoA} el ${fechaCorta(e.enviadoEl)}` : " (generado para copiar)"}; aún sin respuesta.`;
    else est.textContent = e.anulado ? `El último enlace fue anulado el ${fechaCorta(e.anulado)}.` : `El último enlace venció el ${fechaCorta(e.expira)} sin respuesta.`;
    $("pf-enlace-anular").classList.toggle("oculto", !e?.activo);
    $("pf-enlace-enviar").disabled = !ficha.correos.length;
    $("pf-enlace-enviar").title = ficha.correos.length ? "" : "La persona no tiene correo";
  }
  async function accionEnlace(cuerpo, confirmar) {
    if (sucio) return aviso("aviso-ficha", "error", "Guarde primero los cambios de la ficha.");
    if (confirmar && !confirm(confirmar)) return;
    try {
      const r = await DP.api(`/api/admin/personas/${ficha.id}/enlace`, { method: "POST", body: { ...cuerpo, idioma: $("pf-enlace-idioma").value } });
      await abrirFicha(ficha.id);
      if (cuerpo.anular) aviso("aviso-ficha", "ok", "Enlace anulado.");
      else if (cuerpo.enviar) aviso("aviso-ficha", "ok", `Enlace enviado a ${r.enviadoA}. Vence el ${fechaCorta(r.expira)}.`);
      else { $("pf-enlace-texto").value = `Asunto: ${r.mensaje.asunto}\n\n${r.mensaje.texto}`; $("pf-enlace-texto").classList.remove("oculto");
             $("pf-enlace-texto").select(); aviso("aviso-ficha", "ok", "Enlace generado: copie el texto de abajo y envíelo usted. Sirve una sola vez y vence en 30 días."); }
      cargarSilencioso();
    } catch (e) { errorSesion(e, "aviso-ficha"); }
  }
  $("pf-enlace-enviar").addEventListener("click", () => accionEnlace({ enviar: true }, ficha.enlaceDatos?.activo ? "Ya hay un enlace vigente: se anulará y se enviará uno nuevo. ¿Continuar?" : null));
  $("pf-enlace-copiar").addEventListener("click", () => accionEnlace({}, ficha.enlaceDatos?.activo ? "Ya hay un enlace vigente: se anulará y se generará uno nuevo. ¿Continuar?" : null));
  $("pf-enlace-anular").addEventListener("click", () => accionEnlace({ anular: true }, "¿Anular el enlace vigente? La persona ya no podrá usarlo."));

  function dibujarSolicitudes() {
    const xs = [...(ficha.solicitudes || [])].reverse(), c = $("pf-solicitudes"); c.innerHTML = "";
    $("pf-solicitudes-bloque").classList.toggle("oculto", !xs.length);
    if (!xs.length) return;
    const t = el("table", { className: "mini-tabla" }, el("tr", {}, ...["Fecha", "Tipo", "Solicitud", "Estado", ""].map((x) => el("th", { textContent: x }))));
    xs.forEach((x) => {
      const acc = el("td", { style: "white-space:nowrap" });
      if (x.estado === "pendiente") {
        const ok = el("button", { type: "button", className: "boton sec peq", textContent: "Resuelta" }); ok.onclick = () => cerrarSolicitud(x, "resuelta");
        const no = el("button", { type: "button", className: "boton peligro", textContent: "Descartar" }); no.onclick = () => cerrarSolicitud(x, "descartada");
        acc.append(ok, " ", no);
      }
      t.appendChild(el("tr", { className: x.estado === "pendiente" ? "" : "cerrada" }, el("td", { textContent: fechaCorta(x.el) }), el("td", { textContent: x.tipo }),
        el("td", { textContent: x.texto }), el("td", { textContent: x.estado === "pendiente" ? "Pendiente" : `${x.estado[0].toUpperCase() + x.estado.slice(1)} (${fechaCorta(x.cerradaEl)})` }), acc));
    });
    c.appendChild(t);
    c.appendChild(el("p", { className: "vacio", textContent: "Aplique lo que corresponda en la ficha (por ejemplo, agregue la institución en «Instituciones» y registre el cambio) y luego marque la solicitud como resuelta." }));
  }
  async function cerrarSolicitud(x, estado) {
    if (sucio) return aviso("aviso-ficha", "error", "Guarde primero los cambios de la ficha.");
    try { await DP.api(`/api/admin/personas/${ficha.id}/solicitud`, { method: "POST", body: { id: x.id, estado } });
          await abrirFicha(ficha.id); aviso("aviso-ficha", "ok", `Solicitud marcada como ${estado}.`); cargarSilencioso(); }
    catch (e) { errorSesion(e, "aviso-ficha"); }
  }

  // ---------- Envío masivo de enlaces ----------
  $("p-enlaces").addEventListener("click", () => {
    aviso("aviso-masivo", "", "");
    const con = filasActuales.filter((p) => p.correo), sin = filasActuales.filter((p) => !p.correo);
    $("em-resumen").textContent = `Lista actual: ${filasActuales.length} persona(s) · ${con.length} con correo recibirán su enlace` + (sin.length ? ` · ${sin.length} sin correo (no se les puede enviar).` : ".");
    $("em-sin-correo").textContent = sin.length ? "Sin correo: " + sin.slice(0, 30).map((p) => p.nombre || p.id).join(", ") + (sin.length > 30 ? "…" : "") : "";
    $("em-enviar").disabled = !con.length;
    $("enlaces-masivo").showModal();
  });
  $("em-enviar").addEventListener("click", async () => {
    const con = filasActuales.filter((p) => p.correo);
    if (!confirm(`¿Enviar ${con.length} correo(s), cada uno con un enlace personal? Los enlaces vigentes anteriores de esas personas se anularán.`)) return;
    $("em-enviar").disabled = true;
    try {
      const r = await DP.api("/api/admin/personas/enlaces", { method: "POST", body: { ids: con.map((p) => p.id), idioma: $("em-idioma").value } });
      aviso("aviso-masivo", "ok", `${r.encolados} enlace(s) en cola de envío. Puede seguir el avance en la pestaña «Envíos».`); cargarSilencioso();
    } catch (e) { errorSesion(e, "aviso-masivo"); $("em-enviar").disabled = false; }
  });

  function dibujarCharlas() {
    const c = $("pf-charlas"); c.innerHTML = "";
    if (!ficha.charlas?.length) { c.appendChild(el("p", { className: "vacio", textContent: "Sin charlas registradas." })); return; }
    const t = el("table", { className: "mini-tabla" }, el("tr", {}, ...["Fecha", "Título", "Institución declarada", "Serie"].map((x) => el("th", { textContent: x }))));
    ficha.charlas.forEach((ch) => t.appendChild(el("tr", {}, el("td", { style: "white-space:nowrap", textContent: ch.fecha + (ch.cancelada ? " (cancelada)" : "") }),
      el("td", { textContent: ch.titulo }), el("td", { textContent: ch.institucion }), el("td", { textContent: ch.serie === "Dinámica Junior" ? "Dinámica Junior" : "Seminario" }))));
    c.appendChild(t);
  }
  function dibujarHistorial() {
    const c = $("pf-historial"); c.innerHTML = "";
    const h = [...(ficha.historial || [])].reverse();
    if (!h.length) { c.appendChild(el("p", { className: "vacio", textContent: "Sin cambios registrados." })); return; }
    const conNombres = (t) => String(t || "—").replace(/\bI\d{3,}\b/g, (id) => nombreInst(id));
    c.appendChild(el("ul", {}, ...h.map((x) => el("li", {},
      `${fechaCorta(x.el)} ${x.el.slice(11, 16)} — ${x.cambio}${x.por ? " (" + x.por + ")" : ""}`,
      (x.cambios || []).length ? el("ul", { className: "cambios" }, ...x.cambios.map((d) => el("li", {}, el("b", { textContent: d.etiqueta + ": " }),
        el("span", { className: "antes", textContent: conNombres(d.antes) }), " → ", el("span", { className: "despues", textContent: conNombres(d.despues) })))) : null))));
  }

  // foto
  $("pf-foto").addEventListener("change", async (ev) => {
    const a = ev.target.files[0]; if (!a) return;
    try { fotoNueva = await DP.reducirImagen(a); $("pf-foto-img").src = fotoNueva; $("pf-foto-img").classList.remove("oculto"); $("pf-foto-quitar").classList.remove("oculto");
          if (!$("pf-foto-autorizada").checked) aviso("aviso-ficha", "info", "Recuerde marcar «La persona autorizó publicar su foto» si corresponde."); }
    catch (e) { aviso("aviso-ficha", "error", e.message); }
  });
  $("pf-foto-quitar").addEventListener("click", () => { fotoNueva = null; sucio = true; $("pf-foto-img").classList.add("oculto"); $("pf-foto-quitar").classList.add("oculto"); });

  // guardar
  $("form-ficha").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const cuerpo = {
      nombre: $("pf-nombre").value.trim(), variantes: $("pf-variantes").value.split(";").map((x) => x.trim()).filter(Boolean),
      correos: ficha.correos.filter((c) => c.email), afiliaciones: ficha.afiliaciones, roles: ficha.roles,
      publicar: $("pf-publicar").checked, fotoAutorizada: $("pf-foto-autorizada").checked, orcid: $("pf-orcid").value.trim(), zbmath: $("pf-zbmath").value.trim(),
      pendientes: $("pf-pendientes").value.trim(), notas: $("pf-notas").value.trim(), fotoArchivo: $("pf-foto-archivo").value.trim(),
      fuentes: $("pf-fuentes").value.trim(),
      enlaces: $("pf-enlaces").value.split("\n").map((x) => x.trim()).filter(Boolean).map((t) => { const [a, b] = t.split("|").map((x) => x.trim()); return b ? { texto: a, url: b } : { texto: "Enlace", url: a }; }),
    };
    if (cuerpo.afiliaciones.some((a) => !a.inst)) return aviso("aviso-ficha", "error", "Elija la institución en cada fila de «Instituciones» (o quite la fila vacía).");
    if (fotoNueva !== undefined) cuerpo.foto = fotoNueva;
    $("pf-guardar").disabled = true;
    try {
      const r = ficha.id ? await DP.api("/api/admin/personas/" + ficha.id, { method: "PUT", body: cuerpo }) : await DP.api("/api/admin/personas", { method: "POST", body: cuerpo });
      sucio = false; await abrirFicha(r.id); aviso("aviso-ficha", "ok", "Ficha guardada."); cargarSilencioso();
    } catch (e) { errorSesion(e, "aviso-ficha"); }
    finally { $("pf-guardar").disabled = false; }
  });
  async function cargarSilencioso() { try { personas = await DP.api("/api/admin/personas"); dibujar(); } catch (e) {} }

  $("pf-eliminar").addEventListener("click", async () => {
    if (!confirm(`¿Eliminar la ficha de ${ficha.nombre || ficha.id}?\n\nSolo se puede eliminar a quien no tiene charlas. Si es un duplicado, use «Fusionar». Si la persona pidió no recibir correos, es preferible darla de baja: así no se vuelve a agregar por error.`)) return;
    try { await DP.api("/api/admin/personas/" + ficha.id, { method: "DELETE" }); sucio = false; $("ficha").close(); aviso("aviso-panel", "ok", "Ficha eliminada."); cargar(); }
    catch (e) { errorSesion(e, "aviso-ficha"); }
  });

  // ---------- Fusión ----------
  $("pf-fusionar").addEventListener("click", () => {
    if (sucio) return aviso("aviso-ficha", "error", "Guarde primero los cambios de la ficha.");
    aviso("aviso-fusion", "", ""); $("fu-destino").textContent = `${ficha.nombre} (${ficha.id})`; $("fu-buscar").value = "";
    const dl = $("fu-lista"); dl.innerHTML = "";
    personas.filter((p) => p.id !== ficha.id).forEach((p) => dl.appendChild(el("option", { value: `${p.id} — ${p.nombre || p.correo}${p.institucion ? " (" + p.institucion + ")" : ""}` })));
    $("fusion").showModal();
  });
  $("fu-aplicar").addEventListener("click", async () => {
    const id = ($("fu-buscar").value.match(/^P\d+/) || [])[0];
    const otra = personas.find((p) => p.id === id);
    if (!otra || id === ficha.id) return aviso("aviso-fusion", "error", "Elija una ficha de la lista.");
    if (!confirm(`Se incorporará ${otra.nombre || otra.correo} (${otra.id}) en ${ficha.nombre} (${ficha.id}) y la ficha ${otra.id} desaparecerá. ¿Continuar?`)) return;
    try { const r = await DP.api(`/api/admin/personas/${ficha.id}/fusionar`, { method: "POST", body: { con: id } });
          $("fusion").close(); await abrirFicha(ficha.id); aviso("aviso-ficha", "ok", `Fichas fusionadas (${r.charlasMovidas} charla(s) trasladadas). Revise el nombre, el correo principal y la institución vigente.`); cargarSilencioso(); }
    catch (e) { errorSesion(e, "aviso-fusion"); }
  });

  // ---------- Agregar suscriptores ----------
  $("p-suscribir").addEventListener("click", () => { aviso("aviso-suscribir", "", ""); $("suscribir").showModal(); });
  $("s-archivo-boton").addEventListener("click", () => $("s-archivo").click());
  $("s-archivo").addEventListener("change", async (ev) => {
    const a = ev.target.files[0]; ev.target.value = ""; if (!a) return;
    if (a.size > 5 * 1024 * 1024) return aviso("aviso-suscribir", "error", "El archivo supera los 5 MB.");
    try {
      let texto;
      if (/\.xlsx?$/i.test(a.name)) { const X = await xlsx(); const libro = X.read(await a.arrayBuffer(), { type: "array" });
        texto = X.utils.sheet_to_csv(libro.Sheets[libro.SheetNames[0]], { FS: "\t", blankrows: false }); }
      else { const bytes = new Uint8Array(await a.arrayBuffer());
        try { texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch (e) { texto = new TextDecoder("windows-1252").decode(bytes); } }
      $("s-texto").value = texto.trim();
      aviso("aviso-suscribir", "info", `Se leyeron ${$("s-texto").value.split("\n").length} fila(s) de «${a.name}». Revíselas y pulse «Agregar».`);
    } catch (e) { aviso("aviso-suscribir", "error", "No se pudo leer el archivo: " + e.message); }
  });
  $("s-agregar").addEventListener("click", async () => {
    const texto = $("s-texto").value; if (!texto.trim()) return aviso("aviso-suscribir", "error", "Pegue al menos un correo.");
    $("s-agregar").disabled = true;
    try {
      const r = await DP.api("/api/admin/personas/suscribir", { method: "POST", body: { texto, reactivarBajas: $("s-reactivar").checked, origen: $("s-origen").value, nota: $("s-nota").value.trim() } });
      const partes = [`${r.agregados} suscrito(s)`];
      if (r.nuevasFichas) partes.push(`${r.nuevasFichas} ficha(s) nueva(s)`);
      if (r.existentes) partes.push(`${r.existentes} ya estaban suscritos`);
      if (r.reactivados) partes.push(`${r.reactivados} reactivado(s)`);
      if (r.bajasOmitidas.length) partes.push(`${r.bajasOmitidas.length} omitido(s) por haberse dado de baja: ${r.bajasOmitidas.join(", ")}`);
      if (r.invalidos.length) partes.push(`${r.invalidos.length} no reconocido(s): ${r.invalidos.slice(0, 10).join(", ")}${r.invalidos.length > 10 ? "…" : ""}`);
      aviso("aviso-suscribir", r.invalidos.length || r.bajasOmitidas.length ? "info" : "ok", partes.join(" · ") + ".");
      $("s-texto").value = ""; $("s-reactivar").checked = false; cargarSilencioso();
    } catch (e) { errorSesion(e, "aviso-suscribir"); }
    finally { $("s-agregar").disabled = false; }
  });

  // ---------- Excel: descarga ----------
  $("p-exportar").addEventListener("click", async () => {
    $("p-exportar").disabled = true;
    try {
      const [X, datos] = await Promise.all([xlsx(), DP.api("/api/admin/registro")]);
      const libro = X.utils.book_new();
      const leeme = [["Registro de personas — Dinámica Porteña"], [], ["Generado", new Date(datos.generado).toLocaleString("es-CL", { timeZone: "America/Santiago" })],
        ["Contenido", "Personas, instituciones, historial de afiliaciones y roles, charlas y eventos de suscripción, exportados desde el panel."],
        ["Datos personales", "Contiene correos y otros datos personales: uso interno de los administradores. No publicar ni subir al repositorio del sitio."],
        ["Para corregir", "Edite este archivo y vuelva a importarlo en Personas → «Importar Excel…». Mantenga los ID y los nombres de las hojas y columnas. Las columnas calculadas (institución vigente, roles, n.º de charlas, suscripción) se ignoran al importar."],
        ["Historial", "No borre filas de Afiliaciones, Roles ni Suscripción: los cambios se registran cerrando la fila anterior (Hasta, Estado o un evento nuevo)."]];
      X.utils.book_append_sheet(libro, Object.assign(X.utils.aoa_to_sheet(leeme), { "!cols": [{ wch: 18 }, { wch: 110 }] }), "LEEME");
      for (const h of datos.hojas) {
        const hoja = X.utils.aoa_to_sheet([h.columnas, ...h.filas]);
        hoja["!cols"] = h.columnas.map((c, i) => ({ wch: Math.min(50, Math.max(10, c.length + 2, ...h.filas.slice(0, 200).map((f) => String(f[i] ?? "").length * 0.8))) }));
        hoja["!autofilter"] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, h.filas.length), c: h.columnas.length - 1 } }) };
        X.utils.book_append_sheet(libro, hoja, h.nombre);
      }
      X.writeFile(libro, `Registro_Personas_DinamicaPortena_${hoy()}.xlsx`);
    } catch (e) { errorSesion(e, "aviso-panel"); }
    finally { $("p-exportar").disabled = false; }
  });

  // ---------- Excel: importación ----------
  let hojasImport = null;
  $("p-importar").addEventListener("click", () => { hojasImport = null; $("i-archivo").value = ""; $("i-resultado").innerHTML = ""; $("i-aplicar").disabled = true;
    aviso("aviso-importar", "", ""); $("importar").showModal(); });
  $("i-archivo").addEventListener("change", async (ev) => {
    const a = ev.target.files[0]; if (!a) return;
    if (a.size > 15 * 1024 * 1024) return aviso("aviso-importar", "error", "El archivo supera los 15 MB.");
    aviso("aviso-importar", "info", "Leyendo y revisando el archivo…"); $("i-resultado").innerHTML = ""; $("i-aplicar").disabled = true;
    try {
      const X = await xlsx(), libro = X.read(await a.arrayBuffer(), { type: "array", cellDates: true });
      hojasImport = {};
      for (const n of ["Personas", "Instituciones", "Afiliaciones", "Roles", "Charlas", "Suscripción", "Eventos"])
        if (libro.Sheets[n]) hojasImport[n] = X.utils.sheet_to_json(libro.Sheets[n], { defval: "", raw: false, dateNF: "yyyy-mm-dd" })
          .filter((f) => Object.entries(f).some(([k, v]) => !/^Clave|^Nombre$/.test(k) && String(v).trim()));
      if (!Object.keys(hojasImport).length) throw new Error("El archivo no tiene ninguna de las hojas del registro (Personas, Instituciones, Afiliaciones, Roles, Charlas, Suscripción).");
      const r = await DP.api("/api/admin/registro/importar", { method: "POST", body: { hojas: hojasImport, aplicar: false } });
      mostrarRevision(r, Object.keys(hojasImport));
    } catch (e) { hojasImport = null; errorSesion(e, "aviso-importar"); }
  });
  function mostrarRevision(r, hojas) {
    aviso("aviso-importar", r.ok ? (r.aplicado ? "ok" : "info") : "error",
      r.aplicado ? "Importación aplicada." : r.ok ? "Revisión lista: estos son los cambios que se aplicarán." : `Hay ${r.errores.length} error(es): corríjalos en el Excel y vuelva a elegir el archivo. No se aplicó nada.`);
    const c = r.conteo, fila = (n, x) => el("tr", {}, el("td", { textContent: n }), el("td", { textContent: x.nuevas }), el("td", { textContent: x.modificadas }), el("td", { textContent: x.sinCambios }));
    const res = el("div", { className: "resultado-import" },
      el("p", { textContent: "Hojas leídas: " + hojas.join(", ") + "." }),
      el("table", { className: "mini-tabla" }, el("tr", {}, ...["", "Nuevas", "Modificadas", "Sin cambios"].map((x) => el("th", { textContent: x }))),
        fila("Personas", c.personas), fila("Instituciones", c.instituciones), fila("Charlas", c.charlas), ...(c.eventos ? [fila("Eventos", c.eventos)] : [])),
      el("p", { textContent: `Eventos de suscripción nuevos: ${c.eventosNuevos}.` }));
    if (r.errores.length) res.append(el("h3", { className: "seccion", textContent: "Errores" }), el("ul", {}, ...r.errores.map((e) => el("li", { textContent: `${e.hoja}${e.fila ? ", fila " + e.fila : ""}: ${e.mensaje}` }))));
    if (r.avisos.length) res.append(el("h3", { className: "seccion", textContent: `Avisos (${r.totalAvisos})` }), el("ul", {}, ...r.avisos.map((m) => el("li", { textContent: m }))));
    $("i-resultado").innerHTML = ""; $("i-resultado").appendChild(res);
    const hayCambios = c.personas.nuevas + c.personas.modificadas + c.instituciones.nuevas + c.instituciones.modificadas + c.charlas.nuevas + c.charlas.modificadas + c.eventosNuevos
                       + (c.eventos ? c.eventos.nuevas + c.eventos.modificadas : 0) > 0;
    $("i-aplicar").disabled = !(r.ok && !r.aplicado && hayCambios);
  }
  $("i-aplicar").addEventListener("click", async () => {
    if (!hojasImport || !confirm("¿Aplicar la importación? Los cambios quedan anotados en el historial de cada ficha.")) return;
    $("i-aplicar").disabled = true; aviso("aviso-importar", "info", "Aplicando…");
    try { const r = await DP.api("/api/admin/registro/importar", { method: "POST", body: { hojas: hojasImport, aplicar: true } });
          mostrarRevision(r, Object.keys(hojasImport)); if (r.aplicado) cargar(); }
    catch (e) { errorSesion(e, "aviso-importar"); }
  });

  // ---------- Instituciones ----------
  let instEditando = null;
  function dibujarInstituciones() {
    const q = sinTildes($("in-buscar").value.trim()), tb = $("in-tabla").querySelector("tbody"); tb.innerHTML = "";
    instituciones.filter((i) => !q || sinTildes([i.id, i.nombre, i.sigla, i.pais, ...(i.variantes || [])].join(" ")).includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).forEach((i) => {
        const b = el("button", { type: "button", className: "boton sec peq", textContent: "Editar" }); b.onclick = () => editarInst(i);
        tb.appendChild(el("tr", {}, el("td", { textContent: i.id }), el("td", {}, i.nombre, el("span", { className: "sub", textContent: (i.variantes || []).slice(0, 4).join(" · ") })),
          el("td", { textContent: i.sigla || "" }), el("td", { textContent: i.pais }), el("td", {}, b)));
      });
    const dl = $("in-paises"); dl.innerHTML = ""; [...new Set(instituciones.map((i) => i.pais))].sort().forEach((p) => dl.appendChild(el("option", { value: p })));
  }
  function editarInst(i) {
    instEditando = i;
    $("in-titulo").textContent = i ? `Editar ${i.id}` : "Nueva institución"; $("in-guardar").textContent = i ? "Guardar cambios" : "Agregar institución";
    $("in-nueva").classList.toggle("oculto", !i);
    $("in-nombre").value = i?.nombre || ""; $("in-nombre-en").value = i?.nombreEn || ""; $("in-sigla").value = i?.sigla || ""; $("in-ciudad").value = i?.ciudad || ""; $("in-pais").value = i?.pais || "";
    $("in-variantes").value = (i?.variantes || []).join("; "); $("in-nombre").focus();
  }
  $("in-nueva").addEventListener("click", () => editarInst(null));
  $("in-buscar").addEventListener("input", dibujarInstituciones);
  $("p-instituciones").addEventListener("click", async () => {
    aviso("aviso-inst", "", ""); editarInst(null);
    try { instituciones = await DP.api("/api/admin/instituciones"); } catch (e) { return errorSesion(e, "aviso-panel"); }
    dibujarInstituciones(); $("instituciones").showModal();
  });
  $("form-inst").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const cuerpo = { nombre: $("in-nombre").value.trim(), nombreEn: $("in-nombre-en").value.trim(), sigla: $("in-sigla").value.trim(), ciudad: $("in-ciudad").value.trim(), pais: $("in-pais").value.trim(),
                     variantes: $("in-variantes").value.split(";").map((x) => x.trim()).filter(Boolean) };
    try {
      const r = instEditando ? await DP.api("/api/admin/instituciones/" + instEditando.id, { method: "PUT", body: cuerpo })
                             : await DP.api("/api/admin/instituciones", { method: "POST", body: cuerpo });
      instituciones = await DP.api("/api/admin/instituciones"); dibujarInstituciones(); editarInst(null);
      aviso("aviso-inst", "ok", `${r.nombre} (${r.id}) guardada.`);
    } catch (e) { errorSesion(e, "aviso-inst"); }
  });
})();
