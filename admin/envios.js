// Pestañas del panel y sección «Envíos» (revisión automática diaria e historial de envíos a la lista).
(function () {
  const $ = (id) => document.getElementById(id);
  const aviso = (tipo, m) => { const el = $("aviso-panel"); el.innerHTML = ""; if (!m) return;
    const d = document.createElement("div"); d.className = "aviso " + tipo; d.textContent = m; el.appendChild(d); };
  const fecha = (iso) => iso ? DP.fechaLarga(iso) : "";

  // Cambio de pestaña: muestra «vista-<nombre>» y avisa con el evento «abrir-<nombre>»
  document.querySelectorAll(".pestana").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".pestana").forEach((x) => {
      x.classList.toggle("activa", x === b);
      $("vista-" + x.dataset.vista).classList.toggle("oculto", x !== b);
    });
    aviso("", "");
    document.dispatchEvent(new Event("abrir-" + b.dataset.vista));
  }));
  document.addEventListener("abrir-envios", () => { cargarRevision(); cargarEnvios(); });

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
