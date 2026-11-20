// Spanish translation of /legal/subprocessors, for convenience only: the English page governs.
import Link from "next/link";
import { Ph, type LegalTranslation } from "@/components/legal/LegalDoc";
import { COMPANY } from "@/lib/legal";
import SubprocessorTableEs from "./SubprocessorTableEs";

export const subprocessorsEs: LegalTranslation = {
  title: "Subencargados del tratamiento",
  intro: (
    <p>
      Estas empresas alojan y operan partes de Northpin para nosotros y pueden tratar Datos del Cliente en nuestro nombre. Cada una está obligada por un contrato
      que limita el uso de los datos a la prestación de su servicio a nosotros. Consulte nuestra <Link href="/privacy">Política de privacidad</Link> y nuestro{" "}
      <Link href="/legal/dpa">Anexo de tratamiento de datos</Link> para saber cómo tratamos los datos.
    </p>
  ),
  children: (
    <>
      <h2 id="list">Subencargados actuales</h2>
      <SubprocessorTableEs />

      <h2 id="not-subprocessors">Servicios que usted elige usar</h2>
      <p>
        Si conecta una integración como Billdu, los datos de obras y clientes que decida enviar van a ese servicio conforme a su propio acuerdo con el proveedor
        correspondiente; ese proveedor no es nuestro subencargado. El mapa de obras carga los mosaicos del mapa de OpenStreetMap directamente en su navegador;
        OpenStreetMap recibe su dirección IP y el área del mapa que se muestra, pero ningún Dato del Cliente.
      </p>

      <h2 id="changes">Cambios en esta lista</h2>
      <p>
        Actualizamos esta página antes de que un nuevo subencargado comience a tratar Datos del Cliente. Para recibir un correo electrónico cuando cambie, escriba a{" "}
        <Ph>{COMPANY.privacyEmail}</Ph> desde el correo electrónico de su cuenta. Los Clientes amparados por nuestro Anexo de tratamiento de datos pueden oponerse a
        un nuevo subencargado en la forma descrita en dicho anexo.
      </p>
    </>
  ),
};
