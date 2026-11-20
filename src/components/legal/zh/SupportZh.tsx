// Simplified Chinese version of /support. The English page (src/app/support/page.tsx) governs where the account-deletion
// and data-export wording matters; keep the sections, ids, steps and conditions (AI_ENABLED) in step with it. Menu names
// follow the app's Chinese dictionary (docs/i18n.md).
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import StatusCheck from "@/components/legal/StatusCheck";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  contact: { id: "contact", title: "联系我们" },
  status: { id: "status", title: "服务状态" },
  faq: { id: "faq", title: "常见问题" },
  export: { id: "export", title: "导出您的数据" },
  deleteAccount: { id: "delete-account", title: "删除您的账号" },
  security: { id: "security", title: "报告安全问题" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);

const FAQ: { q: string; a: React.ReactNode; onlyWhen?: "ai" }[] = [
  {
    q: "没有信号时 Northpin 还能用吗？",
    a: "能。工程、图纸和照片会先保存在您的设备上，因此在没有网络连接时也可以继续标注设备和拍照。恢复联网后，更改会自动同步到您的团队。页面顶部的云朵图标会显示仍在等待上传的内容。",
  },
  {
    q: "我的数据存储在哪里？",
    a: (
      <>
        存储在您的设备上；在您登录后，还会存储在由 Supabase 托管、位于 <Ph>{COMPANY.dataRegion}</Ph>{" "}
        的云数据库和文件存储中，传输和存储时均已加密。完整的服务提供商列表请参阅<Link href="/privacy">隐私政策</Link>。
      </>
    ),
  },
  {
    q: "我的数据会被用于训练 AI 吗？",
    a: "不会。AI 功能（识读图纸、建议设备、照片说明、施工日志草稿）仅在您使用时运行。所涉及的图像和文字由 Anthropic 根据其商业条款处理，这些条款不允许使用这些数据进行训练。在有人接受之前，AI 建议绝不会计入工程量或价格。",
    onlyWhen: "ai",
  },
  {
    q: "如何添加办公室人员和技术员？",
    a: "打开“设置 → 团队”并邀请他们。技术员可以处理图纸、照片、检查清单和任务；在他们的账号中，应用会隐藏价格、报价单和发票。每个人都有自己的登录账号。",
  },
  {
    q: "如何更改或取消订阅？",
    a: (
      <>
        团队所有者可以在“设置 → 套餐与付费”中更改套餐或取消订阅；取消将在当前周期结束时生效。如果您是通过 App Store 订阅的，请在 iOS“设置”→ 您的姓名 →“订阅”中管理。套餐详情请参阅
        <Link href="/pricing">价格</Link>页面。
      </>
    ),
  },
  {
    q: "照片显示的位置不对，或者根本没有位置。",
    a: "Northpin 读取相机保存在照片中的 GPS 位置。请确认您的相机应用已获准访问位置信息（如果在应用内拍照，Northpin 也需要获准）。通过某些即时通讯应用发送的照片会被移除位置信息。",
  },
  {
    q: "我无法登录，或者没有收到电子邮件。",
    a: (
      <>
        请在垃圾邮件文件夹中查找来自 Northpin 的邮件，并确认您使用的是团队邀请您时所用的同一电子邮件地址。仍然无法解决？请用该地址发送电子邮件至{" "}
        <Ph>{COMPANY.supportEmail}</Ph>，我们会为您提供帮助。
      </>
    ),
  },
  {
    q: "应用出了问题。",
    a: "请重新加载页面或重新打开应用，您的工作已保存在设备上。如果出现错误页面，请点按“复制详细信息”，然后粘贴到发给支持团队的电子邮件中，以便我们迅速找到问题。",
  },
];

