// Funciones compartidas por el panel (admin/) y el formulario del expositor (charla/).
window.DP = (function () {
  async function api(ruta, opciones = {}) {
    const init = { method: opciones.method || "GET", credentials: "same-origin", headers: {} };
    if (opciones.body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opciones.body); }
    const r = await fetch(ruta, init);
    let datos = null; try { datos = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error((datos && datos.error) || ("Error " + r.status)); err.estado = r.status; throw err; }
    return datos;
  }

  // Reduce la foto en el navegador (lado mayor 600 px, JPEG) antes de enviarla.
  function reducirImagen(archivo, lado = 600) {
    return new Promise((resolver, rechazar) => {
      if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return rechazar(new Error("Use una imagen JPG, PNG o WebP."));
      if (archivo.size > 15 * 1024 * 1024) return rechazar(new Error("La imagen es demasiado grande (máximo 15 MB)."));
      const lector = new FileReader();
      lector.onerror = () => rechazar(new Error("No se pudo leer la imagen."));
      lector.onload = () => {
        const img = new Image();
        img.onerror = () => rechazar(new Error("No se pudo abrir la imagen."));
        img.onload = () => {
          const escala = Math.min(1, lado / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
          const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolver(c.toDataURL("image/jpeg", 0.85));
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  const MESES = { es: ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"],
                  en: ["January","February","March","April","May","June","July","August","September","October","November","December"] };
  const DIAS = { es: ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"],
                 en: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] };
  function fechaLarga(fecha, hora, idioma = "es") {
    if (!fecha) return "";
    if (/T/.test(fecha)) fecha = new Date(fecha).toLocaleDateString("en-CA", { timeZone: "America/Santiago" });   // fecha y hora → día en Chile
    const [a, m, d] = fecha.split("-").map(Number);
    const dia = DIAS[idioma][new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
    const f = idioma === "es" ? `${dia} ${d} de ${MESES.es[m - 1]} de ${a}` : `${dia}, ${MESES.en[m - 1]} ${d}, ${a}`;
    return hora ? `${f} · ${hora} ${idioma === "es" ? "hrs" : "h"}` : f;
  }

  // Muestra el texto como se verá en el sitio y en el afiche: fórmulas LaTeX ($…$, \[…\]) con MathJax y comandos de texto (\textbf, \emph, ~, …).
  let pendiente = null;
  function vistaPrevia(elemento, textoFuente) {
    if (window.DPTexto) DPTexto.escribir(elemento, textoFuente || ""); else elemento.textContent = textoFuente || "";   // mismo intérprete que el afiche
    clearTimeout(pendiente);
    pendiente = setTimeout(() => {
      if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetClear && MathJax.typesetClear([elemento]);
        MathJax.typesetPromise([elemento]).catch(() => {});
      }
    }, 300);
  }

  return { api, reducirImagen, fechaLarga, vistaPrevia };
})();
