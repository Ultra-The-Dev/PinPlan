// Spanish translation of /terms, for convenience only: the English text in src/app/terms/page.tsx governs.
// Keep the sections, ids and conditions (AI_ENABLED) in step with the English page.
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  agreement: { id: "agreement", title: "El acuerdo" },
  definitions: { id: "definitions", title: "Definiciones" },
  accounts: { id: "accounts", title: "Cuentas y equipos" },
  billing: { id: "billing", title: "Suscripciones, pruebas y facturación" },
  data: { id: "customer-data", title: "Sus datos" },
  ai: { id: "ai", title: "Funciones de IA" },
  proposals: { id: "proposals", title: "Presupuestos, propuestas y firmas" },
  use: { id: "acceptable-use", title: "Uso aceptable" },
  thirdParty: { id: "third-party", title: "Servicios de terceros" },
  availability: { id: "availability", title: "Disponibilidad, uso sin conexión y copias de seguridad" },
  ip: { id: "ip", title: "Nuestra propiedad intelectual" },
  confidentiality: { id: "confidentiality", title: "Confidencialidad" },
  termination: { id: "termination", title: "Vigencia, cancelación y terminación" },
  warranties: { id: "warranties", title: "Exclusión de garantías" },
  liability: { id: "liability", title: "Limitación de responsabilidad" },
  indemnity: { id: "indemnity", title: "Indemnización" },
  law: { id: "law", title: "Ley aplicable y controversias" },
  apple: { id: "apple", title: "Condiciones del App Store de Apple" },
  changes: { id: "changes", title: "Cambios en estos términos" },
  general: { id: "general", title: "Disposiciones generales" },
  contact: { id: "contact", title: "Contacto" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S).filter((t) => AI_ENABLED || t !== S.ai);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export const termsEs: LegalTranslation = {
  title: "Términos del servicio",
  toc,
  intro: (
    <p>
      Northpin ayuda a los contratistas eléctricos, de bajo voltaje y de especialidades a hacer cómputos a partir de planos, enviar cotizaciones y facturas, y
      gestionar sus obras en campo. Estos términos explican lo que puede esperar de nosotros y lo que esperamos de usted. Le pedimos que los lea; al usar
      Northpin, usted los acepta.
    </p>
  ),
  children: (
    <>
      <Section item={S.agreement} n={n(S.agreement)}>
        <p>
          Estos Términos del servicio (los “Términos”) constituyen un acuerdo entre <Ph>{COMPANY.legalName}</Ph>, <Ph>{COMPANY.entity}</Ph> (“Northpin”,
          “nosotros”), y la empresa u organización que se registra en Northpin (el “Cliente”, “usted”). Si acepta estos Términos en nombre de una empresa, usted
          confirma que tiene facultades para obligarla. Si no tiene esas facultades, o no está de acuerdo, no use Northpin.
        </p>
        <p>
          Northpin es una herramienta empresarial. Se ofrece a empresas y a su personal exclusivamente con fines comerciales, no a consumidores para uso personal,
          familiar o doméstico. Debe tener al menos 18 años para crear una cuenta.
        </p>
        <p>
          Nuestra <Link href="/privacy">Política de privacidad</Link> explica cómo tratamos la información personal y forma parte de estos Términos. Si usted ha
          firmado con nosotros un formulario de pedido o un acuerdo de tratamiento de datos, ese documento prevalece en lo que contradiga estos Términos.
        </p>
      </Section>

      <Section item={S.definitions} n={n(S.definitions)}>
        <ul>
          <li>
            <strong>Servicio</strong> significa el sitio web de Northpin, la aplicación web, la aplicación para iOS, las API y el soporte relacionado que
            prestamos.
          </li>
          <li>
            <strong>Usuarios</strong> son las personas a las que usted permite usar el Servicio con su cuenta, como propietarios, personal de oficina y técnicos de
            su equipo.
          </li>
          <li>
            <strong>Datos del Cliente</strong> es todo lo que usted y sus Usuarios ingresan en el Servicio: obras, planos y dibujos, ubicación de dispositivos,
            cómputos, precios, cotizaciones y presupuestos, facturas, notas de crédito y registros de pagos, RFI, órdenes de cambio, formularios, listas de
            verificación, tareas, cronogramas, reportes diarios, fotos (incluidos sus metadatos de ubicación y hora), notas, documentos y archivos, así como
            información sobre sus propios clientes.
          </li>
          <li>
            <strong>Sus Clientes Finales</strong> son las personas y empresas para las que usted realiza trabajos, incluida cualquier persona que abra un enlace a
            una cotización, factura, orden de cambio, RFI o reporte que usted envíe.
          </li>
        </ul>
      </Section>

      <Section item={S.accounts} n={n(S.accounts)}>
        <ul>
          <li>Proporciónenos información de cuenta exacta y manténgala actualizada, incluida una dirección de correo electrónico que funcione.</li>
          <li>
            Mantenga la confidencialidad de las contraseñas y los códigos de acceso y no comparta sus credenciales de acceso. Cada Usuario debe tener su propio
            acceso. Usted es responsable de todo lo que se haga con su cuenta y por sus Usuarios, así como de asignar sus funciones (por ejemplo, qué Usuarios
            pueden ver los precios).
          </li>
          <li>
            Avísenos de inmediato en <Ph>{COMPANY.securityEmail}</Ph> si cree que alguien ha accedido a su cuenta sin autorización.
          </li>
          <li>
            El propietario del equipo controla la cuenta del equipo. Si el propietario deja su empresa, contáctenos y le ayudaremos a transferir la propiedad una
            vez que podamos verificar la solicitud con su empresa.
          </li>
        </ul>
      </Section>

      <Section item={S.billing} n={n(S.billing)}>
        <p>
          <strong>Planes y licencias de usuario.</strong> Los planes de pago se facturan por periodo de suscripción (mensual o anual) y pueden limitar el número de
          Usuarios (“licencias”) u otros usos, según se indique en nuestra <Link href="/pricing">página de precios</Link> o en su pedido.
          {AI_ENABLED && " Pueden aplicarse límites de uso a las funciones de IA para que el Servicio sea justo y confiable."}
        </p>
        <p>
          <strong>Prueba gratis.</strong> Podemos ofrecer una prueba gratis. Cuando termina, el Servicio continúa solo si usted elige un plan de pago. Si no lo
          hace, su cuenta queda limitada o en modo de solo lectura, y aún podrá exportar sus datos según se describe más adelante.
        </p>
        <p>
          <strong>Pago.</strong> Los pagos realizados en la web los procesa Stripe, Inc. Al suscribirse, usted nos autoriza a cobrar, a través de Stripe, a su
          método de pago al inicio de cada periodo hasta que cancele. No almacenamos números de tarjeta completos. Las suscripciones se renuevan automáticamente,
          salvo que se cancelen antes de la fecha de renovación. Las compras realizadas a través del App Store de Apple las factura y administra Apple conforme a
          sus condiciones, y deben cancelarse desde su cuenta de Apple.
        </p>
        <p>
          <strong>Impuestos.</strong> Los precios no incluyen impuestos, salvo que se indique lo contrario. Usted es responsable de los impuestos sobre las ventas,
          sobre el uso y otros similares que correspondan, excepto los impuestos sobre nuestros ingresos.
        </p>
        <p>
          <strong>Cambios y reembolsos.</strong> Podemos cambiar los precios con un aviso previo de al menos 30 días; los cambios se aplican a partir de su
          siguiente renovación. Las tarifas no son reembolsables y no otorgamos créditos por periodos parciales, salvo cuando la ley lo exija o cuando nosotros
          demos por terminado el Servicio sin causa, en cuyo caso reembolsaremos las tarifas pagadas por adelantado correspondientes al periodo no utilizado.
        </p>
        <p>
          <strong>Pago atrasado.</strong> Si un pago no se procesa, se lo informaremos y volveremos a intentarlo. Si sigue sin pagarse 14 días después del aviso,
          podemos suspender las funciones de pago hasta que se pague.
        </p>
      </Section>

      <Section item={S.data} n={n(S.data)}>
        <p>
          <strong>Los Datos del Cliente son de su propiedad.</strong> Usted nos otorga una licencia limitada para alojar, copiar, transmitir, tratar y mostrar los
          Datos del Cliente solo en la medida necesaria para prestarle, proteger y dar soporte al Servicio, para prevenir abusos y según lo exija la ley. No
          vendemos los Datos del Cliente ni los usamos para mostrarle publicidad a usted ni a nadie más.
        </p>
        <p>
          <strong>Sus responsabilidades.</strong> Usted es responsable de los Datos del Cliente y de contar con los derechos y permisos necesarios para ingresarlos
          en el Servicio. Esto incluye los planos de planta y dibujos que sube (que pueden pertenecer a arquitectos, ingenieros o propietarios de edificios), las
          fotos tomadas en las instalaciones de sus Clientes Finales y la información personal sobre sus Clientes Finales, como nombres, direcciones, números de
          teléfono, correos electrónicos y firmas. Cuando la ley lo exija, usted es responsable de informar a sus Clientes Finales sobre cómo usa su información y
          de obtener su consentimiento.
        </p>
        <p>
          <strong>Nuestro papel.</strong> Respecto de la información personal contenida en los Datos del Cliente, actuamos como su proveedor de servicios (o
          “encargado del tratamiento”) y la tratamos conforme a sus instrucciones, según se describe en nuestra <Link href="/privacy">Política de privacidad</Link>{" "}
          y en nuestro <Link href="/legal/dpa">Anexo de tratamiento de datos</Link>, que forma parte de estos Términos. Puede solicitar una copia firmada por
          nosotros en <Ph>{COMPANY.privacyEmail}</Ph>.
        </p>
        <p>
          <strong>Información sensible.</strong> No use el Servicio para almacenar números de tarjetas de pago, números de identificación oficial, información de
          salud, códigos de alarma, códigos de puertas ni contraseñas de los sistemas de sus Clientes Finales. El Servicio no está diseñado para ese tipo de datos.
        </p>
        <p>
          <strong>Datos agregados.</strong> Podemos usar información desidentificada y agregada sobre el uso del Servicio (por ejemplo, cuántas obras se crean) para
          operarlo y mejorarlo, siempre que no lo identifique a usted, a sus Usuarios ni a sus Clientes Finales.
        </p>
      </Section>

      {AI_ENABLED && (
        <Section item={S.ai} n={n(S.ai)}>
          <p>
            Algunas funciones usan inteligencia artificial: leer hojas de planos, sugerir ubicaciones de dispositivos, explicar una hoja, poner leyendas a las fotos
            y redactar borradores de bitácoras diarias. Cuando usted usa una de ellas, las imágenes y el texto correspondientes (por ejemplo, una hoja de plano, una
            foto, nombres de habitaciones o su catálogo de dispositivos) se envían a nuestro proveedor de IA, Anthropic, PBC, para su tratamiento conforme a sus
            condiciones comerciales. Conforme a dichas condiciones, Anthropic no usa estos datos para entrenar sus modelos.
          </p>
          <ul>
            <li>
              <strong>Solo sugerencias.</strong> Los resultados de la IA pueden ser incorrectos o incompletos. Los dispositivos sugeridos nunca cuentan en un
              cómputo ni en un presupuesto hasta que una persona de su equipo los acepta. Usted es responsable de revisar las cantidades, los precios, las leyendas
              y los reportes antes de basarse en ellos o de enviarlos a cualquier persona.
            </li>
            <li>
              <strong>No es asesoramiento profesional.</strong> Northpin no presta asesoramiento de ingeniería, diseño, cumplimiento de códigos y normas,
              seguridad contra incendios y protección de la vida ni asesoramiento legal, y los resultados de la IA no lo sustituyen.
            </li>
            <li>
              <strong>Usted decide.</strong> Las funciones de IA solo se ejecutan cuando alguien de su equipo las usa.
            </li>
          </ul>
        </Section>
      )}

      <Section item={S.proposals} n={n(S.proposals)}>
        <p>
          Northpin puede generar cotizaciones, facturas, órdenes de cambio, RFI, reportes de fotos y otros documentos, así como enlaces que sus Clientes Finales
          pueden abrir, responder, firmar y aceptar. Usted decide su contenido, precios y condiciones. Cualquier contrato que se celebre es entre usted y su Cliente
          Final; nosotros no somos parte de él ni somos responsables de sus condiciones, de su trabajo ni de si una firma electrónica es válida para su propósito en
          su jurisdicción. Las facturas y los registros de pagos en Northpin son sus registros: usted es responsable de los impuestos que cobra y de su propia
          contabilidad. Cualquier persona que tenga el enlace a un documento puede verlo, por lo que debe compartir los enlaces solo con el destinatario previsto y
          retirar los enlaces que ya no quiera mantener activos.
        </p>
        <p>
          Las integraciones como Billdu envían datos a otro servicio por indicación suya. Su uso de ese servicio se rige por su acuerdo con el proveedor
          correspondiente.
        </p>
      </Section>

      <Section item={S.use} n={n(S.use)}>
        <p>Usted se compromete a no hacer lo siguiente, ni permitir que otra persona lo haga:</p>
        <ul>
          <li>infringir la ley o los derechos de cualquier persona, ni subir contenido que no tenga derecho a usar;</li>
          <li>subir software malicioso, ni intentar acceder a cuentas, datos o sistemas a los que no esté autorizado a acceder;</li>
          <li>
            sondear, escanear o probar la vulnerabilidad del Servicio, salvo mediante nuestro proceso de divulgación responsable (consulte Soporte);
          </li>
          <li>
            sobrecargar o interrumpir el Servicio, eludir los límites de uso ni usar medios automatizados para acceder a él distintos de nuestras API publicadas;
          </li>
          <li>
            revender, sublicenciar o prestar el Servicio a terceros como oficina de servicios, salvo a sus propios Clientes Finales en la forma prevista por el
            Servicio;
          </li>
          <li>copiar el Servicio, aplicarle ingeniería inversa ni crear un producto competidor a partir de él, salvo cuando la ley lo permita expresamente; ni</li>
          <li>usar el Servicio para acosar a nadie ni para enviar spam.</li>
        </ul>
        <p>
          Podemos suspender el acceso que, de forma razonable, consideremos que infringe esta sección o pone en riesgo el Servicio o a otros clientes, y le
          explicaremos el motivo cuando sea posible.
        </p>
      </Section>

      <Section item={S.thirdParty} n={n(S.thirdParty)}>
        <p>
          El Servicio depende de proveedores externos, que se enumeran en nuestra <Link href="/privacy#subprocessors">Política de privacidad</Link>. Los mapas del
          Servicio usan datos de OpenStreetMap, © colaboradores de OpenStreetMap. Los productos de terceros que usted decida conectar los proporcionan esos
          terceros, no nosotros.
        </p>
      </Section>

      <Section item={S.availability} n={n(S.availability)}>
        <p>
          Trabajamos para que el Servicio esté disponible y sea rápido, pero en ocasiones puede no estar disponible por mantenimiento, actualizaciones o motivos
          ajenos a nuestro control. Northpin está diseñado para seguir funcionando sin conexión: los datos que usted ingresa se guardan primero en su dispositivo y
          se sincronizan con nuestros servidores cuando hay conexión. Los datos que aún no se han sincronizado existen solo en ese dispositivo, por lo que pueden
          perderse si el dispositivo se pierde, se restablece o se borra el almacenamiento de su navegador.
        </p>
        <p>
          Hacemos copias de seguridad periódicas de los datos sincronizados (consulte nuestra <Link href="/privacy#retention">Política de privacidad</Link>), pero
          las copias de seguridad sirven para la recuperación ante desastres y no sustituyen sus propios registros. Puede exportar sus obras en cualquier momento.
        </p>
      </Section>

      <Section item={S.ip} n={n(S.ip)}>
        <p>
          Somos propietarios del Servicio, incluidos su software, diseño, símbolos y documentación. Mientras su suscripción esté activa, le otorgamos a usted y a sus
          Usuarios un derecho no exclusivo e intransferible de usar el Servicio para sus fines comerciales internos conforme a estos Términos. Si nos envía ideas o
          comentarios, podemos usarlos sin ninguna obligación hacia usted.
        </p>
      </Section>

      <Section item={S.confidentiality} n={n(S.confidentiality)}>
        <p>
          Cada una de las partes protegerá la información comercial no pública de la otra con un cuidado razonable, la usará solo para los fines de este acuerdo y
          la compartirá solo con las personas y proveedores que la necesiten y estén obligados a protegerla. Esto no se aplica a la información que sea pública, ya
          conocida, desarrollada de forma independiente o cuya divulgación exija la ley (con aviso cuando esté permitido).
        </p>
      </Section>

      <Section item={S.termination} n={n(S.termination)}>
        <ul>
          <li>
            <strong>Cancelación.</strong> Puede cancelar en cualquier momento desde su configuración de facturación (o a través de Apple, si se suscribió allí). La
            cancelación surte efecto al final del periodo en curso.
          </li>
          <li>
            <strong>Terminación por nuestra parte.</strong> Podemos dar por terminada o suspender su cuenta si usted incumple de manera sustancial estos Términos y no
            subsana el incumplimiento dentro de los 15 días siguientes al aviso, de inmediato en caso de infracciones graves de las reglas de uso aceptable, o si la
            ley lo exige. Podemos dejar de ofrecer el Servicio con un aviso previo de al menos 60 días y el reembolso de las tarifas pagadas por adelantado
            correspondientes al periodo no utilizado.
          </li>
          <li>
            <strong>Sus datos después de la terminación.</strong> Cuando termina su suscripción, su cuenta queda en modo de solo lectura y aún puede exportar los
            Datos del Cliente (le ayudaremos si lo solicita). Los eliminamos cuando usted elimina su cuenta en la aplicación, o dentro de los{" "}
            {RETENTION.deletionRequestDays} días siguientes a una solicitud por escrito a <Ph>{COMPANY.privacyEmail}</Ph>; después se eliminan de las copias de
            seguridad a medida que estas vencen, según se describe en nuestra <Link href="/privacy#retention">Política de privacidad</Link>.
          </li>
          <li>
            Las secciones que por su naturaleza deban subsistir (como los pagos adeudados, las exclusiones de garantías, la limitación de responsabilidad y la
            indemnización) subsisten tras la terminación.
          </li>
        </ul>
      </Section>

      <Section item={S.warranties} n={n(S.warranties)}>
        <p>
          Prestaremos el Servicio con una pericia y un cuidado razonables y de conformidad con nuestra documentación. Por lo demás, en la máxima medida permitida
          por la ley, el Servicio se proporciona “tal cual” y “según disponibilidad”, y rechazamos cualquier otra garantía, expresa o implícita, incluidas las de
          comerciabilidad, idoneidad para un fin determinado, titularidad y no infracción. No garantizamos que el Servicio esté libre de errores o interrupciones,
          ni que los cómputos, presupuestos{AI_ENABLED ? ", resultados de la IA" : ""} o medidas derivadas de las escalas de los planos sean exactos. Usted es
          responsable de verificar las cantidades y los precios antes de basarse en ellos.
        </p>
        <p>
          Northpin es una herramienta para su propio trabajo. No presta asesoramiento de ingeniería, diseño, cumplimiento de códigos y normas, seguridad contra
          incendios y protección de la vida, fiscal ni legal, y nada de lo que contiene sustituye dicho asesoramiento.
        </p>
      </Section>

      <Section item={S.liability} n={n(S.liability)}>
        <p>En la máxima medida permitida por la ley:</p>
        <ul>
          <li>
            ninguna de las partes será responsable de daños indirectos, incidentales, especiales, consecuentes o punitivos, ni de la pérdida de ganancias, ingresos,
            fondo de comercio o datos (salvo nuestra obligación de restaurar datos a partir de nuestras copias de seguridad cuando estén disponibles), aun cuando se
            le haya advertido de su posibilidad; y
          </li>
          <li>
            la responsabilidad total de cada parte derivada de estos Términos o relacionada con ellos se limita a los importes que usted nos haya pagado por el
            Servicio en los 12 meses anteriores al hecho que dio origen a la reclamación (o 100 dólares estadounidenses si usted no ha pagado nada).
          </li>
        </ul>
        <p>
          Estos límites no se aplican a sus obligaciones de pago, a las obligaciones de indemnización de cualquiera de las partes ni a la responsabilidad que no
          pueda limitarse conforme a la ley.
        </p>
      </Section>

      <Section item={S.indemnity} n={n(S.indemnity)}>
        <p>
          Usted defenderá e indemnizará a Northpin frente a reclamaciones de terceros derivadas de los Datos del Cliente, de su trabajo para sus Clientes Finales o
          de su uso del Servicio en incumplimiento de estos Términos o de la ley. Nosotros lo defenderemos e indemnizaremos a usted frente a reclamaciones de
          terceros según las cuales el Servicio, tal como lo prestamos, infringe sus derechos de propiedad intelectual. La parte que solicite la indemnización debe
          notificarlo de inmediato a la otra, permitirle dirigir la defensa y cooperar de forma razonable.
        </p>
      </Section>

      <Section item={S.law} n={n(S.law)}>
        <p>
          Estos Términos se rigen por las leyes del Estado de <Ph>{COMPANY.state}</Ph> y por la legislación federal de los EE. UU. aplicable, sin tener en cuenta
          las normas sobre conflicto de leyes. Los tribunales estatales y federales ubicados en <Ph>{COMPANY.county}</Ph>, <Ph>{COMPANY.state}</Ph> tienen
          jurisdicción exclusiva, y ambas partes se someten a ellos. Antes de presentar una reclamación, cada parte se compromete a intentar resolver la
          controversia de manera informal, comunicándose con la otra y negociando de buena fe durante 30 días.
        </p>
      </Section>

      <Section item={S.apple} n={n(S.apple)}>
        <p>Si usa la aplicación de Northpin para iOS descargada del App Store de Apple, también se aplica lo siguiente:</p>
        <ul>
          <li>
            Estos Términos se celebran únicamente entre usted y Northpin, no con Apple. Northpin, y no Apple, es el único responsable de la aplicación y de su
            contenido.
          </li>
          <li>
            Su licencia para usar la aplicación se limita a los dispositivos de la marca Apple que usted posea o controle, según lo permitido por las reglas de uso
            del App Store.
          </li>
          <li>Apple no tiene ninguna obligación de prestar mantenimiento ni soporte para la aplicación.</li>
          <li>
            Si la aplicación no cumple alguna garantía aplicable, usted puede notificarlo a Apple y Apple le reembolsará el precio de compra (si lo hubiera). En la
            máxima medida permitida por la ley, Apple no tiene ninguna otra obligación de garantía respecto de la aplicación.
          </li>
          <li>
            Northpin, y no Apple, es responsable de atender cualquier reclamación relacionada con la aplicación, incluidas las reclamaciones por responsabilidad del
            producto, las reclamaciones de que no cumple los requisitos legales o reglamentarios, las reclamaciones en materia de protección al consumidor o de
            privacidad, y las reclamaciones de que infringe la propiedad intelectual de terceros.
          </li>
          <li>
            Usted confirma que no se encuentra en un país sujeto a un embargo de los EE. UU. y que no figura en ninguna lista del gobierno de los EE. UU. de partes
            prohibidas o restringidas.
          </li>
          <li>
            Apple y sus subsidiarias son terceros beneficiarios de estos Términos y pueden exigir su cumplimiento frente a usted en lo que respecta a la aplicación
            para iOS.
          </li>
        </ul>
      </Section>

      <Section item={S.changes} n={n(S.changes)}>
        <p>
          Podemos actualizar estos Términos a medida que el Servicio evolucione. Si un cambio es sustancial, se lo informaremos por correo electrónico o en la
          aplicación al menos 30 días antes de que entre en vigor. Si no está de acuerdo con el cambio, puede cancelar antes de que entre en vigor; si sigue usando
          el Servicio después de esa fecha, significa que lo acepta.
        </p>
      </Section>

      <Section item={S.general} n={n(S.general)}>
        <ul>
          <li>
            Usted no puede ceder estos Términos sin nuestro consentimiento, salvo a un sucesor de su negocio. Nosotros podemos cederlos en caso de fusión,
            adquisición o venta de activos.
          </li>
          <li>Ninguna de las partes es responsable de los retrasos causados por hechos que escapen a su control razonable.</li>
          <li>
            Si alguna parte de estos Términos no puede hacerse cumplir, el resto sigue vigente. No ejercer un derecho no constituye una renuncia a él.
          </li>
          <li>
            Podemos enviarle avisos a la dirección de correo electrónico de su cuenta. Usted puede enviarnos avisos a la dirección que figura a continuación.
          </li>
          <li>
            Somos contratistas independientes. Estos Términos constituyen el acuerdo completo sobre el Servicio y sustituyen cualquier acuerdo anterior sobre esa
            materia.
          </li>
          <li>Al usar el Servicio, usted cumplirá las leyes de control de exportaciones y de sanciones de los EE. UU.</li>
        </ul>
      </Section>

      <Section item={S.contact} n={n(S.contact)}>
        <p>
          <Ph>{COMPANY.legalName}</Ph>
          <br />
          <Ph>{COMPANY.address}</Ph>
          <br />
          <Ph>{COMPANY.contactEmail}</Ph>
        </p>
      </Section>
    </>
  ),
};