export const supportZh: LegalTranslation = {
  title: "支持",
  toc,
  intro: <p>我们是一个小团队，为电气、弱电及其他专业工种承包商打造 Northpin。每一条消息都由真人回复。</p>,
  children: (
    <>
      <Section item={S.contact}>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">电子邮件支持</p>
            <p className="mt-1">
              <Ph>{COMPANY.supportEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">
              我们会在一个工作日内回复（美国工作时间，<Ph>{COMPANY.supportTimeZone}</Ph>）。请注明您的公司名称；如果遇到问题，请说明您当时在做什么，并附上屏幕截图或复制的错误详细信息。
            </p>
          </div>
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">隐私和数据请求</p>
            <p className="mt-1">
              <Ph>{COMPANY.privacyEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">用于提出访问、导出或删除请求。请从您的账号电子邮件地址发送，以便我们进行核实。</p>
          </div>
        </div>
        <p>请勿通过电子邮件发送密码、API 密钥或支付卡号。我们绝不会索要这些信息。</p>
      </Section>

      <Section item={S.status}>
        <div className="mk-sheet mt-4 p-5">
          <StatusCheck />
          <p className="mt-3 text-sm text-mk-pencil">
            实时检查我们的服务器和数据库：<a href="/api/health">/api/health</a>
          </p>
        </div>
      </Section>

      <Section item={S.faq}>
        <div className="mt-4 divide-y divide-mk-rule mk-sheet">
          {FAQ.filter((f) => f.onlyWhen !== "ai" || AI_ENABLED).map((f) => (
            <details key={f.q} className="group px-5 py-4 [&_p]:mt-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-mk-graphite [&::-webkit-details-marker]:hidden">
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
        <p>您的工程归您所有。您可以随时将其导出，包括在订阅结束之后（账号仍可读取）。</p>
        <ul>
          <li>
            <strong>整个工程，包括图纸、标注、照片和价格：</strong>打开工程 → <strong>概览</strong>选项卡 → <strong>备份</strong> →{" "}
            <strong>下载备份</strong>。这会保存一个文件，Northpin 可以在任何设备上恢复该文件（工程 → <strong>恢复备份</strong>）。
          </li>
          <li>
            <strong>工程量、价格和报告：</strong>在工程的<strong>工程量</strong>、<strong>财务</strong>（价格部分）、<strong>图纸</strong>和
            <strong>现场</strong>选项卡中下载 PDF 和 CSV 文件。
          </li>
          <li>
            <strong>您的价目表：</strong>
            <strong>价目表</strong> → 下载 CSV。
          </li>
          <li>
            <strong>一次性导出全部内容：</strong>请从团队所有者的电子邮件地址发送邮件至 <Ph>{COMPANY.supportEmail}</Ph>，我们将在{" "}
            {RETENTION.deletionRequestDays} 天内发送您账号数据的完整导出文件。
          </li>
        </ul>
      </Section>

      <Section item={S.deleteAccount}>
        <p>您可以自行删除您的账号：</p>
        <ol>
          <li>
            在网页应用或 iOS 应用中，打开<strong>设置 → 账号</strong>。
          </li>
          <li>
            选择<strong>删除账号</strong>并确认。
          </li>
        </ol>
        <p>接下来会发生什么：</p>
        <ul>
          <li>您的登录账号会被立即移除，并且您会在所有设备上退出登录。</li>
          <li>
            如果您是<strong>团队所有者</strong>，删除您的账号也会删除团队的工程、照片和文档。如果公司将继续使用 Northpin，请先转移所有权（设置 → 团队），并在 iOS
            设置中取消任何 App Store 订阅。
          </li>
          <li>如果您是团队成员，您的工程仍保留在您的团队中；只有您的登录账号和个人信息会被移除。</li>
          <li>
            您的数据会立即从我们的在线数据库和文件存储中移除，并随备份到期而从备份中移除，具体如<Link href="/privacy#retention">隐私政策</Link>
            所述。保存在您自己设备上的副本会一直保留，直至您删除应用或其数据。
          </li>
        </ul>
        <p>
          无法登录？请从您的账号电子邮件地址发送邮件至 <Ph>{COMPANY.privacyEmail}</Ph>，主题为“Delete my account”（删除我的账号）；在确认是您本人后，我们将在收到您邮件后的{" "}
          {RETENTION.deletionRequestDays} 天内为您删除。
        </p>
      </Section>

      <Section item={S.security}>
        <p>
          如果您认为发现了安全漏洞，请将详细信息通过电子邮件发送至 <Ph>{COMPANY.securityEmail}</Ph>
          。在公开披露之前，请给我们合理的时间进行修复；测试期间，请勿访问其他客户的数据或干扰服务的运行。我们感谢负责任的报告。
        </p>
      </Section>
    </>
  ),
};
