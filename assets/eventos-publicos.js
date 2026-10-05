// Eventos desde el panel: página Eventos (próximos y anteriores) y portada. Si el servicio no responde
// o aún no hay eventos cargados, las páginas quedan como están escritas.
(function () {
  const EN = (document.documentElement.lang || "es").toLowerCase().startsWith("en");
  const MESES = EN ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
                   : ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const T = EN ? { ver: "View event page →", proximos: "Upcoming events", recientes: "Recent events" }
               : { ver: "Ver página del evento →", proximos: "Próximos eventos", recientes: "Eventos recientes" };
  const el = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto !== undefined) e.textContent = texto; return e; };
  const p = (f) => ({ a: f.slice(0, 4), m: Number(f.slice(5, 7)), d: f.length > 7 ? Number(f.slice(8, 10)) : null });
  // «Diciembre 2018», «Agosto - Septiembre 2015»; con días para los próximos: «10 al 14 de diciembre de 2026»
  function fechas(e, conDias) {
    const i = p(e.inicio), f = e.fin ? p(e.fin) : i, mes = (x) => MESES[x.m - 1];
    if (conDias && i.d) {
      if (EN) return i.m === f.m && i.a === f.a ? `${mes(i)} ${i.d}${f.d && f.d !== i.d ? "–" + f.d : ""}, ${i.a}` : `${mes(i)} ${i.d}, ${i.a} – ${f.d ? `${mes(f)} ${f.d}, ${f.a}` : `${mes(f)} ${f.a}`}`;
      return i.m === f.m && i.a === f.a ? `${f.d && f.d !== i.d ? i.d + " al " + f.d : i.d} de ${mes(i).toLowerCase()} de ${i.a}` : `${i.d} de ${mes(i).toLowerCase()} de ${i.a} al ${f.d ? f.d + " de " : ""}${mes(f).toLowerCase()} de ${f.a}`;
    }
    if (i.a !== f.a) return `${mes(i)} ${i.a} - ${mes(f)} ${f.a}`;
    return i.m !== f.m ? `${mes(i)} - ${mes(f)} ${i.a}` : `${mes(i)} ${i.a}`;
  }
  function item(e, { descripcion = true, conDias = false } = {}) {
    const d = el("div", "event-item");
    d.append(el("div", "fecha", fechas(e, conDias)), el("h3", "", EN && e.tituloEn ? e.tituloEn : e.titulo));
    const desc = EN ? e.descripcionEn || e.descripcion : e.descripcion;
    if (descripcion && desc) d.appendChild(el("p", "", desc));
    if (descripcion && e.lugar && conDias) d.appendChild(el("p", "lugar", (EN && e.lugarEn) || e.lugar));
    const enlace = (EN && e.enlaceEn) || e.enlace;
    if (enlace && /^(https?:\/\/|\/(?!\/))/i.test(enlace)) {         // solo enlaces web o páginas de este sitio
      const a = el("a", "", T.ver); a.href = enlace;
      if (/^https?:/i.test(enlace)) { a.target = "_blank"; a.rel = "noopener"; }
      const q = el("p"); q.appendChild(a); d.appendChild(q);
    }
    return d;
  }
  fetch("/api/eventos").then((r) => (r.ok ? r.json() : null)).then((datos) => {
    if (!datos || !datos.disponible) return;
    // Página Eventos
    const prox = document.querySelector('[data-eventos="proximos"]'), ant = document.querySelector('[data-eventos="anteriores"]');
    if (prox) { prox.hidden = !datos.proximos.length; prox.querySelector(".details-body").replaceChildren(...datos.proximos.map((e) => item(e, { conDias: true }))); }
    if (ant && datos.anteriores.length) ant.querySelector(".details-body").replaceChildren(...datos.anteriores.map((e) => item(e)));   // sin eventos anteriores cargados: se conserva el texto escrito
    // Portada: los próximos (hasta 3) o, si no hay, los tres más recientes
    const portada = document.getElementById("home-eventos");
    if (portada) {
      const lista = datos.proximos.length ? datos.proximos.slice(0, 3) : datos.anteriores.slice(0, 3);
      document.getElementById("home-eventos-titulo").textContent = datos.proximos.length ? T.proximos : T.recientes;
      portada.querySelectorAll(".event-item").forEach((x) => x.remove());
      portada.append(...lista.map((e) => item(e, { descripcion: false, conDias: datos.proximos.length > 0 })));
    }
  }).catch(() => {});
})();
