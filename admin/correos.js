// Pestaña «Correos» del panel central: escribir a la lista de divulgación, a los inscritos de un evento o a correos puntuales,
// y aprobar o rechazar los correos a la lista que piden los administradores de las páginas de evento.
(function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...hijos) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...hijos.filter((h) => h !== null && h !== undefined)); return e; };
  const aviso = (tipo, m) => { const c = $("aviso-panel"); c.replaceChildren(); if (m) c.append(el("div", { className: "aviso " + tipo, textContent: m })); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const b = { tipo: "lista", slug: "", estados: { aprobada: true, pendiente: false, rechazada: false }, correos: "", asunto: "", cuerpo: "", idioma: "es", firma: true };
  const ESTADO = { enviado: ["Enviado", "publicada"], rechazado: ["No aprobado", "cancelada"], "por-aprobar": ["Por aprobar", "pendiente"] };
  let info = null;

  function badge(n) { const c = $("n-por-aprobar"); c.textContent = n; c.classList.toggle("oculto", !n); }
  async function cargar() {
    const v = $("vista-correos"); v.replaceChildren(el("p", { className: "vacio", textContent: "Cargando…" }));
    try { info = await DP.api("/api/admin/mensajes"); } catch (e) { if (e.estado === 401) return location.reload(); v.replaceChildren(el("div", { className: "aviso error", textContent: e.message })); return; }
    badge(info.porAprobar.length); dibujar();
  }

  function dibujar() {
    const v = $("vista-correos"); v.replaceChildren();
    // --- por aprobar ---
    if (info.porAprobar.length) {
      v.append(el("h2", { className: "grupo-titulo", textContent: "Correos a la lista por aprobar" }),
        el("p", { className: "vacio", style: "margin-top:0", textContent: "Pedidos por administradores de páginas de evento. Al aprobarlos se envían de inmediato a la lista de divulgación, con el nombre del evento como remitente." }));
      info.porAprobar.forEach((m) => {
        const motivo = el("input", { type: "text", maxLength: 500, placeholder: "Motivo (opcional; se le informa a quien lo pidió)" });
        const resolver = async (accion) => {
          if (accion === "aprobar" && !confirm(`¿Aprobar y enviar «${m.asunto}» a la lista de divulgación (${info.lista} suscriptores)?`)) return;
          try { await DP.api(`/api/admin/mensajes/${m.id}/${accion}`, { method: "POST", body: { motivo: motivo.value } }); await cargar(); aviso("ok", accion === "aprobar" ? "Correo aprobado: se está enviando a la lista." : "Correo rechazado; se avisó a quien lo pidió."); }
          catch (e) { aviso("error", e.message); }
        };
        v.append(el("div", { className: "tarjeta", style: "margin:0 0 14px" },
          el("div", { className: "meta", textContent: `${DP.fechaLarga(m.creado)} · ${m.autor} · ${m.descripcion}` }),
          el("h3", { textContent: m.asunto, style: "margin:6px 0 8px" }),
          el("pre", { textContent: m.cuerpo, style: "white-space:pre-wrap;font:14.5px/1.5 Roboto,Arial,sans-serif;background:#f6f8fa;border:1px solid #e1e5ea;border-radius:4px;padding:10px 12px;max-height:340px;overflow:auto" }),
          el("div", { className: "campo" }, motivo),
          el("p", { style: "display:flex;gap:8px;flex-wrap:wrap" },
            el("button", { type: "button", className: "boton peq", textContent: "Aprobar y enviar", onclick: () => resolver("aprobar") }),
            el("button", { type: "button", className: "boton sec peq", textContent: "Rechazar", onclick: () => resolver("rechazar") }))));
      });
    }
    // --- escribir ---
    const tipo = el("select", { id: "co-tipo" }, el("option", { value: "lista", textContent: `Lista de divulgación de Dinámica Porteña (${info.lista} suscriptores)` }),
      el("option", { value: "inscritos", textContent: "Inscritos de una página de evento" }), el("option", { value: "correos", textContent: "Correos puntuales" }));
    tipo.value = b.tipo;
    const evento = el("select", { id: "co-evento" }, el("option", { value: "", textContent: "— elija el evento —" }), ...info.eventos.map((e) => el("option", { value: e.slug, textContent: e.nombre })));
    evento.value = b.slug;
    const estados = el("div", { style: "display:flex;gap:6px 18px;flex-wrap:wrap" });
    const total = el("p", { className: "vacio", style: "margin:4px 0 12px" });
    const ev = () => info.eventos.find((e) => e.slug === b.slug);
    function pintarEstados() {
      estados.replaceChildren(...[["aprobada", "Aprobadas"], ["pendiente", "Pendientes"], ["rechazada", "Rechazadas"]].map(([k, t]) => {
        const c = el("input", { type: "checkbox", checked: b.estados[k] }); c.onchange = () => { b.estados[k] = c.checked; pintarTotal(); };
        return el("label", { className: "casilla", style: "margin:0" }, c, el("span", { textContent: `${t}${ev() ? ` (${ev().inscritos[k] || 0})` : ""}` }));
      }));
    }
    const correos = el("textarea", { id: "co-correos", value: b.correos, placeholder: "Un correo por línea, o separados por comas", rows: 4 }); correos.oninput = () => { b.correos = correos.value; pintarTotal(); };
    function pintarTotal() {
      const n = b.tipo === "lista" ? info.lista : b.tipo === "inscritos" ? (ev() ? Object.entries(b.estados).filter(([, x]) => x).reduce((a, [k]) => a + (ev().inscritos[k] || 0), 0) : 0)
        : (b.correos.match(/[^\s,;<>()"]+@[^\s,;<>()"]+\.[^\s,;<>()"]+/g) || []).length;
      total.textContent = b.tipo === "lista" ? `${n} destinatarios. Cada suscriptor recibe el correo por separado, con su enlace personal para darse de baja.`
        : b.tipo === "inscritos" ? (ev() ? `${n} destinatario(s). Cada inscrito lo recibe por separado, con una nota que indica que lo recibe por estar inscrito en el evento.` : "Elija el evento.")
        : `${n} correo(s). Cada destinatario lo recibe por separado.`;
    }
    const filaEvento = el("div", {}, el("div", { className: "campo" }, el("label", { htmlFor: "co-evento", textContent: "Evento" }), evento), el("div", { className: "campo" }, el("label", { textContent: "Inscripciones" }), estados));
    const filaCorreos = el("div", { className: "campo" }, el("label", { htmlFor: "co-correos", textContent: "Correos" }), correos);
    const visibles = () => { filaEvento.classList.toggle("oculto", b.tipo !== "inscritos"); filaCorreos.classList.toggle("oculto", b.tipo !== "correos"); pintarEstados(); pintarTotal(); };
    tipo.onchange = () => { b.tipo = tipo.value; visibles(); };
    evento.onchange = () => { b.slug = evento.value; visibles(); };
    const asunto = el("input", { type: "text", id: "co-asunto", maxLength: 200, value: b.asunto }); asunto.oninput = () => { b.asunto = asunto.value; };
    const cuerpo = el("textarea", { id: "co-cuerpo", value: b.cuerpo, rows: 14, placeholder: "Estimados/as:\n\n…\n\nSaludos cordiales," }); cuerpo.oninput = () => { b.cuerpo = cuerpo.value; };
    const idioma = el("select", { id: "co-idioma" }, el("option", { value: "es", textContent: "Español" }), el("option", { value: "en", textContent: "Inglés" })); idioma.value = b.idioma; idioma.onchange = () => { b.idioma = idioma.value; };
    const firma = el("input", { type: "checkbox", id: "co-firma", checked: b.firma }); firma.onchange = () => { b.firma = firma.checked; };
    const cuerpoEnvio = (prueba) => ({ prueba, asunto: b.asunto, cuerpo: b.cuerpo, idioma: b.idioma, firma: b.firma,
      destino: { tipo: b.tipo, slug: b.slug, estados: Object.entries(b.estados).filter(([, x]) => x).map(([k]) => k), texto: b.correos } });
    const enviarBtn = el("button", { type: "button", className: "boton", textContent: "Enviar" });
    enviarBtn.onclick = async () => {
      if (!confirm(`¿Enviar «${b.asunto}»? ${total.textContent.split(".")[0]}. No se puede deshacer.`)) return;
      enviarBtn.disabled = true;
      try { const m = await DP.api("/api/admin/mensajes", { method: "POST", body: cuerpoEnvio(false) }); Object.assign(b, { asunto: "", cuerpo: "", correos: "" }); await cargar(); aviso("ok", `Correo en envío a ${m.total} destinatario(s). El avance se ve en la pestaña «Envíos».`); }
      catch (e) { enviarBtn.disabled = false; aviso("error", e.message); }
    };
    v.append(el("h2", { className: "grupo-titulo", textContent: "Escribir un correo" }),
      el("p", { className: "vacio", style: "margin-top:0", textContent: "Sale desde la cuenta de Dinámica Porteña; las respuestas llegan al correo del grupo (pestaña Plantillas)." }),
      el("div", { className: "tarjeta" },
        el("div", { className: "fila2" }, el("div", { className: "campo" }, el("label", { htmlFor: "co-tipo", textContent: "Destinatarios" }), tipo),
          el("div", { className: "campo" }, el("label", { htmlFor: "co-idioma", textContent: "Idioma de la firma y del pie del correo" }), idioma)),
        filaEvento, filaCorreos, total,
        el("div", { className: "campo" }, el("label", { htmlFor: "co-asunto", textContent: "Asunto" }), asunto),
        el("div", { className: "campo" }, el("label", { htmlFor: "co-cuerpo", textContent: "Texto" }), cuerpo,
          el("div", { className: "ayuda", textContent: "Texto simple: deje una línea en blanco entre párrafos. Las direcciones web (https://…) quedan como enlaces." })),
        el("label", { className: "casilla" }, firma, el("span", { textContent: "Agregar la firma de Dinámica Porteña al final (se edita en Plantillas → Textos de los correos → «Firma de los correos escritos en el panel»)" })),
        el("p", { style: "display:flex;gap:8px;flex-wrap:wrap" },
          el("button", { type: "button", className: "boton sec", textContent: "Enviarme una prueba", onclick: async () => {
            try { const r = await DP.api("/api/admin/mensajes", { method: "POST", body: cuerpoEnvio(true) }); aviso("ok", `Prueba enviada a ${r.prueba}.`); } catch (e) { aviso("error", e.message); } } }),
          enviarBtn)));
    visibles();
    // --- historial ---
    const tb = el("tbody");
    if (!info.mensajes.length) tb.append(el("tr", {}, el("td", { colSpan: 4, className: "vacio", textContent: "Aún no se han escrito correos desde los paneles." })));
    info.mensajes.forEach((m) => { const [t, c] = ESTADO[m.estado] || [m.estado, ""];
      tb.append(el("tr", {}, el("td", { textContent: DP.fechaLarga(m.creado) }),
        el("td", {}, el("strong", { textContent: m.asunto }), el("div", { className: "meta", textContent: `${m.descripcion} · ${m.autor}${m.aprobadoPor ? " · aprobado por " + m.aprobadoPor : ""}${m.motivo ? " · motivo: " + m.motivo : ""}` })),
        el("td", { textContent: m.total ?? "—" }), el("td", {}, el("span", { className: "estado " + c, textContent: t })))); });
    v.append(el("h2", { className: "grupo-titulo", textContent: "Correos escritos desde los paneles" }),
      el("div", { style: "overflow-x:auto" }, el("table", { className: "tabla" }, el("thead", {}, el("tr", {}, ...["Fecha", "Correo", "Destinatarios", "Estado"].map((x) => el("th", { textContent: x })))), tb)));
  }

  document.addEventListener("abrir-correos", cargar);
  document.addEventListener("panel-listo", async () => { try { badge((await DP.api("/api/admin/mensajes")).porAprobar.length); } catch (e) {} });
})();
