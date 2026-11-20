// Simplified Chinese translation of /legal/subprocessors, for convenience only: the English page governs.
import Link from "next/link";
import { Ph, type LegalTranslation } from "@/components/legal/LegalDoc";
import { COMPANY } from "@/lib/legal";
import SubprocessorTableZh from "./SubprocessorTableZh";

export const subprocessorsZh: LegalTranslation = {
  title: "数据子处理者",
  intro: (
    <p>
      以下公司为我们托管和运营 Northpin 的部分服务，并可能代表我们处理客户数据。每家公司均受合同约束，该合同将其对数据的使用限于向我们提供其服务。关于我们如何处理数据，请参阅我们的
      <Link href="/privacy">隐私政策</Link>和<Link href="/legal/dpa">数据处理附录</Link>。
    </p>
  ),
  children: (
    <>
      <h2 id="list">当前的子处理者</h2>
      <SubprocessorTableZh />

      <h2 id="not-subprocessors">您自行选择使用的服务</h2>
      <p>
        如果您连接 Billdu 等集成服务，您选择发送的工程和委托方信息将根据您与该服务提供商之间的协议传送至该服务；该服务不是我们的子处理者。工程地图直接在您的浏览器中从
        OpenStreetMap 加载地图图块，OpenStreetMap 会收到您的 IP 地址和所显示的地图区域，但不会收到任何客户数据。
      </p>

      <h2 id="changes">本列表的变更</h2>
      <p>
        在新的子处理者开始处理客户数据之前，我们会更新本页面。如需在列表变更时收到电子邮件通知，请使用您的账户电子邮件地址写信至 <Ph>{COMPANY.privacyEmail}</Ph>
        。受我们数据处理附录约束的客户可以按照该附录所述的方式对新的子处理者提出异议。
      </p>
    </>
  ),
};
