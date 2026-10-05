// Pestaña «Plantillas»: datos de los documentos, imágenes y textos de los correos.
(function () {
  const $ = (id) => document.getElementById(id);
  let P = null;
  const aviso = (tipo, m) => { const el = $("aviso-panel"); el.innerHTML = ""; if (!m) return;
    const d = document.createElement("div"); d.className = "aviso " + tipo; d.textContent = m; el.appendChild(d); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const CAMPOS = ["institucion-es", "institucion-en", "direccion", "email", "web", "firmaNombre", "ciudad", "firmaCargo-es", "firmaCargo-en", "organizadorEmail"];
  const leer = (obj, k) => { const [a, b] = k.split("-"); return b ? (obj[a] || {})[b] || "" : obj[a] || ""; };

  document.addEventListener("abrir-plantillas", cargar);
  async function cargar() {
    try { P = await DP.api("/api/admin/plantillas"); } catch (e) { return aviso("error", e.message); }
    CAMPOS.forEach((k) => ($("d-" + k).value = leer(P.datos, k)));
    const sel = $("t-tipo"); sel.innerHTML = "";
    Object.entries(P.nombresTextos).forEach(([k, n]) => { const o = document.createElement("option"); o.value = k; o.textContent = n; sel.appendChild(o); });
    mostrarTexto(); dibujarComponentes();
  }

  $("form-datos").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const d = {};
    CAMPOS.forEach((k) => { const [a, b] = k.split("-"), v = $("d-" + k).value; if (b) (d[a] ||= {})[b] = v; else d[a] = v; });
    try { await DP.api("/api/admin/plantillas", { method: "PUT", body: { datos: d } }); aviso("ok", "Datos guardados."); cargar(); }
    catch (e) { aviso("error", e.message); }
  });

  // ----- Textos -----
  function mostrarTexto() {
    const t = P.textos[$("t-tipo").value][$("t-idioma").value];
    $("t-asunto").value = t.asunto; $("t-cuerpo").value = t.cuerpo;
    $("t-asunto").closest(".campo").classList.toggle("oculto", $("t-tipo").value === "firma");   // la firma no lleva asunto
  }
  $("t-tipo").addEventListener("change", mostrarTexto); $("t-idioma").addEventListener("change", mostrarTexto);
  async function guardarTexto(asunto, cuerpo) {
    const tipo = $("t-tipo").value, idioma = $("t-idioma").value;
    const textos = JSON.parse(JSON.stringify(P.textos)); textos[tipo][idioma] = { asunto, cuerpo };
    await DP.api("/api/admin/plantillas", { method: "PUT", body: { textos } });
    P.textos = textos;
  }
  $("form-textos").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try { await guardarTexto($("t-asunto").value, $("t-cuerpo").value); aviso("ok", "Texto guardado."); } catch (e) { aviso("error", e.message); }
  });
  $("t-restaurar").addEventListener("click", async () => {
    const b = P.textosBase[$("t-tipo").value][$("t-idioma").value];
    if (!confirm("¿Restaurar el texto original de este correo?")) return;
    try { await guardarTexto(b.asunto, b.cuerpo); mostrarTexto(); aviso("ok", "Texto original restaurado."); } catch (e) { aviso("error", e.message); }
  });

  // ----- Imágenes -----
  function dibujarComponentes() {
    const cont = $("lista-componentes"); cont.innerHTML = "";
    P.componentes.forEach((c) => {
      const d = document.createElement("div"); d.className = "componente";
      const m = document.createElement("div"); m.className = "muestra" + (/Blanc/.test(c.nombre) ? " oscuro" : "");
      if (c.propio || c.tieneBase) { const i = document.createElement("img"); i.alt = c.descripcion; i.src = `/api/admin/plantillas/componente/${c.nombre}?t=${Date.now()}`; m.appendChild(i); }
      else { m.textContent = "Sin imagen"; m.style.color = "var(--texto-suave)"; m.style.fontSize = "13px"; }
      const p = document.createElement("p"); p.textContent = c.descripcion;
      if (c.propio) { const s = document.createElement("div"); s.className = "propio"; s.textContent = "Imagen personalizada"; p.prepend(s); }
      const acc = document.createElement("div"); acc.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/png,image/jpeg"; inp.style.display = "none";
      const b1 = document.createElement("button"); b1.className = "boton sec peq"; b1.textContent = c.propio || c.tieneBase ? "Reemplazar" : "Subir"; b1.onclick = () => inp.click();
      inp.onchange = async () => {
        const a = inp.files[0]; if (!a) return;
        if (a.size > 8 * 1024 * 1024) return aviso("error", "La imagen supera los 8 MB.");
        const url = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(a); });
        try { await DP.api(`/api/admin/plantillas/componente/${c.nombre}`, { method: "POST", body: { imagen: url } }); aviso("ok", "Imagen actualizada."); cargar(); }
        catch (e) { aviso("error", e.message); }
      };
      acc.append(b1, inp);
      if (c.propio) { const b2 = document.createElement("button"); b2.className = "boton peligro"; b2.textContent = c.tieneBase ? "Restaurar original" : "Quitar";
        b2.onclick = async () => { if (!confirm("¿Volver a la imagen original?")) return;
          try { await DP.api(`/api/admin/plantillas/componente/${c.nombre}`, { method: "DELETE" }); cargar(); } catch (e) { aviso("error", e.message); } };
        acc.appendChild(b2); }
      d.append(m, p, acc); cont.appendChild(d);
    });
  }
})();
