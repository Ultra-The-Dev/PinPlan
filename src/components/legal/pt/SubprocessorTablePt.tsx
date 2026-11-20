// The subprocessor table in Brazilian Portuguese (translation for convenience; /privacy and /legal/subprocessors in
// English govern). Rows come from SUBPROCESSORS in src/lib/legal.ts; a provider without a Portuguese description here
// shows its English text.
import { Ph } from "@/components/legal/LegalDoc";
import { COMPANY, SUBPROCESSORS } from "@/lib/legal";

const PT: Record<string, { purpose: string; data: string }> = {
  "Supabase, Inc.": {
    purpose: "Banco de dados, autenticação de usuários e armazenamento de arquivos",
    data: "Dados da conta e todos os Dados do Contratante sincronizados (obras, plantas, fotos, orçamentos, faturas, registros de campo e arquivos)",
  },
  "Cloudflare, Inc.": {
    purpose: "Hospedagem do site e do aplicativo, funções serverless, entrega de conteúdo, DNS e encaminhamento de e-mails",
    data: "Requisições que passam pelo serviço, endereços IP, logs do servidor",
  },
  "Stripe, Inc.": {
    purpose: "Cobrança de assinaturas e processamento de pagamentos",
    data: "Contato de cobrança, nome da empresa, dados do cartão de pagamento (mantidos pela Stripe, não por nós), faturas",
  },
  "Resend (Plus Five Five, Inc.)": {
    purpose: "E-mails transacionais (links de acesso, convites, avisos de propostas e de cobrança)",
    data: "Endereço de e-mail e nome do destinatário, conteúdo da mensagem",
  },
  "Anthropic, PBC": {
    purpose: "Recursos de IA: leitura de plantas baixas, sugestão de dispositivos, legendas de fotos e rascunhos do diário de obra",
    data: "Imagens das folhas das plantas, fotos das obras e textos relacionados que você decide enviar a um recurso de IA",
  },
  "Apple Inc.": {
    purpose: "Distribuição do app para iOS pela App Store (e compras dentro do app, se oferecidas)",
    data: "Informações que a Apple coleta segundo os próprios termos quando você baixa ou compra pela App Store",
  },
};

const LOCATION_PT: Record<string, string> = {
  "United States": "Estados Unidos",
  "United States (global edge network)": "Estados Unidos (rede de borda global)",
};

export default function SubprocessorTablePt() {
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Fornecedor</th>
            <th>Finalidade</th>
            <th>Dados envolvidos</th>
            <th>Localização</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((s) => (
            <tr key={s.name}>
              <td className="font-medium whitespace-nowrap">{s.name}</td>
              <td>{PT[s.name]?.purpose ?? s.purpose}</td>
              <td>{PT[s.name]?.data ?? s.data}</td>
              <td>
                <Ph>{s.location === COMPANY.dataRegion ? s.location : (LOCATION_PT[s.location] ?? s.location)}</Ph>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
