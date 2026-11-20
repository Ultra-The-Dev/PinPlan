// Spanish version of /support. The English page (src/app/support/page.tsx) governs where the account-deletion and
// data-export wording matters; keep the sections, ids, steps and conditions (AI_ENABLED) in step with it. Menu names
// follow the app's Spanish dictionary (docs/i18n.md).
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import StatusCheck from "@/components/legal/StatusCheck";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  contact: { id: "contact", title: "Contáctenos" },
  status: { id: "status", title: "Estado del servicio" },
  faq: { id: "faq", title: "Preguntas frecuentes" },
  export: { id: "export", title: "Exportar sus datos" },
  deleteAccount: { id: "delete-account", title: "Eliminar su cuenta" },
  security: { id: "security", title: "Informar un problema de seguridad" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);

const FAQ: { q: string; a: React.ReactNode; onlyWhen?: "ai" }[] = [
  {
    q: "¿Northpin funciona sin señal?",
    a: "Sí. Las obras, los planos y las fotos se guardan primero en su dispositivo, así que puede seguir colocando dispositivos y tomando fotos sin conexión. Cuando vuelva a estar en línea, los cambios se sincronizan automáticamente con su equipo. El ícono de la nube en el encabezado muestra todo lo que aún está pendiente de subir.",
  },
  {
    q: "¿Dónde se guardan mis datos?",
    a: (
      <>
        En su dispositivo y, cuando usted ha iniciado sesión, en nuestra base de datos y almacenamiento de archivos en la nube alojados por Supabase en{" "}
        <Ph>{COMPANY.dataRegion}</Ph>, cifrados en tránsito y en reposo. Consulte la <Link href="/privacy">Política de privacidad</Link> para ver la lista completa
        de proveedores.
      </>
    ),
  },
  {
    q: "¿Se usan mis datos para entrenar a la IA?",
    a: "No. Las funciones de IA (lectura de planos, sugerencias de dispositivos, leyendas de fotos, borradores de bitácoras diarias) solo se ejecutan cuando usted las usa. Las imágenes y el texto implicados los procesa Anthropic conforme a sus condiciones comerciales, que no permiten entrenar con estos datos. Las sugerencias de la IA nunca cuentan en un cómputo ni en los precios hasta que alguien las acepta.",
    onlyWhen: "ai",
  },
  {
    q: "¿Cómo agrego al personal de oficina y a los técnicos?",
    a: "Abra Configuración → Equipo e invítelos. Los técnicos pueden trabajar con planos, fotos, listas de verificación y tareas; en sus cuentas se ocultan los precios, las cotizaciones y las facturas de la aplicación. Cada persona tiene su propio acceso.",
  },
  {
    q: "¿Cómo cambio o cancelo mi suscripción?",
    a: (
      <>
        Los propietarios del equipo pueden cambiar de plan o cancelar en Configuración → Plan y facturación; la cancelación surte efecto al final del periodo en
        curso. Si se suscribió a través del App Store, adminístrela en Configuración de iOS → su nombre → Suscripciones. Consulte{" "}
        <Link href="/pricing">Precios</Link> para ver los planes.
      </>
    ),
  },
  {
    q: "Una foto muestra la ubicación equivocada o no muestra ninguna.",
    a: "Northpin lee la posición GPS que su cámara guardó en la foto. Asegúrese de que su aplicación de cámara tenga permiso de acceso a la ubicación (y Northpin también, si toma las fotos desde la aplicación). Algunas aplicaciones de mensajería eliminan la ubicación de las fotos que se envían por ellas.",
  },
  {
    q: "No puedo iniciar sesión o no recibí un correo.",
    a: (
      <>
        Revise su carpeta de spam en busca de un mensaje de Northpin y asegúrese de usar el mismo correo electrónico al que lo invitó su equipo. ¿Sigue sin poder
        entrar? Escriba a <Ph>{COMPANY.supportEmail}</Ph> desde esa dirección y le ayudaremos.
      </>
    ),
  },
  {
    q: "Algo salió mal en la aplicación.",
    a: "Vuelva a cargar la página o abra de nuevo la aplicación: su trabajo está guardado en el dispositivo. Si aparece una pantalla de error, toque “Copiar detalles” y péguelos en un correo electrónico a soporte para que podamos encontrar el problema rápidamente.",
  },
];

