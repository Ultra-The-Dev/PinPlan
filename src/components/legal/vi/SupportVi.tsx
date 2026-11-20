// Vietnamese version of /support. The English page (src/app/support/page.tsx) governs where the account-deletion and
// data-export wording matters; keep the sections, ids, steps and conditions (AI_ENABLED) in step with it. Menu names
// follow the app's Vietnamese dictionary (docs/i18n.md).
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import StatusCheck from "@/components/legal/StatusCheck";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  contact: { id: "contact", title: "Liên hệ với chúng tôi" },
  status: { id: "status", title: "Trạng thái dịch vụ" },
  faq: { id: "faq", title: "Câu hỏi thường gặp" },
  export: { id: "export", title: "Xuất dữ liệu của bạn" },
  deleteAccount: { id: "delete-account", title: "Xóa tài khoản của bạn" },
  security: { id: "security", title: "Báo cáo sự cố bảo mật" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);

const FAQ: { q: string; a: React.ReactNode; onlyWhen?: "ai" }[] = [
  {
    q: "Northpin có hoạt động khi không có sóng không?",
    a: "Có. Công trình, bản vẽ và ảnh được lưu trên thiết bị của bạn trước, vì vậy bạn có thể tiếp tục ghim thiết bị và chụp ảnh khi không có kết nối. Khi có mạng trở lại, các thay đổi sẽ tự động đồng bộ với nhóm của bạn. Biểu tượng đám mây ở đầu trang cho biết những gì vẫn đang chờ tải lên.",
  },
  {
    q: "Dữ liệu của tôi được lưu trữ ở đâu?",
    a: (
      <>
        Trên thiết bị của bạn, và — khi bạn đã đăng nhập — trong cơ sở dữ liệu đám mây và kho lưu trữ tệp của chúng tôi do Supabase lưu trữ tại{" "}
        <Ph>{COMPANY.dataRegion}</Ph>, được mã hóa khi truyền và khi lưu trữ. Xem <Link href="/privacy">Chính sách quyền riêng tư</Link> để biết danh sách đầy
        đủ các nhà cung cấp.
      </>
    ),
  },
  {
    q: "Dữ liệu của tôi có được dùng để huấn luyện AI không?",
    a: "Không. Các tính năng AI (đọc bản vẽ, gợi ý thiết bị, chú thích ảnh, bản nháp nhật ký hằng ngày) chỉ chạy khi bạn sử dụng chúng. Hình ảnh và văn bản liên quan được Anthropic xử lý theo điều khoản thương mại của họ, vốn không cho phép huấn luyện trên dữ liệu này. Gợi ý của AI không bao giờ được tính vào bóc khối lượng hay vào giá cho đến khi có người chấp nhận chúng.",
    onlyWhen: "ai",
  },
  {
    q: "Làm cách nào để thêm nhân viên văn phòng và kỹ thuật viên?",
    a: "Mở Cài đặt → Nhóm và mời họ. Kỹ thuật viên có thể làm việc với bản vẽ, ảnh, danh sách kiểm tra và việc; tài khoản đăng nhập của họ ẩn giá, báo giá và hóa đơn trong ứng dụng. Mỗi người có tài khoản đăng nhập riêng.",
  },
  {
    q: "Làm cách nào để thay đổi hoặc hủy gói thuê bao?",
    a: (
      <>
        Chủ sở hữu nhóm có thể đổi gói hoặc hủy trong Cài đặt → Gói và thanh toán; việc hủy có hiệu lực vào cuối kỳ hiện tại. Nếu bạn đăng ký qua App Store, hãy
        quản lý thuê bao trong Cài đặt iOS → tên của bạn → Đăng ký. Xem trang <Link href="/pricing">Giá</Link> để biết các gói.
      </>
    ),
  },
  {
    q: "Ảnh hiển thị sai vị trí hoặc không có vị trí.",
    a: "Northpin đọc vị trí GPS mà máy ảnh đã lưu trong ảnh. Hãy đảm bảo ứng dụng máy ảnh được phép truy cập vị trí (và cả Northpin khi chụp ảnh trong ứng dụng). Ảnh gửi qua một số ứng dụng nhắn tin sẽ bị xóa thông tin vị trí.",
  },
  {
    q: "Tôi không đăng nhập được hoặc không nhận được email.",
    a: (
      <>
        Hãy kiểm tra thư mục thư rác để tìm thư từ Northpin, và đảm bảo bạn đang dùng đúng email mà nhóm của bạn đã mời. Vẫn chưa được? Hãy gửi email đến{" "}
        <Ph>{COMPANY.supportEmail}</Ph> từ địa chỉ đó và chúng tôi sẽ giúp bạn.
      </>
    ),
  },
  {
    q: "Đã xảy ra lỗi trong ứng dụng.",
    a: "Hãy tải lại trang hoặc mở lại ứng dụng — công việc của bạn đã được lưu trên thiết bị. Nếu màn hình báo lỗi xuất hiện, hãy chạm vào “Sao chép chi tiết” và dán vào email gửi bộ phận hỗ trợ để chúng tôi nhanh chóng tìm ra vấn đề.",
  },
];

