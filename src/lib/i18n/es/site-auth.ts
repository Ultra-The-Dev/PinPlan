// Español: public site (header, footer, /welcome, /pricing, support), sign-in, sign-up, password reset, /join, /start.
// Same keys as ../ru/site-auth.ts. Keys are the exact English source text. Glossary and rules: docs/i18n.md.
import type { Dictionary } from "../types";

const dict: Dictionary = {
  // Site header and footer
  "Skip to content": "Ir al contenido",
  "Open menu": "Abrir menú",
  "Close menu": "Cerrar menú",
  Site: "Sitio",
  "Site menu": "Menú del sitio",
  "How it works": "Cómo funciona",
  Trades: "Oficios",
  Pricing: "Precios",
  Questions: "Preguntas",
  "Open the app": "Abrir la app",
  "Sign in": "Iniciar sesión",
  "Start free trial": "Empezar prueba gratis",
  Product: "Producto",
  "Your team": "Tu equipo",
  "Join your team": "Únete a tu equipo",
  Support: "Soporte",
  Legal: "Legal",
  "Terms of Service": "Términos del servicio",
  "Privacy Policy": "Política de privacidad",
  Subprocessors: "Subencargados del tratamiento",
  "Data Processing Addendum": "Anexo de tratamiento de datos",
  Security: "Seguridad",
  Accessibility: "Accesibilidad",
  "Plans, counts, quotes, invoices and field work for electrical, low-voltage and specialty contractors.":
    "Planos, cómputos, cotizaciones, facturas y trabajo en campo para contratistas eléctricos, de bajo voltaje y especialidades.",
  "Try it without an account": "Pruébalo sin cuenta",
  "Your account was deleted and this device was cleared.": "Tu cuenta se eliminó y se borraron los datos de este dispositivo.",
  Dismiss: "Cerrar",

  // Legal pages (chrome; the documents themselves stay in English)
  DPA: "Tratamiento de datos",
  Effective: "Vigente desde",
  "Last updated": "Última actualización",
  "On this page": "En esta página",
  "Checking {product}’s servers…": "Revisando los servidores de {product}…",
  "All systems operational": "Todos los sistemas funcionan",
  "Some services are having problems. Your work is saved on your device and will sync when they recover.":
    "Algunos servicios tienen problemas. Tu trabajo está guardado en tu dispositivo y se sincronizará cuando se recuperen.",
  "Can’t reach {product} from this device. Check your connection; {product} keeps working offline.":
    "No se puede conectar con {product} desde este dispositivo. Revisa tu conexión; {product} sigue funcionando sin conexión.",

  // Auth pages (AuthShell, sign-in, sign-up, reset)
  Terms: "Condiciones",
  Privacy: "Privacidad",
  "Show password": "Mostrar contraseña",
  "Hide password": "Ocultar contraseña",
  "Loading…": "Cargando…",
  Email: "Correo",
  Password: "Contraseña",
  "Forgot password?": "¿Olvidaste tu contraseña?",
  or: "o",
  "Check your email": "Revisa tu correo",
  "Back to sign in": "Volver a iniciar sesión",
  "Accounts aren’t available here": "Las cuentas no están disponibles aquí",
  "This copy of {product} isn’t connected to the cloud. Your jobs are saved on this device.":
    "Esta copia de {product} no está conectada a la nube. Tus obras se guardan en este dispositivo.",
  "That link has expired or was already used. Sign in with your password, or send a new link.":
    "Ese enlace venció o ya se usó. Inicia sesión con tu contraseña o envía un enlace nuevo.",
  "Enter your email address first, then press “Email me a sign-in link”.":
    "Primero escribe tu correo electrónico y luego toca “Enviarme un enlace para iniciar sesión”.",
  "Opening {product}…": "Abriendo {product}…",
  "If {email} has a {product} account, a sign-in link is on its way. Open it on the device you want to use. It can take a few minutes — check spam too.":
    "Si {email} tiene una cuenta de {product}, el enlace para iniciar sesión ya va en camino. Ábrelo en el dispositivo que quieras usar. Puede tardar unos minutos; revisa también la carpeta de spam.",
  "New to {product}?": "¿Eres nuevo en {product}?",
  "Welcome back. Sign in to sync your jobs across iPad, iPhone and the web.":
    "Qué bueno verte de nuevo. Inicia sesión para sincronizar tus obras entre iPad, iPhone y la web.",
  "Email confirmed. Sign in to finish setting up.": "Correo confirmado. Inicia sesión para terminar la configuración.",
  "Email me a sign-in link": "Enviarme un enlace para iniciar sesión",
  "Got an invite from your company?": "¿Recibiste una invitación de tu empresa?",

  "There’s already an account with this email. {signIn} or {reset}.": "Ya existe una cuenta con este correo. {signIn} o {reset}.",
  "reset your password": "restablece tu contraseña",
  "Your login is ready, but setting up {company} didn’t finish: {error} Press the button to try again.":
    "Tu cuenta ya está lista, pero la configuración de {company} no terminó: {error} Toca el botón para intentarlo de nuevo.",
  "Sign-up isn’t available here": "El registro no está disponible aquí",
  "This copy of {product} isn’t connected to the cloud, so there are no accounts. You can still use it on this device.":
    "Esta copia de {product} no está conectada a la nube, así que no hay cuentas. Igual puedes usarla en este dispositivo.",
  "You’re already signed in": "Ya iniciaste sesión",
  "Signed in as {email}.": "Sesión iniciada como {email}.",
  "Signed in as {email}": "Sesión iniciada como {email}",
  "Open {product}": "Abrir {product}",
  "Sign out to create another company": "Cerrar sesión para crear otra empresa",
  "Have an account?": "¿Ya tienes cuenta?",
  "Start your free trial": "Empieza tu prueba gratis",
  "{n} day of everything in {product}. Set up your company now and invite your crew when you’re ready.": {
    one: "{n} día con todo {product}. Configura tu empresa ahora e invita a tu cuadrilla cuando estés listo.",
    other: "{n} días con todo {product}. Configura tu empresa ahora e invita a tu cuadrilla cuando estés listo.",
  },
  "What does your company do?": "¿A qué se dedica tu empresa?",
  "Pick one or more — the first is your main trade. It sets up your device menu, catalog, wire types and checklists. You can change it later in Settings.":
    "Elige uno o más; el primero será tu oficio principal. Con él se arman tu menú de dispositivos, catálogo, tipos de cable y listas de verificación. Puedes cambiarlo después en Configuración.",
  "Company name": "Nombre de la empresa",
  "Your name": "Tu nombre",
  "First and last name": "Nombre y apellido",
  "Work email": "Correo del trabajo",
  "I agree to the {terms} and {privacy}.": "Acepto las {terms} y la {privacy}.",
  "Setting up your company…": "Configurando tu empresa…",
  "Try again": "Intentar de nuevo",
  "Create company account": "Crear cuenta de empresa",
  "Joining your company’s team?": "¿Vas a unirte al equipo de tu empresa?",
  "Use your invite code": "Usa tu código de invitación",
  "We sent a confirmation link to {email}. Open it on any device — phone, tablet or computer — and sign in. We’ll finish setting up {company} for you.":
    "Enviamos un enlace de confirmación a {email}. Ábrelo en cualquier dispositivo (teléfono, tableta o computadora) e inicia sesión. Nosotros terminamos de configurar {company} por ti.",
  "It can take a few minutes to arrive.": "Puede tardar unos minutos en llegar.",
  "Check spam or promotions if you don’t see it.": "Si no lo ves, revisa spam o promociones.",
  "I’ve confirmed — sign in": "Ya confirmé: iniciar sesión",
  "Sent again. Give it a few minutes.": "Enviado de nuevo. Espera unos minutos.",
  "Resend the email": "Reenviar el correo",

  "That reset link has expired or was already used. Send yourself a new one below.":
    "Ese enlace para restablecer venció o ya se usó. Envíate uno nuevo aquí abajo.",
  "Couldn’t open that reset link. Send yourself a new one below and open it in this browser.":
    "No se pudo abrir ese enlace para restablecer. Envíate uno nuevo aquí abajo y ábrelo en este navegador.",
  "This copy of {product} isn’t connected to the cloud, so there’s no password to reset.":
    "Esta copia de {product} no está conectada a la nube, así que no hay contraseña que restablecer.",
  "Password updated": "Contraseña actualizada",
  "Use your new password to sign in on the iPad, iPhone and web.": "Usa tu nueva contraseña para iniciar sesión en iPad, iPhone y la web.",
  "Continue to {product}": "Continuar a {product}",
  "Choose a new password": "Elige una contraseña nueva",
  "For {email}.": "Para {email}.",
  "Use at least {n} character.": {
    one: "Usa al menos {n} carácter.",
    other: "Usa al menos {n} caracteres.",
  },
  "The two passwords don’t match.": "Las contraseñas no coinciden.",
  "Choose a password you haven’t used before.": "Elige una contraseña que no hayas usado antes.",
  "New password": "Contraseña nueva",
  "Repeat new password": "Repite la contraseña nueva",
  "The two passwords don’t match yet.": "Las contraseñas todavía no coinciden.",
  "Save new password": "Guardar contraseña nueva",
  "Opening your reset link…": "Abriendo tu enlace para restablecer…",
  "If {email} has a {product} account, a reset link is on its way.": "Si {email} tiene una cuenta de {product}, el enlace para restablecer ya va en camino.",
  "The email may take a few minutes to arrive — check spam too.": "El correo puede tardar unos minutos en llegar; revisa también la carpeta de spam.",
  "Open the link in this browser to choose a new password.": "Abre el enlace en este navegador para elegir una contraseña nueva.",
  "Use a different email": "Usar otro correo",
  "Reset your password": "Restablece tu contraseña",
  "Enter the email you sign in with and we’ll send you a link to choose a new password. It may take a few minutes to arrive.":
    "Escribe el correo con el que inicias sesión y te enviaremos un enlace para elegir una contraseña nueva. Puede tardar unos minutos en llegar.",
  "Enter a valid email address.": "Escribe un correo electrónico válido.",
  "Send reset link": "Enviar enlace para restablecer",

  // Account deletion: confirm it's you (the dialog itself is in Settings)
  "Not connected to the cloud.": "Sin conexión a la nube.",
  "Sign out, sign in again, then delete your account.": "Cierra sesión, vuelve a iniciarla y luego elimina tu cuenta.",
  "Enter your password.": "Escribe tu contraseña.",
  "That password isn’t right. Try again, or type your email instead.": "Esa contraseña no es correcta. Inténtalo de nuevo o escribe tu correo en su lugar.",
  "Type the email you sign in with.": "Escribe el correo con el que inicias sesión.",
  "Your sign-in has expired. Sign out, sign in again, then delete your account.":
    "Tu sesión venció. Cierra sesión, vuelve a iniciarla y luego elimina tu cuenta.",
  "Confirm it’s you": "Confirma que eres tú",
  "Your sign-in has expired. Enter your password to continue.": "Tu sesión venció. Escribe tu contraseña para continuar.",
  "To keep your account safe, enter your password again.": "Para proteger tu cuenta, escribe tu contraseña otra vez.",
  "Your password": "Tu contraseña",
  "The email you sign in with": "El correo con el que inicias sesión",
  "No password? Type your email instead": "¿No tienes contraseña? Escribe tu correo",
  "Use my password instead": "Usar mi contraseña",

  // /join
  "That code isn’t valid any more. It may have been used already, revoked, or it’s older than 14 days. Ask whoever invited you for a new one.":
    "Ese código ya no es válido. Puede que ya se haya usado, que se haya revocado o que tenga más de 14 días. Pídele uno nuevo a quien te invitó.",
  "Enter the code from your invite — it looks like K7QM-XR4T-PA.": "Escribe el código de tu invitación; se ve así: K7QM-XR4T-PA.",
  "Teams aren’t available on this server": "Los equipos no están disponibles en este servidor",
  "This copy of {product} isn’t connected to the cloud, so there’s no team to join here. Ask your office for the {product} link they use.":
    "Esta copia de {product} no está conectada a la nube, así que aquí no hay equipo al cual unirse. Pídele a tu oficina el enlace de {product} que usan.",
  "Checking your invite…": "Revisando tu invitación…",
  "Join your company on {product}": "Únete a tu empresa en {product}",
  "Enter the invite code you got by text or email.": "Escribe el código de invitación que te llegó por mensaje de texto o correo.",
  "Invite code": "Código de invitación",
  Continue: "Continuar",
  "Already set up?": "¿Ya está todo listo?",
  "Go to your jobs": "Ir a tus obras",
  "You’re invited to join": "Te invitaron a unirte a",
  "your company": "tu empresa",
  "as {role}": "como {role}",
  "Please accept the Terms and Privacy Policy.": "Acepta las Condiciones y la Política de privacidad.",
  "That email and password don’t match an account. Check them, or create a new login.":
    "No hay ninguna cuenta con ese correo y esa contraseña. Revísalos o crea una cuenta nueva.",
  "You already have a {product} account with this email. Sign in with its password to join.":
    "Ya tienes una cuenta de {product} con este correo. Inicia sesión con su contraseña para unirte.",
  "You already have an account with this email. Choose “I have an account” and sign in.":
    "Ya tienes una cuenta con este correo. Elige “Ya tengo cuenta” e inicia sesión.",
  "You’re already on {team} as {email}.": "Ya estás en {team} como {email}.",
  "You’re signed in as {email}, which is already on {team}. Leave that team in Settings → Team first, or sign out and use a different email.":
    "Iniciaste sesión como {email}, que ya está en {team}. Primero sal de ese equipo en Configuración → Equipo, o cierra sesión y usa otro correo.",
  "another team": "otro equipo",
  "Open jobs": "Abrir obras",
  "Your team sees this when they give you tasks, and it’s on the photos you take.":
    "Tu equipo lo ve cuando te asigna tareas y aparece en las fotos que tomas.",
  "You’ll join as {name}.": "Te unirás como {name}.",
  Change: "Cambiar",
  "Checking sign-in…": "Revisando el inicio de sesión…",
  "Joining as {email}.": "Te unes como {email}.",
  "Not you?": "¿No eres tú?",
  "Join {team}": "Unirse a {team}",
  "Join the team": "Unirse al equipo",
  "New to {product}": "Soy nuevo en {product}",
  "I have an account": "Ya tengo cuenta",
  "Choose a password": "Elige una contraseña",
  "At least {n} character": {
    one: "Al menos {n} carácter",
    other: "Al menos {n} caracteres",
  },
  "You’ll use this email and password on the iPad and iPhone app too.": "Usarás este correo y esta contraseña también en la app para iPad y iPhone.",
  "Creating your login…": "Creando tu cuenta…",
  "Create login & join": "Crear cuenta y unirme",
  "Signing in…": "Iniciando sesión…",
  "Sign in & join": "Iniciar sesión y unirme",
  "Use a different code": "Usar otro código",
  "You’re signed in and on {team}.": "Iniciaste sesión y ya estás en {team}.",
  "Check your email to finish": "Revisa tu correo para terminar",
  "Your login is made, but it won’t work until you confirm it. We sent a confirmation link to {email}.":
    "Tu cuenta está creada, pero no funcionará hasta que la confirmes. Enviamos un enlace de confirmación a {email}.",
  "Open the email from {product} and tap the confirmation link.": "Abre el correo de {product} y toca el enlace de confirmación.",
  "Sign in with your password — you’ll join {team} automatically.": "Inicia sesión con tu contraseña y te unirás a {team} automáticamente.",
  "the team": "el equipo",
  "Nothing after a few minutes? Check spam. Already had a {product} account with this email? Just sign in below with its password.":
    "¿No llega nada después de unos minutos? Revisa spam. ¿Ya tenías una cuenta de {product} con este correo? Solo inicia sesión aquí abajo con su contraseña.",
  "Your email isn’t confirmed yet. Open the link in the email first.": "Tu correo todavía no está confirmado. Primero abre el enlace del correo.",
  "You’re on {team}": "Ya estás en {team}",
  "You’re on the team": "Ya estás en el equipo",
  "{open} to see every team job. They download in the background — give it a moment the first time.":
    "{open} para ver todas las obras del equipo. Se descargan en segundo plano; la primera vez puede tardar un momento.",
  "Open Jobs": "Abre Obras",
  "{where}, install {product} and sign in with {email} and the same password.":
    "{where}, instala {product} e inicia sesión con {email} y la misma contraseña.",
  "On iPad or iPhone": "En iPad o iPhone",
  "the same email": "el mismo correo",
  "Prices, estimates and Billdu stay with the office, so you won’t see them.": "Los precios, las cotizaciones y Billdu se quedan en la oficina, así que no los verás.",
  "Team settings": "Configuración del equipo",

  // /start: first-run checklist, technicians' start, "Set up your company"
  "Your business": "Tu negocio",
  "Name, phone and logo for your estimates and client proposals.": "Nombre, teléfono y logo para tus cotizaciones y propuestas a clientes.",
  "Upload your first floor plan": "Sube tu primer plano",
  "Start a job and add the plan — a PDF or a photo of it.": "Crea una obra y agrega el plano — un PDF o una foto.",
  "Invite your team": "Invita a tu equipo",
  "Office staff and technicians each get their own login.": "Cada persona de oficina y cada técnico tiene su propia cuenta.",
  "Get the iPad and iPhone app": "Descarga la app para iPad y iPhone",
  "Walk the site with the plan; it all syncs to the office.": "Recorre la obra con el plano; todo se sincroniza con la oficina.",
  "Setting up {company}…": "Configurando {company}…",
  "Welcome to {team}": "Bienvenido a {team}",
  "Welcome to the team": "Bienvenido al equipo",
  "Your jobs, plans, tasks and photos are ready. Use the app on site; this website works too.":
    "Tus obras, planos, tareas y fotos están listos. Usa la app en la obra; este sitio web también funciona.",
  "Get the app": "Descarga la app",
  "My tasks": "Mis tareas",
  "{n}-day free trial": {
    one: "{n} día de prueba gratis",
    other: "{n} días de prueba gratis",
  },
  "{team} is ready": "{team} está lista",
  "Welcome to {product}": "Bienvenido a {product}",
  "Four quick steps and you’re ready for your next walkthrough. You can come back to this any time.":
    "Cuatro pasos rápidos y estarás listo para tu próximo recorrido. Puedes volver aquí cuando quieras.",
  "All done": "Todo listo",
  "{done} of {total} done": "{done} de {total} hechos",
  "Hide this checklist": "Ocultar esta lista",
  "Go to jobs": "Ir a las obras",
  "Get set up · {done} of {total}": "Configuración · {done} de {total}",
  "Next: {step}": "Siguiente: {step}",
  "Hide the setup checklist": "Ocultar la lista de configuración",
  Hide: "Ocultar",
  Done: "Listo",
  "Saved on this device. It goes to your team when you’re back online.": "Guardado en este dispositivo. Le llegará a tu equipo cuando vuelvas a tener conexión.",
  "Business details saved": "Datos del negocio guardados",
  "Business name": "Nombre del negocio",
  Phone: "Teléfono",
  "Email on estimates": "Correo en las cotizaciones",
  Website: "Sitio web",
  "Your logo": "Tu logotipo",
  "No logo": "Sin logotipo",
  "Change logo": "Cambiar logotipo",
  "Upload logo": "Subir logotipo",
  Save: "Guardar",
  "Address, colours and estimate terms →": "Dirección, colores y condiciones del presupuesto →",
  Client: "Cliente",
  "Job address": "Dirección de la obra",
  "Create job and add the plan": "Crear obra y agregar el plano",
  "Next you’ll pick the plan file: every page of a PDF becomes a floor.": "Luego eliges el archivo del plano: cada página del PDF se convierte en un piso.",
  "Make an invite code for each person and text it to them. Technicians see plans, devices, photos and checklists — never prices.":
    "Crea un código de invitación para cada persona y envíaselo por mensaje. Los técnicos ven planos, dispositivos, fotos y listas de verificación, pero nunca los precios.",
  "I work alone — skip": "Trabajo solo: omitir",
  "Get it on the App Store": "Descárgala en el App Store",
  "Or scan the code with your iPhone or iPad camera.": "O escanea el código con la cámara de tu iPhone o iPad.",
  "The iPhone and iPad app is coming to the App Store. Until then, use this website on any device: on iPhone or iPad, open it in Safari and tap Share → Add to Home Screen.":
    "La app para iPhone y iPad llegará pronto al App Store. Mientras tanto, usa este sitio web en cualquier dispositivo: en iPhone o iPad, ábrelo en Safari y toca Compartir → Agregar a inicio.",
  "Sign in with {email} and the same password. Your jobs sync automatically.": "Inicia sesión con {email} y la misma contraseña. Tus obras se sincronizan automáticamente.",
  "QR code for the App Store page": "Código QR de la página del App Store",
  "Set up your company": "Configura tu empresa",
  "Everything in {product} belongs to your company: jobs, price list and crew. Your {n}-day free trial starts now.": {
    one: "Todo en {product} pertenece a tu empresa: obras, lista de precios y cuadrilla. Tu prueba gratis de {n} día empieza ahora.",
    other: "Todo en {product} pertenece a tu empresa: obras, lista de precios y cuadrilla. Tu prueba gratis de {n} días empieza ahora.",
  },
  "Your crew sees this, and it’s on the photos you take.": "Tu cuadrilla lo ve, y aparece en las fotos que tomas.",
  "Pick one or more. It sets up your device list, price list and checklists. You can change it later in Settings.":
    "Elige uno o más. Con esto se arman tu lista de dispositivos, lista de precios y listas de verificación. Puedes cambiarlo después en Configuración.",
  "Set up my company": "Configurar mi empresa",
  "I have an invite code": "Tengo un código de invitación",

  // /welcome (landing page)
  "Pin the plan. Send the quote. Get it signed.": "Marca el plano. Envía la cotización. Consigue la firma.",
  "{product} is takeoff, quoting and job management for electrical, low-voltage and specialty contractors. Put each device on the floor plan, and the count, the wire and your price come straight from it.":
    "{product} es cómputo, cotizaciones y gestión de obras para contratistas eléctricos, de bajo voltaje y especialidades. Coloca cada dispositivo en el plano, y el conteo, el cable y tu precio salen directo de ahí.",
  "See how it works": "Mira cómo funciona",
  "Free for {n} day with every feature. Just looking? {demo}.": {
    one: "Gratis por {n} día con todas las funciones. ¿Solo estás viendo? {demo}.",
    other: "Gratis por {n} días con todas las funciones. ¿Solo estás viendo? {demo}.",
  },
  "One job, from the first walkthrough to the final invoice": "Una obra, desde el primer recorrido hasta la factura final",
  "Each step uses what the last one made, so you never count the same plan twice or type a quote into an invoice.":
    "Cada paso usa lo que hizo el anterior, así nunca cuentas el mismo plano dos veces ni pasas una cotización a mano a una factura.",
  "Pin devices on the plans": "Coloca dispositivos en los planos",
  "Upload the PDF set or a photo of the drawings. Every page becomes a floor you can pinch, zoom and flip through. Tap a device from your trade’s list and tap where it goes.":
    "Sube el juego de planos en PDF o una foto de los planos. Cada página se convierte en un piso que puedes ampliar, acercar y hojear. Toca un dispositivo de la lista de tu oficio y toca dónde va.",
  "Letters on the plan, like the legend on the drawings": "Letras en el plano, como en la simbología de los planos",
  "Wire runs drawn back to the panel, rack or closet": "Tendidos dibujados hasta el tablero, el rack o el cuarto técnico",
  "Set the scale once from any known dimension": "Fija la escala una sola vez con cualquier medida conocida",
  "Get the count for every floor": "Obtén el conteo de cada piso",
  "Device and wire counts add up as you pin, floor by floor. Wire lengths come out in feet with slack included, and electrical jobs get circuits and a panel schedule.":
    "Los conteos de dispositivos y cable se suman mientras colocas, piso por piso. Las longitudes de cable salen en pies con holgura incluida, y las obras eléctricas tienen circuitos y cuadro de cargas.",
  "Counts come only from what’s on the plan": "Los conteos salen solo de lo que está en el plano",
  "Export the count and marked-up sheets as PDF": "Exporta el conteo y las hojas con anotaciones en PDF",
  "Price it from your price list": "Ponle precio con tu lista de precios",
  "Your material and labor prices, markup and wire by the foot turn the count into a quote. Mark items optional and let the client decide.":
    "Tus precios de material y mano de obra, el margen y el cable por pie convierten el conteo en una cotización. Marca partidas como opcionales y deja que el cliente decida.",
  "Starting prices for your trade, all editable": "Precios iniciales para tu oficio, todos editables",
  "Change the plan and the quote follows": "Cambia el plano y la cotización se actualiza",
  "Your client approves on their phone": "Tu cliente aprueba desde su teléfono",
  "Send the client a link. They read the quote, tick the options they want, sign with a finger and approve. No account or app for them.":
    "Envíale un enlace al cliente. Lee la cotización, marca las opciones que quiere, firma con el dedo y aprueba. No necesita cuenta ni app.",
  "See when it’s opened and when it’s approved": "Ve cuándo la abren y cuándo la aprueban",
  "The approved options are added to the job": "Las opciones aprobadas se agregan a la obra",
  "Bill the deposit, progress and final": "Factura el anticipo, los avances y el final",
  "Invoices come straight from the approved quote, so nothing is typed twice. Record payments as they come in and see what’s left to collect on every job.":
    "Las facturas salen directo de la cotización aprobada, así que nada se escribe dos veces. Registra los pagos a medida que llegan y ve cuánto falta por cobrar en cada obra.",
  "Quote and invoice numbering, tax and terms set once": "Numeración de cotizaciones y facturas, impuestos y condiciones se configuran una vez",
  "See what’s paid and what’s left on every job": "Ve lo pagado y lo pendiente en cada obra",
  "Run the job in the field": "Lleva la obra en campo",
  "The crew works from the same plans. Photos with mark-up, checklists and punch lists, tasks with who’s on them, daily logs and files all live on the job.":
    "La cuadrilla trabaja con los mismos planos. Fotos con anotaciones, listas de verificación y de pendientes, tareas con sus responsables, bitácoras diarias y archivos: todo queda en la obra.",
  "Photos pinned to the spot on the plan": "Fotos ubicadas en su lugar del plano",
  "Daily logs and photo reports ready to send": "Bitácoras diarias e informes de fotos listos para enviar",
  "Your trade’s devices, already on the list": "Los dispositivos de tu oficio, ya en la lista",
  "Pick your trades when you sign up. Each one comes with its own devices, wire or pipe types and checklists, with starting prices you change to yours.":
    "Elige tus oficios al registrarte. Cada uno trae sus propios dispositivos, tipos de cable o tubería y listas de verificación, con precios iniciales que cambias por los tuyos.",
  "Runs to": "Tendidos a",
  "{list} and more": "{list} y más",
  "The office sees the money. The crew sees the work.": "La oficina ve el dinero. La cuadrilla ve el trabajo.",
  "Invite your office staff and technicians with a code. Everyone works on the same jobs with their own login, and technician logins hide prices in the app.":
    "Invita a tu personal de oficina y a tus técnicos con un código. Todos trabajan en las mismas obras con su propia cuenta, y las cuentas de técnico ocultan los precios en la app.",
  "Owner and office": "Dueño y oficina",
  "Plans, counts, prices, quotes, invoices and settings.": "Planos, conteos, precios, cotizaciones, facturas y configuración.",
  Technicians: "Técnicos",
  "Plans, devices, photos, checklists, daily logs and their tasks. Prices, quotes and invoices are hidden in the app, and they can’t delete jobs.":
    "Planos, dispositivos, fotos, listas de verificación, bitácoras diarias y sus tareas. Los precios, cotizaciones y facturas están ocultos en la app, y no pueden eliminar obras.",
  "Kitchen, first floor": "Cocina, primer piso",
  Office: "Oficina",
  "{n} on the plan": "{n} en el plano",
  "All set": "Todo instalado",
  "{done} of {total} set": "{done} de {total} instalados",
  "Quote, invoices and margins": "Cotización, facturas y márgenes",
  "Photos, checklist and today’s tasks": "Fotos, lista de verificación y tareas de hoy",
  "No signal in the basement? Keep working.": "¿Sin señal en el sótano? Sigue trabajando.",
  "Every job is saved on the iPad or iPhone. Pin devices, take photos and tick checklists with no connection, and it all syncs when you’re back online.":
    "Cada obra se guarda en el iPad o iPhone. Coloca dispositivos, toma fotos y marca listas de verificación sin conexión, y todo se sincroniza cuando vuelvas a tener señal.",
  iPad: "iPad",
  "Walk the site with the plans": "Recorre la obra con los planos",
  iPhone: "iPhone",
  "Photos, checklists and tasks": "Fotos, listas de verificación y tareas",
  Web: "Web",
  "Quotes and invoices at the desk": "Cotizaciones y facturas en el escritorio",
  "Large plan sets": "Juegos de planos grandes",
  "Opens fast; pinch, zoom and flip sheets": "Abren rápido; amplía, acerca y hojea las hojas",
  "The same plan open on an iPad, an iPhone and a laptop": "El mismo plano abierto en un iPad, un iPhone y una laptop",
  "One price for the company": "Un solo precio para la empresa",
  "Every feature, every trade, unlimited jobs. Pay for the people who log in. Try it free for {n} day.": {
    one: "Todas las funciones, todos los oficios, obras ilimitadas. Paga por las personas que inician sesión. Pruébalo gratis por {n} día.",
    other: "Todas las funciones, todos los oficios, obras ilimitadas. Paga por las personas que inician sesión. Pruébalo gratis por {n} días.",
  },
  "See pricing": "Ver precios",
  Monthly: "Mensual",
  "includes {n} user": {
    one: "incluye {n} usuario",
    other: "incluye {n} usuarios",
  },
  "Each extra user": "Cada usuario adicional",
  "a month": "al mes",
  "A crew of {n}": {
    one: "Una cuadrilla de {n} persona",
    other: "Una cuadrilla de {n} personas",
  },
  "Free trial": "Prueba gratis",
  "{n} day": {
    one: "{n} día",
    other: "{n} días",
  },
  "every feature": "todas las funciones",
  "Prices in USD, plus applicable tax.": "Precios en USD, más los impuestos que correspondan.",
  "Questions contractors ask": "Preguntas que hacen los contratistas",
  "Do I need internet on site?": "¿Necesito internet en la obra?",
  "No. Plans, devices, photos and checklists are saved on the iPad or phone and sync when you’re back online.":
    "No. Los planos, dispositivos, fotos y listas de verificación se guardan en el iPad o el teléfono y se sincronizan cuando vuelves a tener conexión.",
  "What plans can I use?": "¿Qué planos puedo usar?",
  "PDF plan sets (every page becomes a floor), photos or scans of printed plans, or a sketch. Set the scale once from any known dimension.":
    "Juegos de planos en PDF (cada página se convierte en un piso), fotos o escaneos de planos impresos, o un croquis. Fija la escala una sola vez con cualquier medida conocida.",
  "Which trades does it work for?": "¿Para qué oficios sirve?",
  "Low voltage and smart home, electrical, fire alarm, HVAC, plumbing, and solar and EV charging. Pick one or several, and add your own devices to any list.":
    "Bajo voltaje y casa inteligente, electricidad, alarma contra incendios, HVAC, plomería, y energía solar y carga de vehículos eléctricos. Elige uno o varios y agrega tus propios dispositivos a cualquier lista.",
  "Can my technicians use it without seeing prices?": "¿Mis técnicos pueden usarlo sin ver los precios?",
  "Yes. Technicians get their own login for plans, devices, photos, checklists and tasks. Prices, quotes and invoices are hidden from them in the app.":
    "Sí. Los técnicos tienen su propia cuenta para planos, dispositivos, fotos, listas de verificación y tareas. Los precios, cotizaciones y facturas están ocultos para ellos en la app.",
  "Does it work with my accounting?": "¿Funciona con mi contabilidad?",
  "Quotes, invoices and payments are built into {product}, so you don’t need anything else. You can also export counts, quotes and plan sheets as PDF or CSV.":
    "Las cotizaciones, facturas y pagos ya vienen en {product}, así que no necesitas nada más. También puedes exportar conteos, cotizaciones y hojas de planos en PDF o CSV.",
  "What happens after the {n}-day trial?": {
    one: "¿Qué pasa después de la prueba de {n} día?",
    other: "¿Qué pasa después de la prueba de {n} días?",
  },
  "Choose a plan to keep going. If you don’t, your jobs stay readable and you can export them any time. See {pricing}.":
    "Elige un plan para continuar. Si no lo haces, tus obras siguen disponibles para consulta y puedes exportarlas cuando quieras. Consulta {pricing}.",
  pricing: "los precios",
  "Is my data private?": "¿Mis datos son privados?",
  "Each company’s jobs are private to its team, enforced in the database. You can export everything or delete your account from Settings.":
    "Las obras de cada empresa son privadas para su equipo, y la base de datos lo garantiza. Puedes exportar todo o eliminar tu cuenta desde Configuración.",
  "Bring your next set of plans": "Trae tu próximo juego de planos",
  "Set up your company, upload a plan and send a real quote during the {n}-day trial. Bring the crew in when you’re ready.": {
    one: "Configura tu empresa, sube un plano y envía una cotización real durante la prueba de {n} día. Suma a tu cuadrilla cuando estés listo.",
    other: "Configura tu empresa, sube un plano y envía una cotización real durante la prueba de {n} días. Suma a tu cuadrilla cuando estés listo.",
  },
  // /welcome, Northpin redesign: trade strip, steps, features, crew
  "Starting device lists and prices for": "Listas de dispositivos y precios iniciales para",
  "Upload the plans": "Sube los planos",
  "Drop in the PDF set or a photo of the drawings. Every page becomes a floor.":
    "Agrega el juego de planos en PDF o una foto de los planos. Cada página se convierte en un piso.",
  "Pin every device": "Coloca cada dispositivo",
  "Tap a device from your trade’s list, then tap where it goes on the plan.":
    "Toca un dispositivo de la lista de tu oficio y luego toca dónde va en el plano.",
  "Get the count": "Obtén el conteo",
  "Devices and wire add up per floor as you pin. Nothing is counted twice.":
    "Los dispositivos y el cable se suman por piso mientras colocas. Nada se cuenta dos veces.",
  "Send the quote": "Envía la cotización",
  "Your prices turn the count into a quote the client signs on their phone.":
    "Tus precios convierten el conteo en una cotización que el cliente firma en su teléfono.",
  "Bill and build": "Factura y construye",
  "Invoice from the approved quote while the crew works from the same plans.":
    "Factura desde la cotización aprobada mientras la cuadrilla trabaja con los mismos planos.",
  "Count from the plan, floor by floor": "Conteo desde el plano, piso por piso",
  "Tap a device, tap the plan. Device and wire counts add up as you pin, with wire lengths in feet and slack included. Electrical jobs also get circuits and a panel schedule.":
    "Toca un dispositivo, toca el plano. Los conteos de dispositivos y cable se suman mientras colocas, con longitudes de cable en pies y holgura incluida. Las obras eléctricas también tienen circuitos y cuadro de cargas.",
  "A quote your client signs on their phone": "Una cotización que tu cliente firma en su teléfono",
  "Your material and labor prices, markup and wire by the foot turn the count into a quote. Send the client a link: they tick the options they want, sign with a finger and approve. No account or app for them.":
    "Tus precios de material y mano de obra, el margen y el cable por pie convierten el conteo en una cotización. Envíale un enlace al cliente: marca las opciones que quiere, firma con el dedo y aprueba. No necesita cuenta ni app.",
  "Change orders signed the same way as quotes": "Órdenes de cambio firmadas igual que las cotizaciones",

  // Pictures of the app on /welcome (illustrations; names, sheet numbers and wire types stay as they are)
  "An electrical floor plan with {n} device pinned on it and circuits drawn to the panel. Beside it, the count for the floor and a {total} quote that the client signed and approved on their phone.":
    {
      one: "Un plano eléctrico con {n} dispositivo colocado y circuitos trazados hasta el tablero. Al lado, el conteo del piso y una cotización de {total} que el cliente firmó y aprobó en su teléfono.",
      other: "Un plano eléctrico con {n} dispositivos colocados y circuitos trazados hasta el tablero. Al lado, el conteo del piso y una cotización de {total} que el cliente firmó y aprobó en su teléfono.",
    },
  Receptacles: "Contactos",
  "GFCI receptacles": "Contactos GFCI",
  Switches: "Apagadores",
  "3-way switches": "Apagadores de 3 vías",
  "Recessed lights": "Luces empotradas",
  "Surface fixtures": "Luminarias de sobreponer",
  "Smoke alarms": "Detectores de humo",
  Job: "Obra",
  Floor: "Piso",
  "First floor power and lighting": "Contactos e iluminación, primer piso",
  Sheet: "Hoja",
  "First floor count": "Conteo del primer piso",
  "{n} device": { one: "{n} dispositivo", other: "{n} dispositivos" },
  "{ft} ft": "{ft} ft",
  "Quote {number}": "Cotización {number}",
  "and {n} more line": {
    one: "y {n} línea más",
    other: "y {n} líneas más",
  },
  "Signed by {name}": "Firmada por {name}",
  Approved: "Aprobada",
  Basement: "Sótano",
  "First floor": "Primer piso",
  "Second floor": "Segundo piso",
  "{n} floor from one PDF": {
    one: "{n} piso de un solo PDF",
    other: "{n} pisos de un solo PDF",
  },
  "Sheet {number}": "Hoja {number}",
  Viewing: "Viendo",
  "Tap a device, then tap the plan": "Toca un dispositivo y luego toca el plano",
  "Device and wire count": "Conteo de dispositivos y cable",
  "Updated as you pin": "Se actualiza mientras colocas",
  Device: "Dispositivo",
  "1st fl": "1.er piso",
  "2nd fl": "2.º piso",
  Total: "Total",
  "Panel schedule, {panel}": "Cuadro de cargas, {panel}",
  "Kitchen counter receptacles": "Contactos de la barra de cocina",
  "Kitchen and dining lights": "Luces de cocina y comedor",
  "Laundry and garage": "Lavandería y cochera",
  "From your price list": "De tu lista de precios",
  "{wire} wire": "Cable {wire}",
  "Optional: under-cabinet lights, {ft} ft": "Opcional: luces bajo gabinetes, {ft} ft",
  "Markup {pct}%, labor included": "Margen {pct}%, mano de obra incluida",
  "Quote from your company": "Cotización de tu empresa",
  "Add under-cabinet lights": "Agregar luces bajo gabinetes",
  "Add EV outlet in garage": "Agregar contacto para vehículo eléctrico en la cochera",
  "Sign here": "Firma aquí",
  "Approved by {name}": "Aprobada por {name}",
  Money: "Dinero",
  "Approved quote {total}": "Cotización aprobada {total}",
  "Deposit, 50%": "Anticipo, 50%",
  "Progress, rough-in done": "Avance, instalación preliminar terminada",
  Final: "Final",
  Paid: "Pagada",
  Sent: "Enviada",
  Draft: "Borrador",
  "Invoice {number}": "Factura {number}",
  "Left to collect": "Por cobrar",
  "Move box 6 in. left": "Mover la caja 6 in a la izquierda",
  "Kitchen, island wall": "Cocina, muro de la isla",
  "Pinned to {sheet}, tagged rough-in": "Ubicada en {sheet}, etiqueta: instalación preliminar",
  "Rough-in checklist": "Lista de verificación de instalación preliminar",
  "{done} of {total}": "{done} de {total}",
  "Boxes set at 16 in. to center": "Cajas a 16 in al centro",
  "Home runs labelled at the panel": "Retornos al tablero etiquetados en el tablero",
  "Photo every wall before drywall": "Fotografiar cada muro antes del tablaroca",
  Task: "Tarea",
  "Pull circuits {from} to {to} to {panel}": "Jalar circuitos del {from} al {to} hasta {panel}",
  "{name}, due Thursday": "{name}, vence el jueves",

  // /pricing
  "One plan for the whole company": "Un solo plan para toda la empresa",
  "Every feature, every trade and unlimited jobs. You pay for the people who log in, and the first {n} day is free.": {
    one: "Todas las funciones, todos los oficios y obras ilimitadas. Pagas por las personas que inician sesión, y tienes {n} día gratis.",
    other: "Todas las funciones, todos los oficios y obras ilimitadas. Pagas por las personas que inician sesión, y tienes {n} días gratis.",
  },
  "People who log in": "Personas que inician sesión",
  "{n} user": {
    one: "{n} usuario",
    other: "{n} usuarios",
  },
  "{n} user, {total} a month": {
    one: "{n} usuario, {total} al mes",
    other: "{n} usuarios, {total} al mes",
  },
  "{price} includes {n} user": {
    one: "{price} incluye {n} usuario",
    other: "{price} incluye {n} usuarios",
  },
  "plus {n} extra user at {price}": {
    one: "más {n} usuario adicional a {price}",
    other: "más {n} usuarios adicionales a {price}",
  },
  "a month, plus tax": "al mes, más impuestos",
  "Includes {n} user. Each extra user is {price} a month. USD, plus applicable tax.": {
    one: "Incluye {n} usuario. Cada usuario adicional cuesta {price} al mes. En USD, más los impuestos que correspondan.",
    other: "Incluye {n} usuarios. Cada usuario adicional cuesta {price} al mes. En USD, más los impuestos que correspondan.",
  },
  "You, office staff and technicians each count as one user. Clients never need a login.":
    "Tú, el personal de oficina y los técnicos cuentan cada uno como un usuario. Los clientes nunca necesitan cuenta.",
  "{n} day free. Cancel any time, and your jobs stay yours to export.": {
    one: "{n} día gratis. Cancela cuando quieras; tus obras siguen siendo tuyas para exportarlas.",
    other: "{n} días gratis. Cancela cuando quieras; tus obras siguen siendo tuyas para exportarlas.",
  },
  "Every feature from day one. Set up your company, upload a plan and send a real quote before you decide.":
    "Todas las funciones desde el primer día. Configura tu empresa, sube un plano y envía una cotización real antes de decidir.",
  "Prices stay with the office": "Los precios se quedan en la oficina",
  "Techs get their own login for plans, devices, photos, checklists and tasks. Their logins hide prices, quotes and invoices in the app.":
    "Los técnicos tienen su propia cuenta para planos, dispositivos, fotos, listas de verificación y tareas. Sus cuentas ocultan los precios, cotizaciones y facturas en la app.",
  "Your data, always": "Tus datos, siempre",
  "Export every job as a backup file any time: during the trial, after it, or after you cancel.":
    "Exporta todas tus obras como archivo de respaldo cuando quieras: durante la prueba, después o después de cancelar.",
  "Private to your company": "Privado para tu empresa",
  "Jobs are visible only to your team, enforced in the database. Delete your account from Settings whenever you like.":
    "Solo tu equipo ve las obras, y la base de datos lo garantiza. Elimina tu cuenta desde Configuración cuando quieras.",
  "Pricing questions": "Preguntas sobre precios",
  "Still deciding? {ask} or {demo}.": "¿Todavía lo estás pensando? {ask} o {demo}.",
  "Ask us anything": "Pregúntanos lo que quieras",
  "Can I cancel any time?": "¿Puedo cancelar cuando quiera?",
  "Yes. There’s no contract: cancel from Settings and you won’t be charged again. Your jobs stay readable and exportable.":
    "Sí. No hay contrato: cancela desde Configuración y no se te volverá a cobrar. Tus obras siguen disponibles para consulta y exportación.",
  "What happens when the trial ends?": "¿Qué pasa cuando termina la prueba?",
  "After {n} day, add a card to keep working. If you don’t, nothing is deleted: your jobs become read-only until you subscribe.": {
    one: "Después de {n} día, agrega una tarjeta para seguir trabajando. Si no lo haces, no se borra nada: tus obras quedan en modo de solo lectura hasta que te suscribas.",
    other: "Después de {n} días, agrega una tarjeta para seguir trabajando. Si no lo haces, no se borra nada: tus obras quedan en modo de solo lectura hasta que te suscribas.",
  },
  "Who counts as a user?": "¿Quién cuenta como usuario?",
  "Anyone with their own login on your team: you, office staff and technicians. {n} is included; each extra person is {price} a month.": {
    one: "Cualquier persona de tu equipo con su propia cuenta: tú, el personal de oficina y los técnicos. Se incluye {n}; cada persona adicional cuesta {price} al mes.",
    other: "Cualquier persona de tu equipo con su propia cuenta: tú, el personal de oficina y los técnicos. Se incluyen {n}; cada persona adicional cuesta {price} al mes.",
  },
  "What do technicians see?": "¿Qué ven los técnicos?",
  "Plans, devices, wire runs, photos, checklists, daily logs and tasks on every team job. Prices, quotes and invoices are hidden from their logins in the app, and they can’t delete jobs.":
    "Planos, dispositivos, tendidos, fotos, listas de verificación, bitácoras diarias y tareas en todas las obras del equipo. Los precios, cotizaciones y facturas están ocultos en sus cuentas de la app, y no pueden eliminar obras.",
  "Do I need separate accounting software?": "¿Necesito un programa de contabilidad aparte?",
  "Not for quotes and invoices: quotes, invoices and payments are built in, and counts and quotes export as PDF or CSV for your bookkeeping.":
    "No para cotizaciones y facturas: las cotizaciones, facturas y pagos ya vienen incluidos, y los conteos y cotizaciones se exportan en PDF o CSV para tu contabilidad.",
  "Can I export my data?": "¿Puedo exportar mis datos?",
  "Yes. Settings, then Account, then {export} downloads every job (plans, devices, photos and quotes) as one backup file you can restore into {product} on any device. Counts and quotes also export as PDF and CSV.":
    "Sí. En Configuración, luego Cuenta, {export} descarga todas las obras (planos, dispositivos, fotos y cotizaciones) en un solo archivo de respaldo que puedes restaurar en {product} en cualquier dispositivo. Los conteos y cotizaciones también se exportan en PDF y CSV.",
  "Export my data": "Exportar mis datos",
  "Do I pay for the iPad and iPhone apps?": "¿Tengo que pagar por las apps de iPad y iPhone?",
  "No. One subscription covers the web app and the iPad and iPhone apps for everyone on your team.":
    "No. Una sola suscripción cubre la app web y las apps de iPad y iPhone para todo tu equipo.",
  "The crew reads it in their language. The client gets English.":
    "La cuadrilla lo lee en su idioma. El cliente lo recibe en inglés.",
  "Each person picks English, Spanish, Russian, Ukrainian, Polish, Portuguese, Chinese or Vietnamese, and the choice stays with their login. Plans, checklists, tasks and daily logs read in their language; quotes, invoices and client emails always go out in English.":
    "Cada persona elige inglés, español, ruso, ucraniano, polaco, portugués, chino o vietnamita, y la elección se guarda en su cuenta. Los planos, listas de verificación, tareas y bitácoras diarias se leen en su idioma; las cotizaciones, facturas y correos a clientes siempre salen en inglés.",
  "All eight languages work in the web app today, in any computer, tablet or phone browser, and on the iPad and iPhone app.":
    "Los ocho idiomas ya funcionan en la app web, en el navegador de cualquier computadora, tableta o teléfono, y en la app para iPad y iPhone.",
  "Can my crew use it in their own language?":
    "¿Mi cuadrilla puede usarlo en su propio idioma?",
  "Yes. Northpin speaks English, Spanish, Russian, Ukrainian, Polish, Portuguese, Chinese and Vietnamese. Anyone can switch from the menu or the page footer on the web, and the iPad and iPhone app follows the device language. The choice is saved on their login. Quotes, invoices and everything the client sees stay in English.":
    "Sí. Northpin habla inglés, español, ruso, ucraniano, polaco, portugués, chino y vietnamita. En la web, cualquiera puede cambiar el idioma desde el menú o el pie de página, y la app para iPad y iPhone sigue el idioma del dispositivo. La elección se guarda en su cuenta. Las cotizaciones, facturas y todo lo que ve el cliente se quedan en inglés.",
};

export default dict;
