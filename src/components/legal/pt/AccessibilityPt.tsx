// Brazilian Portuguese translation of /accessibility, for convenience only: the English page governs. Keep it in step.
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { COMPANY } from "@/lib/legal";

const S = {
  goal: { id: "goal", title: "Nosso objetivo" },
  done: { id: "done", title: "O que fazemos" },
  limits: { id: "limitations", title: "Limitações conhecidas" },
  feedback: { id: "feedback", title: "Conte-nos sobre uma barreira" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);

export const accessibilityPt: LegalTranslation = {
  title: "Acessibilidade",
  toc,
  intro: (
    <p>
      Queremos que todos — na equipe de campo, no escritório e do lado do cliente — possam usar o Northpin, seja qual for o dispositivo ou a tecnologia assistiva
      que utilizem.
    </p>
  ),
  children: (
    <>
      <Section item={S.goal}>
        <p>
          Nosso objetivo é atender às{" "}
          <a href="https://www.w3.org/TR/WCAG22/" rel="noopener noreferrer">
            Diretrizes de Acessibilidade para Conteúdo Web (WCAG) 2.2
          </a>{" "}
          no nível AA no nosso site, no app web e nas páginas que os seus clientes abrem (orçamentos, faturas, aditivos, RFIs e relatórios fotográficos). Esse é um
          objetivo pelo qual trabalhamos, e não uma afirmação de que todas as páginas já o atendem hoje.
        </p>
      </Section>

      <Section item={S.done}>
        <ul>
          <li>
            Textos e controles são projetados para ter alto contraste, e o site público pode ser usado pelo teclado, com foco visível e um link para pular para o
            conteúdo.
          </li>
          <li>As páginas usam títulos, rótulos e marcos (landmarks) reais, para que leitores de tela possam navegar por elas.</li>
          <li>
            As páginas se reorganizam em celulares, tablets e computadores, e o site público respeita a configuração de redução de movimento do seu dispositivo.
          </li>
          <li>Os dispositivos nas plantas são mostrados com letras e nomes, não apenas por cor, e as contagens estão sempre disponíveis em tabelas.</li>
        </ul>
      </Section>

      <Section item={S.limits}>
        <ul>
          <li>
            <strong>Posicionar dispositivos em uma planta</strong> é feito por toque, caneta ou mouse sobre o desenho. As contagens, orçamentos e listas que a
            planta gera podem ser lidos e editados com teclado e leitor de tela, mas ainda não é possível posicionar um dispositivo em um ponto do desenho dessa
            forma.
          </li>
          <li>
            <strong>O zoom com pinça</strong> fica desativado no navegador para que o gesto de pinça amplie a planta, e não a página. Use a configuração de tamanho
            do texto ou de zoom do seu navegador para ampliar o texto.
          </li>
          <li>
            <strong>As folhas das plantas</strong> são imagens dos desenhos que você envia, então o texto delas é tão legível quanto o do arquivo original.
          </li>
          <li>
            <strong>As exportações em PDF</strong> (contagens, orçamentos, faturas, relatórios) ainda não têm marcação para leitores de tela. As mesmas informações
            estão disponíveis na tela e em CSV.
          </li>
          <li>
            <strong>Os documentos que a sua empresa escreve</strong> (condições, observações, fotos e legendas em orçamentos e relatórios) são tão acessíveis
            quanto o conteúdo deles.
          </li>
        </ul>
      </Section>

      <Section item={S.feedback}>
        <p>
          Se algo no Northpin for difícil ou impossível de usar, escreva para <Ph>{COMPANY.supportEmail}</Ph> informando a página ou tela, o que você estava
          tentando fazer e o dispositivo e a tecnologia assistiva que você usa. Procuramos responder em até dois dias úteis e vamos trabalhar com você em uma
          correção ou em outra forma de concluir o trabalho. Os clientes de um contratante do Northpin também podem pedir à empresa que lhes enviou o link o documento
          em outro formato.
        </p>
      </Section>
    </>
  ),
};
