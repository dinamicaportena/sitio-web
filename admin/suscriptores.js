// Sección «Suscriptores» del panel y cambio de pestañas.
(function () {
  const $ = (id) => document.getElementById(id);
  let lista = [];
  const aviso = (tipo, m) => { const el = $("aviso-panel"); el.innerHTML = ""; if (!m) return;
    const d = document.createElement("div"); d.className = "aviso " + tipo; d.textContent = m; el.appendChild(d); };
  const fecha = (iso) => iso ? DP.fechaLarga(iso.slice(0, 10)) : "";

  document.querySelectorAll(".pestana").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".pestana").forEach((x) => x.classList.toggle("activa", x === b));
    $("vista-charlas").classList.toggle("oculto", b.dataset.vista !== "charlas");
    $("vista-suscriptores").classList.toggle("oculto", b.dataset.vista !== "suscriptores");
    $("vista-plantillas").classList.toggle("oculto", b.dataset.vista !== "plantillas");
    if (b.dataset.vista === "plantillas") document.dispatchEvent(new Event("abrir-plantillas"));
    aviso("", "");
    if (b.dataset.vista === "suscriptores") cargar();
  }));

  async function cargar() {
    try {
      [lista] = await Promise.all([DP.api("/api/admin/suscriptores")]);
      dibujar(); cargarEnvios(); cargarRevision();
    } catch (e) { aviso("error", e.message); }
  }
  function dibujar() {
    const q = $("s-buscar").value.trim().toLowerCase();
    const activos = lista.filter((s) => s.estado === "activo").length;
    $("s-cuenta").textContent = `(${activos} activos${lista.length - activos ? `, ${lista.length - activos} dados de baja` : ""})`;
    const tb = $("s-tabla").querySelector("tbody"); tb.innerHTML = "";
    const filas = lista.filter((s) => !q || s.email.includes(q) || (s.nombre || "").toLowerCase().includes(q));
    if (!filas.length) { const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = 5; td.className = "vacio";
      td.textContent = lista.length ? "Sin resultados." : "Aún no hay suscriptores."; tr.appendChild(td); tb.appendChild(tr); }
    filas.forEach((s) => {
      const tr = document.createElement("tr"); if (s.estado === "baja") tr.className = "baja";
      const celda = (t) => { const td = document.createElement("td"); td.textContent = t; tr.appendChild(td); return td; };
      celda(s.email); celda(s.nombre || ""); celda(s.estado === "activo" ? "Activo" : "Dado de baja");
      celda(fecha(s.estado === "baja" ? s.baja : (s.reactivado || s.alta)));
      const acc = celda("");
      if (s.estado === "baja") { const b = document.createElement("button"); b.className = "boton sec peq"; b.textContent = "Reactivar";
        b.onclick = () => reactivar(s); acc.appendChild(b); acc.append(" "); }
      const d = document.createElement("button"); d.className = "boton peligro"; d.textContent = "Eliminar"; d.onclick = () => eliminar(s); acc.appendChild(d);
      tb.appendChild(tr);
    });
  }
  $("s-buscar").addEventListener("input", dibujar);

  $("s-agregar").addEventListener("click", async () => {
    const texto = $("s-texto").value;
    if (!texto.trim()) return aviso("error", "Pegue al menos un correo.");
    $("s-agregar").disabled = true;
    try {
      const r = await DP.api("/api/admin/suscriptores", { method: "POST", body: { texto, reactivarBajas: $("s-reactivar").checked } });
      const partes = [`${r.agregados} agregado(s)`];
      if (r.existentes) partes.push(`${r.existentes} ya estaban en la lista`);
      if (r.reactivados) partes.push(`${r.reactivados} reactivado(s)`);
      if (r.bajasOmitidas.length) partes.push(`${r.bajasOmitidas.length} omitido(s) por haberse dado de baja: ${r.bajasOmitidas.join(", ")}`);
      if (r.invalidos.length) partes.push(`${r.invalidos.length} no reconocido(s): ${r.invalidos.slice(0, 10).join(", ")}${r.invalidos.length > 10 ? "…" : ""}`);
      aviso(r.invalidos.length || r.bajasOmitidas.length ? "info" : "ok", partes.join(" · ") + ".");
      $("s-texto").value = ""; $("s-reactivar").checked = false; cargar();
    } catch (e) { aviso("error", e.message); }
    finally { $("s-agregar").disabled = false; }
  });
  async function eliminar(s) {
    if (!confirm(`¿Eliminar a ${s.email} de la lista?\n\nSi la persona pidió no recibir más correos, es preferible dejarla como «dada de baja», para que no se vuelva a agregar por error.`)) return;
    try { await DP.api("/api/admin/suscriptores/" + s.id, { method: "DELETE" }); cargar(); } catch (e) { aviso("error", e.message); }
  }
  async function reactivar(s) {
    if (!confirm(`¿Reactivar a ${s.email}? Hágalo solo si la persona lo solicitó.`)) return;
    try { await DP.api(`/api/admin/suscriptores/${s.id}/reactivar`, { method: "POST", body: {} }); cargar(); } catch (e) { aviso("error", e.message); }
  }
  $("s-exportar").addEventListener("click", () => {
    const esc = (x) => `"${String(x || "").replace(/"/g, '""')}"`;
    const csv = ["correo,nombre,estado,alta,baja"].concat(lista.map((s) => [s.email, s.nombre, s.estado, s.alta, s.baja].map(esc).join(","))).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
    a.download = "suscriptores-dinamica-portena.csv"; a.click(); URL.revokeObjectURL(a.href);
  });

  const NOMBRE_ACCION = { anuncio: "anuncio", recordatorio: "recordatorio", certificado: "certificado", "reanudar-envios": "envíos reanudados", error: "error" };
  function describir(r) {
    if (!r) return "Aún no se ha ejecutado ninguna revisión.";
    const cuando = `${DP.fechaLarga(r.fecha)} a las ${r.hora}${r.manual ? " (ejecutada manualmente)" : ""}`;
    if (!r.acciones.length) return `Última revisión: ${cuando}. No había envíos pendientes.`;
    return `Última revisión: ${cuando}. ` + r.acciones.map((a) =>
      `${NOMBRE_ACCION[a.tipo] || a.tipo}${a.sesion ? " de la sesión del " + DP.fechaLarga(a.sesion) : ""}: ${a.ok ? (a.total != null ? a.total + " destinatario(s)" : "hecho") : "no enviado" + (a.motivo ? " (" + a.motivo + ")" : "")}`).join("; ") + ".";
  }
  // Hora de la revisión diaria
  (function () { const sel = $("rev-hora"); for (let h = 6; h <= 20; h++) { const v = String(h).padStart(2, "0") + ":00";
    const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); } })();
  async function cargarHora() {
    try { const p = await DP.api("/api/admin/plantillas"); $("rev-hora").value = p.datos.horaEnvio || "08:00"; } catch (e) {}
  }
  $("rev-guardar-hora").addEventListener("click", async () => {
    const h = $("rev-hora").value;
    try { await DP.api("/api/admin/plantillas", { method: "PUT", body: { datos: { horaEnvio: h } } });
          aviso("ok", `Hora de la revisión diaria: ${h} (hora de Chile). Los anuncios y recordatorios programados se enviarán a esa hora.`); }
    catch (e) { aviso("error", e.message); }
  });
  async function cargarRevision() {
    cargarHora();
    try { $("rev-estado").textContent = describir(await DP.api("/api/admin/revision")); } catch (e) { $("rev-estado").textContent = e.message; }
  }
  $("rev-ejecutar").addEventListener("click", async () => {
    if (!confirm("¿Ejecutar ahora la revisión? Se enviará todo lo que ya corresponda según las reglas de fecha y hora (anuncios, recordatorios y certificados).")) return;
    $("rev-ejecutar").disabled = true;
    try { const r = await DP.api("/api/admin/revision", { method: "POST", body: {} }); $("rev-estado").textContent = describir(r); cargarEnvios(); }
    catch (e) { aviso("error", e.message); }
    finally { $("rev-ejecutar").disabled = false; }
  });

  const ESTADO_ENVIO = { pendiente: "En cola", enviando: "Enviando…", completado: "Completado" };
  async function cargarEnvios() {
    const tb = $("e-tabla").querySelector("tbody"); tb.innerHTML = "";
    let envios = []; try { envios = await DP.api("/api/admin/envios"); } catch (e) {}
    if (!envios.length) { const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = 5; td.className = "vacio";
      td.textContent = "Aún no hay envíos a la lista."; tr.appendChild(td); tb.appendChild(tr); return; }
    envios.forEach((e) => { const tr = document.createElement("tr");
      [fecha(e.creado), e.asunto, ESTADO_ENVIO[e.estado] || e.estado, `${e.enviados} de ${e.total}`, e.fallidos].forEach((t) => {
        const td = document.createElement("td"); td.textContent = t; tr.appendChild(td); }); tb.appendChild(tr); });
  }
})();
