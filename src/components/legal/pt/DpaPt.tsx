// Brazilian Portuguese translation of /legal/dpa, for convenience only: the English text in src/app/legal/dpa/page.tsx
// governs. Keep the sections and ids in step with the English page.
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  scope: { id: "scope", title: "Escopo e papéis" },
  instructions: { id: "instructions", title: "Tratamento conforme as suas instruções" },
  people: { id: "people", title: "Nossa equipe" },
  security: { id: "security", title: "Segurança" },
  subprocessors: { id: "subprocessors", title: "Suboperadores" },
  requests: { id: "requests", title: "Apoio com solicitações" },
  incidents: { id: "incidents", title: "Incidentes de segurança" },
  deletion: { id: "deletion", title: "Devolução e exclusão" },
  audits: { id: "audits", title: "Informações e auditorias" },
  transfers: { id: "transfers", title: "Transferências internacionais" },
  ccpa: { id: "ccpa", title: "Leis estaduais de privacidade dos EUA" },
  general: { id: "general", title: "Disposições gerais" },
  details: { id: "details", title: "Anexo: detalhes do tratamento" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export const dpaPt: LegalTranslation = {
  title: "Adendo de Tratamento de Dados",
  toc,
  intro: (
    <p>
      Este adendo faz parte dos nossos <Link href="/terms">Termos de Serviço</Link> e se aplica sempre que tratamos informações pessoais contidas nos seus Dados
      do Contratante. Você não precisa assinar nada para que ele se aplique; se precisar de uma via assinada por nós, escreva para <Ph>{COMPANY.privacyEmail}</Ph>.
    </p>
  ),
  children: (
    <>
      <Section item={S.scope} n={n(S.scope)}>
        <p>
          Neste adendo, “nós” significa <Ph>{COMPANY.legalName}</Ph> e “você” significa o contratante que aceitou os Termos. As expressões definidas nos Termos
          (como Dados do Contratante e Serviço) têm aqui o mesmo significado. Em relação às informações pessoais contidas nos Dados do Contratante, você é o
          controlador (ou “business”) e nós somos o seu operador (ou prestador de serviços). Quando você atua em nome de outra pessoa, como uma construtora
          responsável pela obra ou o proprietário de um edifício, nós somos o seu suboperador.
        </p>
      </Section>

      <Section item={S.instructions} n={n(S.instructions)}>
        <p>
          Tratamos os Dados do Contratante somente para prestar, proteger e dar suporte ao Serviço, conforme as suas instruções documentadas. Os Termos, as suas
          configurações e a forma como você e os seus Usuários usam o Serviço constituem as suas instruções. Se acreditarmos que uma instrução viola a legislação
          de proteção de dados, informaremos você. Fora isso, só tratamos os Dados do Contratante quando a lei exigir e, nesse caso, avisaremos você antes, salvo
          se a lei nos impedir.
        </p>
      </Section>

      <Section item={S.people} n={n(S.people)}>
        <p>
          As pessoas que podem acessar os Dados do Contratante estão sujeitas a obrigações de confidencialidade e só recebem acesso quando precisam dele para operar
          ou dar suporte ao Serviço.
        </p>
      </Section>

      <Section item={S.security} n={n(S.security)}>
        <p>
          Mantemos medidas técnicas e organizacionais adequadas para proteger os Dados do Contratante, incluindo as descritas na{" "}
          <Link href="/privacy#security">seção Segurança da nossa Política de Privacidade</Link>: criptografia em trânsito e em repouso, segurança em nível de
          linha no banco de dados separando os dados de cada empresa, acesso baseado em funções dentro de uma equipe, acesso restrito ao ambiente de produção e
          backups regulares. Podemos atualizar essas medidas, desde que o nível geral de proteção não diminua.
        </p>
      </Section>

      <Section item={S.subprocessors} n={n(S.subprocessors)}>
        <p>
          Você autoriza os suboperadores da nossa <Link href="/legal/subprocessors">lista de suboperadores</Link>. Vinculamos cada um deles a condições de
          proteção de dados pelo menos tão protetivas quanto as deste adendo e continuamos responsáveis pelo trabalho deles. Atualizaremos a lista antes que um
          novo suboperador comece a tratar Dados do Contratante e enviaremos um e-mail a você se tiver pedido para ser avisado em <Ph>{COMPANY.privacyEmail}</Ph>.
          Você pode se opor, por motivos razoáveis de proteção de dados, em até 30 dias; se não conseguirmos resolver a objeção, você poderá encerrar a parte
          afetada do Serviço e receber o reembolso das taxas pagas antecipadamente referentes a ela.
        </p>
      </Section>

      <Section item={S.requests} n={n(S.requests)}>
        <p>
          O Serviço permite que você mesmo acesse, corrija, exporte e exclua os Dados do Contratante. Se recebermos uma solicitação de um dos seus Usuários ou dos
          Seus Clientes sobre os Dados do Contratante, nós a encaminharemos a você e não a responderemos diretamente, a menos que você nos peça. Daremos a você
          apoio razoável com as solicitações que você não conseguir atender pelo Serviço, bem como com relatórios de impacto à proteção de dados e consultas às
          autoridades, na medida em que digam respeito ao Serviço.
        </p>
      </Section>

      <Section item={S.incidents} n={n(S.incidents)}>
        <p>
          Se tomarmos conhecimento de uma violação de segurança que resulte em acesso não autorizado aos Dados do Contratante, ou em sua perda, alteração ou
          divulgação, informaremos você sem demora injustificada, descreveremos o que aconteceu e o que estamos fazendo a respeito à medida que soubermos mais, e
          ajudaremos você a cumprir as suas próprias obrigações de notificação.
        </p>
      </Section>

      <Section item={S.deletion} n={n(S.deletion)}>
        <p>
          Você pode exportar os Dados do Contratante a qualquer momento enquanto a sua conta existir, inclusive depois que a sua assinatura terminar. Excluímos os
          Dados do Contratante quando você exclui a sua conta no Serviço, ou em até {RETENTION.deletionRequestDays} dias após a sua solicitação por escrito
          enviada para <Ph>{COMPANY.privacyEmail}</Ph>. Os dados excluídos permanecem em backups criptografados até que estes expirem, em até{" "}
          <Ph>{RETENTION.backupDays}</Ph> dias, salvo se a lei exigir que os mantenhamos por mais tempo.
        </p>
      </Section>

      <Section item={S.audits} n={n(S.audits)}>
        <p>
          Mediante solicitação por escrito, no máximo uma vez por ano (ou após um incidente de segurança), responderemos a perguntas razoáveis sobre como
          protegemos os Dados do Contratante e compartilharemos resumos relevantes das certificações e dos relatórios de segurança dos nossos suboperadores.
          Qualquer auditoria além disso dependerá de acordo, correrá por sua conta e exigirá aviso prévio razoável e confidencialidade.
        </p>
      </Section>

      <Section item={S.transfers} n={n(S.transfers)}>
        <p>
          Armazenamos os Dados do Contratante em <Ph>{COMPANY.dataRegion}</Ph> e os tratamos nos Estados Unidos. Quando a legislação de proteção de dados exigir um
          mecanismo de transferência para informações pessoais enviadas a nós de fora dos EUA, nos baseamos em <Ph>{COMPANY.transferMechanism}</Ph>.
        </p>
      </Section>

      <Section item={S.ccpa} n={n(S.ccpa)}>
        <p>
          Quando se aplicar a Lei de Privacidade do Consumidor da Califórnia (CCPA) ou uma lei estadual semelhante dos EUA, atuamos como seu prestador de serviços
          (ou operador). Não venderemos nem compartilharemos informações pessoais contidas nos Dados do Contratante, não as manteremos, usaremos ou divulgaremos
          fora da nossa relação comercial direta com você nem para qualquer finalidade que não seja a prestação do Serviço, e não as combinaremos com informações
          pessoais que obtemos de terceiros, exceto quando essas leis permitirem. Informaremos você se não pudermos mais cumprir essas obrigações.
        </p>
      </Section>

      <Section item={S.general} n={n(S.general)}>
        <p>
          Este adendo vigora enquanto tratarmos Dados do Contratante para você. Aplicam-se a ele as limitações de responsabilidade previstas nos Termos. Se ele
          conflitar com os Termos quanto ao tratamento de informações pessoais, prevalece este adendo.
        </p>
      </Section>

      <Section item={S.details} n={n(S.details)}>
        <table>
          <tbody>
            <tr>
              <th>Objeto e finalidade</th>
              <td>Prestação do Serviço: armazenamento, sincronização e exibição dos Dados do Contratante, geração de documentos e links, e suporte.</td>
            </tr>
            <tr>
              <th>Duração</th>
              <td>Enquanto a sua conta existir e, depois, até a exclusão, conforme descrito acima.</td>
            </tr>
            <tr>
              <th>Natureza do tratamento</th>
              <td>Hospedagem, armazenamento, transmissão, exibição, backup, exclusão e as demais operações necessárias para prestar o Serviço.</td>
            </tr>
            <tr>
              <th>Titulares envolvidos</th>
              <td>
                Os seus Usuários; os Seus Clientes e os contatos deles; as pessoas mencionadas em plantas, fotos, documentos e registros de obras; os
                destinatários dos links que você envia.
              </td>
            </tr>
            <tr>
              <th>Informações pessoais</th>
              <td>
                Nomes, endereços de e-mail, telefones e endereços postais; endereços das obras; assinaturas; fotos e os seus metadados de horário e localização;
                observações, respostas e outros conteúdos que você ou os Seus Clientes adicionam.
              </td>
            </tr>
            <tr>
              <th>Informações sensíveis</th>
              <td>
                Não previstas. Os Termos pedem que você não armazene informações sensíveis, como números de documentos de identidade emitidos pelo governo,
                informações de saúde ou códigos de acesso.
              </td>
            </tr>
          </tbody>
        </table>
      </Section>
    </>
  ),
};
