#!/usr/bin/env python3
"""Genera evento/index.html (español) y evento/index-en.html (inglés): la plantilla de TODAS las páginas de evento de dinamicaportena.cl.

Netlify las sirve en dinamicaportena.cl/<dirección>/ y /<dirección>/en (ver netlify.toml). Los textos fijos (títulos de sección, etiquetas del formulario, pie de página) están en los diccionarios ES y EN de
este archivo; el contenido del evento (fechas, conferencistas, programa, etc.) NO está aquí: se edita desde el panel
del evento (/<dirección>/admin). Uso:  python3 herramientas/generar_paginas_evento.py   (desde la carpeta raíz del sitio)
"""
from pathlib import Path
from html import escape

RAIZ = Path(__file__).resolve().parent.parent / "evento"

ES = dict(
    lang="es", locale="es_CL", archivo="index.html", otro="index-en.html", otro_etq="EN",
    titulo="Evento — Dinámica Porteña",
    desc="Página de evento del grupo Dinámica Porteña.",
    marca="Evento",
    inst="",
    menu="Menú", nav_grupo="Dinámica Porteña", nav_ima="",
    secciones=[("objetivo", "Objetivo"), ("conferencistas", "Conferencistas"), ("programa", "Programa"),
               ("participantes", "Participantes"), ("inscripcion", "Inscripción"), ("info", "Información práctica"),
               ("organizacion", "Organización")],
    eyebrow="",
    btn_insc="Inscripción", btn_prog="Ver programa",
    k_fechas="Fechas", k_lugar="Lugar", k_dir="Dirección",
    h_conf="Conferencistas", h_prog="Programa", h_part="Participantes", h_insc="Inscripción",
    h_info="Información práctica", h_org="Comité organizador", h_cien="Comité científico", h_org_sec="Organización", h_aus="Auspiciantes y colaboradores", h_cont="Contacto",
    h_obj="Objetivo",
    f_nombre="Nombre completo", f_inst="Institución", f_pais="País", f_email="Correo electrónico",
    f_email_ay="No se publica; solo lo usa la organización para contactarle.",
    f_nivel="Situación académica",
    niveles=[("investigador", "Investigador/a o profesor/a"), ("postdoc", "Postdoctorado"), ("doctorado", "Estudiante de doctorado"),
             ("magister", "Estudiante de magíster"), ("pregrado", "Estudiante de pregrado"), ("otro", "Otra")],
    f_charla="Deseo presentar una charla o póster", f_titulo="Título propuesto (opcional)",
    f_obs="Observaciones (opcional)", f_obs_ay="Por ejemplo, requerimientos de accesibilidad o alimentación.",
    f_publicar="Autorizo que mi nombre e institución aparezcan en la lista pública de participantes.",
    f_suscribir="Deseo recibir las novedades de Dinámica Porteña (seminario y eventos) en mi correo. Puedo darme de baja en cualquier momento.",
    f_priv="Acepto que la organización use los datos ingresados únicamente para gestionar este evento. Mi correo y mis observaciones no se publican.",
    f_enviar="Enviar inscripción",
    preview="Vista previa: este evento aún no está publicado; solo lo ven sus administradores.",
    pie_contacto="Contacto",
    sitio_grupo="Sitio del grupo Dinámica Porteña",
)
EN = dict(
    lang="en", locale="en_US", archivo="index-en.html", otro="index.html", otro_etq="ES",
    titulo="Event — Dinámica Porteña",
    desc="Event page of the Dinámica Porteña group.",
    marca="Event",
    inst="",
    menu="Menu", nav_grupo="Dinámica Porteña", nav_ima="",
    secciones=[("objetivo", "Aim"), ("conferencistas", "Speakers"), ("programa", "Program"),
               ("participantes", "Participants"), ("inscripcion", "Registration"), ("info", "Practical information"),
               ("organizacion", "Organization")],
    eyebrow="",
    btn_insc="Registration", btn_prog="View program",
    k_fechas="Dates", k_lugar="Venue", k_dir="Address",
    h_conf="Speakers", h_prog="Program", h_part="Participants", h_insc="Registration",
    h_info="Practical information", h_org="Organizing committee", h_cien="Scientific committee", h_org_sec="Organization", h_aus="Sponsors and partners", h_cont="Contact",
    h_obj="Aim",
    f_nombre="Full name", f_inst="Institution", f_pais="Country", f_email="Email address",
    f_email_ay="It is not published; it is only used by the organizers to contact you.",
    f_nivel="Academic status",
    niveles=[("investigador", "Researcher or professor"), ("postdoc", "Postdoctoral researcher"), ("doctorado", "PhD student"),
             ("magister", "Master's student"), ("pregrado", "Undergraduate student"), ("otro", "Other")],
    f_charla="I would like to give a talk or poster", f_titulo="Proposed title (optional)",
    f_obs="Remarks (optional)", f_obs_ay="For example, accessibility or dietary requirements.",
    f_publicar="I authorize my name and institution to appear in the public list of participants.",
    f_suscribir="I would like to receive news from Dinámica Porteña (seminar and events) by email. I can unsubscribe at any time.",
    f_priv="I agree that the organizers use the data entered only to manage this event. My email and remarks are not published.",
    f_enviar="Submit registration",
    preview="Preview: this event is not published yet; only its administrators can see it.",
    pie_contacto="Contact",
    sitio_grupo="Dinámica Porteña group website",
)

