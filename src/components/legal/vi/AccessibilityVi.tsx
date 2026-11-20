// Vietnamese translation of /accessibility, for convenience only: the English page governs. Keep it in step.
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { COMPANY } from "@/lib/legal";

const S = {
  goal: { id: "goal", title: "Mục tiêu của chúng tôi" },
  done: { id: "done", title: "Những gì chúng tôi làm" },
  limits: { id: "limitations", title: "Các hạn chế đã biết" },
  feedback: { id: "feedback", title: "Báo cho chúng tôi về một rào cản" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);

export const accessibilityVi: LegalTranslation = {
  title: "Khả năng tiếp cận",
  toc,
  intro: (
    <p>
      Chúng tôi muốn mọi người trong đội thi công, ở văn phòng và phía khách hàng đều có thể sử dụng Northpin, bất kể họ dùng thiết bị hay công nghệ hỗ trợ
      nào.
    </p>
  ),
  children: (
    <>
      <Section item={S.goal}>
        <p>
          Chúng tôi hướng tới việc đáp ứng{" "}
          <a href="https://www.w3.org/TR/WCAG22/" rel="noopener noreferrer">
            Hướng dẫn về khả năng tiếp cận nội dung web (WCAG) 2.2
          </a>{" "}
          ở mức AA trên trang web, ứng dụng web và các trang mà khách hàng của bạn mở (báo giá, hóa đơn, lệnh thay đổi, yêu cầu làm rõ thông tin (RFI) và báo cáo
          ảnh). Đây là mục tiêu chúng tôi đang hướng tới, không phải là khẳng định rằng mọi trang hiện nay đều đã đáp ứng.
        </p>
      </Section>

      <Section item={S.done}>
        <ul>
          <li>
            Văn bản và các nút điều khiển được thiết kế với độ tương phản cao, và trang web công khai có thể sử dụng bằng bàn phím, với tiêu điểm hiển thị rõ và
            liên kết bỏ qua để đến nội dung chính.
          </li>
          <li>Các trang dùng tiêu đề, nhãn và mốc điều hướng thực sự để trình đọc màn hình có thể di chuyển trong trang.</li>
          <li>
            Các trang tự sắp xếp lại bố cục trên điện thoại, máy tính bảng và máy tính, và trang web công khai tuân theo cài đặt giảm chuyển động trên thiết bị
            của bạn.
          </li>
          <li>Thiết bị trên bản vẽ được hiển thị bằng chữ cái và tên, không chỉ bằng màu sắc, và số lượng luôn có sẵn dưới dạng bảng.</li>
        </ul>
      </Section>

      <Section item={S.limits}>
        <ul>
          <li>
            <strong>Đặt thiết bị lên bản vẽ</strong> được thực hiện bằng cảm ứng, bút hoặc chuột trên bản vẽ. Số lượng, báo giá và danh sách tạo ra từ bản vẽ có
            thể đọc và chỉnh sửa bằng bàn phím và trình đọc màn hình, nhưng việc ghim một thiết bị vào một vị trí trên bản vẽ thì hiện chưa thể.
          </li>
          <li>
            <strong>Thu phóng bằng hai ngón tay</strong> bị tắt trong trình duyệt để thao tác chụm ngón thu phóng bản vẽ thay vì trang. Hãy dùng cài đặt cỡ chữ
            hoặc thu phóng của trình duyệt để phóng to văn bản.
          </li>
          <li>
            <strong>Tờ bản vẽ</strong> là hình ảnh của các bản vẽ bạn tải lên, vì vậy văn bản trên đó chỉ dễ đọc ở mức như tệp gốc.
          </li>
          <li>
            <strong>Tệp PDF xuất ra</strong> (số lượng, báo giá, hóa đơn, báo cáo) hiện chưa được gắn thẻ cho trình đọc màn hình. Cùng thông tin đó có sẵn trên
            màn hình và dưới dạng CSV.
          </li>
          <li>
            <strong>Tài liệu do công ty của bạn soạn</strong> (điều khoản, ghi chú, ảnh và chú thích trong báo giá và báo cáo) chỉ dễ tiếp cận ở mức mà nội dung
            của chúng cho phép.
          </li>
        </ul>
      </Section>

      <Section item={S.feedback}>
        <p>
          Nếu có điều gì trong Northpin khiến bạn khó hoặc không thể sử dụng, hãy gửi email đến <Ph>{COMPANY.supportEmail}</Ph>, nêu rõ trang hoặc màn hình, việc
          bạn đang cố thực hiện, cũng như thiết bị và công nghệ hỗ trợ bạn sử dụng. Chúng tôi cố gắng trả lời trong vòng hai ngày làm việc và sẽ cùng bạn tìm cách
          khắc phục hoặc một cách khác để hoàn thành công việc. Khách hàng của một công ty dùng Northpin cũng có thể đề nghị công ty đã gửi liên kết cho họ cung
          cấp tài liệu ở một định dạng khác.
        </p>
      </Section>
    </>
  ),
};