export const supportVi: LegalTranslation = {
  title: "Hỗ trợ",
  toc,
  intro: (
    <p>
      Chúng tôi là một nhóm nhỏ xây dựng Northpin cho các nhà thầu điện, điện nhẹ và các hệ thống chuyên ngành. Mọi tin nhắn đều do người thật trả lời.
    </p>
  ),
  children: (
    <>
      <Section item={S.contact}>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">Hỗ trợ qua email</p>
            <p className="mt-1">
              <Ph>{COMPANY.supportEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">
              Chúng tôi trả lời trong vòng một ngày làm việc (theo giờ Hoa Kỳ, <Ph>{COMPANY.supportTimeZone}</Ph>). Hãy ghi tên công ty của bạn và, nếu gặp sự cố,
              cho biết bạn đang làm gì kèm ảnh chụp màn hình hoặc chi tiết lỗi đã sao chép.
            </p>
          </div>
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">Quyền riêng tư và yêu cầu về dữ liệu</p>
            <p className="mt-1">
              <Ph>{COMPANY.privacyEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">
              Dành cho các yêu cầu truy cập, xuất hoặc xóa dữ liệu. Vui lòng gửi từ email tài khoản của bạn để chúng tôi có thể xác minh.
            </p>
          </div>
        </div>
        <p>Vui lòng không bao giờ gửi mật khẩu, khóa API hoặc số thẻ thanh toán qua email. Chúng tôi sẽ không bao giờ yêu cầu những thông tin này.</p>
      </Section>

      <Section item={S.status}>
        <div className="mk-sheet mt-4 p-5">
          <StatusCheck />
          <p className="mt-3 text-sm text-mk-pencil">
            Kiểm tra trực tiếp máy chủ và cơ sở dữ liệu của chúng tôi: <a href="/api/health">/api/health</a>
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
        <p>
          Công trình của bạn thuộc về bạn. Bạn có thể lấy chúng ra bất cứ lúc nào, kể cả sau khi thuê bao của bạn kết thúc (tài khoản vẫn có thể xem ở chế độ chỉ
          đọc).
        </p>
        <ul>
          <li>
            <strong>Toàn bộ một công trình, kèm bản vẽ, ghi chú, ảnh và giá:</strong> mở công trình → thẻ <strong>Tổng quan</strong> → <strong>Sao lưu</strong> →{" "}
            <strong>Tải bản sao lưu</strong>. Thao tác này lưu một tệp duy nhất mà Northpin có thể khôi phục trên bất kỳ thiết bị nào (Công trình →{" "}
            <strong>Khôi phục bản sao lưu</strong>).
          </li>
          <li>
            <strong>Bóc khối lượng, giá và báo cáo:</strong> tải xuống tệp PDF và CSV từ các thẻ <strong>Bóc khối lượng</strong>, <strong>Tài chính</strong> (mục
            Giá), <strong>Bản vẽ</strong> và <strong>Hiện trường</strong> của một công trình.
          </li>
          <li>
            <strong>Bảng giá của bạn:</strong> <strong>Bảng giá</strong> → tải xuống tệp CSV.
          </li>
          <li>
            <strong>Tất cả cùng lúc:</strong> gửi email đến <Ph>{COMPANY.supportEmail}</Ph> từ địa chỉ của chủ sở hữu nhóm và chúng tôi sẽ gửi bản xuất đầy đủ dữ
            liệu tài khoản của bạn trong vòng {RETENTION.deletionRequestDays} ngày.
          </li>
        </ul>
      </Section>

      <Section item={S.deleteAccount}>
        <p>Bạn có thể tự xóa tài khoản của mình:</p>
        <ol>
          <li>
            Trong ứng dụng web hoặc ứng dụng iOS, mở <strong>Cài đặt → Tài khoản</strong>.
          </li>
          <li>
            Chọn <strong>Xóa tài khoản</strong> và xác nhận.
          </li>
        </ol>
        <p>Điều gì xảy ra tiếp theo:</p>
        <ul>
          <li>Tài khoản đăng nhập của bạn bị xóa ngay lập tức và bạn bị đăng xuất trên mọi thiết bị.</li>
          <li>
            Nếu bạn là <strong>chủ sở hữu nhóm</strong>, việc xóa tài khoản của bạn cũng xóa các công trình, ảnh và tài liệu của nhóm. Hãy chuyển quyền sở hữu trước
            (Cài đặt → Nhóm) nếu công ty sẽ tiếp tục sử dụng Northpin, và hủy mọi thuê bao App Store trong Cài đặt iOS.
          </li>
          <li>
            Nếu bạn là thành viên nhóm, các công trình của bạn vẫn thuộc về nhóm; chỉ tài khoản đăng nhập và thông tin cá nhân của bạn bị xóa.
          </li>
          <li>
            Dữ liệu của bạn được xóa khỏi cơ sở dữ liệu đang hoạt động và kho lưu trữ tệp của chúng tôi ngay lập tức, và khỏi các bản sao lưu khi chúng hết hạn, như
            được mô tả trong <Link href="/privacy#retention">Chính sách quyền riêng tư</Link>. Các bản sao được lưu trên thiết bị của chính bạn vẫn còn cho đến khi
            bạn xóa ứng dụng hoặc dữ liệu của ứng dụng.
          </li>
        </ul>
        <p>
          Không đăng nhập được? Hãy gửi email đến <Ph>{COMPANY.privacyEmail}</Ph> từ email tài khoản của bạn với tiêu đề “Delete my account” (Xóa tài khoản của
          tôi) và chúng tôi sẽ xóa giúp bạn sau khi xác nhận đó là bạn, trong vòng {RETENTION.deletionRequestDays} ngày kể từ khi nhận được email của bạn.
        </p>
      </Section>

      <Section item={S.security}>
        <p>
          Nếu bạn cho rằng mình đã phát hiện một lỗ hổng bảo mật, hãy gửi email đến <Ph>{COMPANY.securityEmail}</Ph> kèm thông tin chi tiết. Vui lòng cho chúng tôi
          một khoảng thời gian hợp lý để khắc phục trước khi công bố, và không truy cập dữ liệu của khách hàng khác hoặc làm gián đoạn Dịch vụ trong khi kiểm thử.
          Chúng tôi trân trọng các báo cáo có trách nhiệm.
        </p>
      </Section>
    </>
  ),
};
