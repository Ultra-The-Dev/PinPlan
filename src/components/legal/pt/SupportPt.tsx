// Brazilian Portuguese version of /support. The English page (src/app/support/page.tsx) governs where the
// account-deletion and data-export wording matters; keep the sections, ids, steps and conditions (AI_ENABLED) in step
// with it. Menu names follow the app's Portuguese dictionary (src/lib/i18n/pt/).
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import StatusCheck from "@/components/legal/StatusCheck";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  contact: { id: "contact", title: "Fale conosco" },
  status: { id: "status", title: "Status do serviço" },
  faq: { id: "faq", title: "Perguntas frequentes" },
  export: { id: "export", title: "Exportar seus dados" },
  deleteAccount: { id: "delete-account", title: "Excluir sua conta" },
  security: { id: "security", title: "Relatar um problema de segurança" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);

const FAQ: { q: string; a: React.ReactNode; onlyWhen?: "ai" }[] = [
  {
    q: "O Northpin funciona sem sinal?",
    a: "Sim. Obras, plantas e fotos são salvas primeiro no seu dispositivo, então você pode continuar posicionando dispositivos e tirando fotos sem conexão. Quando a conexão voltar, as alterações são sincronizadas automaticamente com a sua equipe. O ícone de nuvem no cabeçalho mostra tudo o que ainda está aguardando envio.",
  },
  {
    q: "Onde meus dados ficam armazenados?",
    a: (
      <>
        No seu dispositivo e — quando você está conectado à sua conta — no nosso banco de dados e armazenamento de arquivos em nuvem hospedados pela Supabase em{" "}
        <Ph>{COMPANY.dataRegion}</Ph>, criptografados em trânsito e em repouso. Consulte a <Link href="/privacy">Política de Privacidade</Link> para ver a lista
        completa de fornecedores.
      </>
    ),
  },
  {
    q: "Meus dados são usados para treinar IA?",
    a: "Não. Os recursos de IA (leitura de plantas, sugestões de dispositivos, legendas de fotos, rascunhos do diário de obra) só são executados quando você os usa. As imagens e os textos envolvidos são processados pela Anthropic nos termos comerciais dela, que não permitem treinamento com esses dados. As sugestões da IA nunca contam no levantamento nem nos preços até que alguém as aceite.",
    onlyWhen: "ai",
  },
  {
    q: "Como adiciono a equipe do escritório e os técnicos?",
    a: "Abra Configurações → Equipe e convide-os. Os técnicos podem trabalhar com plantas, fotos, checklists e tarefas; nos acessos deles, preços, orçamentos e faturas ficam ocultos no app. Cada pessoa tem seu próprio login.",
  },
  {
    q: "Como altero ou cancelo minha assinatura?",
    a: (
      <>
        Os proprietários da equipe podem trocar de plano ou cancelar em Configurações → Plano e cobrança; o cancelamento vale a partir do fim do período atual. Se
        você assinou pela App Store, gerencie a assinatura nos Ajustes do iOS → seu nome → Assinaturas. Veja os planos na página <Link href="/pricing">Preços</Link>.
      </>
    ),
  },
  {
    q: "Uma foto mostra o local errado ou nenhum local.",
    a: "O Northpin lê a posição de GPS que a sua câmera salvou na foto. Verifique se o acesso à localização está permitido para o app da câmera (e para o Northpin, ao tirar fotos dentro do app). Fotos enviadas por alguns aplicativos de mensagens têm a localização removida.",
  },
  {
    q: "Não consigo entrar ou não recebi o e-mail.",
    a: (
      <>
        Procure uma mensagem do Northpin na pasta de spam e confira se você está usando o mesmo e-mail para o qual a sua equipe enviou o convite. Ainda não
        resolveu? Escreva para <Ph>{COMPANY.supportEmail}</Ph> a partir desse endereço e nós ajudaremos.
      </>
    ),
  },
  {
    q: "Algo deu errado no app.",
    a: "Recarregue a página ou abra o app de novo — o seu trabalho está salvo no dispositivo. Se aparecer uma tela de erro, toque em “Copiar detalhes” e cole as informações em um e-mail para o suporte, para que possamos encontrar o problema rapidamente.",
  },
];

