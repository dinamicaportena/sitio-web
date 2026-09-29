// Formulario del expositor: completa los datos de su charla con el enlace de invitación.
(function () {
  const $ = (id) => document.getElementById(id);
  const TEXTOS = {
    es: { pie: "Instituto de Matemáticas, Facultad de Ciencias, Pontificia Universidad Católica de Valparaíso", inst: "Instituto de Matemáticas, Pontificia Universidad Católica de Valparaíso", titulo: "Datos de su charla",
      subtitulo: "Seminario Dinámica Porteña", cargando: "Cargando…", nombre: "Nombre *", institucion: "Institución y país *",
      tituloCharla: "Título de la charla *", resumen: "Resumen *",
      ayudaLatex: "Puede escribir fórmulas en LaTeX entre signos de dólar, por ejemplo $f\\colon M\\to M$.",
      vista: "Vista previa del resumen", foto: "Foto (opcional)",
      ayudaFoto: "Una foto de rostro, en JPG, PNG o WebP. Se publicará junto al anuncio de su charla.",
      enviar: "Enviar", enviarDeNuevo: "Enviar correcciones",
      nota: "Sus datos serán revisados por los organizadores antes de publicarse en el sitio del seminario. Puede volver a este enlace para corregirlos mientras la charla no haya sido publicada.",
      datos: (c) => `Su charla está programada para el ${DP.fechaLarga(c.fecha, c.hora, "es")}, en ${c.sala}.`,
      yaEnviada: "Ya recibimos sus datos. Si lo necesita, puede corregirlos y enviarlos nuevamente.",
      invalido: "Este enlace no es válido o ya venció. Si necesita ayuda, escriba a dinamica.portena@pucv.cl.",
      faltan: "Complete nombre, institución, título y resumen.", enviando: "Enviando…",
      gracias: "¡Muchas gracias! Recibimos los datos de su charla. Los organizadores los revisarán antes de publicarlos." },
    en: { pie: "Institute of Mathematics, Faculty of Sciences, Pontifical Catholic University of Valparaíso", inst: "Institute of Mathematics, Pontifical Catholic University of Valparaíso", titulo: "Your talk details",
      subtitulo: "Dinámica Porteña Seminar", cargando: "Loading…", nombre: "Name *", institucion: "Institution and country *",
      tituloCharla: "Title of the talk *", resumen: "Abstract *",
      ayudaLatex: "You may write LaTeX formulas between dollar signs, e.g. $f\\colon M\\to M$.",
      vista: "Abstract preview", foto: "Photo (optional)",
      ayudaFoto: "A headshot in JPG, PNG or WebP format. It will be shown with the announcement of your talk.",
      enviar: "Submit", enviarDeNuevo: "Submit corrections",
      nota: "The organizers will review your details before publishing them on the seminar website. You may return to this link to correct them until the talk is published.",
      datos: (c) => `Your talk is scheduled for ${DP.fechaLarga(c.fecha, c.hora, "en")}, in ${c.sala}.`,
      yaEnviada: "We have received your details. If needed, you can correct and resubmit them.",
      invalido: "This link is not valid or has expired. For assistance, please write to dinamica.portena@pucv.cl.",
      faltan: "Please fill in name, institution, title and abstract.", enviando: "Submitting…",
      gracias: "Thank you very much! We have received your talk details. The organizers will review them before publishing." },
  };
  const token = new URLSearchParams(location.search).get("invitacion") || "";
  let idioma = (navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en";
  let charla = null, foto;

  function aviso(tipo, mensaje) {
    const el = $("aviso"); el.innerHTML = "";
    if (mensaje) { const d = document.createElement("div"); d.className = "aviso " + tipo; d.textContent = mensaje; el.appendChild(d); }
  }
  function aplicarIdioma() {
    const T = TEXTOS[idioma];
    document.documentElement.lang = idioma;
    document.querySelectorAll("[data-t]").forEach((el) => { if (typeof T[el.dataset.t] === "string") el.textContent = T[el.dataset.t]; });
    document.querySelectorAll("[data-idioma]").forEach((a) => a.classList.toggle("active", a.dataset.idioma === idioma));
    if (charla) {
      $("datos-charla").textContent = T.datos(charla);
      $("enviar").textContent = charla.enviada ? T.enviarDeNuevo : T.enviar;
    }
  }
  document.querySelectorAll("[data-idioma]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); idioma = a.dataset.idioma; aplicarIdioma(); }));

  async function cargar() {
    aplicarIdioma();
    try {
      charla = await DP.api("/api/invitacion?t=" + encodeURIComponent(token));
    } catch (e) {
      $("cargando").classList.add("oculto"); aviso("error", TEXTOS[idioma].invalido); return;
    }
    ["expositor", "institucion", "titulo", "resumen"].forEach((k) => ($("f-" + k).value = charla[k] || ""));
    DP.vistaPrevia($("f-vista"), $("f-resumen").value);
    $("cargando").classList.add("oculto"); $("contenido").classList.remove("oculto");
    if (charla.enviada) aviso("info", TEXTOS[idioma].yaEnviada);
    aplicarIdioma();
  }

  $("f-resumen").addEventListener("input", () => DP.vistaPrevia($("f-vista"), $("f-resumen").value));
  $("f-foto").addEventListener("change", async (ev) => {
    const a = ev.target.files[0]; if (!a) return;
    try { foto = await DP.reducirImagen(a); $("f-foto-img").src = foto; $("f-foto-img").classList.remove("oculto"); }
    catch (e) { aviso("error", e.message); ev.target.value = ""; }
  });
  $("form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const T = TEXTOS[idioma];
    const datos = { t: token };
    ["expositor", "institucion", "titulo", "resumen"].forEach((k) => (datos[k] = $("f-" + k).value.trim()));
    if (!datos.expositor || !datos.institucion || !datos.titulo || !datos.resumen) return aviso("error", T.faltan);
    if (foto) datos.foto = foto;
    $("enviar").disabled = true; $("enviar").textContent = T.enviando;
    try {
      charla = await DP.api("/api/invitacion", { method: "POST", body: datos });
      foto = undefined; aviso("ok", T.gracias); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { aviso("error", e.estado === 404 ? T.invalido : e.message); }
    finally { $("enviar").disabled = false; aplicarIdioma(); }
  });

  cargar();
})();
