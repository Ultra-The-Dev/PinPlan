// Simplified Chinese translation of /terms, for convenience only: the English text in src/app/terms/page.tsx governs.
// Keep the sections, ids and conditions (AI_ENABLED) in step with the English page.
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  agreement: { id: "agreement", title: "协议" },
  definitions: { id: "definitions", title: "定义" },
  accounts: { id: "accounts", title: "账户和团队" },
  billing: { id: "billing", title: "订阅、试用和计费" },
  data: { id: "customer-data", title: "您的数据" },
  ai: { id: "ai", title: "AI 功能" },
  proposals: { id: "proposals", title: "估价、方案和签名" },
  use: { id: "acceptable-use", title: "可接受的使用" },
  thirdParty: { id: "third-party", title: "第三方服务" },
  availability: { id: "availability", title: "可用性、离线使用和备份" },
  ip: { id: "ip", title: "我们的知识产权" },
  confidentiality: { id: "confidentiality", title: "保密" },
  termination: { id: "termination", title: "期限、取消和终止" },
  warranties: { id: "warranties", title: "免责声明" },
  liability: { id: "liability", title: "责任限制" },
  indemnity: { id: "indemnity", title: "赔偿" },
  law: { id: "law", title: "适用法律和争议解决" },
  apple: { id: "apple", title: "Apple App Store 条款" },
  changes: { id: "changes", title: "本条款的变更" },
  general: { id: "general", title: "一般规定" },
  contact: { id: "contact", title: "联系方式" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S).filter((t) => AI_ENABLED || t !== S.ai);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export const termsZh: LegalTranslation = {
  title: "服务条款",
  toc,
  intro: (
    <p>
      Northpin 帮助电气、弱电及其他专业工种承包商根据图纸统计工程量、发送报价单和发票，并管理现场工程。本条款说明您可以对我们抱有哪些期待，以及我们对您有哪些期待。请仔细阅读；使用
      Northpin 即表示您同意本条款。
    </p>
  ),
  children: (
    <>
      <Section item={S.agreement} n={n(S.agreement)}>
        <p>
          本服务条款（“本条款”）是 <Ph>{COMPANY.legalName}</Ph>（<Ph>{COMPANY.entity}</Ph>，以下称“Northpin”或“我们”）与注册使用 Northpin
          的企业或组织（以下称“客户”或“您”）之间的协议。如果您代表一家公司接受本条款，即表示您确认您有权代表该公司并使其受本条款约束。如果您没有此项授权，或不同意本条款，请勿使用
          Northpin。
        </p>
        <p>
          Northpin 是一款商业工具，仅向公司及其员工提供，供商业用途使用，不向消费者提供，也不供个人、家庭或家居用途使用。您必须年满 18 周岁方可创建账户。
        </p>
        <p>
          我们的<Link href="/privacy">隐私政策</Link>说明了我们如何处理个人信息，并构成本条款的一部分。如果您已与我们签署订单或数据处理协议，在该文件与本条款相冲突时，以该文件为准。
        </p>
      </Section>

      <Section item={S.definitions} n={n(S.definitions)}>
        <ul>
          <li>
            <strong>服务</strong>是指我们提供的 Northpin 网站、网页应用、iOS 应用、API 及相关支持。
          </li>
          <li>
            <strong>用户</strong>是指您允许在您的账户下使用服务的人员，例如您团队中的所有者、办公室人员和技术员。
          </li>
          <li>
            <strong>客户数据</strong>是指您和您的用户输入服务的全部内容：工程、图纸和图样、设备布置、工程量、价格、报价单和估价、发票、贷项通知单和付款记录、信息请求（RFI）、变更单、表单、检查清单、任务、进度安排、每日报告、照片（包括其位置和时间元数据）、备注、文档和文件，以及有关您自己的委托方的信息。
          </li>
          <li>
            <strong>您的委托方</strong>是指您为其开展工作的个人和企业（即您的客户），包括打开您发送的报价单、发票、变更单、信息请求（RFI）或报告链接的任何人。
          </li>
        </ul>
      </Section>

      <Section item={S.accounts} n={n(S.accounts)}>
        <ul>
          <li>请向我们提供准确的账户信息并保持更新，包括一个可正常使用的电子邮件地址。</li>
          <li>
            请对密码和访问码保密，不要共用登录凭据。每位用户应有自己的登录账号。您须对在您的账户下以及由您的用户进行的一切活动负责，并负责设置他们的角色（例如，哪些用户可以查看价格）。
          </li>
          <li>
            如果您认为您的账户遭到未经许可的访问，请立即通过 <Ph>{COMPANY.securityEmail}</Ph> 告知我们。
          </li>
          <li>团队所有者控制团队账户。如果所有者离开贵公司，请联系我们；在我们能够与贵公司核实该请求后，我们将协助转移所有权。</li>
        </ul>
      </Section>

      <Section item={S.billing} n={n(S.billing)}>
        <p>
          <strong>套餐和席位。</strong>付费套餐按订阅周期（按月或按年）计费，并可能限制用户数量（“席位”）或其他使用量，具体以我们的
          <Link href="/pricing">价格页面</Link>或您的订单所示为准。
          {AI_ENABLED && "为保持服务公平、可靠，AI 功能可能设有使用限额。"}
        </p>
        <p>
          <strong>免费试用。</strong>我们可能提供免费试用。试用结束后，只有在您选择付费套餐的情况下，服务才会继续。如果您未选择，您的账户将受到限制或变为只读，但您仍可按下文所述导出您的数据。
        </p>
        <p>
          <strong>付款。</strong>在网页上进行的付款由 Stripe, Inc. 处理。订阅即表示您授权我们通过 Stripe
          在每个周期开始时从您的付款方式中扣款，直至您取消订阅。我们不存储完整的卡号。除非在续订日期前取消，否则订阅将自动续订。通过 Apple App Store 进行的购买由 Apple
          根据其条款计费和管理，且必须通过您的 Apple 账户取消。
        </p>
        <p>
          <strong>税费。</strong>除非另有说明，价格不含税。您须负责缴纳适用的销售税、使用税及类似税费，但对我们收入征收的税项除外。
        </p>
        <p>
          <strong>价格变更和退款。</strong>我们可在至少提前 30 天通知后变更价格；变更自您下一次续订时起适用。费用不予退还，对于不足一个周期的部分我们也不提供抵扣，但法律另有规定或我们无故终止服务的情况除外，在后一种情况下，我们将退还未使用期间的预付费用。
        </p>
        <p>
          <strong>逾期付款。</strong>如果付款失败，我们会通知您并重新尝试扣款。如果在通知后 14 天内仍未付款，我们可暂停付费功能，直至款项付清。
        </p>
      </Section>

      <Section item={S.data} n={n(S.data)}>
        <p>
          <strong>客户数据归您所有。</strong>您授予我们有限许可，仅在为您提供、保护和支持服务、防止滥用以及法律要求的必要范围内，托管、复制、传输、处理和显示客户数据。我们不出售客户数据，也不利用客户数据向您或任何其他人投放广告。
        </p>
        <p>
          <strong>您的责任。</strong>您须对客户数据负责，并须拥有将其输入服务所需的权利和许可。这包括您上传的楼层平面图和图样（其可能属于建筑师、工程师或建筑物业主）、在您的委托方场所拍摄的照片，以及有关您的委托方的个人信息，例如姓名、地址、电话号码、电子邮件和签名。在法律要求的情况下，您须负责告知您的委托方您如何使用其信息，并取得其同意。
        </p>
        <p>
          <strong>我们的角色。</strong>对于客户数据中的个人信息，我们作为您的服务提供者（或“处理者”），按照您的指示处理这些信息，具体如我们的
          <Link href="/privacy">隐私政策</Link>和<Link href="/legal/dpa">数据处理附录</Link>所述，该附录构成本条款的一部分。如需经我方会签的副本，可发送请求至{" "}
          <Ph>{COMPANY.privacyEmail}</Ph>。
        </p>
        <p>
          <strong>敏感信息。</strong>请勿使用服务存储支付卡号、政府身份证件号码、健康信息、报警密码、门禁密码或您的委托方系统的密码。服务并非为此类数据而设计。
        </p>
        <p>
          <strong>汇总数据。</strong>我们可使用有关服务使用情况的去标识化汇总信息（例如创建了多少个工程）来运营和改进服务，前提是这些信息不会识别出您、您的用户或您的委托方。
        </p>
      </Section>

      {AI_ENABLED && (
        <Section item={S.ai} n={n(S.ai)}>
          <p>
            部分功能使用人工智能：识读图页、建议设备位置、解读图页、为照片添加说明以及起草施工日志。当您使用此类功能时，相关图像和文字（例如图页、照片、房间名称或您的设备目录）将被发送给我们的
            AI 服务提供商 Anthropic, PBC，并依据其商业条款进行处理。根据这些条款，Anthropic 不会使用这些数据训练其模型。
          </p>
          <ul>
            <li>
              <strong>仅为建议。</strong>AI
              的输出可能有误或不完整。在您团队中有人接受之前，建议的设备绝不会计入工程量或估价。在依赖数量、价格、说明文字和报告或将其发送给任何人之前，您须负责对其进行核查。
            </li>
            <li>
              <strong>不构成专业意见。</strong>Northpin 不提供工程、设计、规范合规、消防/生命安全或法律方面的意见，AI 输出也不能替代此类意见。
            </li>
            <li>
              <strong>由您选择。</strong>AI 功能仅在您团队中有人使用时才会运行。
            </li>
          </ul>
        </Section>
      )}

      <Section item={S.proposals} n={n(S.proposals)}>
        <p>
          Northpin
          可以生成报价单、发票、变更单、信息请求（RFI）、照片报告及其他文档，以及您的委托方可以打开、回复、签署和接受的链接。其内容、定价和条款由您决定。由此订立的任何合同均存在于您与您的委托方之间；我们不是合同当事方，不对其条款、您的工作，或电子签名在您所在司法管辖区内对您的用途是否有效承担责任。Northpin
          中的发票和付款记录是您的记录：您须对您收取的税费以及您自己的账务负责。任何持有文档链接的人都可以查看该文档，因此请仅与预期收件人共享链接，并撤回您不再希望保持有效的链接。
        </p>
        <p>Billdu 等集成服务会按照您的指示将数据发送至其他服务。您对该服务的使用受您与其提供商之间的协议约束。</p>
      </Section>

      <Section item={S.use} n={n(S.use)}>
        <p>您同意不进行、也不允许任何其他人进行以下行为：</p>
        <ul>
          <li>违反法律、侵犯任何人的权利，或上传您无权使用的内容；</li>
          <li>上传恶意软件，或试图访问您无权访问的账户、数据或系统；</li>
          <li>对服务进行探测、扫描或漏洞测试，但通过我们的负责任披露流程进行的除外（参见“支持”）；</li>
          <li>使服务超载或中断、规避使用限额，或通过我们公开的 API 以外的自动化手段访问服务；</li>
          <li>转售、再许可服务，或作为服务机构向第三方提供服务，但按照服务的设计用途向您自己的委托方提供的除外；</li>
          <li>复制、反向工程服务，或基于服务构建竞争产品，但法律明确允许的除外；或</li>
          <li>利用服务骚扰任何人或发送垃圾信息。</li>
        </ul>
        <p>对于我们合理认为违反本节规定，或使服务或其他客户面临风险的访问，我们可以暂停，并将在可能时告知您原因。</p>
      </Section>

      <Section item={S.thirdParty} n={n(S.thirdParty)}>
        <p>
          服务依赖于第三方提供商，这些提供商列于我们的<Link href="/privacy#subprocessors">隐私政策</Link>中。服务中的地图使用 OpenStreetMap 数据，© OpenStreetMap
          贡献者。您选择连接的第三方产品由相应第三方提供，而非由我们提供。
        </p>
      </Section>

      <Section item={S.availability} n={n(S.availability)}>
        <p>
          我们努力保持服务的可用性和速度，但服务有时可能因维护、更新或我们无法控制的原因而无法使用。Northpin
          的设计可在离线状态下继续工作：您输入的数据会先存储在您的设备上，在有网络连接时再同步到我们的服务器。尚未同步的数据仅存在于该设备上，因此如果设备丢失、被重置或其浏览器存储被清除，这些数据可能会丢失。
        </p>
        <p>
          我们会定期备份已同步的数据（参见我们的<Link href="/privacy#retention">隐私政策</Link>），但备份用于灾难恢复，不能替代您自己的记录。您可以随时导出您的工程。
        </p>
      </Section>

      <Section item={S.ip} n={n(S.ip)}>
        <p>
          服务（包括其软件、设计、符号和文档）归我们所有。在您的订阅有效期间，我们授予您和您的用户一项非独占、不可转让的权利，以便根据本条款将服务用于您的内部业务目的。如果您向我们提出想法或反馈，我们可以使用这些想法或反馈，且无需对您承担任何义务。
        </p>
      </Section>

      <Section item={S.confidentiality} n={n(S.confidentiality)}>
        <p>
          双方均将以合理的谨慎保护对方的非公开商业信息，仅为本协议之目的使用该等信息，并仅与需要知悉且负有保护义务的人员和服务提供商共享。本条不适用于已公开、已知悉、独立开发的信息，或法律要求披露的信息（在允许的情况下应事先通知）。
        </p>
      </Section>

      <Section item={S.termination} n={n(S.termination)}>
        <ul>
          <li>
            <strong>取消。</strong>您可以随时在计费设置中取消订阅（如果您通过 Apple 订阅，则通过 Apple 取消）。取消将在当前周期结束时生效。
          </li>
          <li>
            <strong>由我们终止。</strong>如果您严重违反本条款且未在收到通知后 15
            天内纠正，或您严重违反可接受使用规则（在此情况下可立即执行），或法律有此要求，我们可终止或暂停您的账户。我们可在至少提前 60 天通知并退还未使用期间预付费用的前提下停止提供服务。
          </li>
          <li>
            <strong>终止后的数据。</strong>订阅结束后，您的账户将变为只读，您仍可导出客户数据（如有需要，我们可提供协助）。当您在应用中删除账户时，或在收到您发送至{" "}
            <Ph>{COMPANY.privacyEmail}</Ph> 的书面请求后 {RETENTION.deletionRequestDays} 天内，我们将删除这些数据；随后，这些数据将随备份到期而从备份中移除，具体如我们的
            <Link href="/privacy#retention">隐私政策</Link>所述。
          </li>
          <li>按其性质应在终止后继续有效的条款（例如应付款项、免责声明、责任限制和赔偿）在终止后继续有效。</li>
        </ul>
      </Section>

      <Section item={S.warranties} n={n(S.warranties)}>
        <p>
          我们将以合理的技能和谨慎并按照我们的文档提供服务。除此之外，在法律允许的最大范围内，服务按“现状”和“现有”基础提供，我们不作任何其他明示或默示的保证，包括适销性、特定用途适用性、所有权和不侵权的保证。我们不保证服务没有错误或不会中断，也不保证工程量、估价
          {AI_ENABLED ? "、AI 输出" : ""}或根据图纸比例得出的测量结果准确无误。在依赖数量和价格之前，您须负责对其进行核实。
        </p>
        <p>Northpin 是供您自身工作使用的工具。它不提供工程、设计、规范合规、消防/生命安全、税务或法律方面的意见，其中任何内容均不能替代此类意见。</p>
      </Section>

      <Section item={S.liability} n={n(S.liability)}>
        <p>在法律允许的最大范围内：</p>
        <ul>
          <li>
            任何一方均不对间接、附带、特殊、后果性或惩罚性损害赔偿，或利润、收入、商誉或数据的损失承担责任（但我们在有备份可用时从备份中恢复数据的义务除外），即使已被告知存在发生此类损失的可能性；并且
          </li>
          <li>
            任何一方因本条款引起或与之相关的全部责任，以引起索赔的事件发生前 12 个月内您就服务向我们支付的金额为限（如果您未支付任何费用，则以 100 美元为限）。
          </li>
        </ul>
        <p>上述限制不适用于您的付款义务、任何一方的赔偿义务，或依法不得限制的责任。</p>
      </Section>

      <Section item={S.indemnity} n={n(S.indemnity)}>
        <p>
          对于因客户数据、您为您的委托方开展的工作，或您违反本条款或法律使用服务而引起的第三方索赔，您将为 Northpin
          进行抗辩并使其免受损害。对于声称我们所提供的服务侵犯第三方知识产权的第三方索赔，我们将为您进行抗辩并使您免受损害。寻求赔偿的一方必须及时通知另一方，由另一方主导抗辩，并给予合理配合。
        </p>
      </Section>

      <Section item={S.law} n={n(S.law)}>
        <p>
          本条款受 <Ph>{COMPANY.state}</Ph> 州法律及适用的美国联邦法律管辖，不考虑法律冲突规则。位于 <Ph>{COMPANY.county}</Ph>, <Ph>{COMPANY.state}</Ph>{" "}
          的州法院和联邦法院拥有专属管辖权，双方均同意接受其管辖。在提起索赔之前，双方同意首先尝试以非正式方式解决争议，即联系另一方并进行为期 30 天的善意协商。
        </p>
      </Section>

      <Section item={S.apple} n={n(S.apple)}>
        <p>如果您使用从 Apple App Store 下载的 Northpin iOS 应用，还适用以下规定：</p>
        <ul>
          <li>本条款仅存在于您与 Northpin 之间，而非与 Apple 之间。对应用及其内容承担全部责任的是 Northpin，而非 Apple。</li>
          <li>您使用该应用的许可仅限于在 App Store 使用规则允许的范围内，在您拥有或控制的 Apple 品牌设备上使用。</li>
          <li>Apple 没有义务为该应用提供任何维护或支持。</li>
          <li>
            如果该应用不符合任何适用的保证，您可以通知 Apple，Apple 将退还购买价格（如有）。在法律允许的最大范围内，Apple 对该应用不承担任何其他保证义务。
          </li>
          <li>
            负责处理与该应用相关的任何索赔的是 Northpin，而非
            Apple，包括产品责任索赔、声称其不符合法律或监管要求的索赔、消费者保护或隐私索赔，以及声称其侵犯第三方知识产权的索赔。
          </li>
          <li>您确认您不位于受美国禁运的国家，也未被列入任何美国政府禁止或限制交易方的名单。</li>
          <li>Apple 及其子公司是本条款的第三方受益人，并可就与 iOS 应用相关的部分对您执行本条款。</li>
        </ul>
      </Section>

      <Section item={S.changes} n={n(S.changes)}>
        <p>
          随着服务的发展，我们可能会更新本条款。如果变更属于重大变更，我们将在变更生效前至少 30
          天通过电子邮件或在应用内通知您。如果您不同意该变更，可以在其生效前取消订阅；在变更生效后继续使用服务，即表示您接受该变更。
        </p>
      </Section>

      <Section item={S.general} n={n(S.general)}>
        <ul>
          <li>未经我们同意，您不得转让本条款，但转让给您业务的承继者除外。我们可以在合并、收购或资产出售中转让本条款。</li>
          <li>任何一方均不对超出其合理控制范围的事件所造成的延误负责。</li>
          <li>如果本条款的任何部分无法执行，其余部分仍然有效。未行使某项权利不构成对该权利的放弃。</li>
          <li>我们可以向您账户上的电子邮件地址发送通知。您可以向下列地址发送通知。</li>
          <li>双方为独立的合同方。本条款构成关于服务的完整协议，并取代此前就该事项达成的任何协议。</li>
          <li>您在使用服务时将遵守美国出口管制和制裁法律。</li>
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
