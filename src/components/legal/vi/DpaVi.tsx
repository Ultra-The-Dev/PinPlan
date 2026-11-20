// Vietnamese translation of /legal/dpa, for convenience only: the English text in src/app/legal/dpa/page.tsx governs.
// Keep the sections and ids in step with the English page.
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  scope: { id: "scope", title: "Phạm vi và vai trò" },
  instructions: { id: "instructions", title: "Xử lý theo chỉ thị của bạn" },
  people: { id: "people", title: "Nhân sự của chúng tôi" },
  security: { id: "security", title: "Bảo mật" },
  subprocessors: { id: "subprocessors", title: "Bên xử lý phụ" },
  requests: { id: "requests", title: "Hỗ trợ xử lý yêu cầu" },
  incidents: { id: "incidents", title: "Sự cố bảo mật" },
  deletion: { id: "deletion", title: "Hoàn trả và xóa" },
  audits: { id: "audits", title: "Thông tin và kiểm toán" },
  transfers: { id: "transfers", title: "Chuyển dữ liệu quốc tế" },
  ccpa: { id: "ccpa", title: "Luật về quyền riêng tư của các tiểu bang Hoa Kỳ" },
  general: { id: "general", title: "Quy định chung" },
  details: { id: "details", title: "Phụ lục: thông tin chi tiết về việc xử lý" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export const dpaVi: LegalTranslation = {
  title: "Phụ lục xử lý dữ liệu",
  toc,
  intro: (
    <p>
      Phụ lục này là một phần của <Link href="/terms">Điều khoản dịch vụ</Link> của chúng tôi và được áp dụng bất cứ khi nào chúng tôi xử lý thông tin cá nhân
      nằm trong Dữ liệu Khách hàng của bạn. Bạn không cần ký bất kỳ văn bản nào để phụ lục này có hiệu lực; nếu bạn cần một bản có chữ ký của cả hai bên, hãy gửi
      email đến <Ph>{COMPANY.privacyEmail}</Ph>.
    </p>
  ),
  children: (
    <>
      <Section item={S.scope} n={n(S.scope)}>
        <p>
          Trong phụ lục này, “chúng tôi” là <Ph>{COMPANY.legalName}</Ph> và “bạn” là khách hàng đã đồng ý với Điều khoản. Các thuật ngữ được định nghĩa trong
          Điều khoản (như Dữ liệu Khách hàng và Dịch vụ) có cùng nghĩa trong phụ lục này. Đối với thông tin cá nhân trong Dữ liệu Khách hàng, bạn là bên kiểm soát
          (hoặc doanh nghiệp) và chúng tôi là bên xử lý (hoặc nhà cung cấp dịch vụ) của bạn. Trường hợp bạn hành động thay mặt người khác, chẳng hạn một tổng thầu
          hoặc chủ sở hữu tòa nhà, chúng tôi là bên xử lý phụ của bạn.
        </p>
      </Section>

      <Section item={S.instructions} n={n(S.instructions)}>
        <p>
          Chúng tôi chỉ xử lý Dữ liệu Khách hàng để cung cấp, bảo mật và hỗ trợ Dịch vụ, theo chỉ thị bằng văn bản của bạn. Điều khoản, các cài đặt của bạn và cách
          bạn cùng Người dùng của bạn sử dụng Dịch vụ là chỉ thị của bạn. Nếu chúng tôi cho rằng một chỉ thị vi phạm pháp luật về bảo vệ dữ liệu, chúng tôi sẽ thông
          báo cho bạn. Ngoài ra, chúng tôi chỉ xử lý Dữ liệu Khách hàng khi pháp luật yêu cầu, và sẽ thông báo trước cho bạn trừ khi pháp luật ngăn cấm việc đó.
        </p>
      </Section>

      <Section item={S.people} n={n(S.people)}>
        <p>
          Những người có thể truy cập Dữ liệu Khách hàng đều bị ràng buộc bởi nghĩa vụ bảo mật và chỉ được cấp quyền truy cập khi cần để vận hành hoặc hỗ trợ Dịch
          vụ.
        </p>
      </Section>

      <Section item={S.security} n={n(S.security)}>
        <p>
          Chúng tôi duy trì các biện pháp kỹ thuật và tổ chức phù hợp để bảo vệ Dữ liệu Khách hàng, bao gồm các biện pháp được mô tả trong{" "}
          <Link href="/privacy#security">mục Bảo mật của Chính sách quyền riêng tư</Link>: mã hóa khi truyền và khi lưu trữ, bảo mật cấp hàng trong cơ sở dữ liệu
          để tách biệt dữ liệu của từng công ty, quyền truy cập theo vai trò trong một nhóm, hạn chế quyền truy cập vào môi trường vận hành thực tế và sao lưu định
          kỳ. Chúng tôi có thể cập nhật các biện pháp này miễn là mức độ bảo vệ tổng thể không bị giảm.
        </p>
      </Section>

      <Section item={S.subprocessors} n={n(S.subprocessors)}>
        <p>
          Bạn cho phép các bên xử lý phụ có trong <Link href="/legal/subprocessors">danh sách bên xử lý phụ</Link> của chúng tôi. Chúng tôi ràng buộc từng bên
          bằng các điều khoản bảo vệ dữ liệu có mức độ bảo vệ ít nhất tương đương phụ lục này và vẫn chịu trách nhiệm về công việc của họ. Chúng tôi sẽ cập nhật danh
          sách trước khi một bên xử lý phụ mới bắt đầu xử lý Dữ liệu Khách hàng và gửi email cho bạn nếu bạn đã yêu cầu được thông báo qua{" "}
          <Ph>{COMPANY.privacyEmail}</Ph>. Bạn có thể phản đối dựa trên lý do hợp lý về bảo vệ dữ liệu trong vòng 30 ngày; nếu chúng tôi không thể giải quyết sự
          phản đối đó, bạn có thể chấm dứt phần Dịch vụ bị ảnh hưởng và được hoàn lại khoản phí đã trả trước cho phần đó.
        </p>
      </Section>

      <Section item={S.requests} n={n(S.requests)}>
        <p>
          Dịch vụ cho phép bạn tự truy cập, chỉnh sửa, xuất và xóa Dữ liệu Khách hàng. Nếu chúng tôi nhận được yêu cầu từ một Người dùng hoặc một Khách hàng của
          bạn liên quan đến Dữ liệu Khách hàng, chúng tôi sẽ chuyển yêu cầu đó cho bạn và không tự trả lời trừ khi bạn đề nghị chúng tôi làm vậy. Chúng tôi sẽ hỗ
          trợ bạn một cách hợp lý đối với những yêu cầu mà bạn không thể xử lý trong Dịch vụ, cũng như đối với việc đánh giá tác động bảo vệ dữ liệu và tham vấn
          với cơ quan có thẩm quyền, trong phạm vi liên quan đến Dịch vụ.
        </p>
      </Section>

      <Section item={S.incidents} n={n(S.incidents)}>
        <p>
          Nếu chúng tôi biết về một vi phạm bảo mật dẫn đến việc truy cập trái phép, hoặc làm mất, thay đổi hay tiết lộ Dữ liệu Khách hàng, chúng tôi sẽ thông báo
          cho bạn mà không chậm trễ quá mức, mô tả những gì đã xảy ra và những gì chúng tôi đang làm để xử lý khi có thêm thông tin, đồng thời hỗ trợ bạn thực hiện
          nghĩa vụ thông báo của chính bạn.
        </p>
      </Section>

      <Section item={S.deletion} n={n(S.deletion)}>
        <p>
          Bạn có thể xuất Dữ liệu Khách hàng bất cứ lúc nào khi tài khoản của bạn còn tồn tại, kể cả sau khi thuê bao của bạn kết thúc. Chúng tôi xóa Dữ liệu Khách
          hàng khi bạn xóa tài khoản trong Dịch vụ, hoặc trong vòng {RETENTION.deletionRequestDays} ngày kể từ khi nhận được yêu cầu bằng văn bản của bạn gửi đến{" "}
          <Ph>{COMPANY.privacyEmail}</Ph>. Dữ liệu đã xóa vẫn còn trong các bản sao lưu được mã hóa cho đến khi chúng hết hạn, trong vòng{" "}
          <Ph>{RETENTION.backupDays}</Ph> ngày, trừ khi pháp luật yêu cầu chúng tôi lưu giữ lâu hơn.
        </p>
      </Section>

      <Section item={S.audits} n={n(S.audits)}>
        <p>
          Theo yêu cầu bằng văn bản, không quá một lần mỗi năm (hoặc sau một sự cố bảo mật), chúng tôi sẽ trả lời các câu hỏi hợp lý về cách chúng tôi bảo vệ Dữ
          liệu Khách hàng và chia sẻ các bản tóm tắt liên quan về chứng nhận và báo cáo bảo mật của các bên xử lý phụ của chúng tôi. Mọi cuộc kiểm toán vượt quá
          phạm vi đó phải được hai bên thỏa thuận, do bạn chịu chi phí, với thông báo trước hợp lý và cam kết bảo mật.
        </p>
      </Section>

      <Section item={S.transfers} n={n(S.transfers)}>
        <p>
          Chúng tôi lưu trữ Dữ liệu Khách hàng tại <Ph>{COMPANY.dataRegion}</Ph> và xử lý dữ liệu đó tại Hoa Kỳ. Trường hợp pháp luật về bảo vệ dữ liệu yêu cầu một
          cơ chế chuyển giao đối với thông tin cá nhân được gửi đến chúng tôi từ bên ngoài Hoa Kỳ, chúng tôi dựa vào <Ph>{COMPANY.transferMechanism}</Ph>.
        </p>
      </Section>

      <Section item={S.ccpa} n={n(S.ccpa)}>
        <p>
          Trường hợp Đạo luật Quyền riêng tư của Người tiêu dùng California (CCPA) hoặc một luật tương tự của tiểu bang Hoa Kỳ được áp dụng, chúng tôi đóng vai trò
          là nhà cung cấp dịch vụ (hoặc bên xử lý) của bạn. Chúng tôi sẽ không bán hoặc chia sẻ thông tin cá nhân từ Dữ liệu Khách hàng; không lưu giữ, sử dụng
          hoặc tiết lộ thông tin đó ngoài phạm vi quan hệ kinh doanh trực tiếp giữa chúng tôi với bạn hoặc cho bất kỳ mục đích nào khác ngoài việc cung cấp Dịch
          vụ; và không kết hợp thông tin đó với thông tin cá nhân chúng tôi nhận được từ người khác, trừ khi các luật đó cho phép. Chúng tôi sẽ thông báo cho bạn
          nếu chúng tôi không còn có thể đáp ứng các nghĩa vụ này.
        </p>
      </Section>

      <Section item={S.general} n={n(S.general)}>
        <p>
          Phụ lục này có hiệu lực trong suốt thời gian chúng tôi xử lý Dữ liệu Khách hàng cho bạn. Các giới hạn trách nhiệm trong Điều khoản được áp dụng cho phụ
          lục này. Nếu phụ lục này mâu thuẫn với Điều khoản về việc xử lý thông tin cá nhân, phụ lục này được ưu tiên áp dụng.
        </p>
      </Section>

      <Section item={S.details} n={n(S.details)}>
        <table>
          <tbody>
            <tr>
              <th>Đối tượng và mục đích</th>
              <td>Cung cấp Dịch vụ: lưu trữ, đồng bộ và hiển thị Dữ liệu Khách hàng, tạo tài liệu và liên kết, và hỗ trợ.</td>
            </tr>
            <tr>
              <th>Thời hạn</th>
              <td>Trong suốt thời gian tài khoản của bạn tồn tại, sau đó cho đến khi dữ liệu bị xóa như mô tả ở trên.</td>
            </tr>
            <tr>
              <th>Bản chất của việc xử lý</th>
              <td>Lưu trữ (hosting), lưu giữ, truyền tải, hiển thị, sao lưu, xóa và các thao tác khác cần thiết để cung cấp Dịch vụ.</td>
            </tr>
            <tr>
              <th>Những người liên quan</th>
              <td>
                Người dùng của bạn; Khách hàng của bạn và người liên hệ của họ; những người có tên trong bản vẽ, ảnh, tài liệu và hồ sơ công trình; người nhận các
                liên kết bạn gửi.
              </td>
            </tr>
            <tr>
              <th>Thông tin cá nhân</th>
              <td>
                Họ tên, địa chỉ email, số điện thoại và địa chỉ bưu chính; địa chỉ công trường; chữ ký; ảnh cùng siêu dữ liệu về thời gian và vị trí của ảnh; ghi
                chú, câu trả lời và nội dung khác do bạn hoặc Khách hàng của bạn thêm vào.
              </td>
            </tr>
            <tr>
              <th>Thông tin nhạy cảm</th>
              <td>
                Không nhằm mục đích này. Điều khoản yêu cầu bạn không lưu trữ thông tin nhạy cảm như số giấy tờ tùy thân do nhà nước cấp, thông tin sức khỏe hoặc
                mã truy cập.
              </td>
            </tr>
          </tbody>
        </table>
      </Section>
    </>
  ),
};
