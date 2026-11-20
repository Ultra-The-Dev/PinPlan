// Spanish translation of /privacy, for convenience only: the English text in src/app/privacy/page.tsx governs.
// Keep the sections, ids and conditions (AI_ENABLED) in step with the English page.
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";
import SubprocessorTableEs from "./SubprocessorTableEs";

const S = {
  scope: { id: "scope", title: "Quiénes somos y qué abarca esta política" },
  collect: { id: "collect", title: "Información que recopilamos" },
  use: { id: "use", title: "Cómo usamos la información" },
  ai: { id: "ai", title: "Tratamiento con IA" },
  sharing: { id: "sharing", title: "Cómo compartimos la información" },
  subprocessors: { id: "subprocessors", title: "Subencargados del tratamiento" },
  retention: { id: "retention", title: "Conservación y eliminación" },
  security: { id: "security", title: "Seguridad" },
  rights: { id: "rights", title: "Sus derechos y opciones" },
  clients: { id: "your-clients", title: "Información sobre los clientes finales de nuestros clientes" },
  transfers: { id: "transfers", title: "Transferencias internacionales" },
  children: { id: "children", title: "Menores de edad" },
  changes: { id: "changes", title: "Cambios en esta política" },
  contact: { id: "contact", title: "Contacto" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S).filter((t) => AI_ENABLED || t !== S.ai);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export const privacyEs: LegalTranslation = {
  title: "Política de privacidad",
  toc,
  intro: (
    <p>
      Los contratistas eléctricos, de bajo voltaje y de especialidades confían a Northpin sus planos, cotizaciones, facturas, obras y los datos de sus clientes.
      Esta política explica, en lenguaje sencillo, qué recopilamos, por qué, quién nos ayuda a tratarlo, cuánto tiempo lo conservamos y cómo puede usted
      controlarlo. En resumen: usamos sus datos para hacer funcionar Northpin para usted, no los vendemos y no los usamos para entrenar modelos de IA.
    </p>
  ),
  children: (
    <>
      <Section item={S.scope} n={n(S.scope)}>
        <p>
          Northpin es operado por <Ph>{COMPANY.legalName}</Ph> (“Northpin”, “nosotros”), con sede en los Estados Unidos. Esta política abarca nuestro sitio web,
          nuestra aplicación web y nuestra aplicación para iOS (en conjunto, el “Servicio”).
        </p>
        <p>Northpin es una herramienta empresarial, por lo que tratamos la información personal en dos funciones:</p>
        <ul>
          <li>
            <strong>Como empresa (responsable del tratamiento)</strong>, respecto de la información sobre las empresas y personas que se registran en Northpin y lo
            usan: información de la cuenta, de facturación, de soporte y de uso.
          </li>
          <li>
            <strong>Como proveedor de servicios (encargado del tratamiento)</strong>, respecto de los datos de obra que nuestros clientes ingresan en Northpin,
            incluida la información sobre sus propios clientes finales. Nuestros clientes deciden qué se ingresa y con qué fin; nosotros lo tratamos en su nombre
            conforme a nuestros <Link href="/terms">Términos del servicio</Link> y a nuestro <Link href="/legal/dpa">Anexo de tratamiento de datos</Link>. Consulte
            la <a href="#your-clients">sección {n(S.clients)}</a>.
          </li>
        </ul>
      </Section>

      <Section item={S.collect} n={n(S.collect)}>
        <h3>Información que usted nos proporciona</h3>
        <ul>
          <li>
            <strong>Información de la cuenta y del equipo:</strong> nombre, dirección de correo electrónico, contraseña (que nuestro proveedor de autenticación
            almacena únicamente como un hash seguro), nombre de la empresa, función en el equipo e invitaciones que usted envía.
          </li>
          <li>
            <strong>Perfil de la empresa:</strong> nombre de la empresa, logotipo, teléfono, correo electrónico, dirección, impuestos y condiciones de pago que usted
            agrega a cotizaciones, facturas y otros documentos.
          </li>
          <li>
            <strong>Información de facturación:</strong> contacto de facturación, plan y facturas. Los datos de la tarjeta los recopila y almacena Stripe; nosotros
            solo vemos datos limitados, como la marca de la tarjeta, los últimos cuatro dígitos y la fecha de vencimiento.
          </li>
          <li>
            <strong>Datos de obra (“Datos del Cliente”):</strong> proyectos, juegos de planos y dibujos, ubicación de dispositivos, tendidos de cable y medidas,
            cómputos, catálogos y precios, cotizaciones y presupuestos, facturas, notas de crédito y registros de pagos, RFI, órdenes de cambio, formularios, listas
            de verificación, tareas, cronogramas, reportes diarios, notas, documentos y archivos. Esto puede incluir los nombres, direcciones, números de teléfono y
            direcciones de correo electrónico de sus clientes finales.
          </li>
          <li>
            <strong>Fotos y sus metadatos:</strong> las fotos que usted toma o sube, con leyendas, etiquetas y anotaciones. Las fotos pueden contener metadatos
            incrustados (EXIF), como la hora en que se tomaron, el modelo de la cámara y la <strong>ubicación GPS</strong>; Northpin lee la ubicación y la hora para
            colocar las fotos en los mapas de obras y en los reportes.
          </li>
          <li>
            <strong>Comunicaciones de soporte:</strong> lo que usted nos envía cuando se comunica con soporte.
          </li>
        </ul>
        <h3>Información que se recopila automáticamente</h3>
        <ul>
          <li>
            <strong>Ubicación del dispositivo</strong>, solo si usted la permite en su dispositivo, para geoetiquetar fotos y mostrar en el mapa las obras
            cercanas. Puede desactivarla en cualquier momento en la configuración de su navegador o de iOS.
          </li>
          <li>
            <strong>Acceso a la cámara</strong>, solo cuando usted decide tomar una foto en la aplicación.
          </li>
          <li>
            <strong>Diagnóstico:</strong> cuando la aplicación encuentra un error, nos envía un informe de error: el mensaje de error y el seguimiento técnico de la
            pila, la dirección de la página (sin las cadenas de consulta ni los tokens), la versión del navegador o de la aplicación, la plataforma y, si usted ha
            iniciado sesión, su ID de usuario. Eliminamos de estos informes las direcciones de correo electrónico y los tokens de acceso antes de que se envíen.
          </li>
          <li>
            <strong>Registros del servidor y de seguridad:</strong> nuestro proveedor de alojamiento registra datos técnicos de las solicitudes, como la dirección
            IP, la hora, la dirección solicitada y el tipo de navegador. Usamos las direcciones IP para proteger el Servicio, incluida la limitación de la frecuencia
            de solicitudes.
          </li>
        </ul>
        <h3 id="cookies">Cookies y almacenamiento local</h3>
        <p>
          Northpin no usa cookies publicitarias, cookies de análisis ni rastreadores de terceros. Para funcionar sin conexión y mantener su sesión iniciada, guarda
          datos en su dispositivo:
        </p>
        <ul>
          <li>
            <strong>Sus obras</strong>, en la base de datos de su navegador (IndexedDB) o en el almacenamiento de la aplicación para iOS, para que pueda seguir
            trabajando sin conexión.
          </li>
          <li>
            <strong>Su sesión</strong>, en el almacenamiento local de su navegador (o en el llavero de iOS), para que su sesión siga iniciada.
          </li>
          <li>
            <strong>Las páginas de la aplicación</strong>, en la caché sin conexión de su navegador (un service worker), para que la aplicación se abra sin señal.
          </li>
          <li>
            <strong>Pequeñas preferencias</strong>, como su equipo actual, la configuración del mapa y de las fotos, y el nombre que escribió al responder un enlace
            que alguien le envió, para que no tenga que volver a ingresarlos en ese dispositivo.
          </li>
        </ul>
        <p>
          Todo esto es necesario para que el Servicio funcione. Permanece en su dispositivo hasta que usted cierre sesión y borre los datos del sitio en su
          navegador, o desinstale la aplicación. Cuando usted paga en la web, las páginas de pago y de facturación de Stripe (en el propio sitio de Stripe) pueden
          establecer sus propias cookies para el pago y la prevención del fraude, conforme a la política de privacidad de Stripe.
        </p>
        <h3>Información sobre las personas que reciben enlaces</h3>
        <p>
          Cuando uno de nuestros clientes envía un enlace a una cotización, propuesta, factura, orden de cambio, RFI o reporte de fotos y el destinatario lo abre,
          podemos registrar que se abrió y cuándo. Si el destinatario responde (por ejemplo, acepta o rechaza una cotización, firma una orden de cambio o responde
          una RFI), registramos el nombre que escribió, su firma, las opciones que eligió, su nota o respuesta y la hora, y compartimos esta información con el
          cliente que lo envió.
        </p>
      </Section>

      <Section item={S.use} n={n(S.use)}>
        <p>Usamos la información para:</p>
        <ul>
          <li>
            prestar el Servicio: almacenar y sincronizar sus obras entre sus dispositivos y su equipo, y generar cómputos, cotizaciones, facturas, archivos PDF,
            reportes y enlaces para clientes;
          </li>
          {AI_ENABLED && <li>ejecutar las funciones de IA cuando usted las usa (consulte más abajo);</li>}
          <li>procesar pagos y administrar suscripciones;</li>
          <li>
            enviar correos electrónicos del servicio, como enlaces de inicio de sesión, invitaciones al equipo, documentos que usted envía a sus clientes, recibos y
            cambios importantes;
          </li>
          <li>brindar soporte, y diagnosticar y corregir problemas;</li>
          <li>mantener la seguridad del Servicio y de nuestros clientes, prevenir abusos y hacer cumplir nuestros Términos;</li>
          <li>comprender el uso general, de forma agregada o desidentificada, para mejorar Northpin; y</li>
          <li>cumplir obligaciones legales.</li>
        </ul>
        <p>
          <strong>No</strong> vendemos información personal, no la compartimos para publicidad conductual en contextos cruzados y no usamos los Datos del Cliente
          para entrenar modelos de IA. Si alguna vez enviamos correos electrónicos de marketing, usted puede darse de baja en cualquier momento.
        </p>
        <p>
          Cuando se apliquen leyes del tipo del RGPD, nuestras bases jurídicas son: la ejecución de nuestro contrato con usted; nuestros intereses legítimos en
          operar, proteger y mejorar un servicio empresarial (ponderados frente a sus derechos); su consentimiento, por ejemplo para la ubicación del dispositivo
          (que usted puede retirar); y el cumplimiento de obligaciones legales.
        </p>
      </Section>

      {AI_ENABLED && (
        <Section item={S.ai} n={n(S.ai)}>
          <p>
            Las funciones de IA (leer una hoja de plano, sugerir ubicaciones de dispositivos, explicar una hoja, poner una leyenda a una foto o redactar el borrador
            de una bitácora diaria) solo se ejecutan cuando alguien de su equipo las usa. En ese momento, la imagen o las imágenes correspondientes y el texto
            relacionado (como nombres de habitaciones, leyendas, notas o su catálogo de dispositivos) se envían a Anthropic, PBC para su tratamiento conforme a sus
            condiciones comerciales. Conforme a dichas condiciones, Anthropic no usa estos datos para entrenar sus modelos y puede conservarlos durante un periodo
            limitado para fines como la confianza y la seguridad, según se describe en sus condiciones y políticas comerciales. Los resultados de la IA vuelven a
            Northpin como sugerencias que una persona debe revisar.
          </p>
        </Section>
      )}

      <Section item={S.sharing} n={n(S.sharing)}>
        <p>Compartimos la información únicamente:</p>
        <ul>
          <li>
            <strong>Dentro de su equipo:</strong> los miembros del equipo ven las obras del equipo según su función.
          </li>
          <li>
            <strong>Con las personas que usted elige:</strong> cuando usted envía una cotización, factura, reporte u otro enlace, o conecta una integración como
            Billdu, enviamos los datos correspondientes adonde usted indique.
          </li>
          <li>
            <strong>Con subencargados del tratamiento</strong> que alojan y operan partes del Servicio para nosotros en virtud de contratos que limitan el uso que
            hacen de los datos (se enumeran más abajo).
          </li>
          <li>
            <strong>Por motivos legales:</strong> para cumplir la ley o un proceso legal válido, o para proteger los derechos, la integridad y la seguridad de
            nuestros clientes, del público o de Northpin. Cuando esté permitido, le informaremos sobre las solicitudes relativas a sus datos.
          </li>
          <li>
            <strong>En una transferencia de negocio:</strong> si Northpin participa en una fusión, adquisición o venta de activos, con sujeción a esta política.
          </li>
        </ul>
        <p>
          El mapa de obras carga los mosaicos del mapa desde los servidores de mosaicos de OpenStreetMap directamente en su navegador, por lo que estos reciben su
          dirección IP y el área del mapa solicitada, como ocurre con cualquier sitio web. Las fuentes tipográficas se sirven desde nuestros propios servidores, por
          lo que las páginas que abren sus clientes no se conectan con servicios de fuentes de terceros.
        </p>
      </Section>

      <Section item={S.subprocessors} n={n(S.subprocessors)}>
        <SubprocessorTableEs />
        <p>
          Si usted conecta Billdu, los datos de obras y clientes que decida enviar van a Billdu conforme a su propio acuerdo con dicho proveedor. La lista vigente
          está siempre disponible en <Link href="/legal/subprocessors">Subencargados del tratamiento</Link>. La actualizaremos antes de agregar un nuevo
          subencargado que trate Datos del Cliente; los clientes pueden pedir que se les avise en <Ph>{COMPANY.privacyEmail}</Ph>.
        </p>
      </Section>

      <Section item={S.retention} n={n(S.retention)}>
        <ul>
          <li>
            <strong>Los Datos del Cliente</strong> se conservan mientras exista su cuenta. Cuando usted elimina un elemento, este se marca como eliminado para que
            sus otros dispositivos y los dispositivos de su equipo también lo quiten; el registro marcado permanece en nuestra base de datos, oculto en la
            aplicación, hasta que se elimine la cuenta o usted nos pida que lo borremos.
          </li>
          <li>
            <strong>Eliminar su cuenta</strong> en la aplicación elimina de inmediato su acceso y sus obras, archivos y documentos de nuestra base de datos activa y
            del almacenamiento de archivos (las obras de un miembro del equipo se quedan con su equipo; consulte <Link href="/support#delete-account">Soporte</Link>
            ).
          </li>
          <li>
            <strong>Cuando termina una suscripción</strong>, la cuenta queda en modo de solo lectura y sus datos se conservan para que usted pueda exportarlos o
            volver. Todavía no eliminamos automáticamente las cuentas finalizadas: los Datos del Cliente se eliminan cuando usted los elimina en la aplicación, o
            dentro de los {RETENTION.deletionRequestDays} días siguientes a una solicitud por escrito del propietario de la cuenta a{" "}
            <Ph>{COMPANY.privacyEmail}</Ph>.
          </li>
          <li>
            <strong>Copias de seguridad:</strong> los datos eliminados permanecen en nuestras copias de seguridad cifradas de la base de datos hasta que estas
            vencen, en un plazo de <Ph>{RETENTION.backupDays}</Ph> días.
          </li>
          <li>
            <strong>Los informes de errores</strong> se eliminan automáticamente después de {RETENTION.errorReportDays} días. Nuestro proveedor de alojamiento
            conserva los registros del servidor durante un periodo breve, según su configuración de conservación.
          </li>
          <li>
            <strong>Los registros de facturación</strong> se conservan durante el tiempo que exijan las leyes fiscales y contables (normalmente, hasta siete años).
          </li>
          <li>
            <strong>Los datos en sus dispositivos</strong> permanecen allí hasta que usted los elimine, cierre sesión y borre los datos de la aplicación, o
            desinstale la aplicación.
          </li>
        </ul>
        <p>
          Puede exportar sus obras en cualquier momento y eliminar su cuenta desde la aplicación; consulte <Link href="/support#delete-account">Soporte</Link>. Las
          fotos conservan sus metadatos originales (incluida la ubicación GPS) cuando se exportan o se comparten, así que revíselas antes de enviarlas fuera de su
          empresa.
        </p>
      </Section>

      <Section item={S.security} n={n(S.security)}>
        <p>Aplicamos medidas de seguridad administrativas, técnicas y físicas adecuadas para un servicio empresarial, entre ellas:</p>
        <ul>
          <li>cifrado en tránsito (HTTPS/TLS con HSTS) y cifrado en reposo de nuestra base de datos y del almacenamiento de archivos;</li>
          <li>
            seguridad a nivel de fila en la base de datos, de modo que cada cuenta y cada equipo solo puedan acceder a sus propios datos, con permisos basados en
            funciones dentro de un equipo;
          </li>
          <li>
            claves del lado del servidor que se mantienen fuera del navegador y de la aplicación, y credenciales de integraciones de terceros cifradas en reposo
            (AES-256-GCM);
          </li>
          <li>encabezados de seguridad estrictos en el navegador, limitación de la frecuencia de solicitudes y protección contra abusos en los puntos de acceso sensibles;</li>
          <li>copias de seguridad periódicas de la base de datos; y</li>
          <li>acceso a los sistemas de producción limitado a las personas que lo necesitan para operar el Servicio y darle soporte.</li>
        </ul>
        <p>
          Ningún sistema es perfectamente seguro. Si tenemos conocimiento de una violación que afecte a su información personal, se lo notificaremos a usted y a
          las autoridades según lo exija la ley. Le pedimos que informe las vulnerabilidades a <Ph>{COMPANY.securityEmail}</Ph>.
        </p>
      </Section>

      <Section item={S.rights} n={n(S.rights)}>
        <p>Según el lugar donde viva, usted puede tener derecho a:</p>
        <ul>
          <li>conocer la información personal que tenemos sobre usted y acceder a ella, y recibir una copia portátil;</li>
          <li>corregir la información inexacta;</li>
          <li>eliminar su información;</li>
          <li>oponerse a determinados tratamientos o limitarlos, y retirar su consentimiento cuando nos basemos en él;</li>
          <li>
            excluirse de la “venta” o del “intercambio” de información personal (no la vendemos ni la compartimos en ese sentido) y limitar el uso de información
            sensible, como la ubicación precisa (solo la usamos para prestar el Servicio); y
          </li>
          <li>presentar una queja ante la autoridad de protección de datos de su lugar de residencia.</li>
        </ul>
        <p>
          <strong>Residentes de California:</strong> en los últimos 12 meses hemos recopilado identificadores, información comercial (suscripciones), actividad en
          internet (diagnóstico y registros), geolocalización (ubicación de fotos y del dispositivo), información audiovisual (fotos) e información profesional
          (empresa y función) para los fines comerciales descritos anteriormente, y los hemos divulgado a los proveedores de servicios enumerados más arriba. No
          hemos vendido ni compartido información personal, ni hemos usado información personal sensible para fines que requieran un derecho a limitar su uso. No
          lo discriminaremos por ejercer sus derechos, y usted puede recurrir a un agente autorizado. Respetamos las señales de Global Privacy Control como
          solicitud de exclusión.
        </p>
        <p>
          Para presentar una solicitud, use las herramientas de la aplicación (exportar, eliminar cuenta) o escriba a <Ph>{COMPANY.privacyEmail}</Ph>.
          Verificaremos su solicitud, normalmente confirmando el acceso al correo electrónico de su cuenta, y responderemos dentro del plazo que exija la ley (por
          ejemplo, 45 días conforme a la ley de California o un mes conforme al RGPD).
        </p>
      </Section>

      <Section item={S.clients} n={n(S.clients)}>
        <p>
          Si usted es cliente de una empresa que usa Northpin (por ejemplo, recibió una cotización o una RFI), esa empresa controla su información y decide cómo se
          usa. Comuníquese con ella para acceder a su información, corregirla o eliminarla. Si se comunica con nosotros, le remitiremos su solicitud a esa empresa y
          la ayudaremos a responder.
        </p>
      </Section>

      <Section item={S.transfers} n={n(S.transfers)}>
        <p>
          Northpin se opera desde los Estados Unidos y almacena los datos en <Ph>{COMPANY.dataRegion}</Ph>. Si usted usa Northpin desde fuera de los EE. UU., su
          información se transfiere a los EE. UU. y se trata allí. Cuando sea necesario, nos basamos en garantías adecuadas: <Ph>{COMPANY.transferMechanism}</Ph>.
        </p>
      </Section>

      <Section item={S.children} n={n(S.children)}>
        <p>
          Northpin es un servicio empresarial y no está dirigido a menores de edad. No recopilamos a sabiendas información personal de menores de 16 años. Si cree
          que un menor nos ha proporcionado información personal, comuníquese con nosotros y la eliminaremos.
        </p>
      </Section>

      <Section item={S.changes} n={n(S.changes)}>
        <p>
          Actualizaremos esta política cuando cambien nuestras prácticas y modificaremos la fecha de entrada en vigor indicada arriba. Si un cambio es sustancial,
          lo notificaremos a los propietarios de las cuentas por correo electrónico o en la aplicación antes de que entre en vigor.
        </p>
      </Section>

      <Section item={S.contact} n={n(S.contact)}>
        <p>
          Preguntas o solicitudes: <Ph>{COMPANY.privacyEmail}</Ph>
          <br />
          <Ph>{COMPANY.legalName}</Ph>, <Ph>{COMPANY.address}</Ph>
        </p>
      </Section>
    </>
  ),
};