PLANTILLA = """<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{titulo}</title>
<meta name="description" content="{desc}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta name="theme-color" content="#1a4269">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Dinámica Porteña">
<meta property="og:title" content="{titulo}">
<meta property="og:description" content="{desc}">
<meta property="og:locale" content="{locale}">
<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Condensed:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css">
<link rel="stylesheet" href="/assets/evento.css">
<script src="/assets/mathjax-config.js"></script>
<script src="/assets/mathjax.js" defer></script>
</head>
<body>
<header class="site">
  <div class="wrap">
    <div class="brandblock">
      <img src="/assets/pucv-logo-centenario.png" alt="Pontificia Universidad Católica de Valparaíso">
      <div class="names">
        <span class="group-name" id="c-marca">{marca}</span>
        <span class="inst-name" id="c-inst">{inst}</span>
      </div>
    </div>
    <div class="lang-toggle lang-mobile">
      <a href="#" class="active" data-lang="{lang}">{lang_up}</a>
      <a href="#" data-lang="{otro_lang}">{otro_etq}</a>
    </div>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="{menu}"><span></span><span></span><span></span></button>
    <div class="navblock" id="site-nav">
      <nav class="site" id="c-nav">
        <a href="/">{nav_grupo}</a>
      </nav>
      <div class="lang-toggle">
        <a href="#" class="active" data-lang="{lang}">{lang_up}</a>
        <a href="#" data-lang="{otro_lang}">{otro_etq}</a>
      </div>
    </div>
  </div>
</header>

<div class="hero evento">
  <div class="wrap">
    <p class="eyebrow" id="c-eyebrow">{eyebrow}</p>
    <h1 id="c-nombre">{titulo}</h1>
    <div class="hero-meta" id="c-meta"></div>
    <a class="btn" href="#inscripcion">{btn_insc}</a>
    <a class="btn secondary" href="#programa">{btn_prog}</a>
    <span class="estado-insc" id="c-estado-insc"></span>
  </div>
</div>

<nav class="subnav" aria-label="{titulo}">
  <div class="wrap">
{subnav}
  </div>
</nav>

<main style="padding-top:0">
  <div class="wrap">
    <div class="aviso-preview" id="c-preview" hidden>{preview}</div>
    <div class="vacio-nota" id="c-error" hidden style="margin-top:40px"></div>

    <section class="col-section" id="objetivo">
      <div class="section-head"><h2 id="t-objetivo">{h_obj}</h2></div>
      <div id="c-objetivo"></div>
      <div class="datos-clave" id="c-clave"></div>
    </section>

    <section class="col-section" id="conferencistas">
      <div class="section-head"><h2 id="t-conferencistas">{h_conf}</h2></div>
      <div id="c-conferencistas"></div>
    </section>

    <section class="col-section" id="programa">
      <div class="section-head"><h2 id="t-programa">{h_prog}</h2></div>
      <div id="c-programa"></div>
    </section>

    <section class="col-section" id="participantes">
      <div class="section-head"><h2 id="t-participantes">{h_part}</h2></div>
      <div id="c-participantes"></div>
    </section>

    <section class="col-section" id="inscripcion">
      <div class="section-head"><h2 id="t-inscripcion">{h_insc}</h2></div>
      <div id="c-inscripcion-texto"></div>
      <div id="c-inscripcion-form">
        <form class="form-card" id="form-insc" novalidate>
          <div id="insc-aviso" role="status" aria-live="polite"></div>
          <div class="fila2">
            <div class="campo"><label for="i-nombre">{f_nombre}</label><input type="text" id="i-nombre" name="nombre" maxlength="120" autocomplete="name" required></div>
            <div class="campo"><label for="i-email">{f_email}</label><input type="email" id="i-email" name="email" maxlength="160" autocomplete="email" required><div class="ayuda">{f_email_ay}</div></div>
          </div>
          <div class="fila2">
            <div class="campo"><label for="i-inst">{f_inst}</label><input type="text" id="i-inst" name="institucion" maxlength="160" autocomplete="organization" required></div>
            <div class="campo"><label for="i-pais">{f_pais}</label><input type="text" id="i-pais" name="pais" maxlength="80" autocomplete="country-name" required></div>
          </div>
          <div class="campo"><label for="i-nivel">{f_nivel}</label>
            <select id="i-nivel" name="nivel">
{niveles}
            </select></div>
          <label class="casilla"><input type="checkbox" id="i-charla" name="charla"> <span>{f_charla}</span></label>
          <div class="campo" id="i-titulo-campo" hidden><label for="i-titulo">{f_titulo}</label><input type="text" id="i-titulo" name="tituloCharla" maxlength="250"></div>
          <div class="campo"><label for="i-obs">{f_obs}</label><textarea id="i-obs" name="observaciones" maxlength="600"></textarea><div class="ayuda">{f_obs_ay}</div></div>
          <label class="casilla"><input type="checkbox" id="i-publicar" name="publicar"> <span>{f_publicar}</span></label>
          <label class="casilla"><input type="checkbox" id="i-suscribir" name="suscribir"> <span>{f_suscribir}</span></label>
          <label class="casilla"><input type="checkbox" id="i-priv" name="privacidad" required> <span>{f_priv}</span></label>
          <div class="trampa" aria-hidden="true"><label>Web <input type="text" name="web" tabindex="-1" autocomplete="off"></label></div>
          <button class="btn" type="submit" id="i-enviar">{f_enviar}</button>
        </form>
      </div>
    </section>

    <section class="col-section" id="info">
      <div class="section-head"><h2 id="t-info">{h_info}</h2></div>
      <div id="c-info"></div>
    </section>

    <section class="col-section" id="organizacion">
      <div class="section-head"><h2 id="t-organizacion">{h_org_sec}</h2></div>
      <h3 class="subtitulo-seccion" id="t-cientifico" hidden>{h_cien}</h3>
      <div id="c-cientifico" hidden></div>
      <h3 class="subtitulo-seccion" id="t-organizadores">{h_org}</h3>
      <div id="c-organizadores"></div>
      <h3 class="subtitulo-seccion" id="t-auspiciantes">{h_aus}</h3>
      <div id="c-auspiciantes"></div>
      <p class="contacto-evento" id="c-contacto"></p>
    </section>
  </div>
</main>
<footer class="site">
  <div class="wrap">
    <div class="logos">
      <img src="/assets/pucv-logo-centenario.png" alt="Pontificia Universidad Católica de Valparaíso">
    </div>
    <p><span id="c-pie-inst"></span><br>
    <span id="c-pie-dir"></span> &middot;
    <span id="c-pie-enlace"><a href="/">{sitio_grupo}</a></span></p>
  </div>
</footer>
<script src="/assets/evento.js" defer></script>
<script src="/assets/site.js" defer></script>
</body>
</html>
"""


def construir(d):
    subnav = "\n".join(f'    <a href="#{i}">{escape(t)}</a>' for i, t in d["secciones"])
    niveles = "\n".join(f'              <option value="{v}">{escape(t)}</option>' for v, t in d["niveles"])
    datos = {k: (escape(v) if isinstance(v, str) else v) for k, v in d.items()}
    datos.update(subnav=subnav, niveles=niveles, lang_up=d["lang"].upper(),
                 otro_lang="en" if d["lang"] == "es" else "es")
    (RAIZ / d["archivo"]).write_text(PLANTILLA.format(**datos), encoding="utf-8")
    print("escrito", d["archivo"])


if __name__ == "__main__":
    construir(ES)
    construir(EN)
