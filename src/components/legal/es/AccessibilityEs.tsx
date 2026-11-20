// Spanish translation of /accessibility, for convenience only: the English page governs. Keep it in step.
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { COMPANY } from "@/lib/legal";

const S = {
  goal: { id: "goal", title: "Nuestro objetivo" },
  done: { id: "done", title: "Lo que hacemos" },
  limits: { id: "limitations", title: "Limitaciones conocidas" },
  feedback: { id: "feedback", title: "Infórmenos sobre una barrera" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);

export const accessibilityEs: LegalTranslation = {
  title: "Accesibilidad",
  toc,
  intro: (
    <p>
      Queremos que todas las personas de una cuadrilla, de la oficina y del lado del cliente puedan usar Northpin, sin importar el dispositivo o la tecnología
      de apoyo que utilicen.
    </p>
  ),
  children: (
    <>
      <Section item={S.goal}>
        <p>
          Nuestro objetivo es cumplir las{" "}
          <a href="https://www.w3.org/TR/WCAG22/" rel="noopener noreferrer">
            Pautas de Accesibilidad para el Contenido Web (WCAG) 2.2
          </a>{" "}
          en el nivel AA en nuestro sitio web, en la aplicación web y en las páginas que abren sus clientes (cotizaciones, facturas, órdenes de cambio, RFI y
          reportes de fotos). Es un objetivo hacia el que trabajamos, no una afirmación de que todas las páginas ya lo cumplen hoy.
        </p>
      </Section>

      <Section item={S.done}>
        <ul>
          <li>
            El texto y los controles están diseñados con un contraste alto, y el sitio público se puede usar con el teclado, con un foco visible y un enlace para
            saltar al contenido.
          </li>
          <li>Las páginas usan encabezados, etiquetas y puntos de referencia reales para que los lectores de pantalla puedan recorrerlas.</li>
          <li>
            Las páginas se adaptan a teléfonos, tabletas y computadoras, y el sitio público respeta la configuración de movimiento reducido de su dispositivo.
          </li>
          <li>
            Los dispositivos en los planos se muestran con letras y nombres, no solo con colores, y los conteos siempre están disponibles en forma de tablas.
          </li>
        </ul>
      </Section>

      <Section item={S.limits}>
        <ul>
          <li>
            <strong>Colocar dispositivos en un plano</strong> se hace con el dedo, un lápiz óptico o un mouse sobre el dibujo. Los conteos, cotizaciones y listas que
            genera el plano se pueden leer y editar con el teclado y con un lector de pantalla, pero todavía no es posible fijar un dispositivo en un punto del
            dibujo de esa manera.
          </li>
          <li>
            <strong>El zoom con los dedos</strong> está desactivado en el navegador para que al pellizcar se amplíe el plano y no la página. Use la configuración de
            tamaño de texto o de zoom de su navegador para agrandar el texto.
          </li>
          <li>
            <strong>Las hojas del plano</strong> son imágenes de los dibujos que usted sube, por lo que su texto solo es tan legible como el del archivo original.
          </li>
          <li>
            <strong>Las exportaciones en PDF</strong> (conteos, cotizaciones, facturas, reportes) todavía no están etiquetadas para lectores de pantalla. La misma
            información está disponible en pantalla y en CSV.
          </li>
          <li>
            <strong>Los documentos que redacta su empresa</strong> (condiciones, notas, fotos y leyendas en cotizaciones y reportes) solo son tan accesibles como su
            contenido.
          </li>
        </ul>
      </Section>

      <Section item={S.feedback}>
        <p>
          Si algo en Northpin le resulta difícil o imposible de usar, escriba a <Ph>{COMPANY.supportEmail}</Ph> indicando la página o pantalla, lo que intentaba
          hacer y el dispositivo y la tecnología de apoyo que utiliza. Procuramos responder en un plazo de dos días hábiles y trabajaremos con usted en una solución
          o en otra forma de hacer el trabajo. Los clientes de un cliente de Northpin también pueden pedir a la empresa que les envió el enlace el documento en otro
          formato.
        </p>
      </Section>
    </>
  ),
};
