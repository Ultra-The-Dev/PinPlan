// 中文（简体）: public site (header, footer, /welcome, /pricing, support), sign-in, sign-up, password reset, /join, /start.
// Same keys as ../ru/site-auth.ts. Keys are the exact English source text. Glossary and rules: docs/i18n.md.
import type { Dictionary } from "../types";

const dict: Dictionary = {
  // Site header and footer
  "Skip to content": "跳到正文",
  "Open menu": "打开菜单",
  "Close menu": "关闭菜单",
  Site: "网站",
  "Site menu": "网站菜单",
  "How it works": "使用方式",
  Trades: "工种",
  Pricing: "价格",
  Questions: "常见问题",
  "Open the app": "打开应用",
  "Sign in": "登录",
  "Start free trial": "开始免费试用",
  Product: "产品",
  "Your team": "你的团队",
  "Join your team": "加入你的团队",
  Support: "支持",
  Legal: "法律信息",
  "Terms of Service": "服务条款",
  "Privacy Policy": "隐私政策",
  Subprocessors: "数据子处理方",
  "Data Processing Addendum": "数据处理附录",
  Security: "安全",
  Accessibility: "无障碍",
  "Plans, counts, quotes, invoices and field work for electrical, low-voltage and specialty contractors.":
    "为电气、弱电及专业工程承包商提供图纸、工程量、报价单、发票和现场管理。",
  "Try it without an account": "无需账号先试用",
  "Your account was deleted and this device was cleared.": "你的账号已删除，此设备上的数据已清除。",
  Dismiss: "关闭",

  // Legal pages (chrome; the documents themselves stay in English)
  DPA: "数据处理",
  Effective: "生效日期",
  "Last updated": "最后更新",
  "On this page": "本页内容",
  "Checking {product}’s servers…": "正在检查 {product} 服务器…",
  "All systems operational": "所有系统运行正常",
  "Some services are having problems. Your work is saved on your device and will sync when they recover.":
    "部分服务出现问题。你的工作已保存在设备上，服务恢复后会自动同步。",
  "Can’t reach {product} from this device. Check your connection; {product} keeps working offline.":
    "此设备无法连接 {product}。请检查网络；{product} 离线也能继续使用。",

  // Auth pages (AuthShell, sign-in, sign-up, reset)
  Terms: "条款",
  Privacy: "隐私",
  "Show password": "显示密码",
  "Hide password": "隐藏密码",
  "Loading…": "正在加载…",
  Email: "邮箱",
  Password: "密码",
  "Forgot password?": "忘记密码？",
  or: "或",
  "Check your email": "请查看邮箱",
  "Back to sign in": "返回登录",
  "Accounts aren’t available here": "此处无法使用账号",
  "This copy of {product} isn’t connected to the cloud. Your jobs are saved on this device.":
    "此 {product} 未连接云端。你的工程保存在这台设备上。",
  "That link has expired or was already used. Sign in with your password, or send a new link.":
    "该链接已过期或已被使用。请用密码登录，或重新发送链接。",
  "Enter your email address first, then press “Email me a sign-in link”.":
    "请先输入邮箱地址，然后点击“发送登录链接到邮箱”。",
  "Opening {product}…": "正在打开 {product}…",
  "If {email} has a {product} account, a sign-in link is on its way. Open it on the device you want to use. It can take a few minutes — check spam too.":
    "如果 {email} 有 {product} 账号，登录链接已发出。请在你要使用的设备上打开它。邮件可能需要几分钟才能到达，也请查看垃圾邮件。",
  "New to {product}?": "第一次使用 {product}？",
  "Welcome back. Sign in to sync your jobs across iPad, iPhone and the web.":
    "欢迎回来。登录后即可在 iPad、iPhone 和网页版之间同步工程。",
  "Email confirmed. Sign in to finish setting up.": "邮箱已确认。请登录完成设置。",
  "Email me a sign-in link": "发送登录链接到邮箱",
  "Got an invite from your company?": "收到公司的邀请了吗？",

  "There’s already an account with this email. {signIn} or {reset}.": "此邮箱已有账号。{signIn}或{reset}。",
  "reset your password": "重置密码",
  "Your login is ready, but setting up {company} didn’t finish: {error} Press the button to try again.":
    "账号已创建，但“{company}”的设置未完成：{error} 请点击按钮重试。",
  "Sign-up isn’t available here": "此处无法注册",
  "This copy of {product} isn’t connected to the cloud, so there are no accounts. You can still use it on this device.":
    "此 {product} 未连接云端，因此没有账号功能。你仍可以在这台设备上使用。",
  "You’re already signed in": "你已登录",
  "Signed in as {email}.": "已登录为 {email}。",
  "Signed in as {email}": "已登录为 {email}",
  "Open {product}": "打开 {product}",
  "Sign out to create another company": "退出登录以创建另一家公司",
  "Have an account?": "已有账号？",
  "Start your free trial": "开始免费试用",
  "{n} day of everything in {product}. Set up your company now and invite your crew when you’re ready.": {
    other: "{n} 天畅用 {product} 全部功能。现在设置公司，准备好后再邀请你的班组。",
  },
  "What does your company do?": "你的公司做什么业务？",
  "Pick one or more — the first is your main trade. It sets up your device menu, catalog, wire types and checklists. You can change it later in Settings.":
    "可选一个或多个，第一个为主要工种。它决定设备菜单、产品目录、线缆类型和检查清单。之后可在设置中更改。",
  "Company name": "公司名称",
  "Your name": "你的姓名",
  "First and last name": "姓名",
  "Work email": "工作邮箱",
  "I agree to the {terms} and {privacy}.": "我同意{terms}和{privacy}。",
  "Setting up your company…": "正在设置你的公司…",
  "Try again": "重试",
  "Create company account": "创建公司账号",
  "Joining your company’s team?": "要加入公司的团队？",
  "Use your invite code": "使用邀请码",
  "We sent a confirmation link to {email}. Open it on any device — phone, tablet or computer — and sign in. We’ll finish setting up {company} for you.":
    "我们已向 {email} 发送确认链接。在任何设备（手机、平板或电脑）上打开并登录，我们会帮你完成“{company}”的设置。",
  "It can take a few minutes to arrive.": "邮件可能需要几分钟才能到达。",
  "Check spam or promotions if you don’t see it.": "如果没收到，请查看垃圾邮件或推广邮件。",
  "I’ve confirmed — sign in": "已确认，去登录",
  "Sent again. Give it a few minutes.": "已重新发送，请稍等几分钟。",
  "Resend the email": "重新发送邮件",

  "That reset link has expired or was already used. Send yourself a new one below.":
    "该重置链接已过期或已被使用。请在下方重新发送一个。",
  "Couldn’t open that reset link. Send yourself a new one below and open it in this browser.":
    "无法打开该重置链接。请在下方重新发送，并在此浏览器中打开。",
  "This copy of {product} isn’t connected to the cloud, so there’s no password to reset.":
    "此 {product} 未连接云端，因此没有可重置的密码。",
  "Password updated": "密码已更新",
  "Use your new password to sign in on the iPad, iPhone and web.": "请用新密码在 iPad、iPhone 和网页版上登录。",
  "Continue to {product}": "进入 {product}",
  "Choose a new password": "设置新密码",
  "For {email}.": "账号：{email}。",
  "Use at least {n} character.": {
    other: "至少使用 {n} 个字符。",
  },
  "The two passwords don’t match.": "两次输入的密码不一致。",
  "Choose a password you haven’t used before.": "请设置一个以前没用过的密码。",
  "New password": "新密码",
  "Repeat new password": "再次输入新密码",
  "The two passwords don’t match yet.": "两次输入的密码还不一致。",
  "Save new password": "保存新密码",
  "Opening your reset link…": "正在打开重置链接…",
  "If {email} has a {product} account, a reset link is on its way.": "如果 {email} 有 {product} 账号，重置链接已发出。",
  "The email may take a few minutes to arrive — check spam too.": "邮件可能需要几分钟才能到达，也请查看垃圾邮件。",
  "Open the link in this browser to choose a new password.": "请在此浏览器中打开链接来设置新密码。",
  "Use a different email": "换一个邮箱",
  "Reset your password": "重置密码",
  "Enter the email you sign in with and we’ll send you a link to choose a new password. It may take a few minutes to arrive.":
    "输入你的登录邮箱，我们会发送设置新密码的链接。邮件可能需要几分钟才能到达。",
  "Enter a valid email address.": "请输入有效的邮箱地址。",
  "Send reset link": "发送重置链接",

  // Account deletion: confirm it's you (the dialog itself is in Settings)
  "Not connected to the cloud.": "未连接云端。",
  "Sign out, sign in again, then delete your account.": "请退出登录后重新登录，再删除账号。",
  "Enter your password.": "请输入密码。",
  "That password isn’t right. Try again, or type your email instead.": "密码不正确。请重试，或改为输入你的邮箱。",
  "Type the email you sign in with.": "请输入你的登录邮箱。",
  "Your sign-in has expired. Sign out, sign in again, then delete your account.":
    "登录已过期。请退出登录后重新登录，再删除账号。",
  "Confirm it’s you": "确认是你本人",
  "Your sign-in has expired. Enter your password to continue.": "登录已过期。请输入密码继续。",
  "To keep your account safe, enter your password again.": "为保护账号安全，请再次输入密码。",
  "Your password": "你的密码",
  "The email you sign in with": "你的登录邮箱",
  "No password? Type your email instead": "没有密码？改为输入邮箱",
  "Use my password instead": "改用密码",

  // /join
  "That code isn’t valid any more. It may have been used already, revoked, or it’s older than 14 days. Ask whoever invited you for a new one.":
    "此邀请码已失效：可能已被使用、已被撤销，或已超过 14 天。请向邀请你的人索取新的邀请码。",
  "Enter the code from your invite — it looks like K7QM-XR4T-PA.": "请输入邀请中的邀请码，格式如 K7QM-XR4T-PA。",
  "Teams aren’t available on this server": "此服务器不支持团队",
  "This copy of {product} isn’t connected to the cloud, so there’s no team to join here. Ask your office for the {product} link they use.":
    "此 {product} 未连接云端，因此这里没有可加入的团队。请向办公室询问他们使用的 {product} 链接。",
  "Checking your invite…": "正在检查邀请…",
  "Join your company on {product}": "在 {product} 上加入你的公司",
  "Enter the invite code you got by text or email.": "请输入你通过短信或邮件收到的邀请码。",
  "Invite code": "邀请码",
  Continue: "继续",
  "Already set up?": "已经设置好了？",
  "Go to your jobs": "前往你的工程",
  "You’re invited to join": "你受邀加入",
  "your company": "你的公司",
  "as {role}": "角色：{role}",
  "Please accept the Terms and Privacy Policy.": "请接受服务条款和隐私政策。",
  "That email and password don’t match an account. Check them, or create a new login.":
    "该邮箱和密码与任何账号都不匹配。请检查，或创建新账号。",
  "You already have a {product} account with this email. Sign in with its password to join.":
    "此邮箱已有 {product} 账号。请用该账号的密码登录后加入。",
  "You already have an account with this email. Choose “I have an account” and sign in.":
    "此邮箱已有账号。请选择“我有账号”并登录。",
  "You’re already on {team} as {email}.": "你已以 {email} 加入“{team}”。",
  "You’re signed in as {email}, which is already on {team}. Leave that team in Settings → Team first, or sign out and use a different email.":
    "你已登录为 {email}，该账号已属于{team}。请先在“设置 → 团队”中退出那个团队，或退出登录并换用其他邮箱。",
  "another team": "另一个团队",
  "Open jobs": "打开工程",
  "Your team sees this when they give you tasks, and it’s on the photos you take.":
    "团队给你分配任务时会看到这个名字，你拍的照片上也会显示。",
  "You’ll join as {name}.": "你将以 {name} 的身份加入。",
  Change: "更改",
  "Checking sign-in…": "正在检查登录…",
  "Joining as {email}.": "正在以 {email} 加入。",
  "Not you?": "不是你？",
  "Join {team}": "加入“{team}”",
  "Join the team": "加入团队",
  "New to {product}": "第一次使用 {product}",
  "I have an account": "我有账号",
  "Choose a password": "设置密码",
  "At least {n} character": {
    other: "至少 {n} 个字符",
  },
  "You’ll use this email and password on the iPad and iPhone app too.": "iPad 和 iPhone 应用也使用这个邮箱和密码。",
  "Creating your login…": "正在创建账号…",
  "Create login & join": "创建账号并加入",
  "Signing in…": "正在登录…",
  "Sign in & join": "登录并加入",
  "Use a different code": "使用其他邀请码",
  "You’re signed in and on {team}.": "你已登录并加入“{team}”。",
  "Check your email to finish": "请查看邮箱完成操作",
  "Your login is made, but it won’t work until you confirm it. We sent a confirmation link to {email}.":
    "账号已创建，但需确认后才能使用。我们已向 {email} 发送确认链接。",
  "Open the email from {product} and tap the confirmation link.": "打开 {product} 发来的邮件，点击确认链接。",
  "Sign in with your password — you’ll join {team} automatically.": "用密码登录，你会自动加入{team}。",
  "the team": "团队",
  "Nothing after a few minutes? Check spam. Already had a {product} account with this email? Just sign in below with its password.":
    "几分钟后还没收到？请查看垃圾邮件。此邮箱已有 {product} 账号？直接在下方用该账号的密码登录即可。",
  "Your email isn’t confirmed yet. Open the link in the email first.": "你的邮箱尚未确认。请先打开邮件中的链接。",
  "You’re on {team}": "你已加入“{team}”",
  "You’re on the team": "你已加入团队",
  "{open} to see every team job. They download in the background — give it a moment the first time.":
    "{open}即可查看团队的所有工程。工程会在后台下载，第一次可能需要一点时间。",
  "Open Jobs": "打开“工程”",
  "{where}, install {product} and sign in with {email} and the same password.":
    "{where}，安装 {product}，并用 {email} 和同一密码登录。",
  "On iPad or iPhone": "在 iPad 或 iPhone 上",
  "the same email": "同一邮箱",
  "Prices, estimates and Billdu stay with the office, so you won’t see them.": "价格、估价和 Billdu 只由办公室管理，你看不到这些内容。",
  "Team settings": "团队设置",

  // /start: first-run checklist, technicians' start, "Set up your company"
  "Your business": "你的公司",
  "Name, phone and logo for your estimates and client proposals.": "用于估价和客户方案的名称、电话和标志。",
  "Upload your first floor plan": "上传第一张楼层图纸",
  "Start a job and add the plan — a PDF or a photo of it.": "新建工程并添加图纸 — PDF 或图纸照片都可以。",
  "Invite your team": "邀请你的团队",
  "Office staff and technicians each get their own login.": "办公室人员和技术员各有自己的账号。",
  "Get the iPad and iPhone app": "获取 iPad 和 iPhone 应用",
  "Walk the site with the plan; it all syncs to the office.": "带着图纸走现场；所有内容都会同步到办公室。",
  "Setting up {company}…": "正在设置 {company}…",
  "Welcome to {team}": "欢迎加入“{team}”",
  "Welcome to the team": "欢迎加入团队",
  "Your jobs, plans, tasks and photos are ready. Use the app on site; this website works too.":
    "你的工程、图纸、任务和照片都准备好了。在现场使用应用；也可以用这个网站。",
  "Get the app": "获取应用",
  "My tasks": "我的任务",
  "{n}-day free trial": {
    other: "{n} 天免费试用",
  },
  "{team} is ready": "“{team}”已准备就绪",
  "Welcome to {product}": "欢迎使用 {product}",
  "Four quick steps and you’re ready for your next walkthrough. You can come back to this any time.":
    "只需四个简单步骤，就能准备好下次现场勘查。你可以随时回到这里。",
  "All done": "全部完成",
  "{done} of {total} done": "已完成 {done} / {total}",
  "Hide this checklist": "隐藏此清单",
  "Go to jobs": "前往工程",
  "Get set up · {done} of {total}": "设置 · {done} / {total}",
  "Next: {step}": "下一步：{step}",
  "Hide the setup checklist": "隐藏设置清单",
  Hide: "隐藏",
  Done: "完成",
  "Saved on this device. It goes to your team when you’re back online.": "已保存在此设备上。恢复联网后会同步给团队。",
  "Business details saved": "公司信息已保存",
  "Business name": "公司名称",
  Phone: "电话",
  "Email on estimates": "估价单上的邮箱",
  Website: "网站",
  "Your logo": "你的标志",
  "No logo": "无标志",
  "Change logo": "更换标志",
  "Upload logo": "上传标志",
  Save: "保存",
  "Address, colours and estimate terms →": "地址、颜色和报价条款 →",
  Client: "客户",
  "Job address": "工程地址",
  "Create job and add the plan": "创建工程并添加图纸",
  "Next you’ll pick the plan file: every page of a PDF becomes a floor.": "接下来选择图纸文件：PDF 的每一页都会成为一个楼层。",
  "Make an invite code for each person and text it to them. Technicians see plans, devices, photos and checklists — never prices.":
    "为每个人生成邀请码并通过短信发送。技术员能看到图纸、设备、照片和检查清单，但永远看不到价格。",
  "I work alone — skip": "我一个人干活，跳过",
  "Get it on the App Store": "在 App Store 下载",
  "Or scan the code with your iPhone or iPad camera.": "或用 iPhone 或 iPad 相机扫描二维码。",
  "The iPhone and iPad app is coming to the App Store. Until then, use this website on any device: on iPhone or iPad, open it in Safari and tap Share → Add to Home Screen.":
    "iPhone 和 iPad 应用即将登陆 App Store。在此之前，可在任何设备上使用本网站：在 iPhone 或 iPad 上用 Safari 打开，点按“共享”→“添加到主屏幕”。",
  "Sign in with {email} and the same password. Your jobs sync automatically.": "用 {email} 和同一密码登录。工程会自动同步。",
  "QR code for the App Store page": "App Store 页面的二维码",
  "Set up your company": "设置你的公司",
  "Everything in {product} belongs to your company: jobs, price list and crew. Your {n}-day free trial starts now.": {
    other: "{product} 中的一切都属于你的公司：工程、价目表和班组。你的 {n} 天免费试用现在开始。",
  },
  "Your crew sees this, and it’s on the photos you take.": "班组能看到，也会显示在你拍的照片上。",
  "Pick one or more. It sets up your device list, price list and checklists. You can change it later in Settings.":
    "可选一个或多个。它决定设备列表、价目表和检查清单。之后可在设置中更改。",
  "Set up my company": "设置我的公司",
  "I have an invite code": "我有邀请码",

  // /welcome (landing page)
  "Pin the plan. Send the quote. Get it signed.": "图上标点，发出报价，客户签字。",
  "{product} is takeoff, quoting and job management for electrical, low-voltage and specialty contractors. Put each device on the floor plan, and the count, the wire and your price come straight from it.":
    "{product} 为电气、弱电及专业工程承包商提供工程量统计、报价和工程管理。把每个设备标在平面图上，数量、线缆和价格直接从图上得出。",
  "See how it works": "看看怎么用",
  "Free for {n} day with every feature. Just looking? {demo}.": {
    other: "{n} 天免费，全部功能可用。只是看看？{demo}。",
  },
  "One job, from the first walkthrough to the final invoice": "一个工程，从首次勘查到最终发票",
  "Each step uses what the last one made, so you never count the same plan twice or type a quote into an invoice.":
    "每一步都沿用上一步的结果，同一张图纸不用数两遍，报价单也不用重新录入成发票。",
  "Pin devices on the plans": "在图纸上标设备",
  "Upload the PDF set or a photo of the drawings. Every page becomes a floor you can pinch, zoom and flip through. Tap a device from your trade’s list and tap where it goes.":
    "上传整套 PDF 图纸或图纸照片。每一页都会成为一个楼层，可以双指缩放、翻页查看。从你工种的列表中点选设备，再点它所在的位置。",
  "Letters on the plan, like the legend on the drawings": "图上用字母标注，和图纸图例一样",
  "Wire runs drawn back to the panel, rack or closet": "线路一直画到配电箱、机柜或弱电间",
  "Set the scale once from any known dimension": "根据任一已知尺寸设置一次比例",
  "Get the count for every floor": "每个楼层的工程量",
  "Device and wire counts add up as you pin, floor by floor. Wire lengths come out in feet with slack included, and electrical jobs get circuits and a panel schedule.":
    "边标注边累计设备和线缆数量，逐层统计。线缆长度以英尺计并含余量，电气工程还会生成回路和配电箱表。",
  "Counts come only from what’s on the plan": "数量只来自图上已标注的内容",
  "Export the count and marked-up sheets as PDF": "将工程量和带标注的图页导出为 PDF",
  "Price it from your price list": "按你的价目表计价",
  "Your material and labor prices, markup and wire by the foot turn the count into a quote. Mark items optional and let the client decide.":
    "用你的材料价、人工价、加价和每英尺线缆价，把工程量变成报价单。可将项目标为可选，由客户决定。",
  "Starting prices for your trade, all editable": "按工种预设的起始价格，均可修改",
  "Change the plan and the quote follows": "图纸一改，报价单跟着变",
  "Your client approves on their phone": "客户在手机上确认",
  "Send the client a link. They read the quote, tick the options they want, sign with a finger and approve. No account or app for them.":
    "给客户发一个链接。客户查看报价单，勾选想要的可选项，用手指签名并确认。客户无需账号或应用。",
  "See when it’s opened and when it’s approved": "随时知道何时被打开、何时被确认",
  "The approved options are added to the job": "已确认的可选项会加入工程",
  "Bill the deposit, progress and final": "开具定金、进度款和尾款发票",
  "Invoices come straight from the approved quote, so nothing is typed twice. Record payments as they come in and see what’s left to collect on every job.":
    "发票直接由已确认的报价单生成，无需重复录入。收到付款随时记录，每个工程还剩多少未收一目了然。",
  "Quote and invoice numbering, tax and terms set once": "报价单和发票编号、税率和条款只需设置一次",
  "See what’s paid and what’s left on every job": "每个工程已付多少、剩多少，一目了然",
  "Run the job in the field": "在现场管理工程",
  "The crew works from the same plans. Photos with mark-up, checklists and punch lists, tasks with who’s on them, daily logs and files all live on the job.":
    "班组使用同一套图纸。带标注的照片、检查清单和整改清单、指派到人的任务、施工日志和文件，都保存在工程里。",
  "Photos pinned to the spot on the plan": "照片固定在图纸上的对应位置",
  "Daily logs and photo reports ready to send": "施工日志和照片报告随时可发送",
  "Your trade’s devices, already on the list": "你工种的设备，已在列表中",
  "Pick your trades when you sign up. Each one comes with its own devices, wire or pipe types and checklists, with starting prices you change to yours.":
    "注册时选择你的工种。每个工种都有自己的设备、线缆或管材类型和检查清单，起始价格可改成你自己的。",
  "Runs to": "线路至",
  "{list} and more": "{list}等",
  "The office sees the money. The crew sees the work.": "办公室看账，班组看活。",
  "Invite your office staff and technicians with a code. Everyone works on the same jobs with their own login, and technician logins hide prices in the app.":
    "用邀请码邀请办公室人员和技术员。每个人用自己的账号处理同样的工程，技术员账号在应用中看不到价格。",
  "Owner and office": "老板和办公室",
  "Plans, counts, prices, quotes, invoices and settings.": "图纸、工程量、价格、报价单、发票和设置。",
  Technicians: "技术员",
  "Plans, devices, photos, checklists, daily logs and their tasks. Prices, quotes and invoices are hidden in the app, and they can’t delete jobs.":
    "图纸、设备、照片、检查清单、施工日志和自己的任务。价格、报价单和发票在应用中隐藏，且不能删除工程。",
  "Kitchen, first floor": "厨房，一楼",
  Office: "办公室",
  "{n} on the plan": "图上 {n} 个",
  "All set": "全部安装",
  "{done} of {total} set": "已安装 {done}/{total}",
  "Quote, invoices and margins": "报价单、发票和利润",
  "Photos, checklist and today’s tasks": "照片、检查清单和今日任务",
  "No signal in the basement? Keep working.": "地下室没信号？照样干活。",
  "Every job is saved on the iPad or iPhone. Pin devices, take photos and tick checklists with no connection, and it all syncs when you’re back online.":
    "每个工程都保存在 iPad 或 iPhone 上。没有网络也能标设备、拍照片、勾检查清单，恢复联网后全部自动同步。",
  iPad: "iPad",
  "Walk the site with the plans": "带着图纸走现场",
  iPhone: "iPhone",
  "Photos, checklists and tasks": "照片、检查清单和任务",
  Web: "网页版",
  "Quotes and invoices at the desk": "在办公桌前处理报价单和发票",
  "Large plan sets": "大型图纸集",
  "Opens fast; pinch, zoom and flip sheets": "打开快速；图页可缩放、翻看",
  "The same plan open on an iPad, an iPhone and a laptop": "同一张图纸在 iPad、iPhone 和笔记本电脑上打开",
  "One price for the company": "全公司一个价格",
  "Every feature, every trade, unlimited jobs. Pay for the people who log in. Try it free for {n} day.": {
    other: "全部功能、所有工种、工程不限数量。按登录人数付费。免费试用 {n} 天。",
  },
  "See pricing": "查看价格",
  Monthly: "每月",
  "includes {n} user": {
    other: "含 {n} 个用户",
  },
  "Each extra user": "每增加一个用户",
  "a month": "每月",
  "A crew of {n}": {
    other: "{n} 人班组",
  },
  "Free trial": "免费试用",
  "{n} day": {
    other: "{n} 天",
  },
  "every feature": "全部功能",
  "Prices in USD, plus applicable tax.": "价格以美元计，另加适用税费。",
  "Questions contractors ask": "承包商常问的问题",
  "Do I need internet on site?": "现场需要网络吗？",
  "No. Plans, devices, photos and checklists are saved on the iPad or phone and sync when you’re back online.":
    "不需要。图纸、设备、照片和检查清单都保存在 iPad 或手机上，恢复联网后自动同步。",
  "What plans can I use?": "可以用哪些图纸？",
  "PDF plan sets (every page becomes a floor), photos or scans of printed plans, or a sketch. Set the scale once from any known dimension.":
    "PDF 图纸集（每一页成为一个楼层）、纸质图纸的照片或扫描件，或草图都可以。根据任一已知尺寸设置一次比例即可。",
  "Which trades does it work for?": "适用于哪些工种？",
  "Low voltage and smart home, electrical, fire alarm, HVAC, plumbing, and solar and EV charging. Pick one or several, and add your own devices to any list.":
    "弱电与智能家居、电气、火灾报警、暖通空调、给排水，以及光伏和电动车充电。可选一个或多个，并可向任何列表添加自己的设备。",
  "Can my technicians use it without seeing prices?": "技术员可以用它而看不到价格吗？",
  "Yes. Technicians get their own login for plans, devices, photos, checklists and tasks. Prices, quotes and invoices are hidden from them in the app.":
    "可以。技术员有自己的账号，用于图纸、设备、照片、检查清单和任务。价格、报价单和发票在应用中对他们隐藏。",
  "Does it work with my accounting?": "能配合我的记账吗？",
  "Quotes, invoices and payments are built into {product}, so you don’t need anything else. You can also export counts, quotes and plan sheets as PDF or CSV.":
    "{product} 内置报价单、发票和收款功能，无需其他软件。你也可以将工程量、报价单和图页导出为 PDF 或 CSV。",
  "What happens after the {n}-day trial?": {
    other: "{n} 天试用期结束后会怎样？",
  },
  "Choose a plan to keep going. If you don’t, your jobs stay readable and you can export them any time. See {pricing}.":
    "选择一个套餐即可继续使用。如果不选，你的工程仍可查看，并可随时导出。查看{pricing}。",
  pricing: "价格",
  "Is my data private?": "我的数据安全吗？",
  "Each company’s jobs are private to its team, enforced in the database. You can export everything or delete your account from Settings.":
    "每家公司的工程只有自己团队能看到，由数据库层面保证。你可以在设置中导出全部数据或删除账号。",
  "Bring your next set of plans": "拿下一套图纸来试试",
  "Set up your company, upload a plan and send a real quote during the {n}-day trial. Bring the crew in when you’re ready.": {
    other: "在 {n} 天试用期内设置公司、上传图纸并发出一份真实报价单。准备好后再让班组加入。",
  },
  // /welcome, Northpin redesign: trade strip, steps, features, crew
  "Starting device lists and prices for": "预设设备列表和价格，适用于",
  "Upload the plans": "上传图纸",
  "Drop in the PDF set or a photo of the drawings. Every page becomes a floor.":
    "放入整套 PDF 图纸或图纸照片。每一页都会成为一个楼层。",
  "Pin every device": "标出每个设备",
  "Tap a device from your trade’s list, then tap where it goes on the plan.":
    "从你工种的列表中点选设备，再点图纸上的安装位置。",
  "Get the count": "得出工程量",
  "Devices and wire add up per floor as you pin. Nothing is counted twice.":
    "边标注边按楼层累计设备和线缆，不会重复计数。",
  "Send the quote": "发出报价单",
  "Your prices turn the count into a quote the client signs on their phone.":
    "你的价格把工程量变成报价单，客户在手机上签字。",
  "Bill and build": "开票和施工",
  "Invoice from the approved quote while the crew works from the same plans.":
    "根据已确认的报价单开发票，班组同时按同一套图纸施工。",
  "Count from the plan, floor by floor": "按图纸逐层统计",
  "Tap a device, tap the plan. Device and wire counts add up as you pin, with wire lengths in feet and slack included. Electrical jobs also get circuits and a panel schedule.":
    "点选设备，再点图纸。边标注边累计设备和线缆数量，线缆长度以英尺计并含余量。电气工程还会生成回路和配电箱表。",
  "A quote your client signs on their phone": "客户在手机上签字的报价单",
  "Your material and labor prices, markup and wire by the foot turn the count into a quote. Send the client a link: they tick the options they want, sign with a finger and approve. No account or app for them.":
    "用你的材料价、人工价、加价和每英尺线缆价，把工程量变成报价单。给客户发一个链接：客户勾选想要的可选项，用手指签名并确认。客户无需账号或应用。",
  "Change orders signed the same way as quotes": "变更单的签字方式与报价单相同",

  // Pictures of the app on /welcome (illustrations; names, sheet numbers and wire types stay as they are)
  "An electrical floor plan with {n} device pinned on it and circuits drawn to the panel. Beside it, the count for the floor and a {total} quote that the client signed and approved on their phone.":
    {
      other: "一张电气平面图，上面标有 {n} 个设备，回路画到配电箱。旁边是该楼层的工程量，以及一份客户已在手机上签字确认的 {total} 报价单。",
    },
  Receptacles: "插座",
  "GFCI receptacles": "GFCI 漏电保护插座",
  Switches: "开关",
  "3-way switches": "双控开关",
  "Recessed lights": "嵌入式灯",
  "Surface fixtures": "明装灯具",
  "Smoke alarms": "烟雾报警器",
  Job: "工程",
  Floor: "楼层",
  "First floor power and lighting": "一楼电源与照明",
  Sheet: "图页",
  "First floor count": "一楼工程量",
  "{n} device": { other: "{n} 个设备" },
  "{ft} ft": "{ft} ft",
  "Quote {number}": "报价单 {number}",
  "and {n} more line": {
    other: "另有 {n} 行",
  },
  "Signed by {name}": "签字人：{name}",
  Approved: "已确认",
  Basement: "地下室",
  "First floor": "一楼",
  "Second floor": "二楼",
  "{n} floor from one PDF": {
    other: "一个 PDF 生成 {n} 个楼层",
  },
  "Sheet {number}": "图页 {number}",
  Viewing: "正在查看",
  "Tap a device, then tap the plan": "点选设备，再点图纸",
  "Device and wire count": "设备和线缆数量",
  "Updated as you pin": "随标注实时更新",
  Device: "设备",
  "1st fl": "1 楼",
  "2nd fl": "2 楼",
  Total: "合计",
  "Panel schedule, {panel}": "配电箱表，{panel}",
  "Kitchen counter receptacles": "厨房台面插座",
  "Kitchen and dining lights": "厨房和餐厅照明",
  "Laundry and garage": "洗衣房和车库",
  "From your price list": "来自你的价目表",
  "{wire} wire": "{wire} 线缆",
  "Optional: under-cabinet lights, {ft} ft": "可选：橱柜下灯带，{ft} ft",
  "Markup {pct}%, labor included": "加价 {pct}%，含人工",
  "Quote from your company": "来自你公司的报价单",
  "Add under-cabinet lights": "加装橱柜下灯带",
  "Add EV outlet in garage": "车库加装电动车充电插座",
  "Sign here": "在此签名",
  "Approved by {name}": "确认人：{name}",
  Money: "财务",
  "Approved quote {total}": "已确认报价单 {total}",
  "Deposit, 50%": "定金，50%",
  "Progress, rough-in done": "进度款，粗装完成",
  Final: "尾款",
  Paid: "已付款",
  Sent: "已发送",
  Draft: "草稿",
  "Invoice {number}": "发票 {number}",
  "Left to collect": "待收款",
  "Move box 6 in. left": "接线盒向左移 6 英寸",
  "Kitchen, island wall": "厨房，岛台旁墙面",
  "Pinned to {sheet}, tagged rough-in": "固定在 {sheet}，标签：粗装",
  "Rough-in checklist": "粗装检查清单",
  "{done} of {total}": "{done}/{total}",
  "Boxes set at 16 in. to center": "接线盒中心高 16 英寸",
  "Home runs labelled at the panel": "回路已在配电箱处标记",
  "Photo every wall before drywall": "封石膏板前每面墙拍照",
  Task: "任务",
  "Pull circuits {from} to {to} to {panel}": "将回路 {from} 至 {to} 拉到 {panel}",
  "{name}, due Thursday": "{name}，周四到期",

  // /pricing
  "One plan for the whole company": "全公司一个套餐",
  "Every feature, every trade and unlimited jobs. You pay for the people who log in, and the first {n} day is free.": {
    other: "全部功能、所有工种，工程不限数量。按登录人数付费，前 {n} 天免费。",
  },
  "People who log in": "登录人数",
  "{n} user": {
    other: "{n} 个用户",
  },
  "{n} user, {total} a month": {
    other: "{n} 个用户，每月 {total}",
  },
  "{price} includes {n} user": {
    other: "{price} 含 {n} 个用户",
  },
  "plus {n} extra user at {price}": {
    other: "另加 {n} 个额外用户，每个 {price}",
  },
  "a month, plus tax": "每月，另加税费",
  "Includes {n} user. Each extra user is {price} a month. USD, plus applicable tax.": {
    other: "含 {n} 个用户。每增加一个用户每月 {price}。以美元计，另加适用税费。",
  },
  "You, office staff and technicians each count as one user. Clients never need a login.":
    "你、办公室人员和技术员各算一个用户。客户无需登录。",
  "{n} day free. Cancel any time, and your jobs stay yours to export.": {
    other: "{n} 天免费。可随时取消，你的工程始终归你，可随时导出。",
  },
  "Every feature from day one. Set up your company, upload a plan and send a real quote before you decide.":
    "第一天起即可使用全部功能。在决定之前，先设置公司、上传图纸并发出一份真实报价单。",
  "Prices stay with the office": "价格只留在办公室",
  "Techs get their own login for plans, devices, photos, checklists and tasks. Their logins hide prices, quotes and invoices in the app.":
    "技术员有自己的账号，用于图纸、设备、照片、检查清单和任务。他们的账号在应用中看不到价格、报价单和发票。",
  "Your data, always": "数据永远属于你",
  "Export every job as a backup file any time: during the trial, after it, or after you cancel.":
    "随时将所有工程导出为备份文件：试用期间、试用结束后或取消订阅后都可以。",
  "Private to your company": "仅限你的公司",
  "Jobs are visible only to your team, enforced in the database. Delete your account from Settings whenever you like.":
    "工程只有你的团队能看到，由数据库层面保证。你可以随时在设置中删除账号。",
  "Pricing questions": "价格常见问题",
  "Still deciding? {ask} or {demo}.": "还在考虑？{ask}，或{demo}。",
  "Ask us anything": "随时向我们提问",
  "Can I cancel any time?": "可以随时取消吗？",
  "Yes. There’s no contract: cancel from Settings and you won’t be charged again. Your jobs stay readable and exportable.":
    "可以。没有合同约束：在设置中取消后不会再扣费。你的工程仍可查看和导出。",
  "What happens when the trial ends?": "试用期结束后会怎样？",
  "After {n} day, add a card to keep working. If you don’t, nothing is deleted: your jobs become read-only until you subscribe.": {
    other: "{n} 天后，添加银行卡即可继续使用。如果不添加，也不会删除任何内容：你的工程变为只读，直到你订阅为止。",
  },
  "Who counts as a user?": "谁算作用户？",
  "Anyone with their own login on your team: you, office staff and technicians. {n} is included; each extra person is {price} a month.": {
    other: "团队中每个有自己账号的人：你、办公室人员和技术员。含 {n} 个用户；每多一人每月 {price}。",
  },
  "What do technicians see?": "技术员能看到什么？",
  "Plans, devices, wire runs, photos, checklists, daily logs and tasks on every team job. Prices, quotes and invoices are hidden from their logins in the app, and they can’t delete jobs.":
    "团队所有工程中的图纸、设备、线路、照片、检查清单、施工日志和任务。价格、报价单和发票在应用中对他们的账号隐藏，且不能删除工程。",
  "Do I need separate accounting software?": "需要另外的记账软件吗？",
  "Not for quotes and invoices: quotes, invoices and payments are built in, and counts and quotes export as PDF or CSV for your bookkeeping.":
    "报价和开票不需要：报价单、发票和收款都已内置，工程量和报价单可导出为 PDF 或 CSV 供你记账。",
  "Can I export my data?": "可以导出我的数据吗？",
  "Yes. Settings, then Account, then {export} downloads every job (plans, devices, photos and quotes) as one backup file you can restore into {product} on any device. Counts and quotes also export as PDF and CSV.":
    "可以。在“设置”→“账号”→{export}，即可把所有工程（图纸、设备、照片和报价单）下载为一个备份文件，可在任何设备上恢复到 {product}。工程量和报价单也可导出为 PDF 和 CSV。",
  "Export my data": "导出我的数据",
  "Do I pay for the iPad and iPhone apps?": "iPad 和 iPhone 应用要另外付费吗？",
  "No. One subscription covers the web app and the iPad and iPhone apps for everyone on your team.":
    "不用。一个订阅即可让团队所有人使用网页版以及 iPad 和 iPhone 应用。",
  "The crew reads it in their language. The client gets English.":
    "班组用自己的语言看，客户收到英文。",
  "Each person picks English, Spanish, Russian, Ukrainian, Polish, Portuguese, Chinese or Vietnamese, and the choice stays with their login. Plans, checklists, tasks and daily logs read in their language; quotes, invoices and client emails always go out in English.":
    "每个人可选择英语、西班牙语、俄语、乌克兰语、波兰语、葡萄牙语、中文或越南语，选择会保存在自己的账号中。图纸、检查清单、任务和施工日志都以其语言显示；报价单、发票和客户邮件始终以英文发出。",
  "All eight languages work in the web app today, in any computer, tablet or phone browser, and on the iPad and iPhone app.":
    "八种语言现已全部支持网页版（电脑、平板或手机浏览器均可）以及 iPad 和 iPhone 应用。",
  "Can my crew use it in their own language?":
    "班组可以用自己的语言吗？",
  "Yes. Northpin speaks English, Spanish, Russian, Ukrainian, Polish, Portuguese, Chinese and Vietnamese. Anyone can switch from the menu or the page footer on the web, and the iPad and iPhone app follows the device language. The choice is saved on their login. Quotes, invoices and everything the client sees stay in English.":
    "可以。Northpin 支持英语、西班牙语、俄语、乌克兰语、波兰语、葡萄牙语、中文和越南语。在网页版中，任何人都可以从菜单或页面底部切换语言，iPad 和 iPhone 应用则跟随设备语言。选择会保存在账号中。报价单、发票以及客户能看到的所有内容都保持英文。",
};

export default dict;
