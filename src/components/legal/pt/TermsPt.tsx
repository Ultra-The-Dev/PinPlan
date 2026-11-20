// Brazilian Portuguese translation of /terms, for convenience only: the English text in src/app/terms/page.tsx governs.
// Keep the sections, ids and conditions (AI_ENABLED) in step with the English page.
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  agreement: { id: "agreement", title: "O contrato" },
  definitions: { id: "definitions", title: "Definições" },
  accounts: { id: "accounts", title: "Contas e equipes" },
  billing: { id: "billing", title: "Assinaturas, testes grátis e cobrança" },
  data: { id: "customer-data", title: "Seus dados" },
  ai: { id: "ai", title: "Recursos de IA" },
  proposals: { id: "proposals", title: "Estimativas, propostas e assinaturas" },
  use: { id: "acceptable-use", title: "Uso aceitável" },
  thirdParty: { id: "third-party", title: "Serviços de terceiros" },
  availability: { id: "availability", title: "Disponibilidade, uso offline e backups" },
  ip: { id: "ip", title: "Nossa propriedade intelectual" },
  confidentiality: { id: "confidentiality", title: "Confidencialidade" },
  termination: { id: "termination", title: "Vigência, cancelamento e rescisão" },
  warranties: { id: "warranties", title: "Isenções de garantia" },
  liability: { id: "liability", title: "Limitação de responsabilidade" },
  indemnity: { id: "indemnity", title: "Indenização" },
  law: { id: "law", title: "Lei aplicável e disputas" },
  apple: { id: "apple", title: "Termos da Apple App Store" },
  changes: { id: "changes", title: "Alterações destes termos" },
  general: { id: "general", title: "Disposições gerais" },
  contact: { id: "contact", title: "Contato" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S).filter((t) => AI_ENABLED || t !== S.ai);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export const termsPt: LegalTranslation = {
  title: "Termos de Serviço",
  toc,
  intro: (
    <p>
      O Northpin ajuda empresas de instalações elétricas, de baixa tensão e de outras especialidades a fazer levantamentos a partir de plantas, enviar orçamentos
      e faturas e gerenciar suas obras em campo. Estes termos explicam o que você pode esperar de nós e o que esperamos de você. Leia-os com atenção; ao usar o
      Northpin, você concorda com eles.
    </p>
  ),
  children: (
    <>
      <Section item={S.agreement} n={n(S.agreement)}>
        <p>
          Estes Termos de Serviço (os “Termos”) constituem um contrato entre <Ph>{COMPANY.legalName}</Ph>, <Ph>{COMPANY.entity}</Ph> (“Northpin”, “nós”), e a
          empresa ou organização que se cadastra no Northpin (“Contratante”, “você”). Se você aceitar estes Termos em nome de uma empresa, você confirma que tem
          poderes para vinculá-la. Se você não tiver esses poderes, ou não concordar, não use o Northpin.
        </p>
        <p>
          O Northpin é uma ferramenta empresarial. Ele é oferecido a empresas e aos seus colaboradores somente para fins profissionais, e não a consumidores para uso
          pessoal, familiar ou doméstico. Você deve ter pelo menos 18 anos para criar uma conta.
        </p>
        <p>
          Nossa <Link href="/privacy">Política de Privacidade</Link> explica como tratamos informações pessoais e faz parte destes Termos. Se você tiver assinado
          conosco um formulário de pedido ou um contrato de tratamento de dados, esse documento prevalece no que conflitar com estes Termos.
        </p>
      </Section>

      <Section item={S.definitions} n={n(S.definitions)}>
        <ul>
          <li>
            <strong>Serviço</strong> significa o site do Northpin, o aplicativo web, o app para iOS, as APIs e o suporte relacionado que oferecemos.
          </li>
          <li>
            <strong>Usuários</strong> são as pessoas que você autoriza a usar o Serviço na sua conta, como proprietários, equipe do escritório e técnicos da sua
            equipe.
          </li>
          <li>
            <strong>Dados do Contratante</strong> são tudo o que você e os seus Usuários inserem no Serviço: obras, plantas e desenhos, posicionamento de
            dispositivos, levantamentos, preços, orçamentos e estimativas, faturas, notas de crédito e registros de pagamento, RFIs, aditivos, formulários,
            checklists, tarefas, cronogramas, relatórios diários, fotos (incluindo os metadados de localização e horário), observações, documentos e arquivos, e
            informações sobre os seus próprios clientes.
          </li>
          <li>
            <strong>Seus Clientes</strong> são as pessoas e empresas para quem você presta serviços, incluindo qualquer pessoa que abra um link de orçamento,
            fatura, aditivo, RFI ou relatório que você enviar.
          </li>
        </ul>
      </Section>

      <Section item={S.accounts} n={n(S.accounts)}>
        <ul>
          <li>Forneça-nos informações de conta corretas e mantenha-as atualizadas, incluindo um endereço de e-mail que funcione.</li>
          <li>
            Mantenha senhas e códigos de acesso em sigilo e não compartilhe logins. Cada Usuário deve ter seu próprio login. Você é responsável por tudo o que for
            feito na sua conta e pelos seus Usuários, e por definir as funções deles (por exemplo, quais Usuários podem ver preços).
          </li>
          <li>
            Avise-nos prontamente em <Ph>{COMPANY.securityEmail}</Ph> se acreditar que a sua conta foi acessada sem permissão.
          </li>
          <li>
            O proprietário da equipe controla a conta da equipe. Se o proprietário sair da sua empresa, entre em contato conosco e ajudaremos a transferir a
            propriedade assim que pudermos confirmar a solicitação com a sua empresa.
          </li>
        </ul>
      </Section>

      <Section item={S.billing} n={n(S.billing)}>
        <p>
          <strong>Planos e licenças.</strong> Os planos pagos são cobrados por período de assinatura (mensal ou anual) e podem limitar o número de Usuários
          (“licenças”) ou outro tipo de uso, conforme indicado na nossa <Link href="/pricing">página de preços</Link> ou no seu pedido.
          {AI_ENABLED && " Podem ser aplicados limites de uso aos recursos de IA para manter o Serviço justo e confiável."}
        </p>
        <p>
          <strong>Teste grátis.</strong> Podemos oferecer um teste grátis. Quando ele terminar, o Serviço só continua se você escolher um plano pago. Caso
          contrário, a sua conta passa a ser limitada ou somente leitura, e você ainda pode exportar seus dados conforme descrito abaixo.
        </p>
        <p>
          <strong>Pagamento.</strong> Os pagamentos feitos pela web são processados pela Stripe, Inc. Ao assinar, você nos autoriza, por meio da Stripe, a cobrar
          o seu meio de pagamento no início de cada período até que você cancele. Não armazenamos números completos de cartão. As assinaturas são renovadas
          automaticamente, a menos que sejam canceladas antes da data de renovação. As compras feitas pela Apple App Store são cobradas e gerenciadas pela Apple
          de acordo com os termos dela e devem ser canceladas pela sua conta Apple.
        </p>
        <p>
          <strong>Tributos.</strong> Os preços não incluem tributos, salvo indicação em contrário. Você é responsável pelos impostos sobre vendas, sobre uso e
          tributos semelhantes aplicáveis, exceto os tributos sobre a nossa renda.
        </p>
        <p>
          <strong>Alterações e reembolsos.</strong> Podemos alterar os preços com aviso prévio de pelo menos 30 dias; as alterações valem a partir da sua próxima
          renovação. As taxas não são reembolsáveis e não concedemos créditos por períodos parciais, exceto quando exigido por lei ou quando encerrarmos o Serviço
          sem justa causa, caso em que reembolsamos as taxas pagas antecipadamente referentes ao período não utilizado.
        </p>
        <p>
          <strong>Atraso no pagamento.</strong> Se um pagamento falhar, avisaremos você e tentaremos novamente. Se ele continuar em aberto por 14 dias após o
          aviso, poderemos suspender os recursos pagos até que seja quitado.
        </p>
      </Section>

      <Section item={S.data} n={n(S.data)}>
        <p>
          <strong>Os Dados do Contratante pertencem a você.</strong> Você nos concede uma licença limitada para hospedar, copiar, transmitir, processar e exibir os
          Dados do Contratante somente na medida necessária para prestar, proteger e dar suporte ao Serviço para você, para prevenir abusos e conforme exigido por
          lei. Não vendemos os Dados do Contratante e não os usamos para fazer publicidade para você ou para qualquer outra pessoa.
        </p>
        <p>
          <strong>Suas responsabilidades.</strong> Você é responsável pelos Dados do Contratante e por ter os direitos e as permissões necessários para inseri-los
          no Serviço. Isso inclui as plantas e os desenhos que você enviar (que podem pertencer a arquitetos, engenheiros ou proprietários de edifícios), as fotos
          tiradas nas instalações dos Seus Clientes e as informações pessoais sobre os Seus Clientes, como nomes, endereços, telefones, e-mails e assinaturas.
          Quando a lei exigir, você é responsável por informar aos Seus Clientes como usa as informações deles e por obter o consentimento deles.
        </p>
        <p>
          <strong>Nosso papel.</strong> Em relação às informações pessoais contidas nos Dados do Contratante, atuamos como seu prestador de serviços (ou
          “operador”) e as tratamos conforme as suas instruções, como descrito na nossa <Link href="/privacy">Política de Privacidade</Link> e no nosso{" "}
          <Link href="/legal/dpa">Adendo de Tratamento de Dados</Link>, que faz parte destes Termos. Uma via assinada por nós está disponível mediante solicitação
          em <Ph>{COMPANY.privacyEmail}</Ph>.
        </p>
        <p>
          <strong>Informações sensíveis.</strong> Não use o Serviço para armazenar números de cartão de pagamento, números de documentos de identidade emitidos
          pelo governo, informações de saúde, códigos de alarme, códigos de portas ou senhas dos sistemas dos Seus Clientes. O Serviço não foi projetado para esse
          tipo de dado.
        </p>
        <p>
          <strong>Dados agregados.</strong> Podemos usar informações desidentificadas e agregadas sobre como o Serviço é usado (por exemplo, quantas obras são
          criadas) para operá-lo e melhorá-lo, desde que elas não identifiquem você, os seus Usuários ou os Seus Clientes.
        </p>
      </Section>

      {AI_ENABLED && (
        <Section item={S.ai} n={n(S.ai)}>
          <p>
            Alguns recursos usam inteligência artificial: leitura de folhas de plantas, sugestão de posições de dispositivos, explicação de uma folha, legendas de
            fotos e rascunhos do diário de obra. Quando você usa um deles, as imagens e os textos relevantes (por exemplo, uma folha de planta, uma foto, nomes de
            ambientes ou o seu catálogo de dispositivos) são enviados ao nosso fornecedor de IA, Anthropic, PBC, para processamento nos termos comerciais dela.
            Segundo esses termos, a Anthropic não usa esses dados para treinar os seus modelos.
          </p>
          <ul>
            <li>
              <strong>Somente sugestões.</strong> O resultado da IA pode estar errado ou incompleto. Os dispositivos sugeridos nunca contam para um levantamento ou
              estimativa até que uma pessoa da sua equipe os aceite. Você é responsável por conferir quantidades, preços, legendas e relatórios antes de confiar
              neles ou de enviá-los a alguém.
            </li>
            <li>
              <strong>Não é aconselhamento profissional.</strong> O Northpin não presta aconselhamento de engenharia, projeto, conformidade com normas, segurança
              contra incêndio e segurança da vida ou aconselhamento jurídico, e o resultado da IA não o substitui.
            </li>
            <li>
              <strong>Você escolhe.</strong> Os recursos de IA só são executados quando alguém da sua equipe os utiliza.
            </li>
          </ul>
        </Section>
      )}

      <Section item={S.proposals} n={n(S.proposals)}>
        <p>
          O Northpin pode gerar orçamentos, faturas, aditivos, RFIs, relatórios fotográficos e outros documentos, além de links que os Seus Clientes podem abrir,
          responder, assinar e aceitar. Você decide o conteúdo, os preços e as condições deles. Qualquer contrato celebrado é entre você e o seu Cliente; não somos
          parte dele e não somos responsáveis pelas condições dele, pelo seu trabalho ou pela validade de uma assinatura eletrônica para a sua finalidade na sua
          jurisdição. As faturas e os registros de pagamento no Northpin são registros seus: você é responsável pelos tributos que cobra e pela sua própria
          contabilidade. Qualquer pessoa com o link de um documento pode visualizá-lo, por isso compartilhe links apenas com o destinatário pretendido e revogue
          os links que você não quer mais ativos.
        </p>
        <p>
          Integrações como a Billdu enviam dados para outro serviço por sua determinação. O seu uso desse serviço é regido pelo seu contrato com o respectivo
          fornecedor.
        </p>
      </Section>

      <Section item={S.use} n={n(S.use)}>
        <p>Você concorda em não fazer, e em não permitir que outra pessoa faça, o seguinte:</p>
        <ul>
          <li>violar a lei, infringir direitos de terceiros ou enviar conteúdo que você não tem o direito de usar;</li>
          <li>enviar malware ou tentar acessar contas, dados ou sistemas aos quais você não tem autorização de acesso;</li>
          <li>sondar, varrer ou testar a vulnerabilidade do Serviço, exceto por meio do nosso processo de divulgação responsável (consulte Suporte);</li>
          <li>sobrecarregar ou interromper o Serviço, burlar limites de uso ou usar meios automatizados para acessá-lo que não sejam as nossas APIs publicadas;</li>
          <li>
            revender, sublicenciar ou fornecer o Serviço a terceiros como bureau de serviços, exceto aos Seus Clientes, da forma prevista pelo Serviço;
          </li>
          <li>copiar, fazer engenharia reversa ou criar um produto concorrente a partir do Serviço, exceto quando a lei expressamente permitir; ou</li>
          <li>usar o Serviço para assediar qualquer pessoa ou para enviar spam.</li>
        </ul>
        <p>
          Podemos suspender o acesso que, de forma razoável, acreditarmos violar esta seção ou colocar em risco o Serviço ou outros contratantes, e informaremos o motivo
          sempre que possível.
        </p>
      </Section>

      <Section item={S.thirdParty} n={n(S.thirdParty)}>
        <p>
          O Serviço depende de fornecedores terceiros, listados na nossa <Link href="/privacy#subprocessors">Política de Privacidade</Link>. Os mapas do Serviço
          usam dados do OpenStreetMap, © colaboradores do OpenStreetMap. Os produtos de terceiros que você decidir conectar são fornecidos por esses terceiros, e não
          por nós.
        </p>
      </Section>

      <Section item={S.availability} n={n(S.availability)}>
        <p>
          Trabalhamos para manter o Serviço disponível e rápido, mas às vezes ele pode ficar indisponível por manutenção, atualizações ou motivos fora do nosso
          controle. O Northpin foi projetado para continuar funcionando offline: os dados que você insere são armazenados primeiro no seu dispositivo e
          sincronizados com os nossos servidores quando há conexão. Os dados que ainda não foram sincronizados existem apenas naquele dispositivo e, portanto,
          podem ser perdidos se o dispositivo for perdido ou redefinido ou se o armazenamento do navegador for apagado.
        </p>
        <p>
          Fazemos backup dos dados sincronizados regularmente (consulte a nossa <Link href="/privacy#retention">Política de Privacidade</Link>), mas os backups
          servem para recuperação de desastres e não substituem os seus próprios registros. Você pode exportar as suas obras a qualquer momento.
        </p>
      </Section>

      <Section item={S.ip} n={n(S.ip)}>
        <p>
          Somos os titulares do Serviço, incluindo o seu software, design, símbolos e documentação. Enquanto a sua assinatura estiver ativa, concedemos a você e
          aos seus Usuários um direito não exclusivo e intransferível de usar o Serviço para os fins internos do seu negócio, nos termos destes Termos. Se você nos
          enviar ideias ou comentários, poderemos usá-los sem nenhuma obrigação para com você.
        </p>
      </Section>

      <Section item={S.confidentiality} n={n(S.confidentiality)}>
        <p>
          Cada uma das partes protegerá as informações comerciais não públicas da outra com cuidado razoável, irá usá-las apenas para os fins deste contrato e só as
          compartilhará com pessoas e fornecedores que precisem delas e que estejam obrigados a protegê-las. Isso não se aplica a informações que sejam públicas,
          já conhecidas, desenvolvidas de forma independente ou cuja divulgação seja exigida por lei (com aviso, quando permitido).
        </p>
      </Section>

      <Section item={S.termination} n={n(S.termination)}>
        <ul>
          <li>
            <strong>Cancelamento.</strong> Você pode cancelar a qualquer momento nas suas configurações de cobrança (ou pela Apple, se tiver assinado por lá). O
            cancelamento produz efeitos no fim do período atual.
          </li>
          <li>
            <strong>Rescisão por nós.</strong> Podemos encerrar ou suspender a sua conta se você violar de forma relevante estes Termos e não corrigir a violação
            em até 15 dias após o aviso, imediatamente em caso de violações graves das regras de uso aceitável, ou se exigido por lei. Podemos deixar de oferecer o
            Serviço com aviso prévio de pelo menos 60 dias e reembolso das taxas pagas antecipadamente referentes ao período não utilizado.
          </li>
          <li>
            <strong>Seus dados após o término.</strong> Quando a sua assinatura terminar, a sua conta passa a ser somente leitura e você ainda pode exportar os
            Dados do Contratante (ajudaremos mediante solicitação). Nós os excluímos quando você exclui a sua conta no app, ou em até{" "}
            {RETENTION.deletionRequestDays} dias após uma solicitação por escrito enviada para <Ph>{COMPANY.privacyEmail}</Ph>; depois, eles são removidos dos
            backups à medida que estes expiram, conforme descrito na nossa <Link href="/privacy#retention">Política de Privacidade</Link>.
          </li>
          <li>
            As cláusulas que, por sua natureza, devam subsistir (como valores de pagamento devidos, isenções de garantia, limitação de responsabilidade e
            indenização) permanecem em vigor após a rescisão.
          </li>
        </ul>
      </Section>

      <Section item={S.warranties} n={n(S.warranties)}>
        <p>
          Prestaremos o Serviço com competência e cuidado razoáveis e de acordo com a nossa documentação. Fora isso, na máxima extensão permitida por lei, o
          Serviço é fornecido “no estado em que se encontra” e “conforme disponível”, e nos isentamos de todas as demais garantias, expressas ou implícitas,
          incluindo as de comerciabilidade, adequação a uma finalidade específica, titularidade e não violação. Não garantimos que o Serviço estará livre de erros
          ou ininterrupto, nem que os levantamentos, as estimativas{AI_ENABLED ? ", o resultado da IA" : ""} ou as medidas obtidas a partir das escalas das plantas
          estejam corretos. Você é responsável por conferir quantidades e preços antes de confiar neles.
        </p>
        <p>
          O Northpin é uma ferramenta para o seu próprio trabalho. Ele não presta aconselhamento de engenharia, projeto, conformidade com normas, segurança contra
          incêndio e segurança da vida, tributário ou jurídico, e nada nele substitui esse aconselhamento.
        </p>
      </Section>

      <Section item={S.liability} n={n(S.liability)}>
        <p>Na máxima extensão permitida por lei:</p>
        <ul>
          <li>
            nenhuma das partes é responsável por danos indiretos, incidentais, especiais, consequenciais ou punitivos, nem por lucros cessantes, perda de receita,
            de fundo de comércio (goodwill) ou de dados (exceto a nossa obrigação de restaurar dados a partir dos nossos backups, quando disponíveis), mesmo que
            tenha sido avisada de que eram possíveis; e
          </li>
          <li>
            a responsabilidade total de cada parte decorrente destes Termos ou a eles relacionada fica limitada aos valores que você nos pagou pelo Serviço nos 12
            meses anteriores ao evento que deu origem à reclamação (ou a US$ 100, se você não tiver pago nada).
          </li>
        </ul>
        <p>
          Esses limites não se aplicam às suas obrigações de pagamento, às obrigações de indenização de qualquer das partes nem à responsabilidade que não possa ser
          limitada por lei.
        </p>
      </Section>

      <Section item={S.indemnity} n={n(S.indemnity)}>
        <p>
          Você defenderá e indenizará a Northpin contra reclamações de terceiros decorrentes dos Dados do Contratante, do seu trabalho para os Seus Clientes ou do
          seu uso do Serviço em violação destes Termos ou da lei. Nós defenderemos e indenizaremos você contra reclamações de terceiros de que o Serviço, tal como o
          fornecemos, viola os direitos de propriedade intelectual deles. A parte que pede a indenização deve notificar a outra prontamente, permitir que ela
          conduza a defesa e cooperar de forma razoável.
        </p>
      </Section>

      <Section item={S.law} n={n(S.law)}>
        <p>
          Estes Termos são regidos pelas leis do Estado de <Ph>{COMPANY.state}</Ph> e pela legislação federal dos EUA aplicável, sem considerar as regras de
          conflito de leis. Os tribunais estaduais e federais localizados em <Ph>{COMPANY.county}</Ph>, <Ph>{COMPANY.state}</Ph>, têm jurisdição exclusiva, e
          ambas as partes se submetem a eles. Antes de apresentar uma reclamação, cada parte concorda em tentar resolver a disputa de maneira informal, entrando em
          contato com a outra e negociando de boa-fé por 30 dias.
        </p>
      </Section>

      <Section item={S.apple} n={n(S.apple)}>
        <p>Se você usar o app Northpin para iOS baixado da Apple App Store, também se aplica o seguinte:</p>
        <ul>
          <li>
            Estes Termos são celebrados somente entre você e a Northpin, e não com a Apple. A Northpin, e não a Apple, é a única responsável pelo app e pelo seu
            conteúdo.
          </li>
          <li>
            A sua licença de uso do app é limitada a dispositivos da marca Apple que você possua ou controle, conforme permitido pelas regras de uso da App Store.
          </li>
          <li>A Apple não tem nenhuma obrigação de oferecer manutenção ou suporte para o app.</li>
          <li>
            Se o app não estiver em conformidade com alguma garantia aplicável, você pode notificar a Apple, e a Apple reembolsará o preço de compra (se houver). Na
            máxima extensão permitida por lei, a Apple não tem nenhuma outra obrigação de garantia em relação ao app.
          </li>
          <li>
            A Northpin, e não a Apple, é responsável por tratar quaisquer reclamações relacionadas ao app, incluindo reclamações de responsabilidade pelo produto,
            reclamações de que ele não cumpre requisitos legais ou regulatórios, reclamações de proteção ao consumidor ou de privacidade e reclamações de que ele
            viola a propriedade intelectual de terceiros.
          </li>
          <li>
            Você confirma que não está localizado em um país sujeito a embargo dos EUA e que não consta de nenhuma lista do governo dos EUA de partes proibidas ou
            restritas.
          </li>
          <li>
            A Apple e as suas subsidiárias são terceiras beneficiárias destes Termos e podem fazê-los valer contra você no que se refere ao app para iOS.
          </li>
        </ul>
      </Section>

      <Section item={S.changes} n={n(S.changes)}>
        <p>
          Podemos atualizar estes Termos à medida que o Serviço evolui. Se uma alteração for relevante, avisaremos você por e-mail ou no app pelo menos 30 dias
          antes de ela entrar em vigor. Se você não concordar com a alteração, poderá cancelar antes que ela entre em vigor; continuar usando o Serviço depois disso
          significa que você a aceita.
        </p>
      </Section>

      <Section item={S.general} n={n(S.general)}>
        <ul>
          <li>
            Você não pode ceder estes Termos sem o nosso consentimento, exceto a um sucessor do seu negócio. Nós podemos cedê-los em caso de fusão, aquisição ou
            venda de ativos.
          </li>
          <li>Nenhuma das partes é responsável por atrasos causados por eventos fora do seu controle razoável.</li>
          <li>
            Se alguma parte destes Termos for inexequível, o restante continua em vigor. Deixar de exercer um direito não significa renunciar a ele.
          </li>
          <li>Podemos enviar notificações para o endereço de e-mail da sua conta. Você pode enviar notificações para o endereço abaixo.</li>
          <li>
            Somos partes independentes entre si. Estes Termos constituem o acordo integral sobre o Serviço e substituem qualquer acordo anterior sobre esse assunto.
          </li>
          <li>Ao usar o Serviço, você cumprirá as leis de controle de exportação e de sanções dos EUA.</li>
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
