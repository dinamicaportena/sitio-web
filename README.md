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

## Registro de personas (pestaña «Personas»)
Una ficha única por persona (investigadores, colaboradores, estudiantes, graduados, expositores y suscriptores), con
historial de correos, instituciones (afiliaciones con fechas; una vigente), roles (con estado: vigente, finalizado,
retiro voluntario, por confirmar) y suscripción (altas, bajas y reactivaciones). Nada se borra del historial.
- Catálogo de instituciones con ID (I001…) y país; el país de cada charla sale de aquí.
- Cada charla guarda la institución tal como se declaró y queda vinculada a la ficha del expositor (al publicarla).
- «Descargar Excel» exporta todo el registro; «Importar Excel…» revisa y aplica un Excel con las mismas hojas y columnas.
- El archivo histórico del seminario (charlas C0001…) se carga con la importación del registro; desde entonces el
  archivo, las cifras y «Quiénes somos» se generan desde el registro. Las páginas conservan su texto escrito como respaldo.
- API pública (sin datos personales): `/api/charlas`, `/api/charlas?todas=1`, `/api/cifras`, `/api/personas`.

## Funciones del panel
Charlas (ingreso directo o invitación al expositor), publicación, cancelación y reprogramación con aviso;
suscriptores con baja por enlace personal; plantillas (datos, imágenes y textos de los correos);
generación de afiche (PDF), anuncio (imagen) y certificado (PDF); aprobación y envío del anuncio;
revisión diaria a las 8:00 (anuncios, recordatorios, certificados del día anterior).

## Correos desde los paneles (pestaña «Correos»)
Todos los correos salen desde la cuenta de Dinámica Porteña (`GMAIL_FROM`) por la cola de envíos del sitio; cada destinatario
recibe su propio correo y el avance se ve en «Envíos».
- Panel central: a la lista de divulgación (con enlace de baja personal), a los inscritos de una página de evento (por estado)
  o a correos puntuales. Las respuestas llegan al correo del grupo (Plantillas). Botón «Enviarme una prueba».
- Panel de cada evento: el responsable escribe a los inscritos del evento (remitente «<evento> · Dinámica Porteña»; las
  respuestas llegan al correo de contacto del evento). Un correo a la lista de divulgación queda «por aprobar»: se avisa a
  `AVISO_EMAILS` (o `ADMIN_EMAILS`) y un administrador central lo aprueba o rechaza en «Correos»; se informa al autor.
  Los colaboradores solo pueden enviarse pruebas.
- Inscripción a eventos: casilla opcional «Deseo recibir las novedades de Dinámica Porteña». La persona queda suscrita a la
  lista cuando se aprueba su inscripción (nunca se reactiva a quien se dio de baja).

## Páginas de evento
dinamicaportena.cl/<dirección>/ (ES), /<dirección>/en (EN) y /<dirección>/admin (panel propio del evento). Las crea un
administrador central (pestaña «Eventos») con un administrador interino (responsable), que invita colaboradores. Los
administradores de un evento no tienen acceso al panel central ni a otros eventos.

## Variables de entorno (Netlify → Project configuration → Environment variables)
- `GOOGLE_CLIENT_ID`, `ADMIN_EMAILS` (correos separados por comas), `SESSION_SECRET`.
- Correo: `GMAIL_USER` (cuenta que inicia sesión), `GMAIL_APP_PASSWORD` (contraseña de aplicación, secreta),
  `GMAIL_FROM` (remitente, opcional), `AVISO_EMAILS` (avisos al completar un expositor sus datos, opcional).

## Advertencias
- El repositorio es público: no suba archivos con datos personales (planillas con RUT, el Excel del registro de personas, etc.).
- Cada publicación en producción consume créditos de Netlify: agrupe los cambios en pocas subidas.
