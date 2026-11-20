// Português (Brasil): public site (header, footer, /welcome, /pricing, support), sign-in, sign-up, password reset, /join, /start.
// Same keys as ../ru/site-auth.ts. Keys are the exact English source text. Glossary and rules: docs/i18n.md.
import type { Dictionary } from "../types";

const siteAuth: Dictionary = {
  // Site header and footer
  "Skip to content": "Pular para o conteúdo",
  "Open menu": "Abrir menu",
  "Close menu": "Fechar menu",
  Site: "Site",
  "Site menu": "Menu do site",
  "How it works": "Como funciona",
  Trades: "Especialidades",
  Pricing: "Preços",
  Questions: "Dúvidas",
  "Open the app": "Abrir o app",
  "Sign in": "Entrar",
  "Start free trial": "Começar teste grátis",
  Product: "Produto",
  "Your team": "Sua equipe",
  "Join your team": "Entrar na sua equipe",
  Support: "Suporte",
  Legal: "Jurídico",
  "Terms of Service": "Termos de Serviço",
  "Privacy Policy": "Política de Privacidade",
  Subprocessors: "Suboperadores",
  "Data Processing Addendum": "Adendo de Tratamento de Dados",
  Security: "Segurança",
  Accessibility: "Acessibilidade",
  "Plans, counts, quotes, invoices and field work for electrical, low-voltage and specialty contractors.":
    "Plantas, levantamentos, orçamentos, faturas e trabalho em campo para empreiteiros de elétrica, baixa tensão e instalações especiais.",
  "Try it without an account": "Experimentar sem conta",
  "Your account was deleted and this device was cleared.": "Sua conta foi excluída e os dados deste aparelho foram apagados.",
  Dismiss: "Fechar",

  // Legal pages (chrome; the documents themselves stay in English)
  DPA: "Tratamento de dados",
  Effective: "Em vigor desde",
  "Last updated": "Atualizado em",
  "On this page": "Nesta página",
  "Checking {product}’s servers…": "Verificando os servidores do {product}…",
  "All systems operational": "Todos os sistemas funcionando",
  "Some services are having problems. Your work is saved on your device and will sync when they recover.":
    "Alguns serviços estão com problemas. Seu trabalho está salvo no aparelho e será sincronizado quando eles voltarem.",
  "Can’t reach {product} from this device. Check your connection; {product} keeps working offline.":
    "Não foi possível conectar ao {product} deste aparelho. Verifique sua conexão; o {product} continua funcionando offline.",

  // Auth pages (AuthShell, sign-in, sign-up, reset)
  Terms: "Termos",
  Privacy: "Privacidade",
  "Show password": "Mostrar senha",
  "Hide password": "Ocultar senha",
  "Loading…": "Carregando…",
  Email: "E-mail",
  Password: "Senha",
  "Forgot password?": "Esqueceu a senha?",
  or: "ou",
  "Check your email": "Confira seu e-mail",
  "Back to sign in": "Voltar para entrar",
  "Accounts aren’t available here": "Contas não estão disponíveis aqui",
  "This copy of {product} isn’t connected to the cloud. Your jobs are saved on this device.":
    "Esta cópia do {product} não está conectada à nuvem. Suas obras ficam salvas neste aparelho.",
  "That link has expired or was already used. Sign in with your password, or send a new link.":
    "Esse link expirou ou já foi usado. Entre com sua senha ou envie um novo link.",
  "Enter your email address first, then press “Email me a sign-in link”.":
    "Digite primeiro seu e-mail e depois toque em “Enviar link de acesso por e-mail”.",
  "Opening {product}…": "Abrindo o {product}…",
  "If {email} has a {product} account, a sign-in link is on its way. Open it on the device you want to use. It can take a few minutes — check spam too.":
    "Se {email} tiver uma conta no {product}, um link de acesso está a caminho. Abra-o no aparelho que você quer usar. Pode levar alguns minutos — confira também o spam.",
  "New to {product}?": "Novo no {product}?",
  "Welcome back. Sign in to sync your jobs across iPad, iPhone and the web.":
    "Que bom ver você de novo. Entre para sincronizar suas obras entre iPad, iPhone e a web.",
  "Email confirmed. Sign in to finish setting up.": "E-mail confirmado. Entre para concluir a configuração.",
  "Email me a sign-in link": "Enviar link de acesso por e-mail",
  "Got an invite from your company?": "Recebeu um convite da sua empresa?",

  "There’s already an account with this email. {signIn} or {reset}.": "Já existe uma conta com este e-mail. {signIn} ou {reset}.",
  "reset your password": "redefina sua senha",
  "Your login is ready, but setting up {company} didn’t finish: {error} Press the button to try again.":
    "Seu acesso está pronto, mas a configuração de {company} não terminou: {error} Toque no botão para tentar de novo.",
  "Sign-up isn’t available here": "Cadastro não disponível aqui",
  "This copy of {product} isn’t connected to the cloud, so there are no accounts. You can still use it on this device.":
    "Esta cópia do {product} não está conectada à nuvem, então não há contas. Você ainda pode usá-la neste aparelho.",
  "You’re already signed in": "Você já está conectado",
  "Signed in as {email}.": "Conectado como {email}.",
  "Signed in as {email}": "Conectado como {email}",
  "Open {product}": "Abrir o {product}",
  "Sign out to create another company": "Sair para criar outra empresa",
  "Have an account?": "Já tem conta?",
  "Start your free trial": "Comece seu teste grátis",
  "{n} day of everything in {product}. Set up your company now and invite your crew when you’re ready.": {
    one: "{n} dia com tudo do {product}. Configure sua empresa agora e convide sua equipe quando estiver pronto.",
    other: "{n} dias com tudo do {product}. Configure sua empresa agora e convide sua equipe quando estiver pronto.",
  },
  "What does your company do?": "O que sua empresa faz?",
  "Pick one or more — the first is your main trade. It sets up your device menu, catalog, wire types and checklists. You can change it later in Settings.":
    "Escolha uma ou mais — a primeira é sua especialidade principal. Ela define o menu de dispositivos, o catálogo, os tipos de cabo e os checklists. Você pode mudar depois em Configurações.",
  "Company name": "Nome da empresa",
  "Your name": "Seu nome",
  "First and last name": "Nome e sobrenome",
  "Work email": "E-mail de trabalho",
  "I agree to the {terms} and {privacy}.": "Concordo com os {terms} e a {privacy}.",
  "Setting up your company…": "Configurando sua empresa…",
  "Try again": "Tentar de novo",
  "Create company account": "Criar conta da empresa",
  "Joining your company’s team?": "Vai entrar na equipe da sua empresa?",
  "Use your invite code": "Use seu código de convite",
  "We sent a confirmation link to {email}. Open it on any device — phone, tablet or computer — and sign in. We’ll finish setting up {company} for you.":
    "Enviamos um link de confirmação para {email}. Abra-o em qualquer aparelho — celular, tablet ou computador — e entre. Nós terminamos de configurar {company} para você.",
  "It can take a few minutes to arrive.": "Pode levar alguns minutos para chegar.",
  "Check spam or promotions if you don’t see it.": "Se não encontrar, confira o spam ou a aba Promoções.",
  "I’ve confirmed — sign in": "Já confirmei — entrar",
  "Sent again. Give it a few minutes.": "Enviado de novo. Aguarde alguns minutos.",
  "Resend the email": "Reenviar o e-mail",

  "That reset link has expired or was already used. Send yourself a new one below.":
    "Esse link de redefinição expirou ou já foi usado. Envie um novo abaixo.",
  "Couldn’t open that reset link. Send yourself a new one below and open it in this browser.":
    "Não foi possível abrir esse link de redefinição. Envie um novo abaixo e abra-o neste navegador.",
  "This copy of {product} isn’t connected to the cloud, so there’s no password to reset.":
    "Esta cópia do {product} não está conectada à nuvem, então não há senha para redefinir.",
  "Password updated": "Senha atualizada",
  "Use your new password to sign in on the iPad, iPhone and web.": "Use sua nova senha para entrar no iPad, no iPhone e na web.",
  "Continue to {product}": "Continuar para o {product}",
  "Choose a new password": "Escolha uma nova senha",
  "For {email}.": "Para {email}.",
  "Use at least {n} character.": {
    one: "Use pelo menos {n} caractere.",
    other: "Use pelo menos {n} caracteres.",
  },
  "The two passwords don’t match.": "As duas senhas não coincidem.",
  "Choose a password you haven’t used before.": "Escolha uma senha que você ainda não usou.",
  "New password": "Nova senha",
  "Repeat new password": "Repita a nova senha",
  "The two passwords don’t match yet.": "As duas senhas ainda não coincidem.",
  "Save new password": "Salvar nova senha",
  "Opening your reset link…": "Abrindo seu link de redefinição…",
  "If {email} has a {product} account, a reset link is on its way.": "Se {email} tiver uma conta no {product}, um link de redefinição está a caminho.",
  "The email may take a few minutes to arrive — check spam too.": "O e-mail pode levar alguns minutos para chegar — confira também o spam.",
  "Open the link in this browser to choose a new password.": "Abra o link neste navegador para escolher uma nova senha.",
  "Use a different email": "Usar outro e-mail",
  "Reset your password": "Redefinir sua senha",
  "Enter the email you sign in with and we’ll send you a link to choose a new password. It may take a few minutes to arrive.":
    "Digite o e-mail que você usa para entrar e enviaremos um link para escolher uma nova senha. Pode levar alguns minutos para chegar.",
  "Enter a valid email address.": "Digite um e-mail válido.",
  "Send reset link": "Enviar link de redefinição",

  // Account deletion: confirm it's you (the dialog itself is in Settings)
  "Not connected to the cloud.": "Sem conexão com a nuvem.",
  "Sign out, sign in again, then delete your account.": "Saia, entre de novo e depois exclua sua conta.",
  "Enter your password.": "Digite sua senha.",
  "That password isn’t right. Try again, or type your email instead.": "Senha incorreta. Tente de novo ou digite seu e-mail no lugar.",
  "Type the email you sign in with.": "Digite o e-mail que você usa para entrar.",
  "Your sign-in has expired. Sign out, sign in again, then delete your account.":
    "Sua sessão expirou. Saia, entre de novo e depois exclua sua conta.",
  "Confirm it’s you": "Confirme que é você",
  "Your sign-in has expired. Enter your password to continue.": "Sua sessão expirou. Digite sua senha para continuar.",
  "To keep your account safe, enter your password again.": "Para manter sua conta segura, digite sua senha de novo.",
  "Your password": "Sua senha",
  "The email you sign in with": "O e-mail que você usa para entrar",
  "No password? Type your email instead": "Sem senha? Digite seu e-mail",
  "Use my password instead": "Usar minha senha",

  // /join
  "That code isn’t valid any more. It may have been used already, revoked, or it’s older than 14 days. Ask whoever invited you for a new one.":
    "Esse código não vale mais. Ele pode já ter sido usado, ter sido revogado ou ter mais de 14 dias. Peça um novo a quem convidou você.",
  "Enter the code from your invite — it looks like K7QM-XR4T-PA.": "Digite o código do seu convite — ele é assim: K7QM-XR4T-PA.",
  "Teams aren’t available on this server": "Equipes não estão disponíveis neste servidor",
  "This copy of {product} isn’t connected to the cloud, so there’s no team to join here. Ask your office for the {product} link they use.":
    "Esta cópia do {product} não está conectada à nuvem, então não há equipe para entrar aqui. Peça ao escritório o link do {product} que eles usam.",
  "Checking your invite…": "Verificando seu convite…",
  "Join your company on {product}": "Entre na sua empresa no {product}",
  "Enter the invite code you got by text or email.": "Digite o código de convite que você recebeu por SMS ou e-mail.",
  "Invite code": "Código de convite",
  Continue: "Continuar",
  "Already set up?": "Já configurou?",
  "Go to your jobs": "Ir para suas obras",
  "You’re invited to join": "Você foi convidado para entrar em",
  "your company": "sua empresa",
  "as {role}": "como {role}",
  "Please accept the Terms and Privacy Policy.": "Aceite os Termos e a Política de Privacidade.",
  "That email and password don’t match an account. Check them, or create a new login.":
    "Esse e-mail e senha não correspondem a nenhuma conta. Confira os dados ou crie um novo acesso.",
  "You already have a {product} account with this email. Sign in with its password to join.":
    "Você já tem uma conta no {product} com este e-mail. Entre com a senha dela para participar.",
  "You already have an account with this email. Choose “I have an account” and sign in.":
    "Você já tem uma conta com este e-mail. Escolha “Já tenho conta” e entre.",
  "You’re already on {team} as {email}.": "Você já está em {team} como {email}.",
  "You’re signed in as {email}, which is already on {team}. Leave that team in Settings → Team first, or sign out and use a different email.":
    "Você está conectado como {email}, que já faz parte de {team}. Saia dessa equipe primeiro em Configurações → Equipe, ou saia da conta e use outro e-mail.",
  "another team": "outra equipe",
  "Open jobs": "Abrir obras",
  "Your team sees this when they give you tasks, and it’s on the photos you take.":
    "Sua equipe vê isso ao atribuir tarefas a você, e ele aparece nas fotos que você tira.",
  "You’ll join as {name}.": "Você vai entrar como {name}.",
  Change: "Alterar",
  "Checking sign-in…": "Verificando acesso…",
  "Joining as {email}.": "Entrando como {email}.",
  "Not you?": "Não é você?",
  "Join {team}": "Entrar em {team}",
  "Join the team": "Entrar na equipe",
  "New to {product}": "Novo no {product}",
  "I have an account": "Já tenho conta",
  "Choose a password": "Escolha uma senha",
  "At least {n} character": {
    one: "Pelo menos {n} caractere",
    other: "Pelo menos {n} caracteres",
  },
  "You’ll use this email and password on the iPad and iPhone app too.": "Você vai usar este e-mail e senha também no app para iPad e iPhone.",
  "Creating your login…": "Criando seu acesso…",
  "Create login & join": "Criar acesso e entrar",
  "Signing in…": "Entrando…",
  "Sign in & join": "Entrar e participar",
  "Use a different code": "Usar outro código",
  "You’re signed in and on {team}.": "Você está conectado e faz parte de {team}.",
  "Check your email to finish": "Confira seu e-mail para concluir",
  "Your login is made, but it won’t work until you confirm it. We sent a confirmation link to {email}.":
    "Seu acesso foi criado, mas só vai funcionar depois que você confirmar. Enviamos um link de confirmação para {email}.",
  "Open the email from {product} and tap the confirmation link.": "Abra o e-mail do {product} e toque no link de confirmação.",
  "Sign in with your password — you’ll join {team} automatically.": "Entre com sua senha — você vai entrar em {team} automaticamente.",
  "the team": "a equipe",
  "Nothing after a few minutes? Check spam. Already had a {product} account with this email? Just sign in below with its password.":
    "Nada depois de alguns minutos? Confira o spam. Já tinha uma conta no {product} com este e-mail? É só entrar abaixo com a senha dela.",
  "Your email isn’t confirmed yet. Open the link in the email first.": "Seu e-mail ainda não foi confirmado. Abra primeiro o link do e-mail.",
  "You’re on {team}": "Você está em {team}",
  "You’re on the team": "Você está na equipe",
  "{open} to see every team job. They download in the background — give it a moment the first time.":
    "{open} para ver todas as obras da equipe. Elas baixam em segundo plano — na primeira vez, aguarde um pouco.",
  "Open Jobs": "Abra Obras",
  "{where}, install {product} and sign in with {email} and the same password.":
    "{where}, instale o {product} e entre com {email} e a mesma senha.",
  "On iPad or iPhone": "No iPad ou iPhone",
  "the same email": "o mesmo e-mail",
  "Prices, estimates and Billdu stay with the office, so you won’t see them.": "Preços, orçamentos e o Billdu ficam com o escritório, então você não vai vê-los.",
  "Team settings": "Configurações da equipe",

  // /start: first-run checklist, technicians' start, "Set up your company"
  "Your business": "Sua empresa",
  "Name, phone and logo for your estimates and client proposals.": "Nome, telefone e logo para seus orçamentos e propostas a clientes.",
  "Upload your first floor plan": "Envie sua primeira planta baixa",
  "Start a job and add the plan — a PDF or a photo of it.": "Crie uma obra e adicione a planta — um PDF ou uma foto dela.",
  "Invite your team": "Convide sua equipe",
  "Office staff and technicians each get their own login.": "Cada pessoa do escritório e cada técnico tem seu próprio acesso.",
  "Get the iPad and iPhone app": "Baixe o app para iPad e iPhone",
  "Walk the site with the plan; it all syncs to the office.": "Percorra a obra com a planta; tudo sincroniza com o escritório.",
  "Setting up {company}…": "Configurando {company}…",
  "Welcome to {team}": "Boas-vindas a {team}",
  "Welcome to the team": "Boas-vindas à equipe",
  "Your jobs, plans, tasks and photos are ready. Use the app on site; this website works too.":
    "Suas obras, plantas, tarefas e fotos estão prontas. Use o app na obra; este site também funciona.",
  "Get the app": "Baixe o app",
  "My tasks": "Minhas tarefas",
  "{n}-day free trial": {
    one: "{n} dia de teste grátis",
    other: "{n} dias de teste grátis",
  },
  "{team} is ready": "{team} está pronta",
  "Welcome to {product}": "Boas-vindas ao {product}",
  "Four quick steps and you’re ready for your next walkthrough. You can come back to this any time.":
    "Quatro passos rápidos e você está pronto para a próxima visita à obra. Você pode voltar aqui quando quiser.",
  "All done": "Tudo pronto",
  "{done} of {total} done": "{done} de {total} concluídos",
  "Hide this checklist": "Ocultar este checklist",
  "Go to jobs": "Ir para obras",
  "Get set up · {done} of {total}": "Configuração · {done} de {total}",
  "Next: {step}": "Próximo: {step}",
  "Hide the setup checklist": "Ocultar o checklist de configuração",
  Hide: "Ocultar",
  Done: "Concluído",
  "Saved on this device. It goes to your team when you’re back online.": "Salvo neste aparelho. Vai para sua equipe quando você estiver online de novo.",
  "Business details saved": "Dados da empresa salvos",
  "Business name": "Nome da empresa",
  Phone: "Telefone",
  "Email on estimates": "E-mail nos orçamentos",
  Website: "Site",
  "Your logo": "Seu logo",
  "No logo": "Sem logo",
  "Change logo": "Trocar logo",
  "Upload logo": "Enviar logo",
  Save: "Salvar",
  "Address, colours and estimate terms →": "Endereço, cores e condições do orçamento →",
  Client: "Cliente",
  "Job address": "Endereço da obra",
  "Create job and add the plan": "Criar obra e adicionar a planta",
  "Next you’ll pick the plan file: every page of a PDF becomes a floor.": "Em seguida, escolha o arquivo da planta: cada página do PDF vira um pavimento.",
  "Make an invite code for each person and text it to them. Technicians see plans, devices, photos and checklists — never prices.":
    "Crie um código de convite para cada pessoa e mande por SMS. Os técnicos veem plantas, dispositivos, fotos e checklists — nunca preços.",
  "I work alone — skip": "Trabalho sozinho — pular",
  "Get it on the App Store": "Baixar na App Store",
  "Or scan the code with your iPhone or iPad camera.": "Ou leia o código com a câmera do iPhone ou iPad.",
  "The iPhone and iPad app is coming to the App Store. Until then, use this website on any device: on iPhone or iPad, open it in Safari and tap Share → Add to Home Screen.":
    "O app para iPhone e iPad está chegando à App Store. Até lá, use este site em qualquer dispositivo: no iPhone ou iPad, abra no Safari e toque em Compartilhar → Adicionar à Tela de Início.",
  "Sign in with {email} and the same password. Your jobs sync automatically.": "Entre com {email} e a mesma senha. Suas obras sincronizam automaticamente.",
  "QR code for the App Store page": "QR code da página na App Store",
  "Set up your company": "Configure sua empresa",
  "Everything in {product} belongs to your company: jobs, price list and crew. Your {n}-day free trial starts now.": {
    one: "Tudo no {product} pertence à sua empresa: obras, tabela de preços e equipe. Seu teste grátis de {n} dia começa agora.",
    other: "Tudo no {product} pertence à sua empresa: obras, tabela de preços e equipe. Seu teste grátis de {n} dias começa agora.",
  },
  "Your crew sees this, and it’s on the photos you take.": "Sua equipe vê este nome, e ele aparece nas fotos que você tira.",
  "Pick one or more. It sets up your device list, price list and checklists. You can change it later in Settings.":
    "Escolha uma ou mais. Isso define sua lista de dispositivos, a tabela de preços e os checklists. Você pode mudar depois em Configurações.",
  "Set up my company": "Configurar minha empresa",
  "I have an invite code": "Tenho um código de convite",

  // /welcome (landing page)
  "Pin the plan. Send the quote. Get it signed.": "Marque na planta. Envie o orçamento. Receba a assinatura.",
  "{product} is takeoff, quoting and job management for electrical, low-voltage and specialty contractors. Put each device on the floor plan, and the count, the wire and your price come straight from it.":
    "O {product} é levantamento, orçamento e gestão de obras para empreiteiros de elétrica, baixa tensão e instalações especiais. Coloque cada dispositivo na planta e a contagem, o cabo e o seu preço saem direto dela.",
  "See how it works": "Veja como funciona",
  "Free for {n} day with every feature. Just looking? {demo}.": {
    one: "Grátis por {n} dia, com todos os recursos. Só dando uma olhada? {demo}.",
    other: "Grátis por {n} dias, com todos os recursos. Só dando uma olhada? {demo}.",
  },
  "One job, from the first walkthrough to the final invoice": "Uma obra, da primeira visita à fatura final",
  "Each step uses what the last one made, so you never count the same plan twice or type a quote into an invoice.":
    "Cada etapa usa o que a anterior gerou, então você nunca conta a mesma planta duas vezes nem digita um orçamento numa fatura.",
  "Pin devices on the plans": "Marque os dispositivos nas plantas",
  "Upload the PDF set or a photo of the drawings. Every page becomes a floor you can pinch, zoom and flip through. Tap a device from your trade’s list and tap where it goes.":
    "Envie o jogo de PDFs ou uma foto dos desenhos. Cada página vira um pavimento que você pode ampliar e folhear. Toque num dispositivo da lista da sua especialidade e toque onde ele vai.",
  "Letters on the plan, like the legend on the drawings": "Letras na planta, como na legenda dos desenhos",
  "Wire runs drawn back to the panel, rack or closet": "Lances desenhados até o quadro, rack ou armário",
  "Set the scale once from any known dimension": "Defina a escala uma vez a partir de qualquer medida conhecida",
  "Get the count for every floor": "Tenha a contagem de cada pavimento",
  "Device and wire counts add up as you pin, floor by floor. Wire lengths come out in feet with slack included, and electrical jobs get circuits and a panel schedule.":
    "A contagem de dispositivos e cabos soma conforme você marca, pavimento por pavimento. Os comprimentos de cabo saem em pés com sobra incluída, e obras elétricas ganham circuitos e quadro de cargas.",
  "Counts come only from what’s on the plan": "A contagem vem só do que está na planta",
  "Export the count and marked-up sheets as PDF": "Exporte a contagem e as folhas anotadas em PDF",
  "Price it from your price list": "Preços da sua tabela",
  "Your material and labor prices, markup and wire by the foot turn the count into a quote. Mark items optional and let the client decide.":
    "Seus preços de material e mão de obra, a margem e o cabo por pé transformam a contagem em orçamento. Marque itens como opcionais e deixe o cliente decidir.",
  "Starting prices for your trade, all editable": "Preços iniciais para sua especialidade, todos editáveis",
  "Change the plan and the quote follows": "Mude a planta e o orçamento acompanha",
  "Your client approves on their phone": "Seu cliente aprova pelo celular",
  "Send the client a link. They read the quote, tick the options they want, sign with a finger and approve. No account or app for them.":
    "Envie um link ao cliente. Ele lê o orçamento, marca as opções que quer, assina com o dedo e aprova. Sem conta nem app para ele.",
  "See when it’s opened and when it’s approved": "Veja quando foi aberto e quando foi aprovado",
  "The approved options are added to the job": "As opções aprovadas entram na obra",
  "Bill the deposit, progress and final": "Fature o sinal, as parciais e o final",
  "Invoices come straight from the approved quote, so nothing is typed twice. Record payments as they come in and see what’s left to collect on every job.":
    "As faturas saem direto do orçamento aprovado, então nada é digitado duas vezes. Registre os pagamentos conforme chegam e veja quanto falta receber em cada obra.",
  "Quote and invoice numbering, tax and terms set once": "Numeração de orçamentos e faturas, impostos e condições definidos uma vez",
  "See what’s paid and what’s left on every job": "Veja o que foi pago e o que falta em cada obra",
  "Run the job in the field": "Toque a obra em campo",
  "The crew works from the same plans. Photos with mark-up, checklists and punch lists, tasks with who’s on them, daily logs and files all live on the job.":
    "A equipe trabalha nas mesmas plantas. Fotos com anotações, checklists e listas de pendências, tarefas com responsáveis, diários de obra e arquivos ficam todos na obra.",
  "Photos pinned to the spot on the plan": "Fotos presas ao ponto exato na planta",
  "Daily logs and photo reports ready to send": "Diários de obra e relatórios fotográficos prontos para enviar",
  "Your trade’s devices, already on the list": "Os dispositivos da sua especialidade, já na lista",
  "Pick your trades when you sign up. Each one comes with its own devices, wire or pipe types and checklists, with starting prices you change to yours.":
    "Escolha suas especialidades no cadastro. Cada uma vem com seus dispositivos, tipos de cabo ou tubo e checklists, com preços iniciais que você troca pelos seus.",
  "Runs to": "Lances até",
  "{list} and more": "{list} e mais",
  "The office sees the money. The crew sees the work.": "O escritório vê o dinheiro. A equipe vê o trabalho.",
  "Invite your office staff and technicians with a code. Everyone works on the same jobs with their own login, and technician logins hide prices in the app.":
    "Convide o pessoal do escritório e os técnicos com um código. Todos trabalham nas mesmas obras com seu próprio acesso, e o acesso de técnico esconde os preços no app.",
  "Owner and office": "Dono e escritório",
  "Plans, counts, prices, quotes, invoices and settings.": "Plantas, contagens, preços, orçamentos, faturas e configurações.",
  Technicians: "Técnicos",
  "Plans, devices, photos, checklists, daily logs and their tasks. Prices, quotes and invoices are hidden in the app, and they can’t delete jobs.":
    "Plantas, dispositivos, fotos, checklists, diários de obra e suas tarefas. Preços, orçamentos e faturas ficam ocultos no app, e eles não podem excluir obras.",
  "Kitchen, first floor": "Cozinha, térreo",
  Office: "Escritório",
  "{n} on the plan": "{n} na planta",
  "All set": "Tudo instalado",
  "{done} of {total} set": "{done} de {total} instalados",
  "Quote, invoices and margins": "Orçamento, faturas e margens",
  "Photos, checklist and today’s tasks": "Fotos, checklist e tarefas de hoje",
  "No signal in the basement? Keep working.": "Sem sinal no subsolo? Continue trabalhando.",
  "Every job is saved on the iPad or iPhone. Pin devices, take photos and tick checklists with no connection, and it all syncs when you’re back online.":
    "Cada obra fica salva no iPad ou iPhone. Marque dispositivos, tire fotos e marque checklists sem conexão, e tudo sincroniza quando você voltar a ficar online.",
  iPad: "iPad",
  "Walk the site with the plans": "Percorra a obra com as plantas",
  iPhone: "iPhone",
  "Photos, checklists and tasks": "Fotos, checklists e tarefas",
  Web: "Web",
  "Quotes and invoices at the desk": "Orçamentos e faturas no escritório",
  "Large plan sets": "Jogos de plantas grandes",
  "Opens fast; pinch, zoom and flip sheets": "Abre rápido; amplie e folheie as folhas",
  "The same plan open on an iPad, an iPhone and a laptop": "A mesma planta aberta num iPad, num iPhone e num notebook",
  "One price for the company": "Um preço para a empresa",
  "Every feature, every trade, unlimited jobs. Pay for the people who log in. Try it free for {n} day.": {
    one: "Todos os recursos, todas as especialidades, obras ilimitadas. Pague pelas pessoas que acessam. Teste grátis por {n} dia.",
    other: "Todos os recursos, todas as especialidades, obras ilimitadas. Pague pelas pessoas que acessam. Teste grátis por {n} dias.",
  },
  "See pricing": "Ver preços",
  Monthly: "Mensal",
  "includes {n} user": {
    one: "inclui {n} usuário",
    other: "inclui {n} usuários",
  },
  "Each extra user": "Cada usuário extra",
  "a month": "por mês",
  "A crew of {n}": {
    one: "Uma equipe de {n} pessoa",
    other: "Uma equipe de {n} pessoas",
  },
  "Free trial": "Teste grátis",
  "{n} day": {
    one: "{n} dia",
    other: "{n} dias",
  },
  "every feature": "todos os recursos",
  "Prices in USD, plus applicable tax.": "Preços em dólares (USD), mais impostos aplicáveis.",
  "Questions contractors ask": "Dúvidas comuns dos empreiteiros",
  "Do I need internet on site?": "Preciso de internet na obra?",
  "No. Plans, devices, photos and checklists are saved on the iPad or phone and sync when you’re back online.":
    "Não. Plantas, dispositivos, fotos e checklists ficam salvos no iPad ou celular e sincronizam quando você voltar a ficar online.",
  "What plans can I use?": "Que plantas posso usar?",
  "PDF plan sets (every page becomes a floor), photos or scans of printed plans, or a sketch. Set the scale once from any known dimension.":
    "Jogos de plantas em PDF (cada página vira um pavimento), fotos ou digitalizações de plantas impressas, ou um croqui. Defina a escala uma vez a partir de qualquer medida conhecida.",
  "Which trades does it work for?": "Para quais especialidades funciona?",
  "Low voltage and smart home, electrical, fire alarm, HVAC, plumbing, and solar and EV charging. Pick one or several, and add your own devices to any list.":
    "Baixa tensão e casa inteligente, elétrica, alarme de incêndio, climatização (HVAC), hidráulica, e energia solar e recarga de veículos elétricos. Escolha uma ou várias e adicione seus próprios dispositivos a qualquer lista.",
  "Can my technicians use it without seeing prices?": "Meus técnicos podem usar sem ver os preços?",
  "Yes. Technicians get their own login for plans, devices, photos, checklists and tasks. Prices, quotes and invoices are hidden from them in the app.":
    "Sim. Os técnicos têm seu próprio acesso para plantas, dispositivos, fotos, checklists e tarefas. Preços, orçamentos e faturas ficam ocultos para eles no app.",
  "Does it work with my accounting?": "Funciona com minha contabilidade?",
  "Quotes, invoices and payments are built into {product}, so you don’t need anything else. You can also export counts, quotes and plan sheets as PDF or CSV.":
    "Orçamentos, faturas e pagamentos já vêm no {product}, então você não precisa de mais nada. Você também pode exportar contagens, orçamentos e folhas da planta em PDF ou CSV.",
  "What happens after the {n}-day trial?": {
    one: "O que acontece depois do teste de {n} dia?",
    other: "O que acontece depois do teste de {n} dias?",
  },
  "Choose a plan to keep going. If you don’t, your jobs stay readable and you can export them any time. See {pricing}.":
    "Escolha um plano para continuar. Se não escolher, suas obras continuam disponíveis para leitura e você pode exportá-las quando quiser. Veja {pricing}.",
  pricing: "preços",
  "Is my data private?": "Meus dados são privados?",
  "Each company’s jobs are private to its team, enforced in the database. You can export everything or delete your account from Settings.":
    "As obras de cada empresa são visíveis só para a equipe dela, garantido no banco de dados. Você pode exportar tudo ou excluir sua conta em Configurações.",
  "Bring your next set of plans": "Traga seu próximo jogo de plantas",
  "Set up your company, upload a plan and send a real quote during the {n}-day trial. Bring the crew in when you’re ready.": {
    one: "Configure sua empresa, envie uma planta e mande um orçamento de verdade durante o teste de {n} dia. Traga a equipe quando estiver pronto.",
    other: "Configure sua empresa, envie uma planta e mande um orçamento de verdade durante o teste de {n} dias. Traga a equipe quando estiver pronto.",
  },
  // /welcome, Northpin redesign: trade strip, steps, features, crew
  "Starting device lists and prices for": "Listas de dispositivos e preços iniciais para",
  "Upload the plans": "Envie as plantas",
  "Drop in the PDF set or a photo of the drawings. Every page becomes a floor.":
    "Envie o jogo de PDFs ou uma foto dos desenhos. Cada página vira um pavimento.",
  "Pin every device": "Marque cada dispositivo",
  "Tap a device from your trade’s list, then tap where it goes on the plan.":
    "Toque num dispositivo da lista da sua especialidade e depois toque onde ele vai na planta.",
  "Get the count": "Tenha a contagem",
  "Devices and wire add up per floor as you pin. Nothing is counted twice.":
    "Dispositivos e cabos somam por pavimento conforme você marca. Nada é contado duas vezes.",
  "Send the quote": "Envie o orçamento",
  "Your prices turn the count into a quote the client signs on their phone.":
    "Seus preços transformam a contagem num orçamento que o cliente assina pelo celular.",
  "Bill and build": "Fature e execute",
  "Invoice from the approved quote while the crew works from the same plans.":
    "Fature a partir do orçamento aprovado enquanto a equipe trabalha nas mesmas plantas.",
  "Count from the plan, floor by floor": "Contagem pela planta, pavimento por pavimento",
  "Tap a device, tap the plan. Device and wire counts add up as you pin, with wire lengths in feet and slack included. Electrical jobs also get circuits and a panel schedule.":
    "Toque num dispositivo, toque na planta. A contagem de dispositivos e cabos soma conforme você marca, com comprimentos em pés e sobra incluída. Obras elétricas também ganham circuitos e quadro de cargas.",
  "A quote your client signs on their phone": "Um orçamento que o cliente assina pelo celular",
  "Your material and labor prices, markup and wire by the foot turn the count into a quote. Send the client a link: they tick the options they want, sign with a finger and approve. No account or app for them.":
    "Seus preços de material e mão de obra, a margem e o cabo por pé transformam a contagem em orçamento. Envie um link ao cliente: ele marca as opções que quer, assina com o dedo e aprova. Sem conta nem app para ele.",
  "Change orders signed the same way as quotes": "Aditivos assinados do mesmo jeito que os orçamentos",

  // Pictures of the app on /welcome (illustrations; names, sheet numbers and wire types stay as they are)
  "An electrical floor plan with {n} device pinned on it and circuits drawn to the panel. Beside it, the count for the floor and a {total} quote that the client signed and approved on their phone.":
    {
      one: "Uma planta elétrica com {n} dispositivo marcado e circuitos desenhados até o quadro. Ao lado, a contagem do pavimento e um orçamento de {total} que o cliente assinou e aprovou pelo celular.",
      other: "Uma planta elétrica com {n} dispositivos marcados e circuitos desenhados até o quadro. Ao lado, a contagem do pavimento e um orçamento de {total} que o cliente assinou e aprovou pelo celular.",
    },
  Receptacles: "Tomadas",
  "GFCI receptacles": "Tomadas GFCI",
  Switches: "Interruptores",
  "3-way switches": "Interruptores three-way",
  "Recessed lights": "Luminárias embutidas",
  "Surface fixtures": "Luminárias de sobrepor",
  "Smoke alarms": "Detectores de fumaça",
  Job: "Obra",
  Floor: "Pavimento",
  "First floor power and lighting": "Térreo: força e iluminação",
  Sheet: "Folha",
  "First floor count": "Contagem do térreo",
  "{n} device": { one: "{n} dispositivo", other: "{n} dispositivos" },
  "{ft} ft": "{ft} ft",
  "Quote {number}": "Orçamento {number}",
  "and {n} more line": {
    one: "e mais {n} linha",
    other: "e mais {n} linhas",
  },
  "Signed by {name}": "Assinado por {name}",
  Approved: "Aprovado",
  Basement: "Subsolo",
  "First floor": "Térreo",
  "Second floor": "1º andar",
  "{n} floor from one PDF": {
    one: "{n} pavimento de um só PDF",
    other: "{n} pavimentos de um só PDF",
  },
  "Sheet {number}": "Folha {number}",
  Viewing: "Aberta",
  "Tap a device, then tap the plan": "Toque num dispositivo e depois na planta",
  "Device and wire count": "Contagem de dispositivos e cabos",
  "Updated as you pin": "Atualizada conforme você marca",
  Device: "Dispositivo",
  "1st fl": "Térreo",
  "2nd fl": "1º and.",
  Total: "Total",
  "Panel schedule, {panel}": "Quadro de cargas, {panel}",
  "Kitchen counter receptacles": "Tomadas da bancada da cozinha",
  "Kitchen and dining lights": "Luzes da cozinha e sala de jantar",
  "Laundry and garage": "Lavanderia e garagem",
  "From your price list": "Da sua tabela de preços",
  "{wire} wire": "Cabo {wire}",
  "Optional: under-cabinet lights, {ft} ft": "Opcional: luzes sob armários, {ft} ft",
  "Markup {pct}%, labor included": "Margem de {pct}%, mão de obra incluída",
  "Quote from your company": "Orçamento da sua empresa",
  "Add under-cabinet lights": "Adicionar luzes sob armários",
  "Add EV outlet in garage": "Adicionar tomada para carro elétrico na garagem",
  "Sign here": "Assine aqui",
  "Approved by {name}": "Aprovado por {name}",
  Money: "Financeiro",
  "Approved quote {total}": "Orçamento aprovado {total}",
  "Deposit, 50%": "Sinal, 50%",
  "Progress, rough-in done": "Parcial, infraestrutura concluída",
  Final: "Final",
  Paid: "Paga",
  Sent: "Enviada",
  Draft: "Rascunho",
  "Invoice {number}": "Fatura {number}",
  "Left to collect": "Falta receber",
  "Move box 6 in. left": "Mover caixa 6 pol. para a esquerda",
  "Kitchen, island wall": "Cozinha, parede da ilha",
  "Pinned to {sheet}, tagged rough-in": "Preso a {sheet}, marcado como infraestrutura",
  "Rough-in checklist": "Checklist de infraestrutura",
  "{done} of {total}": "{done} de {total}",
  "Boxes set at 16 in. to center": "Caixas a 16 pol. até o centro",
  "Home runs labelled at the panel": "Retornos ao quadro identificados no quadro",
  "Photo every wall before drywall": "Fotografar cada parede antes do drywall",
  Task: "Tarefa",
  "Pull circuits {from} to {to} to {panel}": "Puxar circuitos {from} a {to} até {panel}",
  "{name}, due Thursday": "{name}, prazo quinta-feira",

  // /pricing
  "One plan for the whole company": "Um plano para a empresa toda",
  "Every feature, every trade and unlimited jobs. You pay for the people who log in, and the first {n} day is free.": {
    one: "Todos os recursos, todas as especialidades e obras ilimitadas. Você paga pelas pessoas que acessam, e o primeiro {n} dia é grátis.",
    other: "Todos os recursos, todas as especialidades e obras ilimitadas. Você paga pelas pessoas que acessam, e os primeiros {n} dias são grátis.",
  },
  "People who log in": "Pessoas que acessam",
  "{n} user": {
    one: "{n} usuário",
    other: "{n} usuários",
  },
  "{n} user, {total} a month": {
    one: "{n} usuário, {total} por mês",
    other: "{n} usuários, {total} por mês",
  },
  "{price} includes {n} user": {
    one: "{price} inclui {n} usuário",
    other: "{price} inclui {n} usuários",
  },
  "plus {n} extra user at {price}": {
    one: "mais {n} usuário extra a {price}",
    other: "mais {n} usuários extras a {price}",
  },
  "a month, plus tax": "por mês, mais impostos",
  "Includes {n} user. Each extra user is {price} a month. USD, plus applicable tax.": {
    one: "Inclui {n} usuário. Cada usuário extra custa {price} por mês. Em USD, mais impostos aplicáveis.",
    other: "Inclui {n} usuários. Cada usuário extra custa {price} por mês. Em USD, mais impostos aplicáveis.",
  },
  "You, office staff and technicians each count as one user. Clients never need a login.":
    "Você, o pessoal do escritório e os técnicos contam como um usuário cada. Clientes nunca precisam de acesso.",
  "{n} day free. Cancel any time, and your jobs stay yours to export.": {
    one: "{n} dia grátis. Cancele quando quiser, e suas obras continuam suas para exportar.",
    other: "{n} dias grátis. Cancele quando quiser, e suas obras continuam suas para exportar.",
  },
  "Every feature from day one. Set up your company, upload a plan and send a real quote before you decide.":
    "Todos os recursos desde o primeiro dia. Configure sua empresa, envie uma planta e mande um orçamento de verdade antes de decidir.",
  "Prices stay with the office": "Os preços ficam com o escritório",
  "Techs get their own login for plans, devices, photos, checklists and tasks. Their logins hide prices, quotes and invoices in the app.":
    "Os técnicos têm seu próprio acesso para plantas, dispositivos, fotos, checklists e tarefas. O acesso deles esconde preços, orçamentos e faturas no app.",
  "Your data, always": "Seus dados, sempre",
  "Export every job as a backup file any time: during the trial, after it, or after you cancel.":
    "Exporte todas as obras como arquivo de backup quando quiser: durante o teste, depois dele ou depois de cancelar.",
  "Private to your company": "Privado para sua empresa",
  "Jobs are visible only to your team, enforced in the database. Delete your account from Settings whenever you like.":
    "As obras são visíveis só para sua equipe, garantido no banco de dados. Exclua sua conta em Configurações quando quiser.",
  "Pricing questions": "Dúvidas sobre preços",
  "Still deciding? {ask} or {demo}.": "Ainda decidindo? {ask} ou {demo}.",
  "Ask us anything": "Pergunte o que quiser",
  "Can I cancel any time?": "Posso cancelar quando quiser?",
  "Yes. There’s no contract: cancel from Settings and you won’t be charged again. Your jobs stay readable and exportable.":
    "Sim. Não há contrato: cancele em Configurações e você não será cobrado de novo. Suas obras continuam disponíveis para leitura e exportação.",
  "What happens when the trial ends?": "O que acontece quando o teste termina?",
  "After {n} day, add a card to keep working. If you don’t, nothing is deleted: your jobs become read-only until you subscribe.": {
    one: "Depois de {n} dia, adicione um cartão para continuar trabalhando. Se não adicionar, nada é excluído: suas obras ficam somente leitura até você assinar.",
    other: "Depois de {n} dias, adicione um cartão para continuar trabalhando. Se não adicionar, nada é excluído: suas obras ficam somente leitura até você assinar.",
  },
  "Who counts as a user?": "Quem conta como usuário?",
  "Anyone with their own login on your team: you, office staff and technicians. {n} is included; each extra person is {price} a month.": {
    one: "Qualquer pessoa da sua equipe com acesso próprio: você, o pessoal do escritório e os técnicos. {n} está incluído; cada pessoa extra custa {price} por mês.",
    other: "Qualquer pessoa da sua equipe com acesso próprio: você, o pessoal do escritório e os técnicos. {n} estão incluídos; cada pessoa extra custa {price} por mês.",
  },
  "What do technicians see?": "O que os técnicos veem?",
  "Plans, devices, wire runs, photos, checklists, daily logs and tasks on every team job. Prices, quotes and invoices are hidden from their logins in the app, and they can’t delete jobs.":
    "Plantas, dispositivos, lances, fotos, checklists, diários de obra e tarefas em todas as obras da equipe. Preços, orçamentos e faturas ficam ocultos no acesso deles no app, e eles não podem excluir obras.",
  "Do I need separate accounting software?": "Preciso de um software de contabilidade à parte?",
  "Not for quotes and invoices: quotes, invoices and payments are built in, and counts and quotes export as PDF or CSV for your bookkeeping.":
    "Não para orçamentos e faturas: orçamentos, faturas e pagamentos já vêm incluídos, e contagens e orçamentos são exportados em PDF ou CSV para sua contabilidade.",
  "Can I export my data?": "Posso exportar meus dados?",
  "Yes. Settings, then Account, then {export} downloads every job (plans, devices, photos and quotes) as one backup file you can restore into {product} on any device. Counts and quotes also export as PDF and CSV.":
    "Sim. Em Configurações, depois Conta, {export} baixa todas as obras (plantas, dispositivos, fotos e orçamentos) num único arquivo de backup que você pode restaurar no {product} em qualquer aparelho. Contagens e orçamentos também são exportados em PDF e CSV.",
  "Export my data": "Exportar meus dados",
  "Do I pay for the iPad and iPhone apps?": "Pago pelos apps de iPad e iPhone?",
  "No. One subscription covers the web app and the iPad and iPhone apps for everyone on your team.":
    "Não. Uma assinatura cobre o app web e os apps de iPad e iPhone para todos da sua equipe.",
  "The crew reads it in their language. The client gets English.":
    "A equipe lê no idioma dela. O cliente recebe em inglês.",
  "Each person picks English, Spanish, Russian, Ukrainian, Polish, Portuguese, Chinese or Vietnamese, and the choice stays with their login. Plans, checklists, tasks and daily logs read in their language; quotes, invoices and client emails always go out in English.":
    "Cada pessoa escolhe inglês, espanhol, russo, ucraniano, polonês, português, chinês ou vietnamita, e a escolha fica salva no acesso dela. Plantas, checklists, tarefas e diários de obra aparecem no idioma dela; orçamentos, faturas e e-mails para clientes sempre saem em inglês.",
  "All eight languages work in the web app today, in any computer, tablet or phone browser, and on the iPad and iPhone app.":
    "Os oito idiomas já funcionam no app web, no navegador de qualquer computador, tablet ou celular, e no app para iPad e iPhone.",
  "Can my crew use it in their own language?":
    "Minha equipe pode usar no próprio idioma?",
  "Yes. Northpin speaks English, Spanish, Russian, Ukrainian, Polish, Portuguese, Chinese and Vietnamese. Anyone can switch from the menu or the page footer on the web, and the iPad and iPhone app follows the device language. The choice is saved on their login. Quotes, invoices and everything the client sees stay in English.":
    "Sim. O Northpin fala inglês, espanhol, russo, ucraniano, polonês, português, chinês e vietnamita. Na web, qualquer pessoa pode trocar pelo menu ou pelo rodapé da página, e o app para iPad e iPhone segue o idioma do aparelho. A escolha fica salva no acesso. Orçamentos, faturas e tudo o que o cliente vê continuam em inglês.",
};

export default siteAuth;
