// «Quiénes somos»: muestra los integrantes desde el registro de personas del panel
// (solo quienes tienen «Publicar en el sitio» = Sí). Si el servicio no responde, la página queda como está escrita.
(function () {
  const EN = (document.documentElement.lang || "es").toLowerCase().startsWith("en");
  const UNIDAD_EN = { "Instituto de Matemáticas": "Institute of Mathematics", "Instituto de Física": "Institute of Physics",
                      "Doctorado en Matemática (consorcio PUCV-UV-UTFSM)": "PhD Program in Mathematics (PUCV-UV-UTFSM)" };
  const ENLACE_EN = { "Ficha IMA": "IMA profile", "Sitio web": "Website", "Página web": "Website", "Página personal": "Personal page" };
  const el = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto !== undefined) e.textContent = texto; return e; };
  const PARTICULAS = ["de", "del", "da", "do", "dos", "das", "la", "las", "los", "van", "von", "y"];
  const iniciales = (n) => n.split(/\s+/).filter((t) => !/^\w\.?$/.test(t) && !t.endsWith(".") && !PARTICULAS.includes(t.toLowerCase()))
    .slice(0, 2).map((t) => t[0]).join("").toUpperCase();

  function tarjeta(p) {
    const d = el("div", "person"), av = el("div", "avatar");
    if (p.foto) { const i = el("img"); i.src = p.foto; i.alt = p.nombre; i.loading = "lazy"; av.appendChild(i); } else av.textContent = iniciales(p.nombre);
    d.append(av, el("div", "nombre", p.nombre));
    const inst = EN ? p.institucionEn || p.institucion : p.institucion, unidad = EN ? UNIDAD_EN[p.unidad] || p.unidad : p.unidad;
    d.appendChild(el("div", "institucion", [unidad, inst].filter(Boolean).join(", ")));
    if (p.enlaces.length) {
      const e = el("div", "enlaces");
      p.enlaces.forEach((x, k) => { if (k) e.append(" · "); const a = el("a", "", EN ? ENLACE_EN[x.texto] || x.texto : x.texto);
        a.href = x.url; a.target = "_blank"; a.rel = "noopener"; e.appendChild(a); });
      d.appendChild(e);
    }
    return d;
  }
  fetch("/api/personas").then((r) => (r.ok ? r.json() : null)).then((datos) => {
    if (!datos || !datos.disponible) return;
    for (const grupo of ["investigadores", "postdoctorados", "colaboradores", "graduados", "estudiantes"]) {
      const bloque = document.querySelector(`[data-grupo="${grupo}"]`); if (!bloque) continue;
      const lista = datos[grupo] || [];
      bloque.classList.toggle("oculto-vacio", !lista.length); bloque.hidden = !lista.length;
      const grid = bloque.querySelector(".people-grid"); grid.replaceChildren(...lista.map(tarjeta));
    }
  }).catch(() => {});
})();