export const supportEs: LegalTranslation = {
  title: "Soporte",
  toc,
  intro: (
    <p>
      Somos un equipo pequeño que desarrolla Northpin para contratistas eléctricos, de bajo voltaje y de especialidades. Personas reales responden cada mensaje.
    </p>
  ),
  children: (
    <>
      <Section item={S.contact}>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">Soporte por correo electrónico</p>
            <p className="mt-1">
              <Ph>{COMPANY.supportEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">
              Respondemos en un plazo de un día hábil (horario de EE. UU., <Ph>{COMPANY.supportTimeZone}</Ph>). Incluya el nombre de su empresa y, si se trata de un
              problema, lo que estaba haciendo y una captura de pantalla o los detalles del error copiados.
            </p>
          </div>
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">Privacidad y solicitudes de datos</p>
            <p className="mt-1">
              <Ph>{COMPANY.privacyEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">
              Para solicitudes de acceso, exportación o eliminación. Envíelas desde el correo electrónico de su cuenta para que podamos verificarlas.
            </p>
          </div>
        </div>
        <p>Nunca envíe contraseñas, claves de API ni números de tarjetas de pago por correo electrónico. Nunca se los pediremos.</p>
      </Section>

      <Section item={S.status}>
        <div className="mk-sheet mt-4 p-5">
          <StatusCheck />
          <p className="mt-3 text-sm text-mk-pencil">
            Verificación en tiempo real de nuestros servidores y de la base de datos: <a href="/api/health">/api/health</a>
          </p>
        </div>
      </Section>

      <Section item={S.faq}>
        <div className="mt-4 divide-y divide-mk-rule mk-sheet">
          {FAQ.filter((f) => f.onlyWhen !== "ai" || AI_ENABLED).map((f) => (
            <details key={f.q} className="group px-5 py-4 [&_p]:mt-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-mk-graphite [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="text-slate-400 transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="text-mk-pencil">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section item={S.export}>
        <p>
          Sus obras le pertenecen. Puede sacarlas en cualquier momento, incluso después de que termine su suscripción (la cuenta sigue disponible en modo de solo
          lectura).
        </p>
        <ul>
          <li>
            <strong>Una obra completa, con planos, anotaciones, fotos y precios:</strong> abra la obra → pestaña <strong>Resumen</strong> →{" "}
            <strong>Copia de seguridad</strong> → <strong>Descargar copia de seguridad</strong>. Así se guarda un único archivo que Northpin puede restaurar en
            cualquier dispositivo (Obras → <strong>Restaurar copia</strong>).
          </li>
          <li>
            <strong>Cómputo, precios y reportes:</strong> descargue archivos PDF y CSV desde las pestañas <strong>Cómputo</strong>, <strong>Dinero</strong> (sección
            Precios), <strong>Plano</strong> y <strong>Campo</strong> de una obra.
          </li>
          <li>
            <strong>Su lista de precios:</strong> <strong>Lista de precios</strong> → descargue el CSV.
          </li>
          <li>
            <strong>Todo a la vez:</strong> escriba a <Ph>{COMPANY.supportEmail}</Ph> desde la dirección del propietario del equipo y le enviaremos una exportación
            completa de los datos de su cuenta en un plazo de {RETENTION.deletionRequestDays} días.
          </li>
        </ul>
      </Section>

      <Section item={S.deleteAccount}>
        <p>Usted mismo puede eliminar su cuenta:</p>
        <ol>
          <li>
            En la aplicación web o en la aplicación para iOS, abra <strong>Configuración → Cuenta</strong>.
          </li>
          <li>
            Elija <strong>Eliminar cuenta</strong> y confirme.
          </li>
        </ol>
        <p>Qué sucede después:</p>
        <ul>
          <li>Su acceso se elimina de inmediato y se cierra su sesión en todos los dispositivos.</li>
          <li>
            Si usted es el <strong>propietario del equipo</strong>, al eliminar su cuenta también se eliminan las obras, fotos y documentos del equipo. Si la empresa
            va a seguir usando Northpin, primero transfiera la propiedad (Configuración → Equipo) y cancele cualquier suscripción del App Store en la Configuración de
            iOS.
          </li>
          <li>Si usted es miembro de un equipo, sus obras se quedan con su equipo; solo se eliminan su acceso y sus datos personales.</li>
          <li>
            Sus datos se eliminan de inmediato de nuestra base de datos activa y del almacenamiento de archivos, y de las copias de seguridad a medida que estas
            vencen, según se describe en la <Link href="/privacy#retention">Política de privacidad</Link>. Las copias guardadas en sus propios dispositivos permanecen
            hasta que usted elimine la aplicación o sus datos.
          </li>
        </ul>
        <p>
          ¿No puede iniciar sesión? Escriba a <Ph>{COMPANY.privacyEmail}</Ph> desde el correo electrónico de su cuenta con el asunto “Delete my account” (“Eliminar
          mi cuenta”) y lo haremos por usted después de confirmar su identidad, en un plazo de {RETENTION.deletionRequestDays} días a partir de su correo.
        </p>
      </Section>

      <Section item={S.security}>
        <p>
          Si cree haber encontrado una vulnerabilidad de seguridad, escriba a <Ph>{COMPANY.securityEmail}</Ph> con los detalles. Le pedimos que nos dé un plazo
          razonable para corregirla antes de divulgarla y que, durante sus pruebas, no acceda a datos de otros clientes ni interrumpa el Servicio. Agradecemos los
          reportes responsables.
        </p>
      </Section>
    </>
  ),
};
