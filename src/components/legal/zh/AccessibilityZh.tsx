// Simplified Chinese translation of /accessibility, for convenience only: the English page governs. Keep it in step.
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { COMPANY } from "@/lib/legal";

const S = {
  goal: { id: "goal", title: "我们的目标" },
  done: { id: "done", title: "我们的做法" },
  limits: { id: "limitations", title: "已知限制" },
  feedback: { id: "feedback", title: "向我们报告障碍" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);

export const accessibilityZh: LegalTranslation = {
  title: "无障碍",
  toc,
  intro: <p>我们希望班组、办公室和委托方的每一个人，无论使用何种设备或辅助技术，都能使用 Northpin。</p>,
  children: (
    <>
      <Section item={S.goal}>
        <p>
          我们的目标是在我们的网站、网页应用以及您的委托方打开的页面（报价单、发票、变更单、信息请求（RFI）和照片报告）上达到{" "}
          <a href="https://www.w3.org/TR/WCAG22/" rel="noopener noreferrer">
            《Web 内容无障碍指南》（WCAG）2.2
          </a>{" "}
          的 AA 级标准。这是我们努力实现的目标，并非声明目前每个页面都已达到该标准。
        </p>
      </Section>

      <Section item={S.done}>
        <ul>
          <li>文字和控件按高对比度设计；公共网站可通过键盘使用，具有清晰可见的焦点指示和跳转链接。</li>
          <li>页面使用规范的标题、标签和地标，便于屏幕阅读器在页面中导航。</li>
          <li>页面可在手机、平板电脑和台式电脑上自适应排版，公共网站会遵循您设备上的“减少动态效果”设置。</li>
          <li>图纸上的设备以字母和名称标示，而不仅仅依靠颜色区分，并且数量统计始终以表格形式提供。</li>
        </ul>
      </Section>

      <Section item={S.limits}>
        <ul>
          <li>
            <strong>在图纸上放置设备</strong>
            需要在图样上使用触摸、触控笔或鼠标操作。由图纸生成的数量统计、报价单和清单可以通过键盘和屏幕阅读器阅读和编辑，但目前还无法通过这些方式将设备标注在图样上的某个位置。
          </li>
          <li>
            <strong>双指缩放</strong>在浏览器中已被关闭，以便双指捏合时缩放的是图纸而不是页面。如需放大文字，请使用浏览器的文字大小或缩放设置。
          </li>
          <li>
            <strong>图页</strong>是您上传的图样的图像，因此其中文字的可读性取决于原始文件。
          </li>
          <li>
            <strong>PDF 导出文件</strong>（数量统计、报价单、发票、报告）目前尚未针对屏幕阅读器添加标记。相同的信息可在屏幕上查看，也可导出为 CSV。
          </li>
          <li>
            <strong>贵公司撰写的文档</strong>（报价单和报告中的条款、备注、照片和说明文字）的无障碍程度取决于其内容。
          </li>
        </ul>
      </Section>

      <Section item={S.feedback}>
        <p>
          如果您在使用 Northpin 的某项内容时遇到困难或无法使用，请发送电子邮件至 <Ph>{COMPANY.supportEmail}</Ph>
          ，说明所在的页面或屏幕、您当时想要完成的操作，以及您使用的设备和辅助技术。我们力争在两个工作日内答复，并将与您一起找到解决办法或完成工作的其他方式。Northpin
          客户的委托方也可以请求向其发送链接的公司以其他格式提供文档。
        </p>
      </Section>
    </>
  ),
};
