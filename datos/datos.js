// Formulario para que una persona actualice sus datos con su enlace personal (un solo uso).
(function () {
  const $ = (id) => document.getElementById(id);
  const TEXTOS = {
    es: { inst: "Instituto de Matemáticas, Pontificia Universidad Católica de Valparaíso", pie: "Instituto de Matemáticas, Facultad de Ciencias, Pontificia Universidad Católica de Valparaíso",
      titulo: "Actualización de sus datos", subtitulo: "Grupo de investigación Dinámica Porteña", cargando: "Cargando…",
      intro: "Revise sus datos y corrija lo que corresponda. Este enlace es personal y sirve para un solo envío. Sus datos anteriores quedan guardados en el registro del grupo; sus correos nunca se publican.",
      sDatos: "Datos personales", nombre: "Nombre, tal como desea que aparezca *", correo: "Correo principal *", otros: "Otros correos (uno por línea)",
      sInst: "Institución actual", inst2: "Institución", otraNombre: "Nombre de la institución *", otraPais: "País *",
      unidad: "Unidad (instituto, departamento o programa; opcional)", desde: "Desde (si cambió de institución)",
      ayudaInst: "Si cambió de institución, la anterior queda en su historial: sus charlas pasadas conservan la institución que tenía entonces.",
      sColab: "Colaboración con el grupo", retiro: "Deseo dejar de figurar como colaborador/a del grupo",
      sAcad: "Situación académica (solo si es o fue estudiante de postgrado vinculado/a al grupo)", situacion: "Situación", programa: "Programa",
      director: "Director/a de tesis", fechaAcad: "Fecha de graduación o de ingreso", ayudaAcad: "Los organizadores revisarán esta información antes de registrarla.",
      sPublico: "Perfil en el sitio del grupo", publicar: "Acepto que mi nombre e institución aparezcan en el sitio del grupo", zbmath: "zbMATH (identificador de autor)",
      enlaces: "Enlaces públicos (uno por línea: «Texto | https://…»)", foto: "Foto (opcional)", fotoOk: "Autorizo publicar mi foto en el sitio del grupo",
      sCorreos: "Anuncios del seminario", suscrito: "Deseo recibir por correo los anuncios del Seminario Dinámica Porteña",
      sComent: "Comentarios para los organizadores", enviar: "Enviar mis datos", enviando: "Enviando…",
      elija: "— elija su institución —", otra: "Otra (no está en la lista)",
      situaciones: ["", "Estudiante de magíster", "Estudiante de doctorado", "Graduado/a de magíster", "Graduado/a de doctorado", "Otra"],
      vence: (f) => `El enlace vence el ${DP.fechaLarga(f, "", "es")}.`,
      invalido: "Este enlace no es válido, ya se usó o venció. Si necesita uno nuevo, escriba a dinamica.portena@pucv.cl.",
      faltaNombre: "Indique su nombre.", faltaCorreo: "Indique un correo principal válido.", faltaOtra: "Indique el nombre y el país de su institución.",
      enlaceMalo: (x) => `Revise el enlace «${x}»: debe comenzar con https://`,
      gracias: (r) => `¡Muchas gracias! Sus datos quedaron actualizados${r.cambios.length ? " (" + r.cambios.join(", ").toLowerCase() + ")" : ""}.` +
        (r.solicitudes ? " Los organizadores revisarán la información que requiere su confirmación." : "") + " Este enlace ya no puede volver a usarse." },
    en: { inst: "Institute of Mathematics, Pontifical Catholic University of Valparaíso", pie: "Institute of Mathematics, Faculty of Sciences, Pontifical Catholic University of Valparaíso",
      titulo: "Update your details", subtitulo: "Dinámica Porteña research group", cargando: "Loading…",
      intro: "Please review your details and correct whatever is needed. This link is personal and can be used once. Your previous details remain stored in the group's records; your email addresses are never published.",
      sDatos: "Personal details", nombre: "Name, as you wish it to appear *", correo: "Main email address *", otros: "Other email addresses (one per line)",
      sInst: "Current institution", inst2: "Institution", otraNombre: "Name of the institution *", otraPais: "Country *",
      unidad: "Unit (institute, department or program; optional)", desde: "Since (if you changed institution)",
      ayudaInst: "If you changed institution, the previous one remains in your record: your past talks keep the institution you had at the time.",
      sColab: "Collaboration with the group", retiro: "I no longer wish to be listed as a collaborator of the group",
      sAcad: "Academic status (only if you are or were a graduate student connected to the group)", situacion: "Status", programa: "Program",
      director: "Thesis advisor", fechaAcad: "Graduation or enrollment date", ayudaAcad: "The organizers will review this information before recording it.",
      sPublico: "Profile on the group's website", publicar: "I agree that my name and institution appear on the group's website", zbmath: "zbMATH (author identifier)",
      enlaces: "Public links (one per line: “Text | https://…”)", foto: "Photo (optional)", fotoOk: "I authorize the publication of my photo on the group's website",
      sCorreos: "Seminar announcements", suscrito: "I wish to receive the Dinámica Porteña Seminar announcements by email",
      sComent: "Comments for the organizers", enviar: "Submit my details", enviando: "Submitting…",
      elija: "— choose your institution —", otra: "Other (not in the list)",
      situaciones: ["", "Master's student", "PhD student", "Master's graduate", "PhD graduate", "Other"],
      vence: (f) => `The link expires on ${DP.fechaLarga(f, "", "en")}.`,
      invalido: "This link is not valid, has already been used, or has expired. If you need a new one, please write to dinamica.portena@pucv.cl.",
      faltaNombre: "Please enter your name.", faltaCorreo: "Please enter a valid main email address.", faltaOtra: "Please enter the name and country of your institution.",
      enlaceMalo: (x) => `Please check the link “${x}”: it must start with https://`,
      gracias: (r) => `Thank you very much! Your details have been updated${r.cambios.length ? " (" + r.cambios.length + " field(s))" : ""}.` +
        (r.solicitudes ? " The organizers will review the information that requires confirmation." : "") + " This link can no longer be used." },
  };
  const SITUACION_ES = ["", "Estudiante de magíster", "Estudiante de doctorado", "Graduado/a de magíster", "Graduado/a de doctorado", "Otra"];
  const token = new URLSearchParams(location.search).get("t") || "";
  let idioma = (navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en";
  let d = null, foto;

  const aviso = (tipo, m) => { const e = $("aviso"); e.innerHTML = ""; if (m) { const x = document.createElement("div"); x.className = "aviso " + tipo; x.textContent = m; e.appendChild(x); } };
  function opciones() {
    const T = TEXTOS[idioma], sel = $("d-inst"), actual = sel.value || d?.institucion?.id || "";
    sel.innerHTML = "";
    const op = (v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o); };
    op("", T.elija);
    [...(d?.catalogo || [])].sort((a, b) => (idioma === "en" && a.nombreEn || a.nombre).localeCompare(idioma === "en" && b.nombreEn || b.nombre, idioma))
      .forEach((i) => op(i.id, `${idioma === "en" && i.nombreEn ? i.nombreEn : i.nombre}${i.sigla ? " (" + i.sigla + ")" : ""} — ${i.pais}`));
    op("otra", T.otra); sel.value = actual;
    const s = $("d-situacion"), sv = s.selectedIndex; s.innerHTML = "";
    T.situaciones.forEach((t, k) => { const o = document.createElement("option"); o.value = SITUACION_ES[k]; o.textContent = t; s.appendChild(o); });
    s.selectedIndex = Math.max(0, sv);
  }
  function aplicarIdioma() {
    const T = TEXTOS[idioma];
    document.documentElement.lang = idioma;
    document.querySelectorAll("[data-t]").forEach((el) => { if (typeof T[el.dataset.t] === "string") el.textContent = T[el.dataset.t]; });
    document.querySelectorAll("[data-idioma]").forEach((a) => a.classList.toggle("active", a.dataset.idioma === idioma));
    if (d) { opciones(); $("d-vence").textContent = d.vence ? T.vence(d.vence) : ""; }
  }
  document.querySelectorAll("[data-idioma]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); idioma = a.dataset.idioma; aplicarIdioma(); }));
  function mostrarCambioInst() {
    const v = $("d-inst").value, cambia = v && v !== (d.institucion?.id || "");
    $("d-otra").classList.toggle("oculto", v !== "otra");
    $("d-desde-campo").classList.toggle("oculto", !cambia);
  }
  $("d-inst").addEventListener("change", mostrarCambioInst);

  async function cargar() {
    aplicarIdioma();
    try { d = await DP.api("/api/datos?t=" + encodeURIComponent(token)); }
    catch (e) { $("cargando").classList.add("oculto"); return aviso("error", TEXTOS[idioma].invalido); }
    $("d-nombre").value = d.nombre; $("d-correo").value = d.correoPrincipal; $("d-otros").value = d.otrosCorreos.join("\n");
    $("d-unidad").value = d.institucion?.unidad || "";
    $("d-colab").classList.toggle("oculto", !d.colaborador);
    $("d-orcid").value = d.orcid; $("d-zbmath").value = d.zbmath; $("d-enlaces").value = d.enlaces.map((x) => `${x.texto} | ${x.url}`).join("\n");
    $("d-publicar").checked = d.publicar; $("d-foto-ok").checked = d.fotoAutorizada; $("d-suscrito").checked = d.suscrito;
    if (d.foto) { $("d-foto-img").src = d.foto; $("d-foto-img").classList.remove("oculto"); }
    aplicarIdioma(); mostrarCambioInst();
    $("cargando").classList.add("oculto"); $("contenido").classList.remove("oculto");
  }
  $("d-foto").addEventListener("change", async (ev) => {
    const a = ev.target.files[0]; if (!a) return;
    try { foto = await DP.reducirImagen(a); $("d-foto-img").src = foto; $("d-foto-img").classList.remove("oculto"); }
    catch (e) { aviso("error", e.message); ev.target.value = ""; }
  });

  $("form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const T = TEXTOS[idioma];
    const correo = $("d-correo").value.trim();
    if (!$("d-nombre").value.trim()) return aviso("error", T.faltaNombre);
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(correo)) return aviso("error", T.faltaCorreo);
    const inst = $("d-inst").value;
    if (inst === "otra" && (!$("d-otra-nombre").value.trim() || !$("d-otra-pais").value.trim())) return aviso("error", T.faltaOtra);
    const enlaces = $("d-enlaces").value.split("\n").map((x) => x.trim()).filter(Boolean).map((t) => { const [a, b] = t.split("|").map((x) => x.trim()); return b ? { texto: a, url: b } : { texto: "Web", url: a }; });
    const malo = enlaces.find((x) => !/^https?:\/\//.test(x.url)); if (malo) return aviso("error", T.enlaceMalo(malo.url));
    const cuerpo = { t: token, nombre: $("d-nombre").value.trim(), correoPrincipal: correo,
      otrosCorreos: $("d-otros").value.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean),
      institucion: { id: inst, unidad: $("d-unidad").value.trim(), desde: $("d-desde").value, otraNombre: $("d-otra-nombre").value.trim(), otraPais: $("d-otra-pais").value.trim() },
      retiroColaborador: $("d-retiro").checked,
      academica: { situacion: $("d-situacion").value, programa: $("d-programa").value.trim(), director: $("d-director").value.trim(), fecha: $("d-fecha").value },
      orcid: $("d-orcid").value.trim(), zbmath: $("d-zbmath").value.trim(), enlaces, publicar: $("d-publicar").checked, fotoAutorizada: $("d-foto-ok").checked,
      suscrito: $("d-suscrito").checked, comentario: $("d-comentario").value.trim() };
    if (foto) cuerpo.foto = foto;
    $("enviar").disabled = true; $("enviar").textContent = T.enviando;
    try {
      const r = await DP.api("/api/datos", { method: "POST", body: cuerpo });
      $("contenido").classList.add("oculto"); aviso("ok", T.gracias(r)); window.scrollTo(0, 0);
    } catch (e) { aviso("error", e.estado === 404 ? T.invalido : e.message); $("enviar").disabled = false; $("enviar").textContent = T.enviar; }
  });
  cargar();
})();
