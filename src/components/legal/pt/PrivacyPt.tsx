// Brazilian Portuguese translation of /privacy, for convenience only: the English text in src/app/privacy/page.tsx
// governs. Keep the sections, ids and conditions (AI_ENABLED) in step with the English page.
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";
import SubprocessorTablePt from "./SubprocessorTablePt";

const S = {
  scope: { id: "scope", title: "Quem somos e o que esta política abrange" },
  collect: { id: "collect", title: "Informações que coletamos" },
  use: { id: "use", title: "Como usamos as informações" },
  ai: { id: "ai", title: "Processamento por IA" },
  sharing: { id: "sharing", title: "Como compartilhamos as informações" },
  subprocessors: { id: "subprocessors", title: "Suboperadores" },
  retention: { id: "retention", title: "Retenção e exclusão" },
  security: { id: "security", title: "Segurança" },
  rights: { id: "rights", title: "Seus direitos e escolhas" },
  clients: { id: "your-clients", title: "Informações sobre os clientes dos nossos contratantes" },
  transfers: { id: "transfers", title: "Transferências internacionais" },
  children: { id: "children", title: "Crianças e adolescentes" },
  changes: { id: "changes", title: "Alterações desta política" },
  contact: { id: "contact", title: "Contato" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S).filter((t) => AI_ENABLED || t !== S.ai);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export const privacyPt: LegalTranslation = {
  title: "Política de Privacidade",
  toc,
  intro: (
    <p>
      Empresas de instalações elétricas, de baixa tensão e de outras especialidades confiam ao Northpin as suas plantas, orçamentos, faturas, obras e os dados dos
      seus clientes. Esta política explica, em linguagem simples, o que coletamos, por quê, quem nos ajuda a tratar esses dados, por quanto tempo os guardamos e
      como você pode controlá-los. Em resumo: usamos os seus dados para operar o Northpin para você, não os vendemos e não os usamos para treinar modelos de IA.
    </p>
  ),
  children: (
    <>
      <Section item={S.scope} n={n(S.scope)}>
        <p>
          O Northpin é operado por <Ph>{COMPANY.legalName}</Ph> (“Northpin”, “nós”), com sede nos Estados Unidos. Esta política abrange o nosso site, o
          aplicativo web e o app para iOS (em conjunto, o “Serviço”).
        </p>
        <p>O Northpin é uma ferramenta empresarial, por isso tratamos informações pessoais em dois papéis:</p>
        <ul>
          <li>
            <strong>Como empresa (controlador)</strong>, para as informações sobre as empresas e as pessoas que se cadastram e usam o Northpin: informações de
            conta, de cobrança, de suporte e de uso.
          </li>
          <li>
            <strong>Como prestador de serviços (operador)</strong>, para os dados de obras que os nossos contratantes inserem no Northpin, incluindo informações
            sobre os clientes deles. Os nossos contratantes decidem o que é inserido e para quê; nós tratamos esses dados em nome deles, de acordo com os nossos{" "}
            <Link href="/terms">Termos de Serviço</Link> e o nosso <Link href="/legal/dpa">Adendo de Tratamento de Dados</Link>. Veja a{" "}
            <a href="#your-clients">seção {n(S.clients)}</a>.
          </li>
        </ul>
      </Section>

      <Section item={S.collect} n={n(S.collect)}>
        <h3>Informações que você nos fornece</h3>
        <ul>
          <li>
            <strong>Informações da conta e da equipe:</strong> nome, endereço de e-mail, senha (armazenada apenas como um hash seguro pelo nosso provedor de
            autenticação), nome da empresa, função na equipe e convites que você envia.
          </li>
          <li>
            <strong>Perfil da empresa:</strong> nome da empresa, logotipo, telefone, e-mail, endereço, dados fiscais e condições de pagamento que você inclui em
            orçamentos, faturas e outros documentos.
          </li>
          <li>
            <strong>Informações de cobrança:</strong> contato de cobrança, plano e faturas. Os dados do cartão são coletados e armazenados pela Stripe; nós vemos
            apenas detalhes limitados, como a bandeira do cartão, os quatro últimos dígitos e a validade.
          </li>
          <li>
            <strong>Dados de obras (“Dados do Contratante”):</strong> projetos, conjuntos de plantas e desenhos, posicionamento de dispositivos, lances de fiação e
            medições, levantamentos, catálogos e preços, orçamentos e estimativas, faturas, notas de crédito e registros de pagamento, RFIs, aditivos, formulários,
            checklists, tarefas, cronogramas, relatórios diários, observações, documentos e arquivos. Isso pode incluir nomes, endereços, telefones e endereços de
            e-mail dos seus clientes.
          </li>
          <li>
            <strong>Fotos e seus metadados:</strong> fotos que você tira ou envia, com legendas, etiquetas e anotações. As fotos podem conter metadados embutidos
            (EXIF), como a hora em que foram tiradas, o modelo da câmera e a <strong>localização por GPS</strong>; o Northpin lê a localização e a hora para
            posicionar as fotos nos mapas das obras e nos relatórios.
          </li>
          <li>
            <strong>Comunicações com o suporte:</strong> o que você nos envia quando entra em contato com o suporte.
          </li>
        </ul>
        <h3>Informações coletadas automaticamente</h3>
        <ul>
          <li>
            <strong>Localização do dispositivo</strong>, somente se você permitir no seu dispositivo, para georreferenciar fotos e mostrar obras próximas no mapa.
            Você pode desativar isso a qualquer momento nas configurações do navegador ou nos Ajustes do iOS.
          </li>
          <li>
            <strong>Acesso à câmera</strong>, somente quando você escolhe tirar uma foto no app.
          </li>
          <li>
            <strong>Diagnóstico:</strong> quando o app encontra um erro, ele nos envia um relatório de erro: a mensagem de erro e o rastreamento técnico da pilha
            (stack trace), o endereço da página (com parâmetros de consulta e tokens removidos), a versão do navegador ou do app, a plataforma e, se você estiver
            conectado, o seu ID de usuário. Removemos endereços de e-mail e tokens de acesso desses relatórios antes que sejam enviados.
          </li>
          <li>
            <strong>Logs do servidor e de segurança:</strong> o nosso provedor de hospedagem registra dados técnicos das requisições, como endereço IP, horário,
            endereço solicitado e tipo de navegador. Usamos os endereços IP para proteger o Serviço, inclusive para limitar a taxa de requisições.
          </li>
        </ul>
        <h3 id="cookies">Cookies e armazenamento local</h3>
        <p>
          O Northpin não usa cookies de publicidade, cookies de análise nem rastreadores de terceiros. Para funcionar offline e manter você conectado, ele armazena
          dados no seu dispositivo:
        </p>
        <ul>
          <li>
            <strong>Suas obras</strong>, no banco de dados do seu navegador (IndexedDB) ou no armazenamento do app para iOS, para que você possa continuar
            trabalhando sem conexão.
          </li>
          <li>
            <strong>Sua sessão de acesso</strong>, no armazenamento local do navegador (ou nas Chaves do iOS), para que você continue conectado.
          </li>
          <li>
            <strong>As páginas do app</strong>, no cache offline do navegador (um service worker), para que o app abra sem sinal.
          </li>
          <li>
            <strong>Pequenas preferências</strong>, como a sua equipe atual, as configurações de mapa e de fotos e o nome que você digitou ao responder a um link
            que alguém lhe enviou, para que você não precise informá-los de novo naquele dispositivo.
          </li>
        </ul>
        <p>
          Todos esses itens são necessários para o funcionamento do Serviço. Eles permanecem no seu dispositivo até que você saia da conta e apague os dados do
          site no navegador, ou desinstale o app. Quando você paga pela web, as páginas de checkout e de cobrança da Stripe (no próprio site da Stripe) podem
          definir os seus próprios cookies para pagamento e prevenção de fraudes, nos termos da política de privacidade da Stripe.
        </p>
        <h3>Informações sobre as pessoas que recebem links</h3>
        <p>
          Quando um dos nossos contratantes envia um link de orçamento, proposta, fatura, aditivo, RFI ou relatório fotográfico e o destinatário o abre, podemos
          registrar que ele foi aberto e quando. Se o destinatário responder (por exemplo, aceitar ou recusar um orçamento, assinar um aditivo ou responder a uma
          RFI), registramos o nome digitado, a assinatura, as opções escolhidas, a observação ou resposta e o horário, e compartilhamos essas informações com o
          contratante que enviou o link.
        </p>
      </Section>

      <Section item={S.use} n={n(S.use)}>
        <p>Usamos as informações para:</p>
        <ul>
          <li>
            prestar o Serviço: armazenar e sincronizar as suas obras entre os seus dispositivos e a sua equipe, e gerar levantamentos, orçamentos, faturas, PDFs,
            relatórios e links para clientes;
          </li>
          {AI_ENABLED && <li>executar os recursos de IA quando você os usa (veja abaixo);</li>}
          <li>processar pagamentos e gerenciar assinaturas;</li>
          <li>
            enviar e-mails do serviço, como links de acesso, convites para a equipe, documentos que você envia aos seus clientes, recibos e alterações importantes;
          </li>
          <li>prestar suporte e diagnosticar e corrigir problemas;</li>
          <li>manter o Serviço e os nossos contratantes seguros, prevenir abusos e fazer cumprir os nossos Termos;</li>
          <li>entender o uso geral, de forma agregada ou desidentificada, para melhorar o Northpin; e</li>
          <li>cumprir obrigações legais.</li>
        </ul>
        <p>
          Nós <strong>não</strong> vendemos informações pessoais, não as compartilhamos para publicidade comportamental entre contextos e não usamos os Dados do
          Contratante para treinar modelos de IA. Se algum dia enviarmos e-mails de marketing, você poderá cancelar a inscrição a qualquer momento.
        </p>
        <p>
          Onde se aplicam leis no estilo do GDPR, as nossas bases legais são: a execução do nosso contrato com você; os nossos legítimos interesses em operar,
          proteger e melhorar um serviço empresarial (ponderados em relação aos seus direitos); o seu consentimento, por exemplo para a localização do dispositivo
          (que você pode revogar); e o cumprimento de obrigações legais.
        </p>
      </Section>

      {AI_ENABLED && (
        <Section item={S.ai} n={n(S.ai)}>
          <p>
            Os recursos de IA — ler uma folha de planta, sugerir posições de dispositivos, explicar uma folha, criar a legenda de uma foto ou o rascunho de um
            diário de obra — só são executados quando alguém da sua equipe os utiliza. Nesse momento, a imagem ou as imagens envolvidas e o texto relacionado (como
            nomes de ambientes, legendas, observações ou o seu catálogo de dispositivos) são enviados à Anthropic, PBC para processamento nos termos comerciais
            dela. Segundo esses termos, a Anthropic não usa esses dados para treinar os seus modelos e pode retê-los por um período limitado para fins como
            confiança e segurança, conforme descrito nos termos comerciais e nas políticas dela. Os resultados da IA voltam ao Northpin como sugestões que uma
            pessoa precisa revisar.
          </p>
        </Section>
      )}

      <Section item={S.sharing} n={n(S.sharing)}>
        <p>Compartilhamos informações somente:</p>
        <ul>
          <li>
            <strong>Dentro da sua equipe:</strong> os membros da equipe veem as obras da equipe de acordo com a sua função.
          </li>
          <li>
            <strong>Com as pessoas que você escolher:</strong> quando você envia um link de orçamento, fatura, relatório ou outro, ou conecta uma integração como a
            Billdu, enviamos os dados relevantes para onde você indicar.
          </li>
          <li>
            <strong>Com suboperadores</strong> que hospedam e operam partes do Serviço para nós, nos termos de contratos que limitam o uso que fazem dos dados
            (listados abaixo).
          </li>
          <li>
            <strong>Por motivos legais:</strong> para cumprir a lei ou um processo judicial válido, ou para proteger os direitos, a segurança e a proteção dos
            nossos contratantes, do público ou da Northpin. Quando permitido, informaremos você sobre solicitações relativas aos seus dados.
          </li>
          <li>
            <strong>Em uma transferência de negócio:</strong> se a Northpin participar de uma fusão, aquisição ou venda de ativos, sujeito a esta política.
          </li>
        </ul>
        <p>
          O mapa de obras carrega os blocos de mapa diretamente dos servidores de blocos do OpenStreetMap no seu navegador, de modo que eles recebem o seu endereço
          IP e a área do mapa solicitada, como acontece com qualquer site. As fontes são servidas pelos nossos próprios servidores, de modo que as páginas que os
          seus clientes abrem não acessam serviços de fontes de terceiros.
        </p>
      </Section>

      <Section item={S.subprocessors} n={n(S.subprocessors)}>
        <SubprocessorTablePt />
        <p>
          Se você conectar a Billdu, os dados de obras e clientes que você decidir enviar vão para a Billdu nos termos do seu próprio contrato com ela. A lista
          atualizada está sempre na página <Link href="/legal/subprocessors">Suboperadores</Link>. Nós a atualizaremos antes de adicionar um novo suboperador que
          trate Dados do Contratante; os contratantes podem pedir para ser notificados em <Ph>{COMPANY.privacyEmail}</Ph>.
        </p>
      </Section>

      <Section item={S.retention} n={n(S.retention)}>
        <ul>
          <li>
            <strong>Os Dados do Contratante</strong> são mantidos enquanto a sua conta existir. Quando você exclui um item, ele é marcado como excluído para que os
            seus outros dispositivos e os dispositivos da sua equipe também o removam; o registro marcado permanece no nosso banco de dados, oculto no app, até que
            a conta seja excluída ou que você nos peça para removê-lo.
          </li>
          <li>
            <strong>Excluir a sua conta</strong> no app remove imediatamente o seu login e as suas obras, arquivos e documentos do nosso banco de dados ativo e do
            armazenamento de arquivos (as obras de um membro da equipe permanecem com a equipe; consulte <Link href="/support#delete-account">Suporte</Link>).
          </li>
          <li>
            <strong>Quando uma assinatura termina</strong>, a conta passa a ser somente leitura e os seus dados são mantidos para que você possa exportá-los ou
            voltar. Ainda não excluímos automaticamente as contas encerradas: os Dados do Contratante são excluídos quando você os exclui no app, ou em até{" "}
            {RETENTION.deletionRequestDays} dias após uma solicitação por escrito do proprietário da conta enviada para <Ph>{COMPANY.privacyEmail}</Ph>.
          </li>
          <li>
            <strong>Backups:</strong> os dados excluídos permanecem nos nossos backups criptografados do banco de dados até que eles expirem, em até{" "}
            <Ph>{RETENTION.backupDays}</Ph> dias.
          </li>
          <li>
            <strong>Os relatórios de erro</strong> são excluídos automaticamente após {RETENTION.errorReportDays} dias. Os logs do servidor são mantidos pelo nosso
            provedor de hospedagem por um curto período, de acordo com as configurações de retenção dele.
          </li>
          <li>
            <strong>Os registros de cobrança</strong> são mantidos pelo tempo exigido pelas leis fiscais e contábeis (normalmente até sete anos).
          </li>
          <li>
            <strong>Os dados nos seus dispositivos</strong> permanecem neles até que você os exclua, saia da conta e apague os dados do app, ou desinstale o app.
          </li>
        </ul>
        <p>
          Você pode exportar as suas obras a qualquer momento e excluir a sua conta pelo app; consulte <Link href="/support#delete-account">Suporte</Link>. As
          fotos mantêm os metadados originais (incluindo a localização por GPS) quando exportadas ou compartilhadas, por isso revise-as antes de enviá-las para
          fora da sua empresa.
        </p>
      </Section>

      <Section item={S.security} n={n(S.security)}>
        <p>Usamos salvaguardas administrativas, técnicas e físicas adequadas a um serviço empresarial, incluindo:</p>
        <ul>
          <li>criptografia em trânsito (HTTPS/TLS com HSTS) e criptografia em repouso para o nosso banco de dados e o armazenamento de arquivos;</li>
          <li>
            segurança em nível de linha no banco de dados, para que cada conta e equipe acesse apenas os próprios dados, com permissões baseadas em funções dentro
            de uma equipe;
          </li>
          <li>
            chaves do lado do servidor mantidas fora do navegador e do app, e credenciais de integrações de terceiros criptografadas em repouso (AES-256-GCM);
          </li>
          <li>cabeçalhos rigorosos de segurança do navegador, limitação de taxa e proteção contra abusos nos endpoints sensíveis;</li>
          <li>backups regulares do banco de dados; e</li>
          <li>acesso aos sistemas de produção limitado às pessoas que precisam dele para operar e dar suporte ao Serviço.</li>
        </ul>
        <p>
          Nenhum sistema é perfeitamente seguro. Se tomarmos conhecimento de um incidente de segurança que afete as suas informações pessoais, notificaremos você e
          as autoridades conforme exigido por lei. Relate vulnerabilidades para <Ph>{COMPANY.securityEmail}</Ph>.
        </p>
      </Section>

      <Section item={S.rights} n={n(S.rights)}>
        <p>Dependendo de onde você mora, você pode ter o direito de:</p>
        <ul>
          <li>saber quais informações pessoais mantemos sobre você e acessá-las, e receber uma cópia portável;</li>
          <li>corrigir informações incorretas;</li>
          <li>excluir as suas informações;</li>
          <li>opor-se a determinados tratamentos ou restringi-los, e revogar o consentimento quando nos baseamos nele;</li>
          <li>
            optar por não participar da “venda” ou do “compartilhamento” de informações pessoais (não as vendemos nem compartilhamos nesse sentido) e limitar o uso
            de informações sensíveis, como a localização precisa (só a usamos para prestar o Serviço); e
          </li>
          <li>apresentar reclamação à autoridade de proteção de dados do seu país ou região.</li>
        </ul>
        <p>
          <strong>Residentes na Califórnia:</strong> nos últimos 12 meses, coletamos identificadores, informações comerciais (assinaturas), atividade na internet
          (diagnóstico e logs), geolocalização (localização de fotos e do dispositivo), informações audiovisuais (fotos) e informações profissionais (empresa e
          função) para os fins comerciais descritos acima, e as divulgamos aos prestadores de serviços listados acima. Não vendemos nem compartilhamos informações
          pessoais, nem usamos informações pessoais sensíveis para fins que exijam o direito de limitação. Não discriminaremos você por exercer os seus direitos, e
          você pode usar um agente autorizado. Respeitamos os sinais do Global Privacy Control como uma solicitação de exclusão (opt-out).
        </p>
        <p>
          Para fazer uma solicitação, use as ferramentas do app (exportar, excluir conta) ou escreva para <Ph>{COMPANY.privacyEmail}</Ph>. Verificaremos a sua
          solicitação, normalmente confirmando o acesso ao e-mail da sua conta, e responderemos no prazo exigido por lei (por exemplo, 45 dias pela lei da
          Califórnia ou um mês pelo GDPR).
        </p>
      </Section>

      <Section item={S.clients} n={n(S.clients)}>
        <p>
          Se você é cliente de uma empresa que usa o Northpin (por exemplo, recebeu um orçamento ou uma RFI), essa empresa controla as suas informações e decide
          como elas são usadas. Entre em contato com ela para acessar, corrigir ou excluir essas informações. Se você entrar em contato conosco, encaminharemos a
          sua solicitação a ela e a ajudaremos a responder.
        </p>
      </Section>

      <Section item={S.transfers} n={n(S.transfers)}>
        <p>
          O Northpin é operado a partir dos Estados Unidos e armazena dados em <Ph>{COMPANY.dataRegion}</Ph>. Se você usar o Northpin fora dos EUA, as suas
          informações serão transferidas para os EUA e tratadas lá. Quando exigido, nos baseamos em salvaguardas adequadas: <Ph>{COMPANY.transferMechanism}</Ph>.
        </p>
      </Section>

      <Section item={S.children} n={n(S.children)}>
        <p>
          O Northpin é um serviço empresarial e não é direcionado a crianças e adolescentes. Não coletamos intencionalmente informações pessoais de menores de 16
          anos. Se você acredita que uma criança ou adolescente nos forneceu informações pessoais, entre em contato conosco e nós as excluiremos.
        </p>
      </Section>

      <Section item={S.changes} n={n(S.changes)}>
        <p>
          Atualizaremos esta política quando as nossas práticas mudarem e alteraremos a data de vigência acima. Se uma alteração for relevante, notificaremos os
          proprietários das contas por e-mail ou no app antes que ela entre em vigor.
        </p>
      </Section>

      <Section item={S.contact} n={n(S.contact)}>
        <p>
          Dúvidas ou solicitações: <Ph>{COMPANY.privacyEmail}</Ph>
          <br />
          <Ph>{COMPANY.legalName}</Ph>, <Ph>{COMPANY.address}</Ph>
        </p>
      </Section>
    </>
  ),
};
