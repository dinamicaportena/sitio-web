# Sitio web — Dinámica Porteña (IMA-PUCV)

Sitio del grupo de investigación Dinámica Porteña, publicado en Netlify desde este repositorio.

- Páginas públicas: archivos `.html` en la raíz y `assets/`.
- Panel de administración: `admin/` (acceso con Google, solo correos autorizados).
- Formulario para expositores: `charla/` (acceso con enlace de invitación).
- Funciones del servidor: `netlify/functions/`, con utilidades en `netlify/lib/`.

Configuración requerida en Netlify (Project configuration → Environment variables):
`GOOGLE_CLIENT_ID`, `ADMIN_EMAILS` (correos separados por comas) y `SESSION_SECRET`.

Aviso por correo cuando un expositor completa su charla (opcional): `GMAIL_USER` (cuenta que envía),
`GMAIL_APP_PASSWORD` (contraseña de aplicación de Google, secreta) y `AVISO_EMAILS`
(destinatarios separados por comas; si no se define, se usa `ADMIN_EMAILS`).

No suba a este repositorio archivos con datos personales (planillas con RUT, formularios, etc.):
el repositorio es público.
