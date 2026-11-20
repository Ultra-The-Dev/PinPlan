// Simplified Chinese translation of /privacy, for convenience only: the English text in src/app/privacy/page.tsx governs.
// Keep the sections, ids and conditions (AI_ENABLED) in step with the English page.
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";
import SubprocessorTableZh from "./SubprocessorTableZh";

const S = {
  scope: { id: "scope", title: "我们是谁以及本政策的适用范围" },
  collect: { id: "collect", title: "我们收集的信息" },
  use: { id: "use", title: "我们如何使用信息" },
  ai: { id: "ai", title: "AI 处理" },
  sharing: { id: "sharing", title: "我们如何共享信息" },
  subprocessors: { id: "subprocessors", title: "数据子处理者" },
  retention: { id: "retention", title: "保留和删除" },
  security: { id: "security", title: "安全" },
  rights: { id: "rights", title: "您的权利和选择" },
  clients: { id: "your-clients", title: "关于我们客户的委托方的信息" },
  transfers: { id: "transfers", title: "跨境传输" },
  children: { id: "children", title: "儿童" },
  changes: { id: "changes", title: "本政策的变更" },
  contact: { id: "contact", title: "联系方式" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S).filter((t) => AI_ENABLED || t !== S.ai);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export const privacyZh: LegalTranslation = {
  title: "隐私政策",
  toc,
  intro: (
    <p>
      电气、弱电及其他专业工种承包商将他们的图纸、报价单、发票、工程以及其委托方的信息托付给
      Northpin。本政策以通俗易懂的语言说明我们收集哪些信息、为何收集、谁协助我们处理、我们保留多长时间以及您如何对其进行控制。简而言之：我们使用您的数据为您运行
      Northpin，我们不出售这些数据，也不使用这些数据训练 AI 模型。
    </p>
  ),
  children: (
    <>
      <Section item={S.scope} n={n(S.scope)}>
        <p>
          Northpin 由位于美国的 <Ph>{COMPANY.legalName}</Ph>（以下称“Northpin”或“我们”）运营。本政策适用于我们的网站、网页应用和 iOS 应用（统称“服务”）。
        </p>
        <p>Northpin 是一款商业工具，因此我们以两种角色处理个人信息：</p>
        <ul>
          <li>
            <strong>作为企业（控制者）</strong>，处理有关注册和使用 Northpin 的公司及个人的信息：账户、计费、支持和使用信息。
          </li>
          <li>
            <strong>作为服务提供者（处理者）</strong>，处理我们的客户输入 Northpin 的工程数据，包括有关其自己的委托方的信息。输入哪些内容以及出于何种目的由我们的客户决定；我们根据我们的
            <Link href="/terms">服务条款</Link>和<Link href="/legal/dpa">数据处理附录</Link>代表客户处理这些数据。参见
            <a href="#your-clients">第 {n(S.clients)} 节</a>。
          </li>
        </ul>
      </Section>

      <Section item={S.collect} n={n(S.collect)}>
        <h3>您提供给我们的信息</h3>
        <ul>
          <li>
            <strong>账户和团队信息：</strong>姓名、电子邮件地址、密码（仅由我们的身份验证服务提供商以安全哈希形式存储）、公司名称、团队角色以及您发送的邀请。
          </li>
          <li>
            <strong>企业资料：</strong>您添加到报价单、发票及其他文档中的公司名称、标志、电话、电子邮件、地址、税务和付款条件。
          </li>
          <li>
            <strong>计费信息：</strong>账单联系人、套餐和发票。银行卡信息由 Stripe 收集和存储；我们只能看到有限的信息，例如卡组织品牌、卡号后四位和有效期。
          </li>
          <li>
            <strong>工程数据（“客户数据”）：</strong>项目、图纸集和图样、设备布置、线路和测量数据、工程量、目录和价格、报价单和估价、发票、贷项通知单和付款记录、信息请求（RFI）、变更单、表单、检查清单、任务、进度安排、每日报告、备注、文档和文件。其中可能包括您的委托方的姓名、地址、电话号码和电子邮件地址。
          </li>
          <li>
            <strong>照片及其元数据：</strong>您拍摄或上传的照片，以及说明、标签和标注。照片可能包含嵌入的元数据（EXIF），例如拍摄时间、相机型号和
            <strong>GPS 位置</strong>；Northpin 读取位置和时间，以便在工程地图和报告中定位照片。
          </li>
          <li>
            <strong>支持沟通：</strong>您联系支持团队时向我们发送的内容。
          </li>
        </ul>
        <h3>自动收集的信息</h3>
        <ul>
          <li>
            <strong>设备位置</strong>：仅在您于设备上允许的情况下收集，用于为照片添加地理标记并在地图上显示附近的工程。您可以随时在浏览器或 iOS 设置中关闭此功能。
          </li>
          <li>
            <strong>相机访问</strong>：仅在您选择在应用中拍照时使用。
          </li>
          <li>
            <strong>诊断信息：</strong>当应用遇到错误时，会向我们发送错误报告，包括：错误消息和技术堆栈跟踪、页面地址（已移除查询字符串和令牌）、浏览器或应用版本、平台，以及您已登录时的用户
            ID。在发送这些报告之前，我们会从中移除电子邮件地址和访问令牌。
          </li>
          <li>
            <strong>服务器和安全日志：</strong>我们的托管服务提供商会记录技术性请求数据，例如 IP 地址、时间、请求的地址和浏览器类型。我们使用 IP
            地址保护服务，包括进行速率限制。
          </li>
        </ul>
        <h3 id="cookies">Cookie 和本地存储</h3>
        <p>Northpin 不使用广告 Cookie、分析 Cookie 或第三方跟踪器。为了支持离线工作并保持您的登录状态，Northpin 会在您的设备上存储以下数据：</p>
        <ul>
          <li>
            <strong>您的工程</strong>：存储在浏览器的数据库（IndexedDB）或 iOS 应用的存储空间中，以便您在没有网络连接时继续工作。
          </li>
          <li>
            <strong>您的登录会话</strong>：存储在浏览器的本地存储（或 iOS 钥匙串）中，以便您保持登录状态。
          </li>
          <li>
            <strong>应用的页面</strong>：存储在浏览器的离线缓存（Service Worker）中，以便应用在没有信号时也能打开。
          </li>
          <li>
            <strong>少量偏好设置</strong>：例如您当前的团队、地图和照片设置，以及您在回复他人发送的链接时输入的姓名，这样您在该设备上就无需再次输入。
          </li>
        </ul>
        <p>
          以上所有数据都是服务正常运行所必需的。这些数据会一直保留在您的设备上，直到您退出登录并在浏览器中清除该网站的数据，或卸载应用为止。当您在网页上付款时，Stripe
          的结账和计费页面（位于 Stripe 自己的网站上）可能会根据 Stripe 的隐私政策设置其自己的 Cookie，用于付款和防范欺诈。
        </p>
        <h3>关于链接接收者的信息</h3>
        <p>
          当我们的某位客户发送报价单、方案、发票、变更单、信息请求（RFI）或照片报告链接，且接收者打开该链接时，我们可能会记录该链接已被打开以及打开时间。如果接收者作出回应（例如接受或拒绝报价单、签署变更单或回复信息请求），我们会记录其输入的姓名、签名、所选的任何选项、其备注或答复以及时间，并将这些信息提供给发送链接的客户。
        </p>
      </Section>

      <Section item={S.use} n={n(S.use)}>
        <p>我们使用信息以：</p>
        <ul>
          <li>提供服务：存储您的工程并在您的设备和团队之间同步，以及生成工程量、报价单、发票、PDF、报告和委托方链接；</li>
          {AI_ENABLED && <li>在您使用 AI 功能时运行这些功能（见下文）；</li>}
          <li>处理付款和管理订阅；</li>
          <li>发送服务电子邮件，例如登录链接、团队邀请、您发送给委托方的文档、收据和重要变更通知；</li>
          <li>提供支持，以及诊断和修复问题；</li>
          <li>保障服务和我们客户的安全、防止滥用并执行我们的条款；</li>
          <li>以汇总或去标识化的形式了解整体使用情况，以改进 Northpin；以及</li>
          <li>遵守法律义务。</li>
        </ul>
        <p>
          我们<strong>不会</strong>出售个人信息、为跨情境行为广告共享个人信息，或使用客户数据训练 AI 模型。如果我们日后发送营销电子邮件，您可以随时退订。
        </p>
        <p>
          在适用 GDPR 类法律的情况下，我们的法律依据是：履行我们与您之间的合同；我们在运营、保护和改进商业服务方面的合法利益（已与您的权利进行权衡）；您的同意，例如对设备位置的同意（您可以撤回）；以及法律义务。
        </p>
      </Section>

      {AI_ENABLED && (
        <Section item={S.ai} n={n(S.ai)}>
          <p>
            AI 功能（识读图页、建议设备位置、解读图页、为照片添加说明或起草施工日志）仅在您团队中有人使用时才会运行。届时，所涉及的一张或多张图像及相关文字（例如房间名称、说明文字、备注或您的设备目录）将被发送给
            Anthropic, PBC，并依据其商业条款进行处理。根据这些条款，Anthropic 不会使用这些数据训练其模型，但可能会出于信任与安全等目的在有限期限内保留这些数据，具体如其商业条款和政策所述。AI
            结果将作为建议返回 Northpin，必须由人员进行审核。
          </p>
        </Section>
      )}

      <Section item={S.sharing} n={n(S.sharing)}>
        <p>我们仅在以下情况下共享信息：</p>
        <ul>
          <li>
            <strong>在您的团队内部：</strong>团队成员根据其角色查看团队的工程。
          </li>
          <li>
            <strong>与您选择的人员共享：</strong>当您发送报价单、发票、报告或其他链接，或连接 Billdu 等集成服务时，我们会将相关数据发送至您指定的地方。
          </li>
          <li>
            <strong>与子处理者共享：</strong>子处理者根据限制其数据使用的合同，为我们托管和运营服务的部分内容（见下文列表）。
          </li>
          <li>
            <strong>出于法律原因：</strong>为遵守法律或有效的法律程序，或为保护我们的客户、公众或 Northpin 的权利、人身安全和安全。在允许的情况下，我们会将针对您数据的请求告知您。
          </li>
          <li>
            <strong>在业务转让中：</strong>如果 Northpin 涉及合并、收购或资产出售，以遵守本政策为前提。
          </li>
        </ul>
        <p>
          工程地图直接在您的浏览器中从 OpenStreetMap 的图块服务器加载地图图块，因此，与访问任何网站一样，这些服务器会收到您的 IP
          地址和所请求的地图区域。字体由我们自己的服务器提供，因此您的委托方打开的页面不会连接第三方字体服务。
        </p>
      </Section>

      <Section item={S.subprocessors} n={n(S.subprocessors)}>
        <SubprocessorTableZh />
        <p>
          如果您连接 Billdu，您选择发送的工程和委托方信息将根据您与 Billdu 之间的协议传送至 Billdu。最新列表始终可在“
          <Link href="/legal/subprocessors">数据子处理者</Link>”页面查看。在新增处理客户数据的子处理者之前，我们会更新该列表；客户可以通过{" "}
          <Ph>{COMPANY.privacyEmail}</Ph> 要求接收相关通知。
        </p>
      </Section>

      <Section item={S.retention} n={n(S.retention)}>
        <ul>
          <li>
            <strong>客户数据</strong>
            在您的账户存续期间予以保留。当您删除某个项目时，该项目会被标记为已删除，以便您的其他设备和团队成员的设备也将其移除；被标记的记录会保留在我们的数据库中（在应用中不可见），直至账户被删除或您要求我们将其移除。
          </li>
          <li>
            <strong>在应用中删除账户</strong>
            会立即从我们的在线数据库和文件存储中移除您的登录信息以及您的工程、文件和文档（团队成员的工程仍保留在其团队中；参见
            <Link href="/support#delete-account">支持</Link>）。
          </li>
          <li>
            <strong>订阅结束后</strong>，账户将变为只读，其数据会予以保留，以便您导出数据或日后回来继续使用。我们目前不会自动删除已结束的账户：当您在应用中删除客户数据时，或在收到账户所有者发送至{" "}
            <Ph>{COMPANY.privacyEmail}</Ph> 的书面请求后 {RETENTION.deletionRequestDays} 天内，客户数据将被删除。
          </li>
          <li>
            <strong>备份：</strong>已删除的数据会保留在我们加密的数据库备份中，直至备份到期，期限为 <Ph>{RETENTION.backupDays}</Ph> 天以内。
          </li>
          <li>
            <strong>错误报告</strong>在 {RETENTION.errorReportDays} 天后自动删除。服务器日志由我们的托管服务提供商根据其保留设置短期保存。
          </li>
          <li>
            <strong>计费记录</strong>按照税务和会计法律要求的期限保留（通常最长七年）。
          </li>
          <li>
            <strong>您设备上的数据</strong>会一直保留，直至您将其删除、退出登录并清除应用数据，或卸载应用。
          </li>
        </ul>
        <p>
          您可以随时导出您的工程，并在应用中删除您的账户；参见<Link href="/support#delete-account">支持</Link>。照片在导出或共享时会保留其原始元数据（包括 GPS
          位置），因此在向公司以外发送之前，请先进行检查。
        </p>
      </Section>

      <Section item={S.security} n={n(S.security)}>
        <p>我们采取适合商业服务的管理、技术和物理保护措施，包括：</p>
        <ul>
          <li>传输加密（HTTPS/TLS 及 HSTS），以及对我们的数据库和文件存储进行静态加密；</li>
          <li>数据库中的行级安全机制，使每个账户和团队只能访问其自己的数据，团队内部则采用基于角色的权限；</li>
          <li>服务器端密钥不进入浏览器和应用，第三方集成凭据进行静态加密（AES-256-GCM）；</li>
          <li>严格的浏览器安全标头、速率限制以及对敏感端点的滥用防护；</li>
          <li>定期的数据库备份；以及</li>
          <li>对生产系统的访问仅限于运营和支持服务所需的人员。</li>
        </ul>
        <p>
          没有任何系统是绝对安全的。如果我们获悉发生了影响您个人信息的安全事件，我们将按照法律要求通知您和有关主管机关。请将安全漏洞报告至 <Ph>{COMPANY.securityEmail}</Ph>
          。
        </p>
      </Section>

      <Section item={S.rights} n={n(S.rights)}>
        <p>视您所在地而定，您可能享有以下权利：</p>
        <ul>
          <li>了解和访问我们持有的有关您的个人信息，并获取可携带的副本；</li>
          <li>更正不准确的信息；</li>
          <li>删除您的信息；</li>
          <li>反对或限制某些处理，并在我们依赖同意进行处理时撤回同意；</li>
          <li>
            选择退出个人信息的“出售”或“共享”（我们不会在该意义上出售或共享个人信息），并限制对敏感信息（例如精确位置）的使用（我们仅将其用于提供服务）；以及
          </li>
          <li>向您当地的数据保护机构投诉。</li>
        </ul>
        <p>
          <strong>加利福尼亚州居民：</strong>在过去 12
          个月内，我们出于上述业务目的收集了标识符、商业信息（订阅）、互联网活动信息（诊断信息和日志）、地理位置信息（照片和设备位置）、音视频信息（照片）以及职业信息（公司和角色），并已向上文列出的服务提供者披露这些信息。我们未曾出售或共享个人信息，也未曾将敏感个人信息用于需要提供限制使用权的目的。我们不会因您行使权利而歧视您，您也可以通过授权代理人行使权利。我们将全球隐私控制（Global
          Privacy Control）信号视为选择退出请求予以遵从。
        </p>
        <p>
          如需提出请求，请使用应用内工具（导出、删除账户）或发送电子邮件至 <Ph>{COMPANY.privacyEmail}</Ph>
          。我们将核实您的请求（通常是确认您能访问您的账户电子邮件），并在法律规定的期限内作出答复（例如，根据加利福尼亚州法律为 45 天，根据 GDPR 为一个月）。
        </p>
      </Section>

      <Section item={S.clients} n={n(S.clients)}>
        <p>
          如果您是某家使用 Northpin 的公司的委托方（例如，您收到了报价单或信息请求），则该公司控制您的信息并决定其使用方式。如需访问、更正或删除您的信息，请联系该公司。如果您联系我们，我们会将您的请求转交给该公司，并协助其作出答复。
        </p>
      </Section>

      <Section item={S.transfers} n={n(S.transfers)}>
        <p>
          Northpin 在美国运营，并将数据存储在 <Ph>{COMPANY.dataRegion}</Ph>。如果您在美国境外使用
          Northpin，您的信息将被传输至美国并在美国进行处理。在有要求的情况下，我们依赖适当的保障措施：<Ph>{COMPANY.transferMechanism}</Ph>。
        </p>
      </Section>

      <Section item={S.children} n={n(S.children)}>
        <p>
          Northpin 是一项商业服务，并非面向儿童。我们不会在知情的情况下收集 16 岁以下任何人的个人信息。如果您认为有儿童向我们提供了个人信息，请联系我们，我们将予以删除。
        </p>
      </Section>

      <Section item={S.changes} n={n(S.changes)}>
        <p>当我们的做法发生变化时，我们将更新本政策并更改上方的生效日期。如果变更属于重大变更，我们将在变更生效前通过电子邮件或在应用内通知账户所有者。</p>
      </Section>

      <Section item={S.contact} n={n(S.contact)}>
        <p>
          问题或请求：<Ph>{COMPANY.privacyEmail}</Ph>
          <br />
          <Ph>{COMPANY.legalName}</Ph>, <Ph>{COMPANY.address}</Ph>
        </p>
      </Section>
    </>
  ),
};
