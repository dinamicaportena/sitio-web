// Sección «Eventos» del panel: conferencias, workshops, escuelas y otros eventos del grupo.
(function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...hijos) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...hijos.filter((h) => h !== null && h !== undefined)); return e; };
  const aviso = (cont, tipo, m) => { const c = $(cont); c.innerHTML = ""; if (m) c.appendChild(el("div", { className: "aviso " + tipo, textContent: m })); };
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const termino = (e) => { const f = e.fin || e.inicio; return f.length === 7 ? f + "-31" : f; };
  function fechas(e) {
    const p = (f) => ({ a: f.slice(0, 4), m: Number(f.slice(5, 7)), d: f.length > 7 ? Number(f.slice(8, 10)) : null });
    const i = p(e.inicio), f = e.fin ? p(e.fin) : null;
    const uno = (x) => `${x.d ? x.d + " de " : ""}${MESES[x.m - 1]} de ${x.a}`;
    if (!f) return uno(i);
    if (i.a === f.a && i.m === f.m && i.d && f.d) return `${i.d} al ${f.d} de ${MESES[i.m - 1]} de ${i.a}`;
    return `${uno(i)} al ${uno(f)}`;
  }
  let eventos = [], editando = null;

  async function cargar() {
    try { eventos = await DP.api("/api/admin/eventos"); dibujar(); }
    catch (e) { if (e.estado === 401) return location.reload(); aviso("aviso-panel", "error", e.message); }
  }
  document.addEventListener("abrir-eventos", cargar);
  function fila(e) {
    const d = el("div", { className: "charla-fila " + (e.publicar ? "publicada" : "borrador") }, el("div", { className: "sin-foto evento-icono", textContent: e.tipo.slice(0, 1) }));
    const f = el("div", { className: "fecha", textContent: fechas(e) }, el("span", { className: "estado " + (e.publicar ? "publicada" : "borrador"), textContent: e.publicar ? "Publicado" : "Borrador" }));
    const acc = el("div", { className: "acciones" });
    const b = (t, c, fn) => { const x = el("button", { type: "button", className: "boton " + c, textContent: t }); x.onclick = fn; acc.appendChild(x); };
    b("Editar", "sec peq", () => abrir(e));
    b(e.publicar ? "Retirar del sitio" : "Publicar", "sec peq", () => publicar(e, !e.publicar));
    d.appendChild(el("div", { className: "info" }, f, el("div", { className: "titulo", textContent: e.titulo }),
      el("div", { className: "meta", textContent: [e.tipo, e.lugar, e.enlace ? "con página del evento" : ""].filter(Boolean).join(" · ") }), acc));
    return d;
  }
  function dibujar() {
    const h = hoy(), prox = eventos.filter((e) => termino(e) >= h).sort((a, b) => a.inicio.localeCompare(b.inicio)), ant = eventos.filter((e) => termino(e) < h);
    for (const [cont, n, lista] of [["ev-proximos", "ev-n-proximos", prox], ["ev-anteriores", "ev-n-anteriores", ant]]) {
      $(cont).innerHTML = ""; $(n).textContent = lista.length ? `(${lista.length})` : "";
      if (!lista.length) $(cont).appendChild(el("p", { className: "vacio", textContent: cont === "ev-proximos" ? "No hay eventos próximos." : "Aún no hay eventos anteriores registrados (puede importarlos con el Excel del registro, hoja «Eventos»)." }));
      lista.forEach((e) => $(cont).appendChild(fila(e)));
    }
  }
  function abrir(e) {
    editando = e || null; aviso("aviso-evento", "", "");
    $("ev-titulo-dialogo").textContent = e ? `Editar evento · ${e.id}` : "Nuevo evento";
    const v = (id, x) => ($(id).value = x || "");
    v("ev-titulo", e?.titulo); v("ev-titulo-en", e?.tituloEn); $("ev-tipo").value = e?.tipo || "Conferencia"; v("ev-lugar", e?.lugar);
    v("ev-inicio", e?.inicio); v("ev-fin", e?.fin); v("ev-descripcion", e?.descripcion); v("ev-descripcion-en", e?.descripcionEn); v("ev-enlace", e?.enlace);
    $("ev-publicar").checked = Boolean(e?.publicar); $("ev-eliminar").classList.toggle("oculto", !e);
    $("editor-evento").showModal(); $("ev-titulo").focus();
  }
  $("ev-nuevo").addEventListener("click", () => abrir(null));
  $("form-evento").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const cuerpo = { titulo: $("ev-titulo").value.trim(), tituloEn: $("ev-titulo-en").value.trim(), tipo: $("ev-tipo").value, lugar: $("ev-lugar").value.trim(),
      inicio: $("ev-inicio").value.trim(), fin: $("ev-fin").value.trim(), descripcion: $("ev-descripcion").value.trim(), descripcionEn: $("ev-descripcion-en").value.trim(),
      enlace: $("ev-enlace").value.trim(), publicar: $("ev-publicar").checked };
    $("ev-guardar").disabled = true;
    try {
      editando ? await DP.api("/api/admin/eventos/" + editando.id, { method: "PUT", body: cuerpo }) : await DP.api("/api/admin/eventos", { method: "POST", body: cuerpo });
      $("editor-evento").close(); aviso("aviso-panel", "ok", "Evento guardado." + (cuerpo.publicar ? " Puede demorar unos minutos en verse en el sitio." : "")); cargar();
    } catch (e) { aviso("aviso-evento", "error", e.message); }
    finally { $("ev-guardar").disabled = false; }
  });
  async function publicar(e, si) {
    try { await DP.api("/api/admin/eventos/" + e.id, { method: "PUT", body: { publicar: si } }); aviso("aviso-panel", "ok", si ? "Evento publicado." : "Evento retirado del sitio."); cargar(); }
    catch (x) { aviso("aviso-panel", "error", x.message); }
  }
  $("ev-eliminar").addEventListener("click", async () => {
    if (!confirm(`¿Eliminar el evento «${editando.titulo}»? Si solo quiere ocultarlo, use «Retirar del sitio».`)) return;
    try { await DP.api("/api/admin/eventos/" + editando.id, { method: "DELETE" }); $("editor-evento").close(); aviso("aviso-panel", "ok", "Evento eliminado."); cargar(); }
    catch (x) { aviso("aviso-evento", "error", x.message); }
  });
})();
