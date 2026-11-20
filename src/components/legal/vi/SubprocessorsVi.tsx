// Vietnamese translation of /legal/subprocessors, for convenience only: the English page governs.
import Link from "next/link";
import { Ph, type LegalTranslation } from "@/components/legal/LegalDoc";
import { COMPANY } from "@/lib/legal";
import SubprocessorTableVi from "./SubprocessorTableVi";

export const subprocessorsVi: LegalTranslation = {
  title: "Bên xử lý phụ",
  intro: (
    <p>
      Các công ty này lưu trữ và vận hành một số phần của Northpin cho chúng tôi và có thể xử lý Dữ liệu Khách hàng thay mặt chúng tôi. Mỗi công ty đều bị
      ràng buộc bởi một hợp đồng giới hạn việc sử dụng dữ liệu vào mục đích cung cấp dịch vụ của họ cho chúng tôi. Xem{" "}
      <Link href="/privacy">Chính sách quyền riêng tư</Link> và <Link href="/legal/dpa">Phụ lục xử lý dữ liệu</Link> của chúng tôi để biết cách chúng tôi
      xử lý dữ liệu.
    </p>
  ),
  children: (
    <>
      <h2 id="list">Các bên xử lý phụ hiện tại</h2>
      <SubprocessorTableVi />

      <h2 id="not-subprocessors">Các dịch vụ do bạn chọn sử dụng</h2>
      <p>
        Nếu bạn kết nối một tích hợp như Billdu, các thông tin về công trình và khách hàng mà bạn chọn gửi sẽ được chuyển đến dịch vụ đó theo thỏa thuận riêng
        của bạn với nhà cung cấp dịch vụ đó; dịch vụ đó không phải là bên xử lý phụ của chúng tôi. Bản đồ công trình tải các ô bản đồ từ OpenStreetMap trực tiếp
        trong trình duyệt của bạn; OpenStreetMap nhận địa chỉ IP của bạn và khu vực bản đồ được hiển thị, nhưng không nhận Dữ liệu Khách hàng.
      </p>

      <h2 id="changes">Thay đổi đối với danh sách này</h2>
      <p>
        Chúng tôi cập nhật trang này trước khi một bên xử lý phụ mới bắt đầu xử lý Dữ liệu Khách hàng. Để nhận email khi danh sách thay đổi, hãy viết đến{" "}
        <Ph>{COMPANY.privacyEmail}</Ph> từ email tài khoản của bạn. Khách hàng thuộc phạm vi Phụ lục xử lý dữ liệu của chúng tôi có thể phản đối một bên xử lý phụ
        mới như được mô tả trong phụ lục đó.
      </p>
    </>
  ),
};
