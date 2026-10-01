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
  const NOMBRE_ESTADO = { borrador: "Borrador", invitada: "Invitación generada", pendiente: "Pendiente de revisión", publicada: "Publicada" };
  function fila(c) {
    const d = document.createElement("div"); d.className = "charla-fila " + c.estado;
    if (c.foto) { const i = document.createElement("img"); i.src = c.foto; i.alt = ""; d.appendChild(i); }
    else { const s = document.createElement("div"); s.className = "sin-foto"; d.appendChild(s); }
    const info = document.createElement("div"); info.className = "info";
    const f = document.createElement("div"); f.className = "fecha"; f.textContent = DP.fechaLarga(c.fecha, c.hora);
    const e = document.createElement("span"); e.className = "estado " + c.estado; e.textContent = NOMBRE_ESTADO[c.estado]; f.appendChild(e);
    if (c.cancelada) { const x = document.createElement("span"); x.className = "estado cancelada"; x.textContent = "Cancelada"; f.appendChild(x); }
    else if (c.reprogramaciones && c.reprogramaciones.length) {
      const x = document.createElement("span"); x.className = "estado reprogramada"; const r = c.reprogramaciones[c.reprogramaciones.length - 1];
      x.textContent = "Reagendada"; x.title = "Fecha anterior: " + DP.fechaLarga(r.fecha, r.hora); f.appendChild(x); }
    const t = document.createElement("div"); t.className = "titulo"; t.textContent = c.titulo || "(sin título aún)";
    const m = document.createElement("div"); m.className = "meta";
    m.textContent = [c.expositor, c.institucion].filter(Boolean).join(" — ") +
      (c.estado === "invitada" && c.invitacionEnviadaA ? ` · invitación enviada a ${c.invitacionEnviadaA}` : "") +
      (c.estado === "invitada" && c.invitacionVence ? ` · enlace vigente hasta ${DP.fechaLarga(c.invitacionVence.slice(0, 10))}` : "") +
      (c.enviadaPorExpositor ? ` · completada por el expositor el ${DP.fechaLarga(c.enviadaPorExpositor.slice(0, 10))}` : "") +
      (c.certificadoEnviado ? ` · certificado enviado el ${DP.fechaLarga(c.certificadoEnviado.slice(0, 10))}` : "");
    const avisoCorreo = [];
    if (!c.email) { const w = document.createElement("div"); w.className = "sin-correo";
      w.textContent = "⚠ Sin correo del expositor: no se le puede enviar la invitación, los avisos ni el certificado. Agréguelo con «Editar»."; avisoCorreo.push(w); }
    const acc = document.createElement("div"); acc.className = "acciones";
    const boton = (texto, clase, fn) => { const b = document.createElement("button"); b.className = "boton " + clase; b.textContent = texto; b.onclick = fn; acc.appendChild(b); };
    boton(c.estado === "pendiente" ? "Revisar y editar" : "Editar", "sec peq", () => abrirEditor(c));
    if (c.estado !== "publicada" && c.email) boton(c.estado === "borrador" ? "Enviar invitación" : "Reenviar invitación", "sec peq", () => invitar(c));
    const vigente = c.fecha >= hoyISO();
    if (c.estado === "publicada" && !c.cancelada) boton("Materiales", "sec peq", () => abrirMateriales(c));
    if (c.estado === "publicada" && (vigente || c.cancelada)) boton("Reprogramar", "sec peq", () => abrirReprogramar(c));
    if (c.estado === "publicada" && vigente && !c.cancelada) boton("Cancelar charla", "peligro", () => cancelar(c));
    if (c.estado === "publicada" && !c.cancelada && c.fecha <= hoyISO() && c.email)
      boton(c.certificadoEnviado ? "Reenviar certificado" : "Enviar certificado", "sec peq", () => enviarCertificado(c));
    if (c.estado === "publicada") boton("Retirar de la web", "sec peq", () => publicar(c, false));
    else boton("Publicar", "peq", () => publicar(c, true));
    boton("Eliminar", "peligro", () => eliminar(c));
    info.append(f, t, m, ...avisoCorreo, acc); d.appendChild(info);
    return d;
  }

  // ---------- Editor ----------
  // ---------- Fecha por defecto ----------
  // Viernes de la semana próxima (semana de lunes a domingo); si es feriado en Chile, el viernes siguiente.
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function pascua(a) {                       // Domingo de Resurrección (algoritmo de Meeus/Jones/Butcher)
    const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((c + 8) / 25);
    const h = Math.floor((c - g + 1) / 3), i = (19 * b + c - e - h + 15) % 30, k = Math.floor(d / 4), l = d % 4;
    const m = (32 + 2 * f + 2 * k - i - l) % 7, n = Math.floor((b + 11 * i + 22 * m) / 451);
    const mes = Math.floor((i + m - 7 * n + 114) / 31), dia = ((i + m - 7 * n + 114) % 31) + 1;
    return new Date(a, mes - 1, dia);
  }
  function solsticioInvierno(a) {            // día del solsticio de junio en hora de Chile (UTC-4), según Meeus
    const Y = (a - 2000) / 1000;
    const jde = 2451716.56767 + 365241.62603 * Y + 0.00325 * Y * Y + 0.00888 * Y ** 3 - 0.00030 * Y ** 4;
    const ms = (jde - 2440587.5) * 864e5 - 4 * 36e5;
    const d = new Date(ms); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  function moverALunes(a, mes, dia) {        // Ley 19.668: mar-jue → lunes anterior; vie → lunes siguiente
    const d = new Date(a, mes - 1, dia), w = d.getDay();
    if (w >= 2 && w <= 4) d.setDate(d.getDate() - (w - 1)); else if (w === 5) d.setDate(d.getDate() + 3);
    return d;
  }
  function feriadosChile(a) {
    const f = new Set(["01-01", "05-01", "05-21", "07-16", "08-15", "09-18", "09-19", "11-01", "12-08", "12-25"].map((x) => `${a}-${x}`));
    const p = pascua(a); const vs = new Date(p); vs.setDate(p.getDate() - 2); const ss = new Date(p); ss.setDate(p.getDate() - 1);
    [vs, ss, solsticioInvierno(a), moverALunes(a, 6, 29), moverALunes(a, 10, 12)].forEach((d) => f.add(iso(d)));
    const ev = new Date(a, 9, 31), w = ev.getDay();          // Iglesias Evangélicas: mar → vie anterior; mié → vie siguiente
    if (w === 2) ev.setDate(27); else if (w === 3) ev.setDate(ev.getDate() + 2);
    f.add(iso(ev));
    if (new Date(a, 8, 17).getDay() === 1) f.add(`${a}-09-17`);   // 17 de septiembre cuando cae lunes
    if (new Date(a, 8, 20).getDay() === 5) f.add(`${a}-09-20`);   // 20 de septiembre cuando cae viernes
    return f;
  }
  function viernesPorDefecto(hoy = new Date()) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const w = d.getDay() || 7;                                 // lunes = 1, …, domingo = 7
    d.setDate(d.getDate() + (8 - w) + 4);                      // lunes de la semana próxima + 4 días
    for (let n = 0; n < 5 && feriadosChile(d.getFullYear()).has(iso(d)); n++) d.setDate(d.getDate() + 7);
    return iso(d);
  }

  const campos = ["fecha", "hora", "sala", "expositor", "email", "idioma", "institucion", "titulo", "resumen"];
  function abrirEditor(c) {
    editando = c || null; fotoNueva = undefined;
    $("editor-titulo").textContent = c ? "Editar charla" : "Nueva charla";
    aviso("aviso-editor", "", "");
    campos.forEach((k) => { $("f-" + k).value = c ? (c[k] || "") : ($("f-" + k).defaultValue || ""); });
    if (!c) $("f-fecha").value = viernesPorDefecto();
    if (!$("f-idioma").value) $("f-idioma").value = "es";
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

  async function guardar(enviarInvitacion) {
    const datos = {}; campos.forEach((k) => (datos[k] = $("f-" + k).value));
    if (fotoNueva !== undefined) datos.foto = fotoNueva;
    if (enviarInvitacion && !datos.email.trim()) return aviso("aviso-editor", "error", "Indique el correo del expositor para enviarle la invitación.");
    $("guardar").disabled = $("guardar-invitar").disabled = true;
    try {
      let c;
      if (editando) c = await DP.api("/api/admin/charlas/" + encodeURIComponent(editando.id), { method: "PUT", body: datos });
      else { if (datos.foto === null) delete datos.foto; c = await DP.api("/api/admin/charlas", { method: "POST", body: datos }); }
      $("editor").close();
      if (enviarInvitacion) await invitar(c, true);
      else { aviso("aviso-panel", "ok", "Charla guardada."); cargar(); }
    } catch (e) { manejarError(e, "aviso-editor"); }
    finally { $("guardar").disabled = $("guardar-invitar").disabled = false; }
  }
  $("form-charla").addEventListener("submit", (ev) => { ev.preventDefault(); guardar(false); });
  $("guardar-invitar").addEventListener("click", () => guardar(true));

  // ---------- Acciones ----------
  // Genera el enlace; si la charla tiene correo, además envía la invitación al expositor.
  async function invitar(c, sinPreguntar) {
    const enviar = Boolean(c.email);
    if (!sinPreguntar) {
      const pregunta = (c.estado !== "borrador" ? "Se generará un enlace nuevo y el anterior dejará de funcionar. " : "") +
        (enviar ? `La invitación se enviará por correo a ${c.email}. ¿Continuar?` : "¿Generar el enlace de invitación?");
      if (!confirm(pregunta)) return;
    }
    try {
      const r = await DP.api(`/api/admin/charlas/${encodeURIComponent(c.id)}/invitacion`, { method: "POST", body: { enviar } });
      $("inv-enlace").value = r.enlace;
      $("inv-vence").textContent = DP.fechaLarga(r.expira.slice(0, 10));
      $("inv-texto-es").value = r.textos.es; $("inv-texto-en").value = r.textos.en;
      if (r.enviado) aviso("inv-estado", "ok", `Invitación enviada por correo a ${r.a}.`);
      else if (r.error) aviso("inv-estado", "error", r.error + " Puede copiar el mensaje y enviarlo desde su correo.");
      else aviso("inv-estado", "info", "La charla no tiene correo del expositor: copie el enlace o el mensaje y envíelo desde su correo.");
      $("invitacion").showModal(); cargar();
    } catch (e) { manejarError(e, "aviso-panel"); cargar(); }
  }
  async function publicar(c, si) {
    const pregunta = si ? `¿Publicar en el sitio la charla de ${c.expositor}?` : `¿Retirar del sitio la charla de ${c.expositor}? Quedará como borrador.`;
    if (!confirm(pregunta)) return;
    try { await DP.api(`/api/admin/charlas/${encodeURIComponent(c.id)}/publicar`, { method: "POST", body: { publicar: si } });
          aviso("aviso-panel", "ok", si ? "Charla publicada." : "Charla retirada del sitio."); cargar(); }
    catch (e) { manejarError(e, "aviso-panel"); }
  }
  async function enviarCertificado(c) {
    if (!c.email) return aviso("aviso-panel", "error", "La charla no tiene correo del expositor. Agréguelo con «Editar» y vuelva a intentarlo.");
    if (!confirm(`¿${c.certificadoEnviado ? "Reenviar" : "Enviar"} el certificado a ${c.email}, con copia al organizador?`)) return;
    try { const r = await DP.api(`/api/admin/charlas/${encodeURIComponent(c.id)}/certificado`, { method: "POST", body: {} });
          aviso("aviso-panel", "ok", `Certificado enviado a ${r.a}${r.copia ? ", con copia a " + r.copia : ""}.`); cargar(); }
    catch (e) { manejarError(e, "aviso-panel"); }
  }
  async function eliminar(c) {
    if (!confirm(`¿Eliminar definitivamente la charla de ${c.expositor}${c.titulo ? " «" + c.titulo + "»" : ""}? Esta acción no se puede deshacer.`)) return;
    try { await DP.api("/api/admin/charlas/" + encodeURIComponent(c.id), { method: "DELETE" });
          aviso("aviso-panel", "ok", "Charla eliminada."); cargar(); }
    catch (e) { manejarError(e, "aviso-panel"); }
  }

  // ---------- Cancelación y reprogramación ----------
  function hoyISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  function informarAviso(prefijo, a) {
    if (!a) return aviso("aviso-panel", "ok", prefijo);
    const partes = [];
    if (a.expositor) partes.push("aviso enviado al expositor");
    if (a.lista) partes.push(`aviso en envío a ${a.lista} suscriptor(es) (vea «Suscriptores» → «Envíos recientes»)`);
    if (!a.expositor && !a.lista && !a.motivo) partes.push("no hay destinatarios: la charla no tiene correo del expositor y la lista está vacía");
    aviso("aviso-panel", a.motivo ? "info" : "ok", prefijo + " " + (partes.length ? partes.join("; ") + "." : "") + (a.motivo ? " " + a.motivo : ""));
  }
  async function cancelar(c) {
    if (!confirm(`¿Cancelar la charla de ${c.expositor} del ${DP.fechaLarga(c.fecha, c.hora)}?\n\nSe enviará un aviso de cancelación a los suscriptores y al expositor, y la web la mostrará como cancelada.`)) return;
    try { const r = await DP.api(`/api/admin/charlas/${encodeURIComponent(c.id)}/cancelar`, { method: "POST", body: {} });
          informarAviso("Charla cancelada.", r.aviso); cargar(); }
    catch (e) { manejarError(e, "aviso-panel"); }
  }
  let reprogramando = null;
  function abrirReprogramar(c) {
    reprogramando = c; aviso("aviso-reprogramar", "", "");
    $("rep-actual").textContent = (c.cancelada ? "Charla cancelada, programada originalmente para el " : "Fecha actual: ") + DP.fechaLarga(c.fecha, c.hora) + ", " + c.sala + ".";
    $("r-fecha").value = ""; $("r-hora").value = c.hora; $("r-sala").value = c.sala;
    $("reprogramar").showModal();
  }
  $("form-reprogramar").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const datos = { fecha: $("r-fecha").value, hora: $("r-hora").value, sala: $("r-sala").value };
    if (!datos.fecha || !datos.hora) return aviso("aviso-reprogramar", "error", "Indique la nueva fecha y hora.");
    $("rep-confirmar").disabled = true;
    try { const r = await DP.api(`/api/admin/charlas/${encodeURIComponent(reprogramando.id)}/reprogramar`, { method: "POST", body: datos });
          $("reprogramar").close(); informarAviso("Charla reprogramada.", r.aviso); cargar(); }
    catch (e) { manejarError(e, "aviso-reprogramar"); }
    finally { $("rep-confirmar").disabled = false; }
  });

  // ---------- Materiales de la sesión (vista previa) ----------
  function abrirMateriales(c) {
    const f = encodeURIComponent(c.fecha), t = Date.now();
    $("mat-titulo").textContent = "Materiales — " + DP.fechaLarga(c.fecha);
    $("mat-nota").textContent = "Incluyen todas las charlas publicadas de ese día. Se generan con los datos actuales; si edita una charla o las plantillas, vuelva a abrir esta ventana para ver el cambio.";
    aviso("aviso-materiales", "", "");
    $("mat-anuncio").src = `/api/admin/materiales?fecha=${f}&tipo=anuncio&t=${t}`;
    $("mat-afiche").src = `/api/admin/materiales?fecha=${f}&tipo=afiche-png&t=${t}`;
    $("mat-pdf").href = `/api/admin/materiales?fecha=${f}&tipo=afiche&t=${t}`;
    $("mat-png").href = `/api/admin/materiales?fecha=${f}&tipo=anuncio&descargar=1&t=${t}`;
    $("mat-cert").href = `/api/admin/materiales?charla=${encodeURIComponent(c.id)}&tipo=certificado&t=${t}`;
    $("materiales").showModal();
    cargarDifusion(c.fecha);
  }
  // ---------- Difusión de la sesión ----------
  let difFecha = null;
  const fechaHora = (iso) => { const d = new Date(iso); return DP.fechaLarga(iso.slice(0, 10)) + " a las " + d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }); };
  async function cargarDifusion(fecha) {
    difFecha = fecha; $("dif-estado").textContent = "Cargando…";
    let e; try { e = await DP.api("/api/admin/sesiones/" + fecha); } catch (x) { $("dif-estado").textContent = x.message; return; }
    const lineas = [];
    if (!e.correo) lineas.push("⚠️ El envío de correos no está configurado en Netlify.");
    lineas.push(`Suscriptores activos: ${e.suscriptores}.`);
    const an = e.envios.anuncio, re = e.envios.recordatorio;
    if (!e.aprobada) lineas.push(`Estado: <b>sin aprobar</b>. Al aprobar, el anuncio se enviará el ${DP.fechaLarga(e.fechaAnuncio)} a las ${e.horaEnvio} (o de inmediato si esa fecha ya pasó), y el recordatorio el mismo día de la sesión a las ${e.horaEnvio}.`);
    else lineas.push(`Estado: <b>aprobada</b>${e.aprobadaPor ? " por " + e.aprobadaPor : ""}.`);
    lineas.push("Anuncio: " + (an?.enviado ? `enviado el ${fechaHora(an.enviado)} a ${an.total} destinatario(s).` : e.aprobada ? `programado para el ${DP.fechaLarga(e.fechaAnuncio)} a las ${e.horaEnvio}.` : "pendiente de aprobación."));
    lineas.push("Recordatorio: " + (re?.enviado ? `enviado el ${fechaHora(re.enviado)}.` : re?.omitido ? "no corresponde (el anuncio salió el mismo día)." : e.aprobada ? `programado para el ${DP.fechaLarga(e.fecha)} a las ${e.horaEnvio}.` : "pendiente de aprobación."));
    $("dif-estado").innerHTML = lineas.join("<br>");
    $("dif-aprobar").classList.toggle("oculto", e.aprobada);
    $("dif-anular").classList.toggle("oculto", !e.aprobada || Boolean(an?.enviado && re));
    $("dif-enviar").textContent = an?.enviado ? "Reenviar el anuncio ahora" : "Enviar el anuncio ahora";
  }
  async function accionDifusion(accion, pregunta, exito) {
    if (pregunta && !confirm(pregunta)) return;
    ["dif-aprobar", "dif-prueba", "dif-enviar", "dif-anular"].forEach((id) => ($(id).disabled = true));
    aviso("aviso-materiales", "info", "Procesando…");
    try {
      const r = await DP.api(`/api/admin/sesiones/${difFecha}/${accion}`, { method: "POST", body: {} });
      const enviado = (r.hechos || []).find((h) => h[0] === "anuncio");
      aviso("aviso-materiales", "ok", typeof exito === "function" ? exito(r, enviado) : exito);
      cargarDifusion(difFecha); cargar();
    } catch (x) { aviso("aviso-materiales", "error", x.message); }
    finally { ["dif-aprobar", "dif-prueba", "dif-enviar", "dif-anular"].forEach((id) => ($(id).disabled = false)); }
  }
  $("dif-aprobar").onclick = () => accionDifusion("aprobar", "¿Aprobar los envíos de esta sesión? El anuncio y el recordatorio se enviarán a la lista en las fechas indicadas.",
    (r, env) => env ? `Envíos aprobados. Como la fecha del anuncio ya llegó, se está enviando ahora a ${env[1].total ?? 0} suscriptor(es).` : "Envíos aprobados y programados.");
  $("dif-prueba").onclick = () => accionDifusion("prueba", null, (r) => `Se envió una prueba del anuncio a ${r.prueba}. Revise su bandeja de entrada.`);
  $("dif-enviar").onclick = () => accionDifusion("enviar", "¿Enviar ahora el anuncio a toda la lista de suscriptores?", (r) => `Anuncio en envío a ${r.total} suscriptor(es).`);
  $("dif-anular").onclick = () => accionDifusion("anular", "¿Anular la aprobación? Los envíos pendientes no se realizarán hasta volver a aprobar.", "Aprobación anulada.");
  ["mat-anuncio", "mat-afiche"].forEach((id) => $(id).addEventListener("error", () => aviso("aviso-materiales", "error", "No se pudo generar la vista previa. Intente nuevamente en unos segundos.")));

  // ---------- Diálogos y copiar ----------
  document.querySelectorAll("[data-cerrar]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  document.querySelectorAll("[data-copiar]").forEach((b) => b.addEventListener("click", async () => {
    const el = $(b.dataset.copiar); el.select();
    try { await navigator.clipboard.writeText(el.value); } catch (e) { document.execCommand("copy"); }
    const t = b.textContent; b.textContent = "Copiado ✓"; setTimeout(() => (b.textContent = t), 1500);
  }));

  iniciar();
})();
