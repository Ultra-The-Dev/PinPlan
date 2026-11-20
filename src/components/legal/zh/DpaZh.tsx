// Simplified Chinese translation of /legal/dpa, for convenience only: the English text in src/app/legal/dpa/page.tsx governs.
// Keep the sections and ids in step with the English page.
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  scope: { id: "scope", title: "范围和角色" },
  instructions: { id: "instructions", title: "按照您的指示进行处理" },
  people: { id: "people", title: "我们的人员" },
  security: { id: "security", title: "安全" },
  subprocessors: { id: "subprocessors", title: "数据子处理者" },
  requests: { id: "requests", title: "协助处理请求" },
  incidents: { id: "incidents", title: "安全事件" },
  deletion: { id: "deletion", title: "返还和删除" },
  audits: { id: "audits", title: "信息和审计" },
  transfers: { id: "transfers", title: "跨境传输" },
  ccpa: { id: "ccpa", title: "美国各州隐私法律" },
  general: { id: "general", title: "一般规定" },
  details: { id: "details", title: "附件：处理详情" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export const dpaZh: LegalTranslation = {
  title: "数据处理附录",
  toc,
  intro: (
    <p>
      本附录是我们的<Link href="/terms">服务条款</Link>的一部分，适用于我们处理您的客户数据中所含个人信息的一切情形。本附录无需您签署任何文件即可适用；如需经我方会签的副本，请发送电子邮件至{" "}
      <Ph>{COMPANY.privacyEmail}</Ph>。
    </p>
  ),
  children: (
    <>
      <Section item={S.scope} n={n(S.scope)}>
        <p>
          在本附录中，“我们”是指 <Ph>{COMPANY.legalName}</Ph>，“您”是指同意本条款的客户。在条款中定义的术语（例如客户数据和服务）在本附录中具有相同含义。对于客户数据中的个人信息，您是控制者（或“企业”），我们是您的处理者（或服务提供者）。如果您代表他人行事（例如总承包商或建筑物业主），则我们是您的子处理者。
        </p>
      </Section>

      <Section item={S.instructions} n={n(S.instructions)}>
        <p>
          我们仅为提供、保护和支持服务之目的，按照您的书面指示处理客户数据。条款、您的设置以及您和您的用户使用服务的方式即构成您的指示。如果我们认为某项指示违反数据保护法律，我们将告知您。除此之外，我们仅在法律要求时处理客户数据，并将事先告知您，除非法律禁止我们这样做。
        </p>
      </Section>

      <Section item={S.people} n={n(S.people)}>
        <p>能够访问客户数据的人员均负有保密义务，并且仅在运营或支持服务需要时才获得访问权限。</p>
      </Section>

      <Section item={S.security} n={n(S.security)}>
        <p>
          我们采取适当的技术和组织措施保护客户数据，包括我们
          <Link href="/privacy#security">隐私政策“安全”一节</Link>
          所述的措施：传输加密和静态加密、用于隔离各公司数据的数据库行级安全机制、团队内部基于角色的访问控制、受限的生产环境访问以及定期备份。只要整体保护水平不降低，我们可以更新这些措施。
        </p>
      </Section>

      <Section item={S.subprocessors} n={n(S.subprocessors)}>
        <p>
          您授权我们使用<Link href="/legal/subprocessors">子处理者列表</Link>
          中所列的子处理者。我们要求每一个子处理者遵守至少与本附录同等保护程度的数据保护条款，并对其工作承担责任。在新的子处理者开始处理客户数据之前，我们将更新该列表；如果您已通过{" "}
          <Ph>{COMPANY.privacyEmail}</Ph> 要求接收通知，我们还将向您发送电子邮件。您可以在 30
          天内基于合理的数据保护理由提出异议；如果我们无法解决您的异议，您可以终止服务中受影响的部分，并获得该部分预付费用的退款。
        </p>
      </Section>

      <Section item={S.requests} n={n(S.requests)}>
        <p>
          服务使您能够自行访问、更正、导出和删除客户数据。如果我们收到您的某位用户或委托方关于客户数据的请求，我们会将其转交给您，除非您要求我们答复，否则我们不会自行答复。对于您无法在服务中处理的请求，以及与服务相关的数据保护影响评估和与主管机关的协商，我们将为您提供合理协助。
        </p>
      </Section>

      <Section item={S.incidents} n={n(S.incidents)}>
        <p>
          如果我们获悉发生了导致客户数据遭受未经授权的访问、丢失、更改或披露的安全违规事件，我们将及时通知您，不作不当延误；随着我们了解到更多情况，我们将说明发生了什么以及我们正在采取的措施，并协助您履行您自己的通知义务。
        </p>
      </Section>

      <Section item={S.deletion} n={n(S.deletion)}>
        <p>
          在您的账户存续期间（包括订阅结束之后），您可以随时导出客户数据。当您在服务中删除账户时，或在收到您发送至 <Ph>{COMPANY.privacyEmail}</Ph> 的书面请求后{" "}
          {RETENTION.deletionRequestDays} 天内，我们将删除客户数据。已删除的数据会保留在加密备份中，直至备份到期，期限为 <Ph>{RETENTION.backupDays}</Ph>{" "}
          天以内，除非法律要求我们保留更长时间。
        </p>
      </Section>

      <Section item={S.audits} n={n(S.audits)}>
        <p>
          经书面请求，每年不超过一次（或在发生安全事件之后），我们将回答有关我们如何保护客户数据的合理问题，并提供我们的子处理者的安全认证和报告的相关摘要。超出上述范围的任何审计须经双方协商一致，费用由您承担，并须提前合理通知且遵守保密要求。
        </p>
      </Section>

      <Section item={S.transfers} n={n(S.transfers)}>
        <p>
          我们将客户数据存储在 <Ph>{COMPANY.dataRegion}</Ph>，并在美国进行处理。如果数据保护法律要求对从美国境外发送给我们的个人信息采用传输机制，我们依赖{" "}
          <Ph>{COMPANY.transferMechanism}</Ph>。
        </p>
      </Section>

      <Section item={S.ccpa} n={n(S.ccpa)}>
        <p>
          在适用《加利福尼亚州消费者隐私法》（California Consumer Privacy Act）或美国其他州类似法律的情况下，我们作为您的服务提供者（或处理者）行事。我们不会出售或共享客户数据中的个人信息，不会在我们与您的直接业务关系之外或为提供服务以外的任何目的保留、使用或披露这些信息，也不会将其与我们从他人处获得的个人信息相结合，但上述法律允许的情况除外。如果我们无法再履行这些义务，我们将告知您。
        </p>
      </Section>

      <Section item={S.general} n={n(S.general)}>
        <p>
          本附录在我们为您处理客户数据期间持续有效。条款中的责任限制适用于本附录。如果本附录与条款在个人信息处理方面存在冲突，以本附录为准。
        </p>
      </Section>

      <Section item={S.details} n={n(S.details)}>
        <table>
          <tbody>
            <tr>
              <th>处理事项和目的</th>
              <td>提供服务：存储、同步和显示客户数据，生成文档和链接，以及提供支持。</td>
            </tr>
            <tr>
              <th>期限</th>
              <td>在您的账户存续期间，之后直至按上文所述删除为止。</td>
            </tr>
            <tr>
              <th>处理性质</th>
              <td>托管、存储、传输、显示、备份、删除以及提供服务所需的其他操作。</td>
            </tr>
            <tr>
              <th>涉及的人员</th>
              <td>您的用户；您的委托方及其联系人；图纸、照片、文档和工程记录中提及的人员；您所发送链接的接收者。</td>
            </tr>
            <tr>
              <th>个人信息</th>
              <td>姓名、电子邮件地址、电话号码和邮寄地址；施工现场地址；签名；照片及其时间和位置元数据；您或您的委托方添加的备注、答复和其他内容。</td>
            </tr>
            <tr>
              <th>敏感信息</th>
              <td>不在预期范围内。条款要求您不要存储政府身份证件号码、健康信息或访问码等敏感信息。</td>
            </tr>
          </tbody>
        </table>
      </Section>
    </>
  ),
};