export const supportPt: LegalTranslation = {
  title: "Suporte",
  toc,
  intro: (
    <p>
      Somos uma equipe pequena que desenvolve o Northpin para empresas de instalações elétricas, de baixa tensão e de outras especialidades. Pessoas de verdade
      respondem a todas as mensagens.
    </p>
  ),
  children: (
    <>
      <Section item={S.contact}>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">Suporte por e-mail</p>
            <p className="mt-1">
              <Ph>{COMPANY.supportEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">
              Respondemos em até um dia útil (horário dos EUA, <Ph>{COMPANY.supportTimeZone}</Ph>). Informe o nome da sua empresa e, se for um problema, o que você
              estava fazendo, junto com uma captura de tela ou os detalhes do erro copiados.
            </p>
          </div>
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">Privacidade e solicitações de dados</p>
            <p className="mt-1">
              <Ph>{COMPANY.privacyEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">
              Para solicitações de acesso, exportação ou exclusão. Envie-as a partir do e-mail da sua conta, para que possamos verificá-las.
            </p>
          </div>
        </div>
        <p>Nunca envie senhas, chaves de API ou números de cartão de pagamento por e-mail. Nós nunca vamos pedi-los.</p>
      </Section>

      <Section item={S.status}>
        <div className="mk-sheet mt-4 p-5">
          <StatusCheck />
          <p className="mt-3 text-sm text-mk-pencil">
            Verificação em tempo real dos nossos servidores e do banco de dados: <a href="/api/health">/api/health</a>
          </p>
        </div>
      </Section>

      <Section item={S.faq}>
        <div className="mt-4 divide-y divide-mk-rule mk-sheet">
          {FAQ.filter((f) => f.onlyWhen !== "ai" || AI_ENABLED).map((f) => (
            <details key={f.q} className="group px-5 [&_p]:-mt-2 [&_p]:pb-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium text-mk-graphite [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="text-slate-400 transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="text-mk-pencil">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section item={S.export}>
        <p>
          Suas obras pertencem a você. Você pode exportá-las a qualquer momento, inclusive depois que a assinatura terminar (a conta continua disponível somente
          para leitura).
        </p>
        <ul>
          <li>
            <strong>Uma obra inteira, com plantas, anotações, fotos e preços:</strong> abra a obra → aba <strong>Visão geral</strong> → <strong>Backup</strong> →{" "}
            <strong>Baixar backup</strong>. Isso salva um único arquivo que o Northpin pode restaurar em qualquer dispositivo (Obras →{" "}
            <strong>Restaurar backup</strong>).
          </li>
          <li>
            <strong>Levantamento, preços e relatórios:</strong> baixe PDFs e arquivos CSV nas abas <strong>Levantamento</strong>, <strong>Financeiro</strong>{" "}
            (seção Preços), <strong>Planta</strong> e <strong>Campo</strong> de uma obra.
          </li>
          <li>
            <strong>Sua tabela de preços:</strong> <strong>Tabela de preços</strong> → baixe o CSV.
          </li>
          <li>
            <strong>Tudo de uma vez:</strong> escreva para <Ph>{COMPANY.supportEmail}</Ph> a partir do endereço do proprietário da equipe e enviaremos uma
            exportação completa dos dados da sua conta em até {RETENTION.deletionRequestDays} dias.
          </li>
        </ul>
      </Section>

      <Section item={S.deleteAccount}>
        <p>Você mesmo pode excluir a sua conta:</p>
        <ol>
          <li>
            No app web ou no app para iOS, abra <strong>Configurações → Conta</strong>.
          </li>
          <li>
            Escolha <strong>Excluir conta</strong> e confirme.
          </li>
        </ol>
        <p>O que acontece em seguida:</p>
        <ul>
          <li>Seu login é removido imediatamente e você é desconectado em todos os dispositivos.</li>
          <li>
            Se você for o <strong>proprietário da equipe</strong>, excluir a sua conta também exclui as obras, fotos e documentos da equipe. Se a empresa for
            continuar usando o Northpin, transfira antes a propriedade (Configurações → Equipe) e cancele qualquer assinatura da App Store nos Ajustes do iOS.
          </li>
          <li>Se você for membro da equipe, as suas obras continuam com a equipe; somente o seu login e os seus dados pessoais são removidos.</li>
          <li>
            Seus dados são removidos imediatamente do nosso banco de dados ativo e do armazenamento de arquivos, e dos backups à medida que eles expiram, conforme
            descrito na <Link href="/privacy#retention">Política de Privacidade</Link>. As cópias salvas nos seus próprios dispositivos permanecem até você excluir
            o app ou os dados dele.
          </li>
        </ul>
        <p>
          Não consegue entrar? Escreva para <Ph>{COMPANY.privacyEmail}</Ph> a partir do e-mail da sua conta com o assunto “Delete my account” (“Excluir minha
          conta”) e faremos isso por você, depois de confirmar que é você, em até {RETENTION.deletionRequestDays} dias após o seu e-mail.
        </p>
      </Section>

      <Section item={S.security}>
        <p>
          Se você acredita ter encontrado uma vulnerabilidade de segurança, envie os detalhes para <Ph>{COMPANY.securityEmail}</Ph>. Dê-nos um prazo razoável para
          corrigi-la antes de divulgá-la e, durante os testes, não acesse dados de outros contratantes nem interrompa o Serviço. Agradecemos os relatos responsáveis.
        </p>
      </Section>
    </>
  ),
};
