// Vietnamese translation of /terms, for convenience only: the English text in src/app/terms/page.tsx governs.
// Keep the sections, ids and conditions (AI_ENABLED) in step with the English page.
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  agreement: { id: "agreement", title: "Thỏa thuận" },
  definitions: { id: "definitions", title: "Định nghĩa" },
  accounts: { id: "accounts", title: "Tài khoản và nhóm" },
  billing: { id: "billing", title: "Thuê bao, dùng thử và thanh toán" },
  data: { id: "customer-data", title: "Dữ liệu của bạn" },
  ai: { id: "ai", title: "Các tính năng AI" },
  proposals: { id: "proposals", title: "Dự toán, đề xuất và chữ ký" },
  use: { id: "acceptable-use", title: "Sử dụng được chấp nhận" },
  thirdParty: { id: "third-party", title: "Dịch vụ của bên thứ ba" },
  availability: { id: "availability", title: "Tính khả dụng, sử dụng ngoại tuyến và sao lưu" },
  ip: { id: "ip", title: "Quyền sở hữu trí tuệ của chúng tôi" },
  confidentiality: { id: "confidentiality", title: "Bảo mật thông tin" },
  termination: { id: "termination", title: "Thời hạn, hủy và chấm dứt" },
  warranties: { id: "warranties", title: "Tuyên bố miễn trừ" },
  liability: { id: "liability", title: "Giới hạn trách nhiệm" },
  indemnity: { id: "indemnity", title: "Bồi hoàn" },
  law: { id: "law", title: "Luật điều chỉnh và giải quyết tranh chấp" },
  apple: { id: "apple", title: "Điều khoản Apple App Store" },
  changes: { id: "changes", title: "Thay đổi đối với các điều khoản này" },
  general: { id: "general", title: "Quy định chung" },
  contact: { id: "contact", title: "Liên hệ" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S).filter((t) => AI_ENABLED || t !== S.ai);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export const termsVi: LegalTranslation = {
  title: "Điều khoản dịch vụ",
  toc,
  intro: (
    <p>
      Northpin giúp các nhà thầu điện, điện nhẹ và các hạng mục chuyên ngành bóc khối lượng từ bản vẽ, gửi báo giá và hóa đơn, và quản lý công việc tại hiện
      trường. Các điều khoản này giải thích những gì bạn có thể mong đợi từ chúng tôi và những gì chúng tôi mong đợi từ bạn. Vui lòng đọc kỹ; bằng việc sử dụng
      Northpin, bạn đồng ý với các điều khoản này.
    </p>
  ),
  children: (
    <>
      <Section item={S.agreement} n={n(S.agreement)}>
        <p>
          Điều khoản dịch vụ này (“Điều khoản”) là thỏa thuận giữa <Ph>{COMPANY.legalName}</Ph>, <Ph>{COMPANY.entity}</Ph> (“Northpin”, “chúng tôi”), và doanh
          nghiệp hoặc tổ chức đăng ký sử dụng Northpin (“Khách hàng”, “bạn”). Nếu bạn chấp nhận Điều khoản này thay mặt cho một công ty, bạn xác nhận rằng bạn có
          thẩm quyền ràng buộc công ty đó. Nếu bạn không có thẩm quyền đó, hoặc không đồng ý, thì không sử dụng Northpin.
        </p>
        <p>
          Northpin là công cụ dành cho doanh nghiệp. Northpin chỉ được cung cấp cho các công ty và nhân viên của họ cho mục đích kinh doanh, không cung cấp cho
          người tiêu dùng cho mục đích cá nhân, gia đình hoặc sinh hoạt. Bạn phải từ đủ 18 tuổi trở lên để tạo tài khoản.
        </p>
        <p>
          <Link href="/privacy">Chính sách quyền riêng tư</Link> của chúng tôi giải thích cách chúng tôi xử lý thông tin cá nhân và là một phần của Điều khoản
          này. Nếu bạn đã ký đơn đặt hàng hoặc thỏa thuận xử lý dữ liệu với chúng tôi, văn bản đó được ưu tiên áp dụng khi có mâu thuẫn với Điều khoản này.
        </p>
      </Section>

      <Section item={S.definitions} n={n(S.definitions)}>
        <ul>
          <li>
            <strong>Dịch vụ</strong> là trang web, ứng dụng web, ứng dụng iOS, API của Northpin và các hoạt động hỗ trợ liên quan do chúng tôi cung cấp.
          </li>
          <li>
            <strong>Người dùng</strong> là những người bạn cho phép sử dụng Dịch vụ trong tài khoản của bạn, chẳng hạn chủ sở hữu, nhân viên văn phòng và kỹ thuật
            viên trong nhóm của bạn.
          </li>
          <li>
            <strong>Dữ liệu Khách hàng</strong> là mọi thứ bạn và Người dùng của bạn đưa vào Dịch vụ: công trình, bản vẽ và bản vẽ kỹ thuật, vị trí đặt thiết bị,
            bóc khối lượng, giá, báo giá và dự toán, hóa đơn, giấy báo có và hồ sơ thanh toán, yêu cầu làm rõ thông tin (RFI), lệnh thay đổi, biểu mẫu, danh sách
            kiểm tra, việc, lịch trình, báo cáo hằng ngày, ảnh (bao gồm siêu dữ liệu về vị trí và thời gian của ảnh), ghi chú, tài liệu và tệp, cũng như thông tin
            về khách hàng của chính bạn.
          </li>
          <li>
            <strong>Khách hàng của bạn</strong> là những cá nhân và doanh nghiệp mà bạn thực hiện công việc cho họ, bao gồm bất kỳ ai mở liên kết báo giá, hóa
            đơn, lệnh thay đổi, RFI hoặc báo cáo mà bạn gửi.
          </li>
        </ul>
      </Section>

      <Section item={S.accounts} n={n(S.accounts)}>
        <ul>
          <li>Cung cấp cho chúng tôi thông tin tài khoản chính xác và luôn cập nhật, bao gồm một địa chỉ email đang hoạt động.</li>
          <li>
            Giữ bí mật mật khẩu và mã truy cập, và không dùng chung thông tin đăng nhập. Mỗi Người dùng nên có tài khoản đăng nhập riêng. Bạn chịu trách nhiệm về
            mọi việc được thực hiện trong tài khoản của bạn và bởi Người dùng của bạn, cũng như về việc phân vai trò cho họ (ví dụ, Người dùng nào được xem giá).
          </li>
          <li>
            Thông báo kịp thời cho chúng tôi qua <Ph>{COMPANY.securityEmail}</Ph> nếu bạn cho rằng tài khoản của bạn đã bị truy cập trái phép.
          </li>
          <li>
            Chủ sở hữu nhóm kiểm soát tài khoản nhóm. Nếu chủ sở hữu rời khỏi công ty của bạn, hãy liên hệ với chúng tôi và chúng tôi sẽ hỗ trợ chuyển quyền sở hữu
            sau khi xác minh được yêu cầu với công ty của bạn.
          </li>
        </ul>
      </Section>

      <Section item={S.billing} n={n(S.billing)}>
        <p>
          <strong>Gói và chỗ ngồi.</strong> Các gói trả phí được tính phí theo kỳ thuê bao (hằng tháng hoặc hằng năm) và có thể giới hạn số lượng Người dùng (“chỗ
          ngồi”) hoặc mức sử dụng khác, như được nêu trên <Link href="/pricing">trang giá</Link> của chúng tôi hoặc trong đơn đặt hàng của bạn.
          {AI_ENABLED && " Các giới hạn sử dụng đối với tính năng AI có thể được áp dụng để giữ cho Dịch vụ công bằng và ổn định."}
        </p>
        <p>
          <strong>Dùng thử miễn phí.</strong> Chúng tôi có thể cung cấp thời gian dùng thử miễn phí. Khi thời gian dùng thử kết thúc, Dịch vụ chỉ tiếp tục nếu bạn
          chọn một gói trả phí. Nếu bạn không chọn, tài khoản của bạn sẽ bị giới hạn hoặc chuyển sang chế độ chỉ đọc và bạn vẫn có thể xuất dữ liệu của mình như
          mô tả bên dưới.
        </p>
        <p>
          <strong>Thanh toán.</strong> Các khoản thanh toán trên web được xử lý bởi Stripe, Inc. Bằng việc đăng ký thuê bao, bạn ủy quyền cho chúng tôi, thông
          qua Stripe, trừ tiền từ phương thức thanh toán của bạn vào đầu mỗi kỳ cho đến khi bạn hủy. Chúng tôi không lưu trữ đầy đủ số thẻ. Thuê bao tự động gia
          hạn trừ khi được hủy trước ngày gia hạn. Các giao dịch mua qua Apple App Store do Apple tính phí và quản lý theo điều khoản của Apple, và phải được hủy
          thông qua tài khoản Apple của bạn.
        </p>
        <p>
          <strong>Thuế.</strong> Giá chưa bao gồm thuế trừ khi có ghi chú khác. Bạn chịu trách nhiệm về thuế bán hàng, thuế sử dụng và các loại thuế tương tự áp
          dụng, ngoại trừ thuế đánh trên thu nhập của chúng tôi.
        </p>
        <p>
          <strong>Thay đổi và hoàn tiền.</strong> Chúng tôi có thể thay đổi giá với thông báo trước ít nhất 30 ngày; thay đổi được áp dụng từ kỳ gia hạn tiếp theo
          của bạn. Phí không được hoàn lại và chúng tôi không cấp khoản tín dụng cho các kỳ sử dụng một phần, trừ trường hợp pháp luật yêu cầu hoặc khi chúng tôi
          chấm dứt Dịch vụ mà không có lý do, khi đó chúng tôi hoàn lại khoản phí đã trả trước cho thời gian chưa sử dụng.
        </p>
        <p>
          <strong>Thanh toán trễ hạn.</strong> Nếu một khoản thanh toán không thành công, chúng tôi sẽ thông báo cho bạn và thử lại. Nếu khoản đó vẫn chưa được
          thanh toán sau 14 ngày kể từ khi thông báo, chúng tôi có thể tạm ngưng các tính năng trả phí cho đến khi khoản đó được thanh toán.
        </p>
      </Section>

      <Section item={S.data} n={n(S.data)}>
        <p>
          <strong>Bạn sở hữu Dữ liệu Khách hàng của mình.</strong> Bạn cấp cho chúng tôi một giấy phép có giới hạn để lưu trữ, sao chép, truyền tải, xử lý và hiển
          thị Dữ liệu Khách hàng chỉ trong phạm vi cần thiết để cung cấp, bảo mật và hỗ trợ Dịch vụ cho bạn, để ngăn chặn hành vi lạm dụng, và theo yêu cầu của
          pháp luật. Chúng tôi không bán Dữ liệu Khách hàng và không sử dụng dữ liệu đó để quảng cáo cho bạn hay bất kỳ ai khác.
        </p>
        <p>
          <strong>Trách nhiệm của bạn.</strong> Bạn chịu trách nhiệm về Dữ liệu Khách hàng và về việc có đủ các quyền và sự cho phép cần thiết để đưa dữ liệu đó vào
          Dịch vụ. Điều này bao gồm các bản vẽ mặt bằng và bản vẽ kỹ thuật bạn tải lên (có thể thuộc về kiến trúc sư, kỹ sư hoặc chủ sở hữu tòa nhà), ảnh chụp tại
          cơ sở của Khách hàng của bạn, và thông tin cá nhân về Khách hàng của bạn như họ tên, địa chỉ, số điện thoại, email và chữ ký. Trường hợp pháp luật yêu cầu,
          bạn chịu trách nhiệm thông báo cho Khách hàng của bạn về cách bạn sử dụng thông tin của họ và có được sự đồng ý của họ.
        </p>
        <p>
          <strong>Vai trò của chúng tôi.</strong> Đối với thông tin cá nhân trong Dữ liệu Khách hàng, chúng tôi đóng vai trò là nhà cung cấp dịch vụ (hoặc “bên
          xử lý”) của bạn và xử lý thông tin đó theo chỉ thị của bạn, như được mô tả trong <Link href="/privacy">Chính sách quyền riêng tư</Link> và{" "}
          <Link href="/legal/dpa">Phụ lục xử lý dữ liệu</Link> của chúng tôi, là một phần của Điều khoản này. Bản có chữ ký của cả hai bên được cung cấp theo yêu
          cầu qua <Ph>{COMPANY.privacyEmail}</Ph>.
        </p>
        <p>
          <strong>Thông tin nhạy cảm.</strong> Không sử dụng Dịch vụ để lưu trữ số thẻ thanh toán, số giấy tờ tùy thân do nhà nước cấp, thông tin sức khỏe, mã
          báo động, mã cửa hoặc mật khẩu cho các hệ thống của Khách hàng của bạn. Dịch vụ không được thiết kế cho loại dữ liệu đó.
        </p>
        <p>
          <strong>Dữ liệu tổng hợp.</strong> Chúng tôi có thể sử dụng thông tin tổng hợp, đã được khử định danh về cách Dịch vụ được sử dụng (ví dụ, số lượng công
          trình được tạo) để vận hành và cải thiện Dịch vụ, miễn là thông tin đó không xác định được bạn, Người dùng của bạn hoặc Khách hàng của bạn.
        </p>
      </Section>

      {AI_ENABLED && (
        <Section item={S.ai} n={n(S.ai)}>
          <p>
            Một số tính năng sử dụng trí tuệ nhân tạo: đọc tờ bản vẽ, gợi ý vị trí thiết bị, giải thích một tờ bản vẽ, chú thích ảnh và soạn nháp nhật ký hằng
            ngày. Khi bạn sử dụng một tính năng như vậy, hình ảnh và văn bản liên quan (ví dụ một tờ bản vẽ, một bức ảnh, tên phòng hoặc danh mục thiết bị của
            bạn) được gửi đến nhà cung cấp AI của chúng tôi, Anthropic, PBC, để xử lý theo điều khoản thương mại của họ. Theo các điều khoản đó, Anthropic không sử
            dụng dữ liệu này để huấn luyện các mô hình của mình.
          </p>
          <ul>
            <li>
              <strong>Chỉ là gợi ý.</strong> Kết quả của AI có thể sai hoặc không đầy đủ. Các thiết bị được gợi ý không bao giờ được tính vào bóc khối lượng hoặc dự
              toán cho đến khi một người trong nhóm của bạn chấp nhận chúng. Bạn chịu trách nhiệm kiểm tra số lượng, giá, chú thích và báo cáo trước khi dựa vào
              chúng hoặc gửi chúng cho bất kỳ ai.
            </li>
            <li>
              <strong>Không phải tư vấn chuyên môn.</strong> Northpin không cung cấp tư vấn kỹ thuật, thiết kế, tuân thủ quy chuẩn, phòng cháy chữa cháy/an toàn
              sinh mạng hoặc tư vấn pháp lý, và kết quả của AI không thay thế cho các tư vấn đó.
            </li>
            <li>
              <strong>Lựa chọn của bạn.</strong> Các tính năng AI chỉ chạy khi có người trong nhóm của bạn sử dụng chúng.
            </li>
          </ul>
        </Section>
      )}

      <Section item={S.proposals} n={n(S.proposals)}>
        <p>
          Northpin có thể tạo báo giá, hóa đơn, lệnh thay đổi, RFI, báo cáo ảnh và các tài liệu khác, cùng các liên kết mà Khách hàng của bạn có thể mở, trả lời,
          ký và chấp nhận. Bạn quyết định nội dung, giá và điều khoản của chúng. Mọi hợp đồng được hình thành là giữa bạn và Khách hàng của bạn; chúng tôi không
          phải là một bên của hợp đồng đó và không chịu trách nhiệm về các điều khoản của hợp đồng, về công việc của bạn, hoặc về việc chữ ký điện tử có hợp lệ cho
          mục đích của bạn tại khu vực tài phán của bạn hay không. Hóa đơn và hồ sơ thanh toán trong Northpin là hồ sơ của bạn: bạn chịu trách nhiệm về các khoản
          thuế bạn thu và về sổ sách kế toán của chính bạn. Bất kỳ ai có liên kết tài liệu đều có thể xem tài liệu đó, vì vậy chỉ chia sẻ liên kết với người nhận dự
          kiến và thu hồi các liên kết mà bạn không còn muốn để hoạt động.
        </p>
        <p>
          Các tích hợp như Billdu gửi dữ liệu đến một dịch vụ khác theo chỉ thị của bạn. Việc bạn sử dụng dịch vụ đó chịu sự điều chỉnh của thỏa thuận giữa bạn với
          nhà cung cấp dịch vụ đó.
        </p>
      </Section>

      <Section item={S.use} n={n(S.use)}>
        <p>Bạn đồng ý không, và không để bất kỳ ai khác:</p>
        <ul>
          <li>vi phạm pháp luật, xâm phạm quyền của bất kỳ ai, hoặc tải lên nội dung mà bạn không có quyền sử dụng;</li>
          <li>tải lên phần mềm độc hại, hoặc cố gắng truy cập tài khoản, dữ liệu hoặc hệ thống mà bạn không được phép truy cập;</li>
          <li>dò tìm, quét hoặc kiểm tra lỗ hổng của Dịch vụ, trừ khi thông qua quy trình công bố có trách nhiệm của chúng tôi (xem trang Hỗ trợ);</li>
          <li>
            làm quá tải hoặc gây gián đoạn Dịch vụ, lách các giới hạn sử dụng, hoặc dùng phương tiện tự động để truy cập Dịch vụ ngoài các API đã công bố của chúng
            tôi;
          </li>
          <li>
            bán lại, cấp phép lại hoặc cung cấp Dịch vụ cho bên thứ ba dưới hình thức đơn vị cung cấp dịch vụ, trừ việc cung cấp cho chính Khách hàng của bạn theo
            đúng mục đích của Dịch vụ;
          </li>
          <li>sao chép, dịch ngược hoặc xây dựng sản phẩm cạnh tranh từ Dịch vụ, trừ trường hợp pháp luật cho phép rõ ràng; hoặc</li>
          <li>sử dụng Dịch vụ để quấy rối bất kỳ ai hoặc để gửi thư rác.</li>
        </ul>
        <p>
          Chúng tôi có thể tạm ngưng quyền truy cập mà chúng tôi có cơ sở hợp lý để cho rằng vi phạm mục này hoặc gây rủi ro cho Dịch vụ hay các khách hàng khác, và
          sẽ cho bạn biết lý do khi có thể.
        </p>
      </Section>

      <Section item={S.thirdParty} n={n(S.thirdParty)}>
        <p>
          Dịch vụ dựa vào các nhà cung cấp bên thứ ba, được liệt kê trong <Link href="/privacy#subprocessors">Chính sách quyền riêng tư</Link> của chúng tôi. Bản đồ
          trong Dịch vụ sử dụng dữ liệu OpenStreetMap, © những người đóng góp OpenStreetMap. Các sản phẩm của bên thứ ba mà bạn chọn kết nối do các bên thứ ba đó
          cung cấp, không phải do chúng tôi cung cấp.
        </p>
      </Section>

      <Section item={S.availability} n={n(S.availability)}>
        <p>
          Chúng tôi nỗ lực để Dịch vụ luôn khả dụng và nhanh, nhưng đôi khi Dịch vụ có thể không khả dụng do bảo trì, cập nhật hoặc vì những lý do ngoài tầm kiểm
          soát của chúng tôi. Northpin được thiết kế để tiếp tục hoạt động khi ngoại tuyến: dữ liệu bạn nhập được lưu trên thiết bị của bạn trước và được đồng bộ
          lên máy chủ của chúng tôi khi có kết nối. Dữ liệu chưa được đồng bộ chỉ tồn tại trên thiết bị đó, vì vậy có thể bị mất nếu thiết bị bị mất, bị đặt lại
          hoặc bộ nhớ trình duyệt của thiết bị bị xóa.
        </p>
        <p>
          Chúng tôi sao lưu dữ liệu đã đồng bộ định kỳ (xem <Link href="/privacy#retention">Chính sách quyền riêng tư</Link> của chúng tôi), nhưng các bản sao lưu
          chỉ dùng để khôi phục sau thảm họa và không thay thế cho hồ sơ của chính bạn. Bạn có thể xuất các công trình của mình bất cứ lúc nào.
        </p>
      </Section>

      <Section item={S.ip} n={n(S.ip)}>
        <p>
          Chúng tôi sở hữu Dịch vụ, bao gồm phần mềm, thiết kế, ký hiệu và tài liệu hướng dẫn của Dịch vụ. Trong thời gian thuê bao của bạn còn hiệu lực, chúng tôi
          cấp cho bạn và Người dùng của bạn quyền không độc quyền, không được chuyển nhượng để sử dụng Dịch vụ cho mục đích kinh doanh nội bộ của bạn theo Điều
          khoản này. Nếu bạn gửi cho chúng tôi ý tưởng hoặc phản hồi, chúng tôi có thể sử dụng chúng mà không phát sinh nghĩa vụ nào đối với bạn.
        </p>
      </Section>

      <Section item={S.confidentiality} n={n(S.confidentiality)}>
        <p>
          Mỗi bên sẽ bảo vệ thông tin kinh doanh không công khai của bên kia với sự cẩn trọng hợp lý, chỉ sử dụng thông tin đó cho các mục đích của thỏa thuận này,
          và chỉ chia sẻ thông tin đó với những người và nhà cung cấp cần đến thông tin và có nghĩa vụ bảo vệ thông tin. Điều này không áp dụng đối với thông tin đã
          công khai, đã được biết trước, được phát triển độc lập, hoặc thông tin mà pháp luật yêu cầu phải tiết lộ (kèm thông báo khi được phép).
        </p>
      </Section>

      <Section item={S.termination} n={n(S.termination)}>
        <ul>
          <li>
            <strong>Hủy.</strong> Bạn có thể hủy bất cứ lúc nào từ phần cài đặt thanh toán (hoặc thông qua Apple, nếu bạn đã đăng ký ở đó). Việc hủy có hiệu lực vào
            cuối kỳ hiện tại.
          </li>
          <li>
            <strong>Chấm dứt bởi chúng tôi.</strong> Chúng tôi có thể chấm dứt hoặc tạm ngưng tài khoản của bạn nếu bạn vi phạm nghiêm trọng Điều khoản này và không
            khắc phục vi phạm trong vòng 15 ngày kể từ khi được thông báo, chấm dứt ngay lập tức đối với các vi phạm nghiêm trọng quy tắc sử dụng được chấp nhận,
            hoặc nếu pháp luật yêu cầu. Chúng tôi có thể ngừng cung cấp Dịch vụ với thông báo trước ít nhất 60 ngày và hoàn lại khoản phí đã trả trước cho thời gian
            chưa sử dụng.
          </li>
          <li>
            <strong>Dữ liệu của bạn sau khi chấm dứt.</strong> Khi thuê bao của bạn kết thúc, tài khoản của bạn chuyển sang chế độ chỉ đọc và bạn vẫn có thể xuất Dữ
            liệu Khách hàng của mình (chúng tôi sẽ hỗ trợ khi được yêu cầu). Chúng tôi xóa dữ liệu đó khi bạn xóa tài khoản trong ứng dụng, hoặc trong vòng{" "}
            {RETENTION.deletionRequestDays} ngày kể từ khi nhận được yêu cầu bằng văn bản gửi đến <Ph>{COMPANY.privacyEmail}</Ph>; sau đó dữ liệu được xóa khỏi các
            bản sao lưu khi chúng hết hạn, như được mô tả trong <Link href="/privacy#retention">Chính sách quyền riêng tư</Link> của chúng tôi.
          </li>
          <li>
            Các điều khoản mà theo bản chất cần tiếp tục có hiệu lực (như các khoản phải thanh toán, tuyên bố miễn trừ, giới hạn trách nhiệm và bồi hoàn) vẫn tiếp
            tục có hiệu lực sau khi chấm dứt.
          </li>
        </ul>
      </Section>

      <Section item={S.warranties} n={n(S.warranties)}>
        <p>
          Chúng tôi sẽ cung cấp Dịch vụ với kỹ năng và sự cẩn trọng hợp lý và phù hợp với tài liệu hướng dẫn của chúng tôi. Ngoài ra, trong phạm vi tối đa pháp
          luật cho phép, Dịch vụ được cung cấp “nguyên trạng” và “tùy theo tình trạng sẵn có”, và chúng tôi từ chối mọi bảo đảm khác, dù rõ ràng hay ngụ ý, bao
          gồm bảo đảm về khả năng thương mại, sự phù hợp cho một mục đích cụ thể, quyền sở hữu và không vi phạm. Chúng tôi không bảo đảm rằng Dịch vụ sẽ không có
          lỗi hoặc không bị gián đoạn, hoặc rằng bóc khối lượng, dự toán{AI_ENABLED ? ", kết quả của AI" : ""} hoặc số đo suy ra từ tỷ lệ bản vẽ là chính xác. Bạn
          chịu trách nhiệm xác minh số lượng và giá trước khi dựa vào chúng.
        </p>
        <p>
          Northpin là công cụ phục vụ công việc của chính bạn. Northpin không cung cấp tư vấn kỹ thuật, thiết kế, tuân thủ quy chuẩn, phòng cháy chữa cháy/an toàn
          sinh mạng, thuế hoặc pháp lý, và không có nội dung nào trong Northpin thay thế cho các tư vấn đó.
        </p>
      </Section>

      <Section item={S.liability} n={n(S.liability)}>
        <p>Trong phạm vi tối đa pháp luật cho phép:</p>
        <ul>
          <li>
            không bên nào chịu trách nhiệm đối với các thiệt hại gián tiếp, ngẫu nhiên, đặc biệt, hệ quả hoặc mang tính trừng phạt, hoặc đối với việc mất lợi nhuận,
            doanh thu, uy tín hoặc dữ liệu (ngoài nghĩa vụ của chúng tôi khôi phục dữ liệu từ các bản sao lưu của chúng tôi khi có), ngay cả khi đã được thông báo về
            khả năng xảy ra các thiệt hại đó; và
          </li>
          <li>
            tổng trách nhiệm của mỗi bên phát sinh từ hoặc liên quan đến Điều khoản này được giới hạn ở số tiền bạn đã trả cho chúng tôi cho Dịch vụ trong 12 tháng
            trước sự kiện làm phát sinh khiếu nại (hoặc 100 đô la Mỹ nếu bạn chưa trả khoản nào).
          </li>
        </ul>
        <p>
          Các giới hạn này không áp dụng đối với nghĩa vụ thanh toán của bạn, nghĩa vụ bồi hoàn của mỗi bên, hoặc trách nhiệm mà pháp luật không cho phép giới hạn.
        </p>
      </Section>

      <Section item={S.indemnity} n={n(S.indemnity)}>
        <p>
          Bạn sẽ bảo vệ và bồi hoàn cho Northpin trước các khiếu nại của bên thứ ba phát sinh từ Dữ liệu Khách hàng, công việc bạn thực hiện cho Khách hàng của
          bạn, hoặc việc bạn sử dụng Dịch vụ vi phạm Điều khoản này hoặc pháp luật. Chúng tôi sẽ bảo vệ và bồi hoàn cho bạn trước các khiếu nại của bên thứ ba cho
          rằng Dịch vụ, như được chúng tôi cung cấp, xâm phạm quyền sở hữu trí tuệ của họ. Bên yêu cầu bồi hoàn phải thông báo kịp thời cho bên kia, để bên kia
          kiểm soát việc bào chữa, và hợp tác một cách hợp lý.
        </p>
      </Section>

      <Section item={S.law} n={n(S.law)}>
        <p>
          Điều khoản này được điều chỉnh bởi pháp luật của Tiểu bang <Ph>{COMPANY.state}</Ph> và pháp luật liên bang Hoa Kỳ có liên quan, không xét đến các quy
          tắc xung đột pháp luật. Các tòa án tiểu bang và liên bang đặt tại <Ph>{COMPANY.county}</Ph>, <Ph>{COMPANY.state}</Ph> có thẩm quyền xét xử độc quyền,
          và cả hai bên đồng ý với thẩm quyền đó. Trước khi nộp đơn khởi kiện, mỗi bên đồng ý cố gắng giải quyết tranh chấp một cách không chính thức bằng cách liên
          hệ với bên kia và thương lượng thiện chí trong 30 ngày.
        </p>
      </Section>

      <Section item={S.apple} n={n(S.apple)}>
        <p>Nếu bạn sử dụng ứng dụng Northpin cho iOS được tải xuống từ Apple App Store, các quy định sau cũng được áp dụng:</p>
        <ul>
          <li>
            Điều khoản này chỉ được xác lập giữa bạn và Northpin, không phải với Apple. Northpin, không phải Apple, chịu trách nhiệm duy nhất về ứng dụng và nội dung
            của ứng dụng.
          </li>
          <li>
            Giấy phép sử dụng ứng dụng của bạn được giới hạn trên các thiết bị mang thương hiệu Apple mà bạn sở hữu hoặc kiểm soát, theo mức cho phép của quy tắc sử
            dụng App Store.
          </li>
          <li>Apple không có nghĩa vụ cung cấp dịch vụ bảo trì hoặc hỗ trợ cho ứng dụng.</li>
          <li>
            Nếu ứng dụng không phù hợp với bất kỳ bảo đảm hiện hành nào, bạn có thể thông báo cho Apple và Apple sẽ hoàn lại giá mua (nếu có). Trong phạm vi tối đa
            pháp luật cho phép, Apple không có nghĩa vụ bảo đảm nào khác đối với ứng dụng.
          </li>
          <li>
            Northpin, không phải Apple, chịu trách nhiệm giải quyết mọi khiếu nại liên quan đến ứng dụng, bao gồm khiếu nại về trách nhiệm sản phẩm, khiếu nại rằng
            ứng dụng không đáp ứng các yêu cầu pháp lý hoặc quy định, khiếu nại về bảo vệ người tiêu dùng hoặc quyền riêng tư, và khiếu nại rằng ứng dụng xâm phạm
            quyền sở hữu trí tuệ của bên thứ ba.
          </li>
          <li>
            Bạn xác nhận rằng bạn không ở tại một quốc gia chịu lệnh cấm vận của Hoa Kỳ và không có tên trong bất kỳ danh sách nào của chính phủ Hoa Kỳ về các bên bị
            cấm hoặc bị hạn chế.
          </li>
          <li>
            Apple và các công ty con của Apple là bên thụ hưởng thứ ba của Điều khoản này và có thể thực thi Điều khoản này đối với bạn trong phạm vi liên quan đến
            ứng dụng iOS.
          </li>
        </ul>
      </Section>

      <Section item={S.changes} n={n(S.changes)}>
        <p>
          Chúng tôi có thể cập nhật Điều khoản này khi Dịch vụ phát triển. Nếu thay đổi là quan trọng, chúng tôi sẽ thông báo cho bạn qua email hoặc trong ứng dụng
          ít nhất 30 ngày trước khi thay đổi có hiệu lực. Nếu bạn không đồng ý với thay đổi, bạn có thể hủy trước khi thay đổi có hiệu lực; việc tiếp tục sử dụng
          Dịch vụ sau thời điểm đó đồng nghĩa với việc bạn chấp nhận thay đổi.
        </p>
      </Section>

      <Section item={S.general} n={n(S.general)}>
        <ul>
          <li>
            Bạn không được chuyển nhượng Điều khoản này khi chưa có sự đồng ý của chúng tôi, trừ trường hợp chuyển cho bên kế thừa doanh nghiệp của bạn. Chúng tôi có
            thể chuyển nhượng Điều khoản này trong trường hợp sáp nhập, mua lại hoặc bán tài sản.
          </li>
          <li>Không bên nào chịu trách nhiệm về sự chậm trễ do các sự kiện nằm ngoài tầm kiểm soát hợp lý của mình.</li>
          <li>
            Nếu bất kỳ phần nào của Điều khoản này không thể thực thi, các phần còn lại vẫn có hiệu lực. Việc không thực thi một quyền không có nghĩa là từ bỏ quyền
            đó.
          </li>
          <li>Chúng tôi có thể gửi thông báo đến địa chỉ email trong tài khoản của bạn. Bạn có thể gửi thông báo đến địa chỉ dưới đây.</li>
          <li>
            Chúng tôi là các bên độc lập. Điều khoản này là toàn bộ thỏa thuận về Dịch vụ và thay thế mọi thỏa thuận trước đó về vấn đề này.
          </li>
          <li>Bạn sẽ tuân thủ pháp luật Hoa Kỳ về kiểm soát xuất khẩu và trừng phạt khi sử dụng Dịch vụ.</li>
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
