// Spanish translation of /legal/dpa, for convenience only: the English text in src/app/legal/dpa/page.tsx governs.
// Keep the sections and ids in step with the English page.
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  scope: { id: "scope", title: "Alcance y funciones" },
  instructions: { id: "instructions", title: "Tratamiento conforme a sus instrucciones" },
  people: { id: "people", title: "Nuestro personal" },
  security: { id: "security", title: "Seguridad" },
  subprocessors: { id: "subprocessors", title: "Subencargados del tratamiento" },
  requests: { id: "requests", title: "Ayuda con solicitudes" },
  incidents: { id: "incidents", title: "Incidentes de seguridad" },
  deletion: { id: "deletion", title: "Devolución y eliminación" },
  audits: { id: "audits", title: "Información y auditorías" },
  transfers: { id: "transfers", title: "Transferencias internacionales" },
  ccpa: { id: "ccpa", title: "Leyes estatales de privacidad de EE. UU." },
  general: { id: "general", title: "Disposiciones generales" },
  details: { id: "details", title: "Anexo: detalles del tratamiento" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export const dpaEs: LegalTranslation = {
  title: "Anexo de tratamiento de datos",
  toc,
  intro: (
    <p>
      Este anexo forma parte de nuestros <Link href="/terms">Términos del servicio</Link> y se aplica siempre que tratemos información personal contenida en sus
      Datos del Cliente. No necesita firmar nada para que se aplique; si necesita una copia firmada por nosotros, escriba a <Ph>{COMPANY.privacyEmail}</Ph>.
    </p>
  ),
  children: (
    <>
      <Section item={S.scope} n={n(S.scope)}>
        <p>
          En este anexo, “nosotros” significa <Ph>{COMPANY.legalName}</Ph> y “usted” significa el cliente que aceptó los Términos. Las palabras definidas en los
          Términos (como Datos del Cliente y Servicio) tienen aquí el mismo significado. Respecto de la información personal contenida en los Datos del Cliente,
          usted es el responsable del tratamiento (o “empresa”, en inglés “business”) y nosotros somos su encargado del tratamiento (o proveedor de servicios).
          Cuando usted actúa por cuenta de otra persona, como un contratista general o el propietario de un edificio, nosotros somos su subencargado del
          tratamiento.
        </p>
      </Section>

      <Section item={S.instructions} n={n(S.instructions)}>
        <p>
          Tratamos los Datos del Cliente únicamente para prestar, proteger y dar soporte al Servicio, conforme a sus instrucciones documentadas. Los Términos, su
          configuración y la forma en que usted y sus Usuarios utilizan el Servicio constituyen sus instrucciones. Si consideramos que una instrucción infringe la
          legislación de protección de datos, se lo informaremos. Fuera de ello, solo tratamos los Datos del Cliente cuando la ley lo exige, y se lo informaremos
          previamente, salvo que la ley nos lo impida.
        </p>
      </Section>

      <Section item={S.people} n={n(S.people)}>
        <p>
          Las personas que pueden acceder a los Datos del Cliente están sujetas a obligaciones de confidencialidad y solo obtienen acceso cuando lo necesitan para
          operar el Servicio o darle soporte.
        </p>
      </Section>

      <Section item={S.security} n={n(S.security)}>
        <p>
          Mantenemos medidas técnicas y organizativas adecuadas para proteger los Datos del Cliente, incluidas las descritas en la{" "}
          <Link href="/privacy#security">sección de Seguridad de nuestra Política de privacidad</Link>: cifrado en tránsito y en reposo, seguridad a nivel de fila
          en la base de datos que separa los datos de cada empresa, acceso basado en funciones dentro de un equipo, acceso restringido al entorno de producción y
          copias de seguridad periódicas. Podemos actualizar estas medidas siempre que el nivel general de protección no disminuya.
        </p>
      </Section>

      <Section item={S.subprocessors} n={n(S.subprocessors)}>
        <p>
          Usted autoriza a los subencargados que figuran en nuestra <Link href="/legal/subprocessors">lista de subencargados del tratamiento</Link>. Obligamos a
          cada uno de ellos mediante condiciones de protección de datos al menos tan protectoras como las de este anexo y seguimos siendo responsables de su
          trabajo. Actualizaremos la lista antes de que un nuevo subencargado comience a tratar Datos del Cliente y le enviaremos un correo electrónico si usted
          solicitó recibir avisos en <Ph>{COMPANY.privacyEmail}</Ph>. Usted puede oponerse por motivos razonables de protección de datos dentro de un plazo de 30
          días; si no podemos resolver la objeción, usted podrá dar por terminada la parte afectada del Servicio y obtener el reembolso de las tarifas pagadas por
          adelantado correspondientes a ella.
        </p>
      </Section>

      <Section item={S.requests} n={n(S.requests)}>
        <p>
          El Servicio le permite acceder, corregir, exportar y eliminar los Datos del Cliente por su cuenta. Si recibimos una solicitud de alguno de sus Usuarios o
          Clientes Finales relativa a los Datos del Cliente, se la remitiremos a usted y no la responderemos nosotros mismos, salvo que usted nos lo pida. Le
          prestaremos una ayuda razonable con las solicitudes que no pueda atender desde el Servicio, así como con las evaluaciones de impacto relativas a la
          protección de datos y las consultas con las autoridades, en la medida en que se refieran al Servicio.
        </p>
      </Section>

      <Section item={S.incidents} n={n(S.incidents)}>
        <p>
          Si tenemos conocimiento de una violación de la seguridad que provoque el acceso no autorizado a los Datos del Cliente, o su pérdida, alteración o
          divulgación, se lo informaremos sin demora indebida, le describiremos lo ocurrido y lo que estamos haciendo al respecto a medida que tengamos más
          información, y le ayudaremos a cumplir sus propias obligaciones de notificación.
        </p>
      </Section>

      <Section item={S.deletion} n={n(S.deletion)}>
        <p>
          Usted puede exportar los Datos del Cliente en cualquier momento mientras exista su cuenta, incluso después de que termine su suscripción. Eliminamos los
          Datos del Cliente cuando usted elimina su cuenta en el Servicio, o dentro de los {RETENTION.deletionRequestDays} días siguientes a su solicitud por
          escrito a <Ph>{COMPANY.privacyEmail}</Ph>. Los datos eliminados permanecen en copias de seguridad cifradas hasta que estas vencen, en un plazo de{" "}
          <Ph>{RETENTION.backupDays}</Ph> días, salvo que la ley nos exija conservarlos por más tiempo.
        </p>
      </Section>

      <Section item={S.audits} n={n(S.audits)}>
        <p>
          Previa solicitud por escrito, no más de una vez al año (o después de un incidente de seguridad), responderemos preguntas razonables sobre cómo protegemos
          los Datos del Cliente y compartiremos resúmenes pertinentes de las certificaciones e informes de seguridad de nuestros subencargados. Cualquier auditoría
          que vaya más allá de lo anterior se realizará de mutuo acuerdo, a costa de usted, con un aviso previo razonable y bajo confidencialidad.
        </p>
      </Section>

      <Section item={S.transfers} n={n(S.transfers)}>
        <p>
          Almacenamos los Datos del Cliente en <Ph>{COMPANY.dataRegion}</Ph> y los tratamos en los Estados Unidos. Cuando la legislación de protección de datos
          exija un mecanismo de transferencia para la información personal que se nos envíe desde fuera de los EE. UU., nos basamos en{" "}
          <Ph>{COMPANY.transferMechanism}</Ph>.
        </p>
      </Section>

      <Section item={S.ccpa} n={n(S.ccpa)}>
        <p>
          Cuando se aplique la Ley de Privacidad del Consumidor de California (CCPA) o una ley estatal similar de los EE. UU., actuamos como su proveedor de
          servicios (o encargado del tratamiento). No venderemos ni compartiremos información personal procedente de los Datos del Cliente; no la conservaremos,
          usaremos ni divulgaremos fuera de nuestra relación comercial directa con usted ni para ningún fin distinto de la prestación del Servicio; ni la
          combinaremos con información personal que obtengamos de terceros, salvo en la medida en que dichas leyes lo permitan. Le informaremos si dejamos de
          poder cumplir estas obligaciones.
        </p>
      </Section>

      <Section item={S.general} n={n(S.general)}>
        <p>
          Este anexo estará vigente mientras tratemos Datos del Cliente por cuenta de usted. Le son aplicables las limitaciones de responsabilidad de los Términos.
          Si contradice los Términos en lo relativo al tratamiento de información personal, prevalece este anexo.
        </p>
      </Section>

      <Section item={S.details} n={n(S.details)}>
        <table>
          <tbody>
            <tr>
              <th>Objeto y finalidad</th>
              <td>
                Prestar el Servicio: almacenar, sincronizar y mostrar los Datos del Cliente, generar documentos y enlaces, y brindar soporte.
              </td>
            </tr>
            <tr>
              <th>Duración</th>
              <td>Mientras exista su cuenta y, después, hasta su eliminación según lo descrito anteriormente.</td>
            </tr>
            <tr>
              <th>Naturaleza del tratamiento</th>
              <td>
                Alojamiento, almacenamiento, transmisión, visualización, copia de seguridad, eliminación y las demás operaciones necesarias para prestar el
                Servicio.
              </td>
            </tr>
            <tr>
              <th>Personas afectadas</th>
              <td>
                Sus Usuarios; sus Clientes Finales y sus contactos; las personas mencionadas en planos, fotos, documentos y registros de obra; los destinatarios
                de los enlaces que usted envía.
              </td>
            </tr>
            <tr>
              <th>Información personal</th>
              <td>
                Nombres, direcciones de correo electrónico, números de teléfono y direcciones postales; direcciones de las obras; firmas; fotos y sus metadatos
                de hora y ubicación; notas, respuestas y otro contenido que usted o sus Clientes Finales agreguen.
              </td>
            </tr>
            <tr>
              <th>Información sensible</th>
              <td>
                No está prevista. Los Términos le piden no almacenar información sensible, como números de identificación oficial, información de salud o
                códigos de acceso.
              </td>
            </tr>
          </tbody>
        </table>
      </Section>
    </>
  ),
};
