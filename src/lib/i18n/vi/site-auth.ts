// Tiếng Việt: public site (header, footer, /welcome, /pricing, support), sign-in, sign-up, password reset, /join, /start.
// Same keys as ../ru/site-auth.ts. Keys are the exact English source text. Glossary and rules: docs/i18n.md.
import type { Dictionary } from "../types";

const siteAuth: Dictionary = {
  // Site header and footer
  "Skip to content": "Chuyển đến nội dung",
  "Open menu": "Mở menu",
  "Close menu": "Đóng menu",
  Site: "Trang web",
  "Site menu": "Menu trang web",
  "How it works": "Cách hoạt động",
  Trades: "Ngành nghề",
  Pricing: "Giá",
  Questions: "Câu hỏi",
  "Open the app": "Mở ứng dụng",
  "Sign in": "Đăng nhập",
  "Start free trial": "Dùng thử miễn phí",
  Product: "Sản phẩm",
  "Your team": "Nhóm của bạn",
  "Join your team": "Tham gia nhóm của bạn",
  Support: "Hỗ trợ",
  Legal: "Pháp lý",
  "Terms of Service": "Điều khoản dịch vụ",
  "Privacy Policy": "Chính sách quyền riêng tư",
  Subprocessors: "Bên xử lý phụ",
  "Data Processing Addendum": "Phụ lục xử lý dữ liệu",
  Security: "Bảo mật",
  Accessibility: "Trợ năng",
  "Plans, counts, quotes, invoices and field work for electrical, low-voltage and specialty contractors.":
    "Bản vẽ, bóc khối lượng, báo giá, hóa đơn và công việc hiện trường cho nhà thầu điện, điện nhẹ và các ngành chuyên biệt.",
  "Try it without an account": "Dùng thử không cần tài khoản",
  "Your account was deleted and this device was cleared.": "Tài khoản của bạn đã bị xóa và dữ liệu trên thiết bị này đã được xóa sạch.",
  Dismiss: "Đóng",

  // Legal pages (chrome; the documents themselves stay in English)
  DPA: "Xử lý dữ liệu",
  Effective: "Có hiệu lực từ",
  "Last updated": "Cập nhật lần cuối",
  "On this page": "Trên trang này",
  "Checking {product}’s servers…": "Đang kiểm tra máy chủ {product}…",
  "All systems operational": "Mọi hệ thống đều hoạt động bình thường",
  "Some services are having problems. Your work is saved on your device and will sync when they recover.":
    "Một số dịch vụ đang gặp sự cố. Công việc của bạn đã được lưu trên thiết bị và sẽ đồng bộ khi dịch vụ hoạt động lại.",
  "Can’t reach {product} from this device. Check your connection; {product} keeps working offline.":
    "Không kết nối được {product} từ thiết bị này. Hãy kiểm tra kết nối; {product} vẫn hoạt động khi ngoại tuyến.",

  // Auth pages (AuthShell, sign-in, sign-up, reset)
  Terms: "Điều khoản",
  Privacy: "Quyền riêng tư",
  "Show password": "Hiện mật khẩu",
  "Hide password": "Ẩn mật khẩu",
  "Loading…": "Đang tải…",
  Email: "Email",
  Password: "Mật khẩu",
  "Forgot password?": "Quên mật khẩu?",
  or: "hoặc",
  "Check your email": "Kiểm tra email của bạn",
  "Back to sign in": "Quay lại đăng nhập",
  "Accounts aren’t available here": "Tài khoản không khả dụng ở đây",
  "This copy of {product} isn’t connected to the cloud. Your jobs are saved on this device.":
    "Bản {product} này không kết nối với đám mây. Các công trình của bạn được lưu trên thiết bị này.",
  "That link has expired or was already used. Sign in with your password, or send a new link.":
    "Liên kết đã hết hạn hoặc đã được sử dụng. Hãy đăng nhập bằng mật khẩu hoặc gửi liên kết mới.",
  "Enter your email address first, then press “Email me a sign-in link”.":
    "Hãy nhập địa chỉ email trước, rồi bấm “Gửi cho tôi liên kết đăng nhập”.",
  "Opening {product}…": "Đang mở {product}…",
  "If {email} has a {product} account, a sign-in link is on its way. Open it on the device you want to use. It can take a few minutes — check spam too.":
    "Nếu {email} có tài khoản {product}, liên kết đăng nhập đang được gửi đến. Hãy mở nó trên thiết bị bạn muốn dùng. Có thể mất vài phút — hãy kiểm tra cả thư rác.",
  "New to {product}?": "Mới dùng {product}?",
  "Welcome back. Sign in to sync your jobs across iPad, iPhone and the web.":
    "Chào mừng bạn trở lại. Đăng nhập để đồng bộ công trình giữa iPad, iPhone và bản web.",
  "Email confirmed. Sign in to finish setting up.": "Email đã được xác nhận. Đăng nhập để hoàn tất thiết lập.",
  "Email me a sign-in link": "Gửi cho tôi liên kết đăng nhập",
  "Got an invite from your company?": "Bạn nhận được lời mời từ công ty?",

  "There’s already an account with this email. {signIn} or {reset}.": "Đã có tài khoản dùng email này. {signIn} hoặc {reset}.",
  "reset your password": "đặt lại mật khẩu",
  "Your login is ready, but setting up {company} didn’t finish: {error} Press the button to try again.":
    "Tài khoản đăng nhập đã sẵn sàng, nhưng việc thiết lập {company} chưa xong: {error} Bấm nút để thử lại.",
  "Sign-up isn’t available here": "Không thể đăng ký ở đây",
  "This copy of {product} isn’t connected to the cloud, so there are no accounts. You can still use it on this device.":
    "Bản {product} này không kết nối với đám mây nên không có tài khoản. Bạn vẫn có thể dùng nó trên thiết bị này.",
  "You’re already signed in": "Bạn đã đăng nhập rồi",
  "Signed in as {email}.": "Đã đăng nhập bằng {email}.",
  "Signed in as {email}": "Đã đăng nhập bằng {email}",
  "Open {product}": "Mở {product}",
  "Sign out to create another company": "Đăng xuất để tạo công ty khác",
  "Have an account?": "Đã có tài khoản?",
  "Start your free trial": "Bắt đầu dùng thử miễn phí",
  "{n} day of everything in {product}. Set up your company now and invite your crew when you’re ready.": {
    other: "{n} ngày dùng mọi tính năng của {product}. Thiết lập công ty ngay bây giờ và mời đội thợ khi bạn sẵn sàng.",
  },
  "What does your company do?": "Công ty bạn làm lĩnh vực gì?",
  "Pick one or more — the first is your main trade. It sets up your device menu, catalog, wire types and checklists. You can change it later in Settings.":
    "Chọn một hoặc nhiều — mục đầu tiên là ngành chính của bạn. Lựa chọn này quyết định menu thiết bị, danh mục, loại dây và danh sách kiểm tra. Bạn có thể đổi sau trong Cài đặt.",
  "Company name": "Tên công ty",
  "Your name": "Tên của bạn",
  "First and last name": "Họ và tên",
  "Work email": "Email công việc",
  "I agree to the {terms} and {privacy}.": "Tôi đồng ý với {terms} và {privacy}.",
  "Setting up your company…": "Đang thiết lập công ty của bạn…",
  "Try again": "Thử lại",
  "Create company account": "Tạo tài khoản công ty",
  "Joining your company’s team?": "Bạn tham gia nhóm của công ty mình?",
  "Use your invite code": "Dùng mã mời",
  "We sent a confirmation link to {email}. Open it on any device — phone, tablet or computer — and sign in. We’ll finish setting up {company} for you.":
    "Chúng tôi đã gửi liên kết xác nhận đến {email}. Hãy mở nó trên bất kỳ thiết bị nào — điện thoại, máy tính bảng hay máy tính — rồi đăng nhập. Chúng tôi sẽ hoàn tất thiết lập {company} cho bạn.",
  "It can take a few minutes to arrive.": "Có thể mất vài phút để email đến.",
  "Check spam or promotions if you don’t see it.": "Nếu không thấy, hãy kiểm tra thư rác hoặc mục Quảng cáo.",
  "I’ve confirmed — sign in": "Tôi đã xác nhận — đăng nhập",
  "Sent again. Give it a few minutes.": "Đã gửi lại. Hãy chờ vài phút.",
  "Resend the email": "Gửi lại email",

  "That reset link has expired or was already used. Send yourself a new one below.":
    "Liên kết đặt lại đã hết hạn hoặc đã được sử dụng. Hãy gửi liên kết mới ở bên dưới.",
  "Couldn’t open that reset link. Send yourself a new one below and open it in this browser.":
    "Không mở được liên kết đặt lại. Hãy gửi liên kết mới ở bên dưới và mở nó trong trình duyệt này.",
  "This copy of {product} isn’t connected to the cloud, so there’s no password to reset.":
    "Bản {product} này không kết nối với đám mây nên không có mật khẩu để đặt lại.",
  "Password updated": "Đã cập nhật mật khẩu",
  "Use your new password to sign in on the iPad, iPhone and web.": "Dùng mật khẩu mới để đăng nhập trên iPad, iPhone và bản web.",
  "Continue to {product}": "Tiếp tục vào {product}",
  "Choose a new password": "Chọn mật khẩu mới",
  "For {email}.": "Cho {email}.",
  "Use at least {n} character.": {
    other: "Dùng ít nhất {n} ký tự.",
  },
  "The two passwords don’t match.": "Hai mật khẩu không khớp.",
  "Choose a password you haven’t used before.": "Hãy chọn mật khẩu bạn chưa từng dùng.",
  "New password": "Mật khẩu mới",
  "Repeat new password": "Nhập lại mật khẩu mới",
  "The two passwords don’t match yet.": "Hai mật khẩu chưa khớp.",
  "Save new password": "Lưu mật khẩu mới",
  "Opening your reset link…": "Đang mở liên kết đặt lại…",
  "If {email} has a {product} account, a reset link is on its way.": "Nếu {email} có tài khoản {product}, liên kết đặt lại đang được gửi đến.",
  "The email may take a few minutes to arrive — check spam too.": "Email có thể mất vài phút mới đến — hãy kiểm tra cả thư rác.",
  "Open the link in this browser to choose a new password.": "Mở liên kết trong trình duyệt này để chọn mật khẩu mới.",
  "Use a different email": "Dùng email khác",
  "Reset your password": "Đặt lại mật khẩu",
  "Enter the email you sign in with and we’ll send you a link to choose a new password. It may take a few minutes to arrive.":
    "Nhập email bạn dùng để đăng nhập, chúng tôi sẽ gửi liên kết để chọn mật khẩu mới. Có thể mất vài phút để email đến.",
  "Enter a valid email address.": "Nhập địa chỉ email hợp lệ.",
  "Send reset link": "Gửi liên kết đặt lại",

  // Account deletion: confirm it's you (the dialog itself is in Settings)
  "Not connected to the cloud.": "Chưa kết nối với đám mây.",
  "Sign out, sign in again, then delete your account.": "Hãy đăng xuất, đăng nhập lại rồi xóa tài khoản.",
  "Enter your password.": "Nhập mật khẩu của bạn.",
  "That password isn’t right. Try again, or type your email instead.": "Mật khẩu không đúng. Hãy thử lại hoặc nhập email thay thế.",
  "Type the email you sign in with.": "Nhập email bạn dùng để đăng nhập.",
  "Your sign-in has expired. Sign out, sign in again, then delete your account.":
    "Phiên đăng nhập đã hết hạn. Hãy đăng xuất, đăng nhập lại rồi xóa tài khoản.",
  "Confirm it’s you": "Xác nhận đây là bạn",
  "Your sign-in has expired. Enter your password to continue.": "Phiên đăng nhập đã hết hạn. Nhập mật khẩu để tiếp tục.",
  "To keep your account safe, enter your password again.": "Để bảo vệ tài khoản, hãy nhập lại mật khẩu.",
  "Your password": "Mật khẩu của bạn",
  "The email you sign in with": "Email bạn dùng để đăng nhập",
  "No password? Type your email instead": "Không có mật khẩu? Nhập email thay thế",
  "Use my password instead": "Dùng mật khẩu",

  // /join
  "That code isn’t valid any more. It may have been used already, revoked, or it’s older than 14 days. Ask whoever invited you for a new one.":
    "Mã này không còn hiệu lực. Có thể mã đã được dùng, đã bị thu hồi hoặc đã quá 14 ngày. Hãy xin mã mới từ người đã mời bạn.",
  "Enter the code from your invite — it looks like K7QM-XR4T-PA.": "Nhập mã trong lời mời — mã có dạng K7QM-XR4T-PA.",
  "Teams aren’t available on this server": "Máy chủ này không hỗ trợ nhóm",
  "This copy of {product} isn’t connected to the cloud, so there’s no team to join here. Ask your office for the {product} link they use.":
    "Bản {product} này không kết nối với đám mây nên không có nhóm nào để tham gia. Hãy hỏi văn phòng liên kết {product} mà họ đang dùng.",
  "Checking your invite…": "Đang kiểm tra lời mời…",
  "Join your company on {product}": "Tham gia công ty của bạn trên {product}",
  "Enter the invite code you got by text or email.": "Nhập mã mời bạn nhận qua tin nhắn hoặc email.",
  "Invite code": "Mã mời",
  Continue: "Tiếp tục",
  "Already set up?": "Đã thiết lập xong?",
  "Go to your jobs": "Đến công trình của bạn",
  "You’re invited to join": "Bạn được mời tham gia",
  "your company": "công ty của bạn",
  "as {role}": "với vai trò {role}",
  "Please accept the Terms and Privacy Policy.": "Vui lòng chấp nhận Điều khoản và Chính sách quyền riêng tư.",
  "That email and password don’t match an account. Check them, or create a new login.":
    "Email và mật khẩu này không khớp với tài khoản nào. Hãy kiểm tra lại hoặc tạo tài khoản đăng nhập mới.",
  "You already have a {product} account with this email. Sign in with its password to join.":
    "Bạn đã có tài khoản {product} với email này. Hãy đăng nhập bằng mật khẩu của tài khoản đó để tham gia.",
  "You already have an account with this email. Choose “I have an account” and sign in.":
    "Bạn đã có tài khoản với email này. Chọn “Tôi đã có tài khoản” rồi đăng nhập.",
  "You’re already on {team} as {email}.": "Bạn đã ở trong {team} với email {email}.",
  "You’re signed in as {email}, which is already on {team}. Leave that team in Settings → Team first, or sign out and use a different email.":
    "Bạn đang đăng nhập bằng {email}, tài khoản này đã thuộc {team}. Hãy rời nhóm đó trong Cài đặt → Nhóm trước, hoặc đăng xuất và dùng email khác.",
  "another team": "một nhóm khác",
  "Open jobs": "Mở công trình",
  "Your team sees this when they give you tasks, and it’s on the photos you take.":
    "Nhóm của bạn thấy tên này khi giao việc cho bạn, và tên này hiện trên ảnh bạn chụp.",
  "You’ll join as {name}.": "Bạn sẽ tham gia với tên {name}.",
  Change: "Đổi",
  "Checking sign-in…": "Đang kiểm tra đăng nhập…",
  "Joining as {email}.": "Tham gia bằng {email}.",
  "Not you?": "Không phải bạn?",
  "Join {team}": "Tham gia {team}",
  "Join the team": "Tham gia nhóm",
  "New to {product}": "Mới dùng {product}",
  "I have an account": "Tôi đã có tài khoản",
  "Choose a password": "Chọn mật khẩu",
  "At least {n} character": {
    other: "Ít nhất {n} ký tự",
  },
  "You’ll use this email and password on the iPad and iPhone app too.": "Bạn cũng sẽ dùng email và mật khẩu này trên ứng dụng iPad và iPhone.",
  "Creating your login…": "Đang tạo tài khoản đăng nhập…",
  "Create login & join": "Tạo tài khoản và tham gia",
  "Signing in…": "Đang đăng nhập…",
  "Sign in & join": "Đăng nhập và tham gia",
  "Use a different code": "Dùng mã khác",
  "You’re signed in and on {team}.": "Bạn đã đăng nhập và đã ở trong {team}.",
  "Check your email to finish": "Kiểm tra email để hoàn tất",
  "Your login is made, but it won’t work until you confirm it. We sent a confirmation link to {email}.":
    "Tài khoản đăng nhập đã được tạo, nhưng chỉ dùng được sau khi bạn xác nhận. Chúng tôi đã gửi liên kết xác nhận đến {email}.",
  "Open the email from {product} and tap the confirmation link.": "Mở email từ {product} và chạm vào liên kết xác nhận.",
  "Sign in with your password — you’ll join {team} automatically.": "Đăng nhập bằng mật khẩu — bạn sẽ tự động tham gia {team}.",
  "the team": "nhóm",
  "Nothing after a few minutes? Check spam. Already had a {product} account with this email? Just sign in below with its password.":
    "Sau vài phút vẫn chưa thấy? Hãy kiểm tra thư rác. Đã có tài khoản {product} với email này? Chỉ cần đăng nhập bên dưới bằng mật khẩu của tài khoản đó.",
  "Your email isn’t confirmed yet. Open the link in the email first.": "Email của bạn chưa được xác nhận. Hãy mở liên kết trong email trước.",
  "You’re on {team}": "Bạn đã ở trong {team}",
  "You’re on the team": "Bạn đã ở trong nhóm",
  "{open} to see every team job. They download in the background — give it a moment the first time.":
    "{open} để xem mọi công trình của nhóm. Dữ liệu tải ở chế độ nền — lần đầu có thể mất một lúc.",
  "Open Jobs": "Mở Công trình",
  "{where}, install {product} and sign in with {email} and the same password.":
    "{where}, cài {product} và đăng nhập bằng {email} với cùng mật khẩu.",
  "On iPad or iPhone": "Trên iPad hoặc iPhone",
  "the same email": "cùng email",
  "Prices, estimates and Billdu stay with the office, so you won’t see them.": "Giá, dự toán và Billdu chỉ dành cho văn phòng nên bạn sẽ không thấy chúng.",
  "Team settings": "Cài đặt nhóm",

  // /start: first-run checklist, technicians' start, "Set up your company"
  "Your business": "Doanh nghiệp của bạn",
  "Name, phone and logo for your estimates and client proposals.": "Tên, số điện thoại và logo cho dự toán và đề xuất gửi khách hàng.",
  "Upload your first floor plan": "Tải lên bản vẽ mặt bằng đầu tiên",
  "Start a job and add the plan — a PDF or a photo of it.": "Tạo công trình và thêm bản vẽ — tệp PDF hoặc ảnh chụp.",
  "Invite your team": "Mời nhóm của bạn",
  "Office staff and technicians each get their own login.": "Nhân viên văn phòng và kỹ thuật viên mỗi người có tài khoản riêng.",
  "Get the iPad and iPhone app": "Tải ứng dụng cho iPad và iPhone",
  "Walk the site with the plan; it all syncs to the office.": "Đi công trình với bản vẽ trong tay; mọi thứ đồng bộ về văn phòng.",
  "Setting up {company}…": "Đang thiết lập {company}…",
  "Welcome to {team}": "Chào mừng bạn đến với {team}",
  "Welcome to the team": "Chào mừng bạn vào nhóm",
  "Your jobs, plans, tasks and photos are ready. Use the app on site; this website works too.":
    "Công trình, bản vẽ, việc và ảnh của bạn đã sẵn sàng. Dùng ứng dụng tại công trình; trang web này cũng dùng được.",
  "Get the app": "Tải ứng dụng",
  "My tasks": "Việc của tôi",
  "{n}-day free trial": {
    other: "Dùng thử miễn phí {n} ngày",
  },
  "{team} is ready": "{team} đã sẵn sàng",
  "Welcome to {product}": "Chào mừng bạn đến với {product}",
  "Four quick steps and you’re ready for your next walkthrough. You can come back to this any time.":
    "Bốn bước nhanh là bạn đã sẵn sàng cho lần khảo sát công trường tới. Bạn có thể quay lại đây bất cứ lúc nào.",
  "All done": "Đã xong hết",
  "{done} of {total} done": "Xong {done}/{total}",
  "Hide this checklist": "Ẩn danh sách này",
  "Go to jobs": "Đến công trình",
  "Get set up · {done} of {total}": "Thiết lập · {done}/{total}",
  "Next: {step}": "Tiếp theo: {step}",
  "Hide the setup checklist": "Ẩn danh sách thiết lập",
  Hide: "Ẩn",
  Done: "Xong",
  "Saved on this device. It goes to your team when you’re back online.": "Đã lưu trên thiết bị này. Nhóm sẽ nhận được khi bạn có mạng trở lại.",
  "Business details saved": "Đã lưu thông tin doanh nghiệp",
  "Business name": "Tên doanh nghiệp",
  Phone: "Điện thoại",
  "Email on estimates": "Email trên dự toán",
  Website: "Trang web",
  "Your logo": "Logo của bạn",
  "No logo": "Chưa có logo",
  "Change logo": "Đổi logo",
  "Upload logo": "Tải logo lên",
  Save: "Lưu",
  "Address, colours and estimate terms →": "Địa chỉ, màu sắc và điều khoản báo giá →",
  Client: "Khách hàng",
  "Job address": "Địa chỉ công trình",
  "Create job and add the plan": "Tạo công trình và thêm bản vẽ",
  "Next you’ll pick the plan file: every page of a PDF becomes a floor.": "Tiếp theo bạn chọn file bản vẽ: mỗi trang PDF sẽ thành một tầng.",
  "Make an invite code for each person and text it to them. Technicians see plans, devices, photos and checklists — never prices.":
    "Tạo mã mời cho từng người và nhắn cho họ. Kỹ thuật viên thấy bản vẽ, thiết bị, ảnh và danh sách kiểm tra — không bao giờ thấy giá.",
  "I work alone — skip": "Tôi làm một mình — bỏ qua",
  "Get it on the App Store": "Tải trên App Store",
  "Or scan the code with your iPhone or iPad camera.": "Hoặc quét mã bằng camera iPhone hoặc iPad.",
  "The iPhone and iPad app is coming to the App Store. Until then, use this website on any device: on iPhone or iPad, open it in Safari and tap Share → Add to Home Screen.":
    "Ứng dụng iPhone và iPad sắp có trên App Store. Trong lúc chờ, hãy dùng trang web này trên mọi thiết bị: trên iPhone hoặc iPad, mở bằng Safari rồi chạm Chia sẻ → Thêm vào MH chính.",
  "Sign in with {email} and the same password. Your jobs sync automatically.": "Đăng nhập bằng {email} với cùng mật khẩu. Công trình sẽ tự động đồng bộ.",
  "QR code for the App Store page": "Mã QR đến trang App Store",
  "Set up your company": "Thiết lập công ty",
  "Everything in {product} belongs to your company: jobs, price list and crew. Your {n}-day free trial starts now.": {
    other: "Mọi thứ trong {product} thuộc về công ty của bạn: công trình, bảng giá và đội thợ. Thời gian dùng thử miễn phí {n} ngày bắt đầu từ bây giờ.",
  },
  "Your crew sees this, and it’s on the photos you take.": "Đội thợ sẽ thấy tên này, và tên được ghi trên ảnh bạn chụp.",
  "Pick one or more. It sets up your device list, price list and checklists. You can change it later in Settings.":
    "Chọn một hoặc nhiều. Lựa chọn này quyết định danh sách thiết bị, bảng giá và danh sách kiểm tra. Bạn có thể đổi sau trong Cài đặt.",
  "Set up my company": "Thiết lập công ty",
  "I have an invite code": "Tôi có mã mời",

  // /welcome (landing page)
  "Pin the plan. Send the quote. Get it signed.": "Ghim lên bản vẽ. Gửi báo giá. Nhận chữ ký.",
  "{product} is takeoff, quoting and job management for electrical, low-voltage and specialty contractors. Put each device on the floor plan, and the count, the wire and your price come straight from it.":
    "{product} là công cụ bóc khối lượng, báo giá và quản lý công trình cho nhà thầu điện, điện nhẹ và các ngành chuyên biệt. Đặt từng thiết bị lên bản vẽ mặt bằng — số lượng, dây và giá của bạn có ngay từ đó.",
  "See how it works": "Xem cách hoạt động",
  "Free for {n} day with every feature. Just looking? {demo}.": {
    other: "Miễn phí {n} ngày với đầy đủ tính năng. Chỉ xem qua? {demo}.",
  },
  "One job, from the first walkthrough to the final invoice": "Một công trình, từ lần khảo sát đầu tiên đến hóa đơn cuối cùng",
  "Each step uses what the last one made, so you never count the same plan twice or type a quote into an invoice.":
    "Mỗi bước dùng kết quả của bước trước, nên bạn không bao giờ phải đếm một bản vẽ hai lần hay gõ lại báo giá vào hóa đơn.",
  "Pin devices on the plans": "Ghim thiết bị lên bản vẽ",
  "Upload the PDF set or a photo of the drawings. Every page becomes a floor you can pinch, zoom and flip through. Tap a device from your trade’s list and tap where it goes.":
    "Tải lên bộ PDF hoặc ảnh chụp bản vẽ. Mỗi trang thành một tầng mà bạn có thể chụm, phóng to và lật qua lại. Chạm một thiết bị trong danh sách ngành của bạn rồi chạm vào vị trí đặt nó.",
  "Letters on the plan, like the legend on the drawings": "Ký hiệu chữ trên bản vẽ, giống chú giải trên bản vẽ thiết kế",
  "Wire runs drawn back to the panel, rack or closet": "Tuyến dây vẽ về tủ điện, tủ rack hoặc tủ thiết bị",
  "Set the scale once from any known dimension": "Đặt tỷ lệ một lần từ bất kỳ kích thước đã biết nào",
  "Get the count for every floor": "Có khối lượng cho từng tầng",
  "Device and wire counts add up as you pin, floor by floor. Wire lengths come out in feet with slack included, and electrical jobs get circuits and a panel schedule.":
    "Số lượng thiết bị và dây được cộng dồn khi bạn ghim, theo từng tầng. Chiều dài dây tính bằng feet, đã gồm phần dư, và công trình điện có thêm mạch và bảng phân phối tủ điện.",
  "Counts come only from what’s on the plan": "Khối lượng chỉ tính từ những gì có trên bản vẽ",
  "Export the count and marked-up sheets as PDF": "Xuất khối lượng và các tờ có ghi chú ra PDF",
  "Price it from your price list": "Tính giá từ bảng giá của bạn",
  "Your material and labor prices, markup and wire by the foot turn the count into a quote. Mark items optional and let the client decide.":
    "Giá vật tư và nhân công, phần cộng thêm và giá dây theo foot biến khối lượng thành báo giá. Đánh dấu hạng mục là tùy chọn để khách hàng tự quyết.",
  "Starting prices for your trade, all editable": "Giá khởi đầu cho ngành của bạn, sửa được hết",
  "Change the plan and the quote follows": "Đổi bản vẽ là báo giá đổi theo",
  "Your client approves on their phone": "Khách hàng duyệt ngay trên điện thoại",
  "Send the client a link. They read the quote, tick the options they want, sign with a finger and approve. No account or app for them.":
    "Gửi cho khách hàng một liên kết. Họ đọc báo giá, đánh dấu tùy chọn mình muốn, ký bằng ngón tay và duyệt. Họ không cần tài khoản hay ứng dụng.",
  "See when it’s opened and when it’s approved": "Biết khi nào báo giá được mở và khi nào được duyệt",
  "The approved options are added to the job": "Các tùy chọn đã duyệt được thêm vào công trình",
  "Bill the deposit, progress and final": "Lập hóa đơn đặt cọc, theo tiến độ và quyết toán",
  "Invoices come straight from the approved quote, so nothing is typed twice. Record payments as they come in and see what’s left to collect on every job.":
    "Hóa đơn lập thẳng từ báo giá đã duyệt nên không phải gõ lại gì. Ghi nhận các khoản thanh toán khi nhận được và xem còn phải thu bao nhiêu ở mỗi công trình.",
  "Quote and invoice numbering, tax and terms set once": "Đánh số báo giá và hóa đơn, thuế và điều khoản chỉ cần đặt một lần",
  "See what’s paid and what’s left on every job": "Xem đã thu bao nhiêu và còn lại bao nhiêu ở mỗi công trình",
  "Run the job in the field": "Điều hành công việc ở hiện trường",
  "The crew works from the same plans. Photos with mark-up, checklists and punch lists, tasks with who’s on them, daily logs and files all live on the job.":
    "Đội thợ làm việc trên cùng bản vẽ. Ảnh có ghi chú, danh sách kiểm tra và danh sách sửa lỗi, việc kèm người phụ trách, nhật ký hằng ngày và tài liệu — tất cả nằm trong công trình.",
  "Photos pinned to the spot on the plan": "Ảnh được ghim đúng vị trí trên bản vẽ",
  "Daily logs and photo reports ready to send": "Nhật ký hằng ngày và báo cáo ảnh sẵn sàng để gửi",
  "Your trade’s devices, already on the list": "Thiết bị của ngành bạn đã có sẵn trong danh sách",
  "Pick your trades when you sign up. Each one comes with its own devices, wire or pipe types and checklists, with starting prices you change to yours.":
    "Chọn ngành nghề khi đăng ký. Mỗi ngành có sẵn thiết bị, loại dây hoặc ống và danh sách kiểm tra riêng, kèm giá khởi đầu để bạn đổi thành giá của mình.",
  "Runs to": "Tuyến về",
  "{list} and more": "{list} và nhiều hơn nữa",
  "The office sees the money. The crew sees the work.": "Văn phòng thấy tiền. Đội thợ thấy việc.",
  "Invite your office staff and technicians with a code. Everyone works on the same jobs with their own login, and technician logins hide prices in the app.":
    "Mời nhân viên văn phòng và kỹ thuật viên bằng mã. Mọi người làm trên cùng công trình với tài khoản riêng, và tài khoản kỹ thuật viên bị ẩn giá trong ứng dụng.",
  "Owner and office": "Chủ và văn phòng",
  "Plans, counts, prices, quotes, invoices and settings.": "Bản vẽ, khối lượng, giá, báo giá, hóa đơn và cài đặt.",
  Technicians: "Kỹ thuật viên",
  "Plans, devices, photos, checklists, daily logs and their tasks. Prices, quotes and invoices are hidden in the app, and they can’t delete jobs.":
    "Bản vẽ, thiết bị, ảnh, danh sách kiểm tra, nhật ký hằng ngày và việc của họ. Giá, báo giá và hóa đơn bị ẩn trong ứng dụng, và họ không thể xóa công trình.",
  "Kitchen, first floor": "Bếp, tầng một",
  Office: "Văn phòng",
  "{n} on the plan": "{n} trên bản vẽ",
  "All set": "Đã lắp xong",
  "{done} of {total} set": "Đã lắp {done}/{total}",
  "Quote, invoices and margins": "Báo giá, hóa đơn và biên lợi nhuận",
  "Photos, checklist and today’s tasks": "Ảnh, danh sách kiểm tra và việc hôm nay",
  "No signal in the basement? Keep working.": "Tầng hầm mất sóng? Cứ tiếp tục làm.",
  "Every job is saved on the iPad or iPhone. Pin devices, take photos and tick checklists with no connection, and it all syncs when you’re back online.":
    "Mọi công trình được lưu trên iPad hoặc iPhone. Ghim thiết bị, chụp ảnh và đánh dấu danh sách kiểm tra khi không có mạng — tất cả sẽ đồng bộ khi có mạng trở lại.",
  iPad: "iPad",
  "Walk the site with the plans": "Đi công trường với bản vẽ",
  iPhone: "iPhone",
  "Photos, checklists and tasks": "Ảnh, danh sách kiểm tra và việc",
  Web: "Web",
  "Quotes and invoices at the desk": "Báo giá và hóa đơn tại bàn làm việc",
  "Large plan sets": "Bộ bản vẽ lớn",
  "Opens fast; pinch, zoom and flip sheets": "Mở nhanh; chụm, phóng to và lật tờ",
  "The same plan open on an iPad, an iPhone and a laptop": "Cùng một bản vẽ mở trên iPad, iPhone và laptop",
  "One price for the company": "Một mức giá cho cả công ty",
  "Every feature, every trade, unlimited jobs. Pay for the people who log in. Try it free for {n} day.": {
    other: "Mọi tính năng, mọi ngành nghề, không giới hạn công trình. Trả tiền theo số người đăng nhập. Dùng thử miễn phí {n} ngày.",
  },
  "See pricing": "Xem giá",
  Monthly: "Hằng tháng",
  "includes {n} user": {
    other: "gồm {n} người dùng",
  },
  "Each extra user": "Mỗi người dùng thêm",
  "a month": "mỗi tháng",
  "A crew of {n}": {
    other: "Đội {n} người",
  },
  "Free trial": "Dùng thử miễn phí",
  "{n} day": {
    other: "{n} ngày",
  },
  "every feature": "mọi tính năng",
  "Prices in USD, plus applicable tax.": "Giá tính bằng USD, chưa gồm thuế áp dụng.",
  "Questions contractors ask": "Câu hỏi nhà thầu thường hỏi",
  "Do I need internet on site?": "Có cần internet ở công trường không?",
  "No. Plans, devices, photos and checklists are saved on the iPad or phone and sync when you’re back online.":
    "Không. Bản vẽ, thiết bị, ảnh và danh sách kiểm tra được lưu trên iPad hoặc điện thoại và đồng bộ khi có mạng trở lại.",
  "What plans can I use?": "Tôi dùng được loại bản vẽ nào?",
  "PDF plan sets (every page becomes a floor), photos or scans of printed plans, or a sketch. Set the scale once from any known dimension.":
    "Bộ bản vẽ PDF (mỗi trang thành một tầng), ảnh chụp hoặc bản scan của bản vẽ giấy, hoặc bản phác thảo. Đặt tỷ lệ một lần từ bất kỳ kích thước đã biết nào.",
  "Which trades does it work for?": "Dùng được cho những ngành nào?",
  "Low voltage and smart home, electrical, fire alarm, HVAC, plumbing, and solar and EV charging. Pick one or several, and add your own devices to any list.":
    "Điện nhẹ và nhà thông minh, điện, báo cháy, HVAC (điều hòa thông gió), cấp thoát nước, điện mặt trời và sạc xe điện. Chọn một hoặc nhiều ngành, và thêm thiết bị của riêng bạn vào bất kỳ danh sách nào.",
  "Can my technicians use it without seeing prices?": "Kỹ thuật viên có dùng được mà không thấy giá không?",
  "Yes. Technicians get their own login for plans, devices, photos, checklists and tasks. Prices, quotes and invoices are hidden from them in the app.":
    "Có. Kỹ thuật viên có tài khoản riêng để xem bản vẽ, thiết bị, ảnh, danh sách kiểm tra và việc. Giá, báo giá và hóa đơn bị ẩn với họ trong ứng dụng.",
  "Does it work with my accounting?": "Có dùng được với phần mềm kế toán của tôi không?",
  "Quotes, invoices and payments are built into {product}, so you don’t need anything else. You can also export counts, quotes and plan sheets as PDF or CSV.":
    "Báo giá, hóa đơn và thanh toán đã có sẵn trong {product}, nên bạn không cần thêm gì. Bạn cũng có thể xuất khối lượng, báo giá và các tờ bản vẽ ra PDF hoặc CSV.",
  "What happens after the {n}-day trial?": {
    other: "Sau {n} ngày dùng thử thì sao?",
  },
  "Choose a plan to keep going. If you don’t, your jobs stay readable and you can export them any time. See {pricing}.":
    "Chọn gói để tiếp tục. Nếu không, công trình của bạn vẫn xem được và bạn có thể xuất chúng bất cứ lúc nào. Xem {pricing}.",
  pricing: "giá",
  "Is my data private?": "Dữ liệu của tôi có riêng tư không?",
  "Each company’s jobs are private to its team, enforced in the database. You can export everything or delete your account from Settings.":
    "Công trình của mỗi công ty chỉ nhóm của công ty đó thấy, được bảo đảm ngay trong cơ sở dữ liệu. Bạn có thể xuất mọi thứ hoặc xóa tài khoản trong Cài đặt.",
  "Bring your next set of plans": "Mang bộ bản vẽ tiếp theo của bạn đến",
  "Set up your company, upload a plan and send a real quote during the {n}-day trial. Bring the crew in when you’re ready.": {
    other: "Thiết lập công ty, tải lên bản vẽ và gửi một báo giá thật trong {n} ngày dùng thử. Mời đội thợ vào khi bạn sẵn sàng.",
  },
  // /welcome, Northpin redesign: trade strip, steps, features, crew
  "Starting device lists and prices for": "Danh sách thiết bị và giá khởi đầu cho",
  "Upload the plans": "Tải bản vẽ lên",
  "Drop in the PDF set or a photo of the drawings. Every page becomes a floor.":
    "Thả bộ PDF hoặc ảnh chụp bản vẽ vào. Mỗi trang thành một tầng.",
  "Pin every device": "Ghim từng thiết bị",
  "Tap a device from your trade’s list, then tap where it goes on the plan.":
    "Chạm một thiết bị trong danh sách ngành của bạn, rồi chạm vào vị trí của nó trên bản vẽ.",
  "Get the count": "Có ngay khối lượng",
  "Devices and wire add up per floor as you pin. Nothing is counted twice.":
    "Thiết bị và dây được cộng theo từng tầng khi bạn ghim. Không gì bị đếm hai lần.",
  "Send the quote": "Gửi báo giá",
  "Your prices turn the count into a quote the client signs on their phone.":
    "Giá của bạn biến khối lượng thành báo giá để khách hàng ký trên điện thoại.",
  "Bill and build": "Thu tiền và thi công",
  "Invoice from the approved quote while the crew works from the same plans.":
    "Lập hóa đơn từ báo giá đã duyệt trong khi đội thợ làm việc trên cùng bản vẽ.",
  "Count from the plan, floor by floor": "Bóc khối lượng từ bản vẽ, theo từng tầng",
  "Tap a device, tap the plan. Device and wire counts add up as you pin, with wire lengths in feet and slack included. Electrical jobs also get circuits and a panel schedule.":
    "Chạm thiết bị, chạm bản vẽ. Số lượng thiết bị và dây được cộng dồn khi bạn ghim, chiều dài dây tính bằng feet và đã gồm phần dư. Công trình điện còn có mạch và bảng phân phối tủ điện.",
  "A quote your client signs on their phone": "Báo giá khách hàng ký trên điện thoại",
  "Your material and labor prices, markup and wire by the foot turn the count into a quote. Send the client a link: they tick the options they want, sign with a finger and approve. No account or app for them.":
    "Giá vật tư và nhân công, phần cộng thêm và giá dây theo foot biến khối lượng thành báo giá. Gửi cho khách hàng một liên kết: họ đánh dấu tùy chọn mình muốn, ký bằng ngón tay và duyệt. Họ không cần tài khoản hay ứng dụng.",
  "Change orders signed the same way as quotes": "Lệnh thay đổi được ký giống như báo giá",

  // Pictures of the app on /welcome (illustrations; names, sheet numbers and wire types stay as they are)
  "An electrical floor plan with {n} device pinned on it and circuits drawn to the panel. Beside it, the count for the floor and a {total} quote that the client signed and approved on their phone.":
    {
      other: "Bản vẽ mặt bằng điện có {n} thiết bị được ghim và các mạch vẽ về tủ điện. Bên cạnh là khối lượng của tầng và báo giá {total} mà khách hàng đã ký và duyệt trên điện thoại.",
    },
  Receptacles: "Ổ cắm",
  "GFCI receptacles": "Ổ cắm chống giật GFCI",
  Switches: "Công tắc",
  "3-way switches": "Công tắc 3 chiều",
  "Recessed lights": "Đèn âm trần",
  "Surface fixtures": "Đèn gắn nổi",
  "Smoke alarms": "Báo khói",
  Job: "Công trình",
  Floor: "Tầng",
  "First floor power and lighting": "Điện và chiếu sáng tầng một",
  Sheet: "Tờ",
  "First floor count": "Khối lượng tầng một",
  "{n} device": { other: "{n} thiết bị" },
  "{ft} ft": "{ft} ft",
  "Quote {number}": "Báo giá {number}",
  "and {n} more line": {
    other: "và {n} dòng khác",
  },
  "Signed by {name}": "Người ký: {name}",
  Approved: "Đã duyệt",
  Basement: "Tầng hầm",
  "First floor": "Tầng một",
  "Second floor": "Tầng hai",
  "{n} floor from one PDF": {
    other: "{n} tầng từ một file PDF",
  },
  "Sheet {number}": "Tờ {number}",
  Viewing: "Đang xem",
  "Tap a device, then tap the plan": "Chạm một thiết bị, rồi chạm bản vẽ",
  "Device and wire count": "Khối lượng thiết bị và dây",
  "Updated as you pin": "Cập nhật khi bạn ghim",
  Device: "Thiết bị",
  "1st fl": "T1",
  "2nd fl": "T2",
  Total: "Tổng",
  "Panel schedule, {panel}": "Bảng phân mạch tủ {panel}",
  "Kitchen counter receptacles": "Ổ cắm mặt bếp",
  "Kitchen and dining lights": "Đèn bếp và phòng ăn",
  "Laundry and garage": "Phòng giặt và gara",
  "From your price list": "Từ bảng giá của bạn",
  "{wire} wire": "Dây {wire}",
  "Optional: under-cabinet lights, {ft} ft": "Tùy chọn: đèn dưới tủ bếp, {ft} ft",
  "Markup {pct}%, labor included": "Cộng thêm {pct}%, đã gồm nhân công",
  "Quote from your company": "Báo giá từ công ty của bạn",
  "Add under-cabinet lights": "Thêm đèn dưới tủ bếp",
  "Add EV outlet in garage": "Thêm ổ sạc xe điện ở gara",
  "Sign here": "Ký tại đây",
  "Approved by {name}": "Người duyệt: {name}",
  Money: "Tài chính",
  "Approved quote {total}": "Báo giá đã duyệt {total}",
  "Deposit, 50%": "Đặt cọc, 50%",
  "Progress, rough-in done": "Theo tiến độ, xong đi ống thô",
  Final: "Quyết toán",
  Paid: "Đã thanh toán",
  Sent: "Đã gửi",
  Draft: "Bản nháp",
  "Invoice {number}": "Hóa đơn {number}",
  "Left to collect": "Còn phải thu",
  "Move box 6 in. left": "Dời hộp sang trái 6 in.",
  "Kitchen, island wall": "Bếp, tường cạnh đảo bếp",
  "Pinned to {sheet}, tagged rough-in": "Ghim vào {sheet}, gắn thẻ đi ống thô",
  "Rough-in checklist": "Danh sách kiểm tra đi ống thô",
  "{done} of {total}": "{done}/{total}",
  "Boxes set at 16 in. to center": "Hộp đặt cao 16 in. tính đến tâm",
  "Home runs labelled at the panel": "Tuyến về tủ đã dán nhãn tại tủ",
  "Photo every wall before drywall": "Chụp ảnh mọi bức tường trước khi đóng thạch cao",
  Task: "Việc",
  "Pull circuits {from} to {to} to {panel}": "Kéo mạch {from} đến {to} về {panel}",
  "{name}, due Thursday": "{name}, hạn thứ Năm",

  // /pricing
  "One plan for the whole company": "Một gói cho cả công ty",
  "Every feature, every trade and unlimited jobs. You pay for the people who log in, and the first {n} day is free.": {
    other: "Mọi tính năng, mọi ngành nghề và không giới hạn công trình. Bạn trả tiền theo số người đăng nhập, và {n} ngày đầu được miễn phí.",
  },
  "People who log in": "Số người đăng nhập",
  "{n} user": {
    other: "{n} người dùng",
  },
  "{n} user, {total} a month": {
    other: "{n} người dùng, {total} mỗi tháng",
  },
  "{price} includes {n} user": {
    other: "{price} gồm {n} người dùng",
  },
  "plus {n} extra user at {price}": {
    other: "cộng {n} người dùng thêm, mỗi người {price}",
  },
  "a month, plus tax": "mỗi tháng, chưa gồm thuế",
  "Includes {n} user. Each extra user is {price} a month. USD, plus applicable tax.": {
    other: "Gồm {n} người dùng. Mỗi người dùng thêm {price} mỗi tháng. Tính bằng USD, chưa gồm thuế áp dụng.",
  },
  "You, office staff and technicians each count as one user. Clients never need a login.":
    "Bạn, nhân viên văn phòng và kỹ thuật viên — mỗi người tính là một người dùng. Khách hàng không bao giờ cần đăng nhập.",
  "{n} day free. Cancel any time, and your jobs stay yours to export.": {
    other: "Miễn phí {n} ngày. Hủy bất cứ lúc nào, và công trình vẫn là của bạn để xuất ra.",
  },
  "Every feature from day one. Set up your company, upload a plan and send a real quote before you decide.":
    "Đầy đủ tính năng ngay từ ngày đầu. Thiết lập công ty, tải lên bản vẽ và gửi một báo giá thật trước khi quyết định.",
  "Prices stay with the office": "Giá chỉ dành cho văn phòng",
  "Techs get their own login for plans, devices, photos, checklists and tasks. Their logins hide prices, quotes and invoices in the app.":
    "Kỹ thuật viên có tài khoản riêng để xem bản vẽ, thiết bị, ảnh, danh sách kiểm tra và việc. Tài khoản của họ bị ẩn giá, báo giá và hóa đơn trong ứng dụng.",
  "Your data, always": "Dữ liệu luôn là của bạn",
  "Export every job as a backup file any time: during the trial, after it, or after you cancel.":
    "Xuất mọi công trình thành file sao lưu bất cứ lúc nào: trong thời gian dùng thử, sau đó, hoặc sau khi bạn hủy.",
  "Private to your company": "Riêng cho công ty của bạn",
  "Jobs are visible only to your team, enforced in the database. Delete your account from Settings whenever you like.":
    "Công trình chỉ nhóm của bạn thấy, được bảo đảm ngay trong cơ sở dữ liệu. Xóa tài khoản trong Cài đặt bất cứ khi nào bạn muốn.",
  "Pricing questions": "Câu hỏi về giá",
  "Still deciding? {ask} or {demo}.": "Vẫn đang cân nhắc? {ask} hoặc {demo}.",
  "Ask us anything": "Hỏi chúng tôi bất cứ điều gì",
  "Can I cancel any time?": "Tôi có thể hủy bất cứ lúc nào không?",
  "Yes. There’s no contract: cancel from Settings and you won’t be charged again. Your jobs stay readable and exportable.":
    "Có. Không có hợp đồng: hủy trong Cài đặt và bạn sẽ không bị tính phí nữa. Công trình vẫn xem được và xuất được.",
  "What happens when the trial ends?": "Hết thời gian dùng thử thì sao?",
  "After {n} day, add a card to keep working. If you don’t, nothing is deleted: your jobs become read-only until you subscribe.": {
    other: "Sau {n} ngày, hãy thêm thẻ để tiếp tục làm việc. Nếu không, không có gì bị xóa: công trình chỉ xem được cho đến khi bạn đăng ký gói.",
  },
  "Who counts as a user?": "Ai được tính là người dùng?",
  "Anyone with their own login on your team: you, office staff and technicians. {n} is included; each extra person is {price} a month.": {
    other: "Bất kỳ ai trong nhóm có tài khoản đăng nhập riêng: bạn, nhân viên văn phòng và kỹ thuật viên. Đã gồm {n} người; mỗi người thêm {price} mỗi tháng.",
  },
  "What do technicians see?": "Kỹ thuật viên thấy gì?",
  "Plans, devices, wire runs, photos, checklists, daily logs and tasks on every team job. Prices, quotes and invoices are hidden from their logins in the app, and they can’t delete jobs.":
    "Bản vẽ, thiết bị, tuyến dây, ảnh, danh sách kiểm tra, nhật ký hằng ngày và việc trên mọi công trình của nhóm. Giá, báo giá và hóa đơn bị ẩn khỏi tài khoản của họ trong ứng dụng, và họ không thể xóa công trình.",
  "Do I need separate accounting software?": "Tôi có cần phần mềm kế toán riêng không?",
  "Not for quotes and invoices: quotes, invoices and payments are built in, and counts and quotes export as PDF or CSV for your bookkeeping.":
    "Không cần cho báo giá và hóa đơn: báo giá, hóa đơn và thanh toán đã có sẵn, còn khối lượng và báo giá xuất được ra PDF hoặc CSV cho sổ sách kế toán của bạn.",
  "Can I export my data?": "Tôi có thể xuất dữ liệu của mình không?",
  "Yes. Settings, then Account, then {export} downloads every job (plans, devices, photos and quotes) as one backup file you can restore into {product} on any device. Counts and quotes also export as PDF and CSV.":
    "Có. Vào Cài đặt → Tài khoản → {export} để tải mọi công trình (bản vẽ, thiết bị, ảnh và báo giá) thành một file sao lưu mà bạn có thể khôi phục vào {product} trên bất kỳ thiết bị nào. Khối lượng và báo giá cũng xuất được ra PDF và CSV.",
  "Export my data": "Xuất dữ liệu của tôi",
  "Do I pay for the iPad and iPhone apps?": "Tôi có phải trả tiền cho ứng dụng iPad và iPhone không?",
  "No. One subscription covers the web app and the iPad and iPhone apps for everyone on your team.":
    "Không. Một gói đăng ký dùng được cho bản web và ứng dụng iPad, iPhone cho mọi người trong nhóm.",
  "The crew reads it in their language. The client gets English.":
    "Đội thợ đọc bằng ngôn ngữ của mình. Khách hàng nhận bản tiếng Anh.",
  "Each person picks English, Spanish, Russian, Ukrainian, Polish, Portuguese, Chinese or Vietnamese, and the choice stays with their login. Plans, checklists, tasks and daily logs read in their language; quotes, invoices and client emails always go out in English.":
    "Mỗi người chọn tiếng Anh, Tây Ban Nha, Nga, Ukraina, Ba Lan, Bồ Đào Nha, Trung hoặc Việt, và lựa chọn được lưu theo tài khoản. Bản vẽ, danh sách kiểm tra, việc và nhật ký hằng ngày hiển thị bằng ngôn ngữ của họ; báo giá, hóa đơn và email gửi khách hàng luôn bằng tiếng Anh.",
  "All eight languages work in the web app today, in any computer, tablet or phone browser, and on the iPad and iPhone app.":
    "Cả tám ngôn ngữ đều đã dùng được trên bản web — trong trình duyệt của máy tính, máy tính bảng hay điện thoại — và trên ứng dụng iPad, iPhone.",
  "Can my crew use it in their own language?":
    "Đội thợ của tôi có dùng được bằng ngôn ngữ của họ không?",
  "Yes. Northpin speaks English, Spanish, Russian, Ukrainian, Polish, Portuguese, Chinese and Vietnamese. Anyone can switch from the menu or the page footer on the web, and the iPad and iPhone app follows the device language. The choice is saved on their login. Quotes, invoices and everything the client sees stay in English.":
    "Có. Northpin có tiếng Anh, Tây Ban Nha, Nga, Ukraina, Ba Lan, Bồ Đào Nha, Trung và Việt. Trên bản web, ai cũng có thể đổi ngôn ngữ trong menu hoặc ở chân trang, còn ứng dụng iPad và iPhone theo ngôn ngữ của thiết bị. Lựa chọn được lưu theo tài khoản. Báo giá, hóa đơn và mọi thứ khách hàng thấy vẫn bằng tiếng Anh.",
};

export default siteAuth;
