// Brazilian Portuguese translation of /legal/subprocessors, for convenience only: the English page governs.
import Link from "next/link";
import { Ph, type LegalTranslation } from "@/components/legal/LegalDoc";
import { COMPANY } from "@/lib/legal";
import SubprocessorTablePt from "./SubprocessorTablePt";

export const subprocessorsPt: LegalTranslation = {
  title: "Suboperadores",
  intro: (
    <p>
      Estas empresas hospedam e operam partes do Northpin para nós e podem tratar Dados do Contratante em nosso nome. Cada uma está vinculada a um contrato que
      limita o uso dos dados à prestação do seu serviço para nós. Consulte a nossa <Link href="/privacy">Política de Privacidade</Link> e o nosso{" "}
      <Link href="/legal/dpa">Adendo de Tratamento de Dados</Link> para saber como tratamos os dados.
    </p>
  ),
  children: (
    <>
      <h2 id="list">Suboperadores atuais</h2>
      <SubprocessorTablePt />

      <h2 id="not-subprocessors">Serviços que você escolhe usar</h2>
      <p>
        Se você conectar uma integração como a Billdu, os dados de obras e clientes que você decidir enviar vão para esse serviço nos termos do seu próprio
        contrato com o respectivo fornecedor; ele não é nosso suboperador. O mapa de obras carrega os blocos de mapa do OpenStreetMap diretamente no seu
        navegador, e o OpenStreetMap recebe o seu endereço IP e a área do mapa exibida, mas nenhum Dado do Contratante.
      </p>

      <h2 id="changes">Alterações desta lista</h2>
      <p>
        Atualizamos esta página antes que um novo suboperador comece a tratar Dados do Contratante. Para receber um e-mail quando ela mudar, escreva para{" "}
        <Ph>{COMPANY.privacyEmail}</Ph> a partir do e-mail da sua conta. Os contratantes abrangidos pelo nosso Adendo de Tratamento de Dados podem se opor a um
        novo suboperador, conforme descrito nele.
      </p>
    </>
  ),
};
