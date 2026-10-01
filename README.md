# Sitio web — Dinámica Porteña (IMA-PUCV)

Sitio del grupo de investigación Dinámica Porteña, publicado en Netlify desde este repositorio
(www.dinamicaportena.cl · dinamicaportena.netlify.app).

## Estructura
- Páginas públicas: archivos `.html` en la raíz; estilos, scripts, fotos y cifras en `assets/`.
- Panel de administración: `admin/` (acceso con Google, solo correos autorizados).
- Formulario para expositores: `charla/` (acceso con enlace de invitación).
- Baja de la lista de suscriptores: `baja/`.
- Funciones del servidor: `netlify/functions/`, con utilidades en `netlify/lib/`
  (fuentes Roboto en `netlify/lib/fuentes/`, componentes gráficos en `netlify/lib/plantillas/`).

## Funciones del panel
Charlas (ingreso directo o invitación al expositor), publicación, cancelación y reprogramación con aviso;
suscriptores con baja por enlace personal; plantillas (datos, imágenes y textos de los correos);
generación de afiche (PDF), anuncio (imagen) y certificado (PDF); aprobación y envío del anuncio;
revisión diaria a las 8:00 (anuncios, recordatorios, certificados del día anterior).

## Variables de entorno (Netlify → Project configuration → Environment variables)
- `GOOGLE_CLIENT_ID`, `ADMIN_EMAILS` (correos separados por comas), `SESSION_SECRET`.
- Correo: `GMAIL_USER` (cuenta que inicia sesión), `GMAIL_APP_PASSWORD` (contraseña de aplicación, secreta),
  `GMAIL_FROM` (remitente, opcional), `AVISO_EMAILS` (avisos al completar un expositor sus datos, opcional).

## Advertencias
- El repositorio es público: no suba archivos con datos personales (planillas con RUT, formularios, etc.).
- Cada publicación en producción consume créditos de Netlify: agrupe los cambios en pocas subidas.
