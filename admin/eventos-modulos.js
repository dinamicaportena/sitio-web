// Panel CENTRAL → pestaña «Eventos» → «Páginas de evento». El administrador del sitio crea la página de un evento con su nombre y un
// administrador interino (responsable); desde ahí, ese responsable administra el evento en su propio panel (/<dirección>/admin) e invita
// a los demás administradores. Los administradores de un evento no tienen acceso a este panel central.
(function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...hijos) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...hijos.filter((h) => h !== null && h !== undefined)); return e; };
  const aviso = (m, tipo = "info") => { const c = $("evm-aviso"); c.replaceChildren(); if (m) c.append(el("div", { className: "aviso " + tipo, textContent: m })); };
  let lista = [], montado = false;
  const slugDe = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/g, "");

  function montar() {
    if (montado) return; montado = true;
    const vista = $("vista-eventos"), intro = vista.querySelector("p.vacio");
    const form = el("div", { className: "tarjeta oculto", id: "evm-form", style: "margin:0 0 16px" },
      el("h3", { textContent: "Nueva página de evento", style: "margin:0 0 10px" }),
      el("div", { className: "campo" }, el("label", { htmlFor: "evm-nombre", textContent: "Nombre del evento" }), el("input", { type: "text", id: "evm-nombre", maxLength: 200, placeholder: "LXIV Coloquio Nacional en Sistemas Dinámicos" })),
      el("div", { className: "campo" }, el("label", { htmlFor: "evm-slug", textContent: "Dirección de la página" }), el("input", { type: "text", id: "evm-slug", maxLength: 50, placeholder: "lxiv-coloquio" }),
        el("div", { className: "ayuda", id: "evm-slug-ayuda" })),
      el("div", { className: "campo" }, el("label", { htmlFor: "evm-email", textContent: "Correo (cuenta de Google) del administrador interino" }), el("input", { type: "email", id: "evm-email", maxLength: 160 }),
        el("div", { className: "ayuda", textContent: "Será el responsable del evento: completa la información, invita a los demás administradores y publica la página. Recibirá un correo con el enlace a su panel." })),
      el("div", { className: "acciones-seccion" },
        el("button", { type: "button", className: "boton", id: "evm-crear", textContent: "Crear evento e invitar" }),
        el("button", { type: "button", className: "boton sec", textContent: "Cancelar", onclick: () => form.classList.add("oculto") })));
    const bloque = el("div", { id: "evm-bloque" },
      el("h2", { className: "grupo-titulo", textContent: "Páginas de evento con administradores propios" }),
      el("p", { className: "vacio", textContent: "Cada evento tiene su propia página (dinamicaportena.cl/<dirección>/), su panel de administración y sus administradores, que pueden ser de otras instituciones y no tienen acceso a este panel central. Los eventos publicados aparecen automáticamente en la página Eventos y en la portada." }),
      el("p", {}, el("button", { type: "button", className: "boton", id: "evm-nuevo", textContent: "+ Nueva página de evento" })),
      form, el("div", { id: "evm-aviso" }), el("div", { id: "evm-lista" }));
    (intro && intro.nextSibling ? vista.insertBefore(bloque, intro.nextSibling) : vista.prepend(bloque));
    $("evm-nuevo").onclick = () => { form.classList.toggle("oculto"); $("evm-nombre").focus(); };
    let tocado = false;
    $("evm-slug").oninput = () => { tocado = true; ayudaSlug(); };
    $("evm-nombre").oninput = () => { if (!tocado) $("evm-slug").value = slugDe($("evm-nombre").value); ayudaSlug(); };
    $("evm-crear").onclick = crear;
  }
  const ayudaSlug = () => { const s = $("evm-slug").value.trim(); $("evm-slug-ayuda").textContent = s ? `Quedará en ${location.origin}/${s}/` : "Se propone a partir del nombre; solo letras minúsculas sin tildes, números y guiones."; };

  function mostrarInvitacion(inv, email) {
    if (!inv) return;
    aviso(inv.enviado ? `Invitación enviada a ${email}.` : `No se pudo enviar el correo (${inv.motivo || "motivo desconocido"}). Comparta con ${email} este enlace: ${inv.enlace}`, inv.enviado ? "ok" : "info");
  }
  async function crear() {
    const b = $("evm-crear"); b.disabled = true;
    try {
      const email = $("evm-email").value.trim();
      const r = await DP.api("/api/admin/paginas-evento", { method: "POST", body: { nombre: $("evm-nombre").value, slug: $("evm-slug").value, email } });
      ["evm-nombre", "evm-slug", "evm-email"].forEach((i) => { $(i).value = ""; }); $("evm-form").classList.add("oculto");
      await cargar(); mostrarInvitacion(r.invitacion, email);
    } catch (e) { aviso(e.message, "error"); }
    b.disabled = false;
  }

  async function cargar() {
    try { lista = await DP.api("/api/admin/paginas-evento"); dibujar(); }
    catch (e) { if (e.estado === 401) return location.reload(); aviso(e.message, "error"); }
  }
  function dibujar() {
    const cont = $("evm-lista"); cont.replaceChildren();
    if (!lista.length) return cont.append(el("p", { className: "vacio", textContent: "Aún no hay páginas de evento." }));
    lista.forEach((e) => {
      const pub = e.estado === "publicado", resp = (e.admins.find((a) => a.rol === "responsable") || {}).email || "—";
      const acc = el("div", { className: "acciones" });
      const b = (t, c, fn) => acc.append(el("button", { type: "button", className: "boton " + c, textContent: t, onclick: fn }));
      const hacer = async (fn) => { try { await fn(); } catch (x) { aviso(x.message, "error"); } };
      acc.append(el("a", { className: "boton sec peq", href: `/${e.slug}/admin/`, target: "_blank", rel: "noopener", textContent: "Abrir panel del evento" }));
      acc.append(el("a", { className: "boton sec peq", href: `/${e.slug}/`, target: "_blank", rel: "noopener", textContent: "Ver página" }));
      b(pub ? "Retirar de la web" : "Publicar", "sec peq", () => hacer(async () => { await DP.api("/api/admin/paginas-evento/" + e.slug, { method: "PATCH", body: { estado: pub ? "borrador" : "publicado" } }); await cargar(); }));
      b("Cambiar responsable…", "sec peq", () => hacer(async () => {
        const nuevo = prompt(`Correo (cuenta de Google) del nuevo responsable de «${e.nombre}»:`, ""); if (!nuevo) return;
        const r = await DP.api("/api/admin/paginas-evento/" + e.slug, { method: "PATCH", body: { responsable: nuevo.trim() } }); await cargar(); mostrarInvitacion(r.invitacion, nuevo.trim());
      }));
      b("Reenviar invitación al responsable", "sec peq", () => hacer(async () => { const r = await DP.api("/api/admin/paginas-evento/" + e.slug, { method: "PATCH", body: { reenviar: true } }); mostrarInvitacion(r.invitacion, resp); }));
      b("Eliminar", "peligro", () => hacer(async () => {
        const c = prompt(`Se eliminará el evento «${e.nombre}» con su contenido, administradores e inscripciones (${e.inscripciones}). Esta acción no se puede deshacer.\n\nPara confirmar, escriba su dirección: ${e.slug}`, ""); if (c === null) return;
        await DP.api("/api/admin/paginas-evento/" + e.slug, { method: "DELETE", body: { confirmar: c.trim() } }); await cargar(); aviso("Evento eliminado.", "ok");
      }));
      const colab = e.admins.filter((a) => a.rol !== "responsable").length;
      cont.append(el("div", { className: "charla-fila " + (pub ? "publicada" : "borrador") }, el("div", { className: "sin-foto evento-icono", textContent: "E" }),
        el("div", { className: "info" },
          el("div", { className: "fecha" }, document.createTextNode("/" + e.slug + "/"), el("span", { className: "estado " + (pub ? "publicada" : "borrador"), textContent: pub ? "Publicado" : "Borrador" })),
          el("div", { className: "titulo", textContent: e.nombre }),
          el("div", { className: "meta", textContent: `Responsable: ${resp} · ${colab} colaborador${colab === 1 ? "" : "es"} · ${e.inscripciones} inscripci${e.inscripciones === 1 ? "ón" : "ones"}` }), acc)));
    });
  }
  document.addEventListener("abrir-eventos", () => { montar(); cargar(); });
})();
