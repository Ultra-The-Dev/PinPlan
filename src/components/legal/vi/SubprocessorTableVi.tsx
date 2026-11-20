// The subprocessor table in Vietnamese (translation for convenience; /privacy and /legal/subprocessors in English govern).
// Rows come from SUBPROCESSORS in src/lib/legal.ts; a provider without a Vietnamese description here shows its English text.
import { Ph } from "@/components/legal/LegalDoc";
import { COMPANY, SUBPROCESSORS } from "@/lib/legal";

const VI: Record<string, { purpose: string; data: string }> = {
  "Supabase, Inc.": {
    purpose: "Cơ sở dữ liệu, xác thực người dùng và lưu trữ tệp",
    data: "Dữ liệu tài khoản và toàn bộ Dữ liệu Khách hàng đã đồng bộ (công trình, bản vẽ, ảnh, báo giá, hóa đơn, hồ sơ hiện trường và tệp)",
  },
  "Cloudflare, Inc.": {
    purpose: "Lưu trữ (hosting) trang web và ứng dụng, hàm phi máy chủ, phân phối nội dung, DNS và chuyển tiếp email",
    data: "Các yêu cầu đi qua dịch vụ, địa chỉ IP, nhật ký máy chủ",
  },
  "Stripe, Inc.": {
    purpose: "Thanh toán thuê bao và xử lý thanh toán",
    data: "Thông tin liên hệ thanh toán, tên công ty, thông tin thẻ thanh toán (do Stripe lưu giữ, không phải chúng tôi), hóa đơn",
  },
  "Resend (Plus Five Five, Inc.)": {
    purpose: "Email giao dịch (liên kết đăng nhập, lời mời, thông báo về báo giá và thanh toán)",
    data: "Địa chỉ email và tên người nhận, nội dung thư",
  },
  "Anthropic, PBC": {
    purpose: "Các tính năng AI: đọc bản vẽ mặt bằng, gợi ý thiết bị, chú thích ảnh và bản nháp nhật ký hằng ngày",
    data: "Hình ảnh tờ bản vẽ, ảnh công trình và văn bản liên quan mà bạn chọn gửi đến một tính năng AI",
  },
  "Apple Inc.": {
    purpose: "Phân phối ứng dụng iOS qua App Store (và mua hàng trong ứng dụng, nếu có)",
    data: "Thông tin Apple thu thập theo điều khoản riêng của Apple khi bạn tải xuống hoặc mua qua App Store",
  },
};

const LOCATION_VI: Record<string, string> = {
  "United States": "Hoa Kỳ",
  "United States (global edge network)": "Hoa Kỳ (mạng biên toàn cầu)",
};

export default function SubprocessorTableVi() {
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Nhà cung cấp</th>
            <th>Mục đích</th>
            <th>Dữ liệu liên quan</th>
            <th>Địa điểm</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((s) => (
            <tr key={s.name}>
              <td className="font-medium whitespace-nowrap">{s.name}</td>
              <td>{VI[s.name]?.purpose ?? s.purpose}</td>
              <td>{VI[s.name]?.data ?? s.data}</td>
              <td>
                <Ph>{s.location === COMPANY.dataRegion ? s.location : (LOCATION_VI[s.location] ?? s.location)}</Ph>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
