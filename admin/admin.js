// Lógica del panel de administración de charlas.
(function () {
  const $ = (id) => document.getElementById(id);
  let charlas = [];
  let editando = null;          // charla en edición (null = nueva)
  let fotoNueva;                // undefined = sin cambios, null = quitar, "data:..." = nueva

  function aviso(cont, tipo, mensaje) {
    const el = $(cont);
    el.innerHTML = "";
    if (!mensaje) return;
    const d = document.createElement("div"); d.className = "aviso " + tipo; d.textContent = mensaje; el.appendChild(d);
  }
  const mostrar = (id, si) => $(id).classList.toggle("oculto", !si);

  // ---------- Acceso ----------
  async function iniciar() {
    try {
      const yo = await DP.api("/api/auth/me");
      entrar(yo.email);
    } catch (e) {
      prepararGoogle();
    }
  }
  async function prepararGoogle() {
    mostrar("cargando", false); mostrar("acceso", true); mostrar("panel", false);
    let clientId;
    try { clientId = (await DP.api("/api/config")).googleClientId; }
    catch (e) { return aviso("aviso-acceso", "error", "No se pudo leer la configuración del panel: " + e.message); }
    const esperar = () => new Promise((ok) => { const t = setInterval(() => { if (window.google && google.accounts) { clearInterval(t); ok(); } }, 100); });
    await esperar();
    google.accounts.id.initialize({ client_id: clientId, callback: alIngresar, ux_mode: "popup" });
    google.accounts.id.renderButton($("boton-google"), { theme: "outline", size: "large", text: "signin_with", locale: "es" });
  }
  async function alIngresar(respuesta) {
    aviso("aviso-acceso", "info", "Verificando la cuenta…");
    try {
      const r = await DP.api("/api/auth/login", { method: "POST", body: { credential: respuesta.credential } });
      aviso("aviso-acceso", "", ""); entrar(r.email);
    } catch (e) { aviso("aviso-acceso", "error", e.message); }
  }
  function entrar(email) {
    $("usuario").textContent = email;
    mostrar("cargando", false); mostrar("acceso", false); mostrar("panel", true);
    cargar();
  }
  $("salir").addEventListener("click", async () => {
    try { await DP.api("/api/auth/logout", { method: "POST", body: {} }); } catch (e) {}
    if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
    location.reload();
  });

  function manejarError(e, contenedor) {
    if (e.estado === 401) { aviso("aviso-acceso", "info", "Su sesión terminó. Vuelva a ingresar."); prepararGoogle(); return; }
    aviso(contenedor, "error", e.message);
  }

  // ---------- Listado ----------
  async function cargar() {
    try { charlas = await DP.api("/api/admin/charlas"); dibujar(); }
    catch (e) { manejarError(e, "aviso-panel"); }
  }
  function dibujar() {
    const grupos = { pendiente: [], preparacion: [], publicada: [] };
    charlas.forEach((c) => (c.estado === "pendiente" ? grupos.pendiente : c.estado === "publicada" ? grupos.publicada : grupos.preparacion).push(c));
    for (const [g, lista] of Object.entries(grupos)) {
      const cont = $("lista-" + g); cont.innerHTML = "";
      $("n-" + g).textContent = lista.length ? `(${lista.length})` : "";
      if (!lista.length) { const p = document.createElement("p"); p.className = "vacio"; p.textContent = "No hay charlas en este grupo."; cont.appendChild(p); }
      lista.forEach((c) => cont.appendChild(fila(c)));
    }
  }
  const NOMBRE_ESTADO = { borrador: "Borrador", invitada: "Invitación enviada", pendiente: "Pendiente de revisión", publicada: "Publicada" };
  function fila(c) {
    const d = document.createElement("div"); d.className = "charla-fila " + c.estado;
    if (c.foto) { const i = document.createElement("img"); i.src = c.foto; i.alt = ""; d.appendChild(i); }
    else { const s = document.createElement("div"); s.className = "sin-foto"; d.appendChild(s); }
    const info = document.createElement("div"); info.className = "info";
    const f = document.createElement("div"); f.className = "fecha"; f.textContent = DP.fechaLarga(c.fecha, c.hora);
    const e = document.createElement("span"); e.className = "estado " + c.estado; e.textContent = NOMBRE_ESTADO[c.estado]; f.appendChild(e);
    const t = document.createElement("div"); t.className = "titulo"; t.textContent = c.titulo || "(sin título aún)";
    const m = document.createElement("div"); m.className = "meta";
    m.textContent = [c.expositor, c.institucion].filter(Boolean).join(" — ") +
      (c.estado === "invitada" && c.invitacionVence ? ` · enlace vigente hasta ${DP.fechaLarga(c.invitacionVence.slice(0, 10))}` : "") +
      (c.enviadaPorExpositor ? ` · completada por el expositor el ${DP.fechaLarga(c.enviadaPorExpositor.slice(0, 10))}` : "");
    const acc = document.createElement("div"); acc.className = "acciones";
    const boton = (texto, clase, fn) => { const b = document.createElement("button"); b.className = "boton " + clase; b.textContent = texto; b.onclick = fn; acc.appendChild(b); };
    boton(c.estado === "pendiente" ? "Revisar y editar" : "Editar", "sec peq", () => abrirEditor(c));
    if (c.estado !== "publicada") boton(c.estado === "borrador" ? "Invitar al expositor" : "Nuevo enlace de invitación", "sec peq", () => invitar(c));
    if (c.estado === "publicada") boton("Retirar de la web", "sec peq", () => publicar(c, false));
    else boton("Publicar", "peq", () => publicar(c, true));
    boton("Eliminar", "peligro", () => eliminar(c));
    info.append(f, t, m, acc); d.appendChild(info);
    return d;
  }

  // ---------- Editor ----------
  const campos = ["fecha", "hora", "sala", "expositor", "institucion", "titulo", "resumen"];
  function abrirEditor(c) {
    editando = c || null; fotoNueva = undefined;
    $("editor-titulo").textContent = c ? "Editar charla" : "Nueva charla";
    aviso("aviso-editor", "", "");
    campos.forEach((k) => { $("f-" + k).value = c ? (c[k] || "") : ($("f-" + k).defaultValue || ""); });
    $("f-foto").value = "";
    ponerFoto(c && c.foto);
    DP.vistaPrevia($("f-vista"), $("f-resumen").value);
    $("editor").showModal();
  }
  function ponerFoto(src) {
    $("f-foto-img").src = src || ""; mostrar("f-foto-img", Boolean(src)); mostrar("f-foto-quitar", Boolean(src));
  }
  $("nueva").addEventListener("click", () => abrirEditor(null));
  $("f-resumen").addEventListener("input", () => DP.vistaPrevia($("f-vista"), $("f-resumen").value));
  $("f-foto").addEventListener("change", async (ev) => {
    const a = ev.target.files[0]; if (!a) return;
    try { fotoNueva = await DP.reducirImagen(a); ponerFoto(fotoNueva); }
    catch (e) { aviso("aviso-editor", "error", e.message); ev.target.value = ""; }
  });
  $("f-foto-quitar").addEventListener("click", () => { fotoNueva = null; $("f-foto").value = ""; ponerFoto(null); });

  $("form-charla").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const datos = {}; campos.forEach((k) => (datos[k] = $("f-" + k).value));
    if (fotoNueva !== undefined) datos.foto = fotoNueva;
    $("guardar").disabled = true;
    try {
      if (editando) await DP.api("/api/admin/charlas/" + encodeURIComponent(editando.id), { method: "PUT", body: datos });
      else { if (datos.foto === null) delete datos.foto; await DP.api("/api/admin/charlas", { method: "POST", body: datos }); }
      $("editor").close(); aviso("aviso-panel", "ok", "Charla guardada."); cargar();
    } catch (e) { manejarError(e, "aviso-editor"); }
    finally { $("guardar").disabled = false; }
  });

  // ---------- Acciones ----------
  async function invitar(c) {
    if (c.estado !== "borrador" && !confirm("Se generará un enlace nuevo y el anterior dejará de funcionar. ¿Continuar?")) return;
    try {
      const r = await DP.api(`/api/admin/charlas/${encodeURIComponent(c.id)}/invitacion`, { method: "POST", body: {} });
      $("inv-enlace").value = r.enlace;
      $("inv-vence").textContent = DP.fechaLarga(r.expira.slice(0, 10));
      const fechaEs = DP.fechaLarga(c.fecha, c.hora, "es"), fechaEn = DP.fechaLarga(c.fecha, c.hora, "en");
      $("inv-texto-es").value =
`Estimado/a ${c.expositor}:

Muchas gracias por aceptar dar una charla en el Seminario Dinámica Porteña, el ${fechaEs}, en ${c.sala}.

Para preparar el anuncio, le pedimos completar el título, el resumen, su institución y, si lo desea, una foto, en el siguiente enlace:

${r.enlace}

El resumen admite fórmulas en LaTeX entre signos $…$.

Saludos cordiales,
Seminario Dinámica Porteña
Instituto de Matemáticas, PUCV`;
      $("inv-texto-en").value =
`Dear ${c.expositor},

Thank you very much for agreeing to give a talk at the Dinámica Porteña Seminar on ${fechaEn}, in ${c.sala}.

To prepare the announcement, we kindly ask you to provide the title, abstract, your affiliation and, optionally, a photo, using the following link:

${r.enlace}

LaTeX formulas between $…$ are supported in the abstract.

Best regards,
Dinámica Porteña Seminar
Institute of Mathematics, PUCV`;
      $("invitacion").showModal(); cargar();
    } catch (e) { manejarError(e, "aviso-panel"); }
  }
  async function publicar(c, si) {
    const pregunta = si ? `¿Publicar en el sitio la charla de ${c.expositor}?` : `¿Retirar del sitio la charla de ${c.expositor}? Quedará como borrador.`;
    if (!confirm(pregunta)) return;
    try { await DP.api(`/api/admin/charlas/${encodeURIComponent(c.id)}/publicar`, { method: "POST", body: { publicar: si } });
          aviso("aviso-panel", "ok", si ? "Charla publicada." : "Charla retirada del sitio."); cargar(); }
    catch (e) { manejarError(e, "aviso-panel"); }
  }
  async function eliminar(c) {
    if (!confirm(`¿Eliminar definitivamente la charla de ${c.expositor}${c.titulo ? " «" + c.titulo + "»" : ""}? Esta acción no se puede deshacer.`)) return;
    try { await DP.api("/api/admin/charlas/" + encodeURIComponent(c.id), { method: "DELETE" });
          aviso("aviso-panel", "ok", "Charla eliminada."); cargar(); }
    catch (e) { manejarError(e, "aviso-panel"); }
  }

  // ---------- Diálogos y copiar ----------
  document.querySelectorAll("[data-cerrar]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  document.querySelectorAll("[data-copiar]").forEach((b) => b.addEventListener("click", async () => {
    const el = $(b.dataset.copiar); el.select();
    try { await navigator.clipboard.writeText(el.value); } catch (e) { document.execCommand("copy"); }
    const t = b.textContent; b.textContent = "Copiado ✓"; setTimeout(() => (b.textContent = t), 1500);
  }));

  iniciar();
})();
