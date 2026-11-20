// The subprocessor table in Simplified Chinese (translation for convenience; /privacy and /legal/subprocessors in English govern).
// Rows come from SUBPROCESSORS in src/lib/legal.ts; a provider without a Chinese description here shows its English text.
import { Ph } from "@/components/legal/LegalDoc";
import { COMPANY, SUBPROCESSORS } from "@/lib/legal";

const ZH: Record<string, { purpose: string; data: string }> = {
  "Supabase, Inc.": {
    purpose: "数据库、用户身份验证和文件存储",
    data: "账户数据及所有已同步的客户数据（工程、图纸、照片、报价单、发票、现场记录和文件）",
  },
  "Cloudflare, Inc.": {
    purpose: "网站和应用托管、无服务器函数、内容分发、DNS 及电子邮件转发",
    data: "经由该服务传输的请求、IP 地址、服务器日志",
  },
  "Stripe, Inc.": {
    purpose: "订阅计费和支付处理",
    data: "账单联系人、公司名称、支付卡信息（由 Stripe 保存，而非我们保存）、发票",
  },
  "Resend (Plus Five Five, Inc.)": {
    purpose: "事务性电子邮件（登录链接、邀请、报价及计费通知）",
    data: "收件人的电子邮件地址和姓名、邮件内容",
  },
  "Anthropic, PBC": {
    purpose: "AI 功能：识读楼层平面图、建议设备、照片说明和施工日志草稿",
    data: "您选择发送给 AI 功能的图页图像、工程照片及相关文字",
  },
  "Apple Inc.": {
    purpose: "通过 App Store 分发 iOS 应用（以及应用内购买，如有提供）",
    data: "您通过 App Store 下载或购买时，Apple 根据其自身条款收集的信息",
  },
};

const LOCATION_ZH: Record<string, string> = {
  "United States": "美国",
  "United States (global edge network)": "美国（全球边缘网络）",
};

export default function SubprocessorTableZh() {
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>服务商</th>
            <th>用途</th>
            <th>涉及的数据</th>
            <th>所在地</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((s) => (
            <tr key={s.name}>
              <td className="font-medium whitespace-nowrap">{s.name}</td>
              <td>{ZH[s.name]?.purpose ?? s.purpose}</td>
              <td>{ZH[s.name]?.data ?? s.data}</td>
              <td>
                <Ph>{s.location === COMPANY.dataRegion ? s.location : (LOCATION_ZH[s.location] ?? s.location)}</Ph>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
