// Vietnamese translation of /privacy, for convenience only: the English text in src/app/privacy/page.tsx governs.
// Keep the sections, ids and conditions (AI_ENABLED) in step with the English page.
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";
import SubprocessorTableVi from "./SubprocessorTableVi";

const S = {
  scope: { id: "scope", title: "Chúng tôi là ai và chính sách này áp dụng cho những gì" },
  collect: { id: "collect", title: "Thông tin chúng tôi thu thập" },
  use: { id: "use", title: "Cách chúng tôi sử dụng thông tin" },
  ai: { id: "ai", title: "Xử lý bằng AI" },
  sharing: { id: "sharing", title: "Cách chúng tôi chia sẻ thông tin" },
  subprocessors: { id: "subprocessors", title: "Bên xử lý phụ" },
  retention: { id: "retention", title: "Lưu giữ và xóa" },
  security: { id: "security", title: "Bảo mật" },
  rights: { id: "rights", title: "Quyền và lựa chọn của bạn" },
  clients: { id: "your-clients", title: "Thông tin về khách hàng của khách hàng chúng tôi" },
  transfers: { id: "transfers", title: "Chuyển dữ liệu quốc tế" },
  children: { id: "children", title: "Trẻ em" },
  changes: { id: "changes", title: "Thay đổi đối với chính sách này" },
  contact: { id: "contact", title: "Liên hệ" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S).filter((t) => AI_ENABLED || t !== S.ai);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export const privacyVi: LegalTranslation = {
  title: "Chính sách quyền riêng tư",
  toc,
  intro: (
    <p>
      Các nhà thầu điện, điện nhẹ và các hạng mục chuyên ngành tin tưởng giao cho Northpin bản vẽ, báo giá, hóa đơn, công trình và thông tin về khách hàng của họ.
      Chính sách này giải thích bằng ngôn ngữ dễ hiểu những gì chúng tôi thu thập, lý do thu thập, ai giúp chúng tôi xử lý, chúng tôi lưu giữ trong bao lâu và cách
      bạn có thể kiểm soát. Tóm lại: chúng tôi sử dụng dữ liệu của bạn để vận hành Northpin cho bạn, chúng tôi không bán dữ liệu đó và không dùng dữ liệu đó để
      huấn luyện các mô hình AI.
    </p>
  ),
  children: (
    <>
      <Section item={S.scope} n={n(S.scope)}>
        <p>
          Northpin được vận hành bởi <Ph>{COMPANY.legalName}</Ph> (“Northpin”, “chúng tôi”), có trụ sở tại Hoa Kỳ. Chính sách này áp dụng cho trang web, ứng dụng
          web và ứng dụng iOS của chúng tôi (gọi chung là “Dịch vụ”).
        </p>
        <p>Northpin là công cụ dành cho doanh nghiệp, vì vậy chúng tôi xử lý thông tin cá nhân với hai vai trò:</p>
        <ul>
          <li>
            <strong>Với tư cách doanh nghiệp (bên kiểm soát)</strong> đối với thông tin về các công ty và cá nhân đăng ký và sử dụng Northpin: thông tin tài khoản,
            thanh toán, hỗ trợ và sử dụng.
          </li>
          <li>
            <strong>Với tư cách nhà cung cấp dịch vụ (bên xử lý)</strong> đối với dữ liệu công trình mà khách hàng của chúng tôi đưa vào Northpin, bao gồm thông
            tin về khách hàng của chính họ. Khách hàng của chúng tôi quyết định những gì được đưa vào và vì sao; chúng tôi xử lý dữ liệu đó thay mặt họ theo{" "}
            <Link href="/terms">Điều khoản dịch vụ</Link> và <Link href="/legal/dpa">Phụ lục xử lý dữ liệu</Link> của chúng tôi. Xem{" "}
            <a href="#your-clients">mục {n(S.clients)}</a>.
          </li>
        </ul>
      </Section>

      <Section item={S.collect} n={n(S.collect)}>
        <h3>Thông tin bạn cung cấp cho chúng tôi</h3>
        <ul>
          <li>
            <strong>Thông tin tài khoản và nhóm:</strong> họ tên, địa chỉ email, mật khẩu (chỉ được nhà cung cấp dịch vụ xác thực của chúng tôi lưu dưới dạng mã
            băm an toàn), tên công ty, vai trò trong nhóm và các lời mời bạn gửi.
          </li>
          <li>
            <strong>Hồ sơ doanh nghiệp:</strong> tên công ty, logo, số điện thoại, email, địa chỉ, thông tin thuế và điều khoản thanh toán mà bạn thêm vào báo giá,
            hóa đơn và các tài liệu khác.
          </li>
          <li>
            <strong>Thông tin thanh toán:</strong> người liên hệ thanh toán, gói và hóa đơn. Thông tin thẻ do Stripe thu thập và lưu trữ; chúng tôi chỉ thấy một số
            thông tin giới hạn như loại thẻ, bốn chữ số cuối và ngày hết hạn.
          </li>
          <li>
            <strong>Dữ liệu công trình (“Dữ liệu Khách hàng”):</strong> dự án, bộ bản vẽ và bản vẽ kỹ thuật, vị trí đặt thiết bị, tuyến dây và số đo, bóc khối
            lượng, danh mục và giá, báo giá và dự toán, hóa đơn, giấy báo có và hồ sơ thanh toán, yêu cầu làm rõ thông tin (RFI), lệnh thay đổi, biểu mẫu, danh
            sách kiểm tra, việc, lịch trình, báo cáo hằng ngày, ghi chú, tài liệu và tệp. Dữ liệu này có thể bao gồm họ tên, địa chỉ, số điện thoại và địa chỉ
            email của khách hàng của bạn.
          </li>
          <li>
            <strong>Ảnh và siêu dữ liệu của ảnh:</strong> ảnh bạn chụp hoặc tải lên, kèm chú thích, thẻ và ghi chú. Ảnh có thể chứa siêu dữ liệu nhúng (EXIF) như
            thời gian chụp, kiểu máy ảnh và <strong>vị trí GPS</strong>; Northpin đọc vị trí và thời gian để đặt ảnh lên bản đồ công trình và vào báo cáo.
          </li>
          <li>
            <strong>Trao đổi hỗ trợ:</strong> những gì bạn gửi cho chúng tôi khi liên hệ bộ phận hỗ trợ.
          </li>
        </ul>
        <h3>Thông tin được thu thập tự động</h3>
        <ul>
          <li>
            <strong>Vị trí thiết bị</strong>, chỉ khi bạn cho phép trên thiết bị của mình, để gắn thẻ địa lý cho ảnh và hiển thị các công trình gần đó trên bản đồ.
            Bạn có thể tắt tính năng này trong cài đặt trình duyệt hoặc iOS bất cứ lúc nào.
          </li>
          <li>
            <strong>Quyền truy cập máy ảnh</strong>, chỉ khi bạn chọn chụp ảnh trong ứng dụng.
          </li>
          <li>
            <strong>Chẩn đoán:</strong> khi ứng dụng gặp lỗi, ứng dụng sẽ gửi cho chúng tôi một báo cáo lỗi: thông báo lỗi và dấu vết ngăn xếp kỹ thuật, địa chỉ
            trang (đã loại bỏ chuỗi truy vấn và mã thông báo), phiên bản trình duyệt hoặc ứng dụng, nền tảng và, nếu bạn đã đăng nhập, ID người dùng của bạn. Chúng
            tôi loại bỏ địa chỉ email và mã thông báo truy cập khỏi các báo cáo này trước khi chúng được gửi đi.
          </li>
          <li>
            <strong>Nhật ký máy chủ và nhật ký bảo mật:</strong> nhà cung cấp dịch vụ lưu trữ của chúng tôi ghi lại dữ liệu kỹ thuật của yêu cầu như địa chỉ IP,
            thời gian, địa chỉ được yêu cầu và loại trình duyệt. Chúng tôi sử dụng địa chỉ IP để bảo vệ Dịch vụ, bao gồm cả việc giới hạn tần suất yêu cầu.
          </li>
        </ul>
        <h3 id="cookies">Cookie và bộ nhớ cục bộ</h3>
        <p>
          Northpin không sử dụng cookie quảng cáo, cookie phân tích hay công cụ theo dõi của bên thứ ba. Để hoạt động ngoại tuyến và giữ trạng thái đăng nhập của
          bạn, Northpin lưu trữ dữ liệu trên thiết bị của bạn:
        </p>
        <ul>
          <li>
            <strong>Các công trình của bạn</strong> trong cơ sở dữ liệu của trình duyệt (IndexedDB) hoặc trong bộ nhớ của ứng dụng iOS, để bạn có thể tiếp tục làm
            việc khi không có kết nối.
          </li>
          <li>
            <strong>Phiên đăng nhập của bạn</strong> trong bộ nhớ cục bộ của trình duyệt (hoặc iOS keychain), để bạn luôn ở trạng thái đăng nhập.
          </li>
          <li>
            <strong>Các trang của ứng dụng</strong> trong bộ nhớ đệm ngoại tuyến của trình duyệt (service worker), để ứng dụng mở được khi không có sóng.
          </li>
          <li>
            <strong>Các tùy chọn nhỏ</strong>, chẳng hạn nhóm hiện tại của bạn, cài đặt bản đồ và ảnh, và tên bạn đã nhập khi trả lời một liên kết mà ai đó gửi cho
            bạn, để bạn không phải nhập lại trên thiết bị đó.
          </li>
        </ul>
        <p>
          Tất cả những dữ liệu này đều cần thiết để Dịch vụ hoạt động. Chúng được giữ trên thiết bị của bạn cho đến khi bạn đăng xuất và xóa dữ liệu của trang web
          trong trình duyệt, hoặc gỡ cài đặt ứng dụng. Khi bạn thanh toán trên web, các trang thanh toán và quản lý thanh toán của Stripe (trên trang web riêng của
          Stripe) có thể đặt cookie riêng phục vụ thanh toán và phòng chống gian lận, theo chính sách quyền riêng tư của Stripe.
        </p>
        <h3>Thông tin về những người nhận liên kết</h3>
        <p>
          Khi một khách hàng của chúng tôi gửi liên kết báo giá, đề xuất, hóa đơn, lệnh thay đổi, RFI hoặc báo cáo ảnh và người nhận mở liên kết đó, chúng tôi có
          thể ghi lại việc liên kết đã được mở và thời điểm mở. Nếu người nhận phản hồi (ví dụ chấp nhận hoặc từ chối một báo giá, ký một lệnh thay đổi hoặc trả lời
          một RFI), chúng tôi ghi lại tên họ đã nhập, chữ ký, các tùy chọn họ đã chọn, ghi chú hoặc câu trả lời của họ và thời gian, và chia sẻ những thông tin này
          với khách hàng đã gửi liên kết.
        </p>
      </Section>

      <Section item={S.use} n={n(S.use)}>
        <p>Chúng tôi sử dụng thông tin để:</p>
        <ul>
          <li>
            cung cấp Dịch vụ: lưu trữ và đồng bộ các công trình của bạn giữa các thiết bị và với nhóm của bạn, và tạo bóc khối lượng, báo giá, hóa đơn, tệp PDF, báo
            cáo và liên kết cho khách hàng;
          </li>
          {AI_ENABLED && <li>chạy các tính năng AI khi bạn sử dụng chúng (xem bên dưới);</li>}
          <li>xử lý thanh toán và quản lý thuê bao;</li>
          <li>
            gửi email dịch vụ như liên kết đăng nhập, lời mời vào nhóm, tài liệu bạn gửi cho khách hàng của bạn, biên nhận và thông báo về các thay đổi quan trọng;
          </li>
          <li>cung cấp hỗ trợ, chẩn đoán và khắc phục sự cố;</li>
          <li>giữ an toàn cho Dịch vụ và khách hàng của chúng tôi, ngăn chặn hành vi lạm dụng và thực thi Điều khoản của chúng tôi;</li>
          <li>hiểu tình hình sử dụng chung dưới dạng tổng hợp hoặc đã khử định danh để cải thiện Northpin; và</li>
          <li>tuân thủ các nghĩa vụ pháp lý.</li>
        </ul>
        <p>
          Chúng tôi <strong>không</strong> bán thông tin cá nhân, không chia sẻ thông tin đó cho mục đích quảng cáo hành vi đa ngữ cảnh, và không sử dụng Dữ liệu
          Khách hàng để huấn luyện các mô hình AI. Nếu chúng tôi gửi email tiếp thị, bạn có thể hủy đăng ký bất cứ lúc nào.
        </p>
        <p>
          Trường hợp áp dụng các luật tương tự GDPR, cơ sở pháp lý của chúng tôi là: thực hiện hợp đồng giữa chúng tôi với bạn; lợi ích hợp pháp của chúng tôi trong
          việc vận hành, bảo mật và cải thiện một dịch vụ dành cho doanh nghiệp (được cân nhắc với các quyền của bạn); sự đồng ý của bạn, ví dụ đối với vị trí
          thiết bị (bạn có thể rút lại sự đồng ý này); và các nghĩa vụ pháp lý.
        </p>
      </Section>

      {AI_ENABLED && (
        <Section item={S.ai} n={n(S.ai)}>
          <p>
            Các tính năng AI — đọc một tờ bản vẽ, gợi ý vị trí thiết bị, giải thích một tờ bản vẽ, chú thích ảnh hoặc soạn nháp nhật ký hằng ngày — chỉ chạy khi có
            người trong nhóm của bạn sử dụng chúng. Khi đó, một hoặc nhiều hình ảnh liên quan cùng văn bản liên quan (như tên phòng, chú thích, ghi chú hoặc danh
            mục thiết bị của bạn) được gửi đến Anthropic, PBC để xử lý theo điều khoản thương mại của họ. Theo các điều khoản đó, Anthropic không sử dụng dữ liệu
            này để huấn luyện các mô hình của mình, và có thể lưu giữ dữ liệu trong một thời gian giới hạn cho các mục đích như bảo đảm an toàn và tin cậy, như được
            mô tả trong các điều khoản và chính sách thương mại của họ. Kết quả AI được trả về Northpin dưới dạng gợi ý mà một người phải xem xét.
          </p>
        </Section>
      )}

      <Section item={S.sharing} n={n(S.sharing)}>
        <p>Chúng tôi chỉ chia sẻ thông tin:</p>
        <ul>
          <li>
            <strong>Trong nhóm của bạn:</strong> các thành viên trong nhóm xem các công trình của nhóm theo vai trò của họ.
          </li>
          <li>
            <strong>Với những người bạn chọn:</strong> khi bạn gửi một báo giá, hóa đơn, báo cáo hoặc liên kết khác, hoặc kết nối một tích hợp như Billdu, chúng tôi
            gửi dữ liệu liên quan đến nơi bạn chỉ định.
          </li>
          <li>
            <strong>Với các bên xử lý phụ</strong> lưu trữ và vận hành một số phần của Dịch vụ cho chúng tôi theo các hợp đồng giới hạn việc sử dụng dữ liệu của họ
            (được liệt kê bên dưới).
          </li>
          <li>
            <strong>Vì lý do pháp lý:</strong> để tuân thủ pháp luật hoặc quy trình pháp lý hợp lệ, hoặc để bảo vệ quyền, sự an toàn và an ninh của khách hàng của
            chúng tôi, công chúng hoặc Northpin. Khi được phép, chúng tôi sẽ thông báo cho bạn về các yêu cầu đối với dữ liệu của bạn.
          </li>
          <li>
            <strong>Trong trường hợp chuyển giao doanh nghiệp:</strong> nếu Northpin tham gia vào một vụ sáp nhập, mua lại hoặc bán tài sản, theo các quy định của
            chính sách này.
          </li>
        </ul>
        <p>
          Bản đồ công trình tải các ô bản đồ từ máy chủ ô bản đồ của OpenStreetMap trực tiếp trong trình duyệt của bạn, vì vậy các máy chủ đó nhận được địa chỉ IP
          của bạn và khu vực bản đồ được yêu cầu, giống như với bất kỳ trang web nào. Phông chữ được cung cấp từ máy chủ của chính chúng tôi, vì vậy các trang mà
          khách hàng của bạn mở không kết nối đến dịch vụ phông chữ của bên thứ ba.
        </p>
      </Section>

      <Section item={S.subprocessors} n={n(S.subprocessors)}>
        <SubprocessorTableVi />
        <p>
          Nếu bạn kết nối Billdu, các thông tin về công trình và khách hàng mà bạn chọn gửi sẽ được chuyển đến Billdu theo thỏa thuận riêng của bạn với họ. Danh
          sách hiện hành luôn có tại trang <Link href="/legal/subprocessors">Bên xử lý phụ</Link>. Chúng tôi sẽ cập nhật danh sách trước khi bổ sung một bên xử lý
          phụ mới xử lý Dữ liệu Khách hàng; khách hàng có thể yêu cầu được thông báo qua <Ph>{COMPANY.privacyEmail}</Ph>.
        </p>
      </Section>

      <Section item={S.retention} n={n(S.retention)}>
        <ul>
          <li>
            <strong>Dữ liệu Khách hàng</strong> được lưu giữ khi tài khoản của bạn còn tồn tại. Khi bạn xóa một mục, mục đó được đánh dấu là đã xóa để các thiết bị
            khác của bạn và thiết bị của nhóm bạn cũng xóa mục đó; bản ghi đã đánh dấu vẫn nằm trong cơ sở dữ liệu của chúng tôi, bị ẩn khỏi ứng dụng, cho đến khi
            tài khoản bị xóa hoặc bạn yêu cầu chúng tôi xóa bản ghi đó.
          </li>
          <li>
            <strong>Việc xóa tài khoản</strong> trong ứng dụng sẽ xóa ngay tài khoản đăng nhập cùng các công trình, tệp và tài liệu của bạn khỏi cơ sở dữ liệu đang
            hoạt động và kho lưu trữ tệp của chúng tôi (các công trình của một thành viên nhóm vẫn thuộc về nhóm của họ; xem{" "}
            <Link href="/support#delete-account">Hỗ trợ</Link>).
          </li>
          <li>
            <strong>Khi một thuê bao kết thúc</strong>, tài khoản chuyển sang chế độ chỉ đọc và dữ liệu của tài khoản được giữ lại để bạn có thể xuất dữ liệu hoặc
            quay lại sử dụng. Hiện chúng tôi chưa tự động xóa các tài khoản đã kết thúc: Dữ liệu Khách hàng được xóa khi bạn xóa trong ứng dụng, hoặc trong vòng{" "}
            {RETENTION.deletionRequestDays} ngày kể từ khi nhận được yêu cầu bằng văn bản của chủ sở hữu tài khoản gửi đến <Ph>{COMPANY.privacyEmail}</Ph>.
          </li>
          <li>
            <strong>Bản sao lưu:</strong> dữ liệu đã xóa vẫn nằm trong các bản sao lưu cơ sở dữ liệu được mã hóa của chúng tôi cho đến khi chúng hết hạn, trong
            vòng <Ph>{RETENTION.backupDays}</Ph> ngày.
          </li>
          <li>
            <strong>Báo cáo lỗi</strong> được tự động xóa sau {RETENTION.errorReportDays} ngày. Nhật ký máy chủ được nhà cung cấp dịch vụ lưu trữ của chúng tôi giữ
            trong một thời gian ngắn theo cài đặt lưu giữ của họ.
          </li>
          <li>
            <strong>Hồ sơ thanh toán</strong> được lưu giữ trong thời gian mà pháp luật về thuế và kế toán yêu cầu (thường là tối đa bảy năm).
          </li>
          <li>
            <strong>Dữ liệu trên thiết bị của bạn</strong> được giữ ở đó cho đến khi bạn xóa, đăng xuất và xóa dữ liệu của ứng dụng, hoặc gỡ cài đặt ứng dụng.
          </li>
        </ul>
        <p>
          Bạn có thể xuất các công trình của mình bất cứ lúc nào và xóa tài khoản từ ứng dụng; xem <Link href="/support#delete-account">Hỗ trợ</Link>. Ảnh vẫn giữ
          siêu dữ liệu gốc (bao gồm vị trí GPS) khi được xuất hoặc chia sẻ, vì vậy hãy kiểm tra ảnh trước khi gửi ra ngoài công ty của bạn.
        </p>
      </Section>

      <Section item={S.security} n={n(S.security)}>
        <p>Chúng tôi áp dụng các biện pháp bảo vệ về hành chính, kỹ thuật và vật lý phù hợp với một dịch vụ dành cho doanh nghiệp, bao gồm:</p>
        <ul>
          <li>mã hóa khi truyền (HTTPS/TLS với HSTS) và mã hóa khi lưu trữ đối với cơ sở dữ liệu và kho lưu trữ tệp của chúng tôi;</li>
          <li>
            bảo mật cấp hàng trong cơ sở dữ liệu để mỗi tài khoản và nhóm chỉ có thể truy cập dữ liệu của chính mình, với phân quyền theo vai trò trong một nhóm;
          </li>
          <li>
            các khóa phía máy chủ được giữ bên ngoài trình duyệt và ứng dụng, và thông tin xác thực tích hợp của bên thứ ba được mã hóa khi lưu trữ (AES-256-GCM);
          </li>
          <li>các tiêu đề bảo mật trình duyệt nghiêm ngặt, giới hạn tần suất yêu cầu và bảo vệ chống lạm dụng trên các điểm cuối nhạy cảm;</li>
          <li>sao lưu cơ sở dữ liệu định kỳ; và</li>
          <li>quyền truy cập vào hệ thống vận hành thực tế chỉ giới hạn cho những người cần để vận hành và hỗ trợ Dịch vụ.</li>
        </ul>
        <p>
          Không có hệ thống nào an toàn tuyệt đối. Nếu chúng tôi biết về một vi phạm ảnh hưởng đến thông tin cá nhân của bạn, chúng tôi sẽ thông báo cho bạn và cơ
          quan có thẩm quyền theo yêu cầu của pháp luật. Vui lòng báo cáo lỗ hổng đến <Ph>{COMPANY.securityEmail}</Ph>.
        </p>
      </Section>

      <Section item={S.rights} n={n(S.rights)}>
        <p>Tùy theo nơi bạn sinh sống, bạn có thể có quyền:</p>
        <ul>
          <li>biết và truy cập thông tin cá nhân chúng tôi lưu giữ về bạn, và nhận một bản sao có thể chuyển đổi;</li>
          <li>chỉnh sửa thông tin không chính xác;</li>
          <li>xóa thông tin của bạn;</li>
          <li>phản đối hoặc hạn chế một số hoạt động xử lý, và rút lại sự đồng ý khi chúng tôi dựa vào sự đồng ý đó;</li>
          <li>
            từ chối việc “bán” hoặc “chia sẻ” thông tin cá nhân (chúng tôi không bán hoặc chia sẻ thông tin theo nghĩa đó) và hạn chế việc sử dụng thông tin nhạy cảm
            như vị trí chính xác (chúng tôi chỉ sử dụng thông tin này để cung cấp Dịch vụ); và
          </li>
          <li>khiếu nại với cơ quan bảo vệ dữ liệu tại nơi bạn sinh sống.</li>
        </ul>
        <p>
          <strong>Cư dân California:</strong> trong 12 tháng qua, chúng tôi đã thu thập thông tin định danh, thông tin thương mại (thuê bao), hoạt động internet
          (chẩn đoán và nhật ký), vị trí địa lý (vị trí của ảnh và thiết bị), thông tin nghe nhìn (ảnh) và thông tin nghề nghiệp (công ty và vai trò) cho các mục
          đích kinh doanh được mô tả ở trên, và đã tiết lộ chúng cho các nhà cung cấp dịch vụ được liệt kê ở trên. Chúng tôi chưa bán hoặc chia sẻ thông tin cá
          nhân hay sử dụng thông tin cá nhân nhạy cảm cho các mục đích đòi hỏi quyền hạn chế. Chúng tôi sẽ không phân biệt đối xử với bạn vì bạn thực hiện các
          quyền của mình, và bạn có thể sử dụng một đại diện được ủy quyền. Chúng tôi tôn trọng tín hiệu Global Privacy Control như một yêu cầu từ chối.
        </p>
        <p>
          Để gửi yêu cầu, hãy sử dụng các công cụ trong ứng dụng (xuất dữ liệu, xóa tài khoản) hoặc gửi email đến <Ph>{COMPANY.privacyEmail}</Ph>. Chúng tôi sẽ xác
          minh yêu cầu của bạn, thường bằng cách xác nhận quyền truy cập vào email tài khoản của bạn, và phản hồi trong thời hạn pháp luật yêu cầu (ví dụ, 45 ngày
          theo luật California hoặc một tháng theo GDPR).
        </p>
      </Section>

      <Section item={S.clients} n={n(S.clients)}>
        <p>
          Nếu bạn là khách hàng của một công ty sử dụng Northpin (ví dụ, bạn đã nhận được một báo giá hoặc một RFI), công ty đó kiểm soát thông tin của bạn và quyết
          định cách thông tin đó được sử dụng. Vui lòng liên hệ với công ty đó để truy cập, chỉnh sửa hoặc xóa thông tin. Nếu bạn liên hệ với chúng tôi, chúng tôi
          sẽ chuyển yêu cầu của bạn cho công ty đó và hỗ trợ họ phản hồi.
        </p>
      </Section>

      <Section item={S.transfers} n={n(S.transfers)}>
        <p>
          Northpin được vận hành từ Hoa Kỳ và lưu trữ dữ liệu tại <Ph>{COMPANY.dataRegion}</Ph>. Nếu bạn sử dụng Northpin từ bên ngoài Hoa Kỳ, thông tin của bạn
          được chuyển đến và xử lý tại Hoa Kỳ. Khi cần thiết, chúng tôi dựa vào các biện pháp bảo vệ phù hợp: <Ph>{COMPANY.transferMechanism}</Ph>.
        </p>
      </Section>

      <Section item={S.children} n={n(S.children)}>
        <p>
          Northpin là dịch vụ dành cho doanh nghiệp và không hướng đến trẻ em. Chúng tôi không cố ý thu thập thông tin cá nhân của bất kỳ ai dưới 16 tuổi. Nếu bạn
          cho rằng một trẻ em đã cung cấp thông tin cá nhân cho chúng tôi, hãy liên hệ với chúng tôi và chúng tôi sẽ xóa thông tin đó.
        </p>
      </Section>

      <Section item={S.changes} n={n(S.changes)}>
        <p>
          Chúng tôi sẽ cập nhật chính sách này khi cách thức hoạt động của chúng tôi thay đổi và thay đổi ngày có hiệu lực ở trên. Nếu thay đổi là quan trọng, chúng
          tôi sẽ thông báo cho chủ sở hữu tài khoản qua email hoặc trong ứng dụng trước khi thay đổi có hiệu lực.
        </p>
      </Section>

      <Section item={S.contact} n={n(S.contact)}>
        <p>
          Câu hỏi hoặc yêu cầu: <Ph>{COMPANY.privacyEmail}</Ph>
          <br />
          <Ph>{COMPANY.legalName}</Ph>, <Ph>{COMPANY.address}</Ph>
        </p>
      </Section>
    </>
  ),
};
