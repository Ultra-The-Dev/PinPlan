// Transactional email templates. Pure functions → { subject, html, text }: no network, no browser APIs, so they're
// easy to test and render. HTML is table-based with inline styles (Gmail, Outlook, iOS Mail), declares light + dark
// colour schemes, and every piece of user content goes through esc(). Links are only ever http(s).
import { parseClientNote } from "./proposal";
import { PRODUCT_NAME } from "./plans";
import { formatCode, ROLE_INFO } from "./teamLogic";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

// Blueprint Ink palette (docs/brand.md): ink navy text on cool paper, action blue for the one button, teal for approved.
const C = {
  brand: "#0b6fe0", // action blue (white text 4.9:1)
  brandDark: "#0958b5", // action deep
  brandSoft: "#eaf3fe", // a light wash of highlight blue
  brandLine: "#cfe6ff", // highlight
  ink: "#0f2340", // ink navy
  text: "#1f3352",
  muted: "#526580", // pencil (5.6:1 on paper)
  line: "#c9d6e5", // rule
  page: "#f2f6fa", // paper
  card: "#ffffff", // sheet
  approved: "#0b7f72", // approved teal
};
// Dark scheme: deep blueprint paper with light linework; action blue brightened to electric for links.
const D = {
  page: "#081629",
  card: "#0f2340",
  line: "#22385a",
  ink: "#f2f6fa",
  text: "#d5e0ec",
  muted: "#a9bcd4", // on dark
  link: "#33a9ff", // electric
  soft: "#13294a",
};
const FONT = "Archivo,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace";

// ---------------------------------------------------------------- escaping

/** Escape text for HTML element content and quoted attribute values. */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only absolute http(s) URLs make it into a link; anything else (javascript:, data:, junk) gives null. */
export function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const LINK_REMOVED = "[link removed]";
// Bare domains ("evil.com/login", "bit.ly/x") on common and abused endings; "full.Thanks" typed without a space stays.
const BARE_DOMAIN =
  /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|info|biz|io|co|us|ca|uk|eu|de|fr|au|nz|in|me|ly|app|dev|xyz|link|site|online|shop|store|page|top|click|live|pro|ru|cn|tk|gq|ml|ga|cf|ai|so|to|gl|gd|cc|ws|sh|gg|tv|ms|be|im|li|lu|cx)\b(?::\d+)?(?:\/\S*)?/gi;
/**
 * Free-trial companies can't put links in the message to their client (a free account must not be a way to mail
 * strangers a phishing link). Removes web addresses, bare domains and email addresses.
 */
export function stripLinks(s: string): string {
  return s
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, LINK_REMOVED)
    .replace(/\bwww\.\S+/gi, LINK_REMOVED)
    .replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}\b/gi, LINK_REMOVED)
    .replace(BARE_DOMAIN, LINK_REMOVED);
}

/** Only https links (a pay-online link must never be plain http); null otherwise. */
export function httpsUrl(u: string | null | undefined): string | null {
  const ok = safeUrl(u);
  return ok && ok.startsWith("https://") ? ok : null;
}

/** The payment sites a pay-online button may point at (the host itself or a subdomain of it). */
export const PAY_HOSTS = ["checkout.stripe.com", "buy.stripe.com", "paypal.com", "squareup.com", "quickbooks.intuit.com"] as const;

/**
 * A pay-online link for an email: https, no user name or password in it, and on a known payment site. Anything else
 * (a look-alike domain, a shortener, plain http) gives null, so a company's settings can't turn Northpin's email
 * button into a link to any site.
 */
export function allowedPayUrl(u: string | null | undefined): string | null {
  const ok = httpsUrl(u);
  if (!ok) return null;
  const url = new URL(ok);
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return PAY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? ok : null;
}

/** One line of user text for a subject or heading: no line breaks, collapsed spaces, capped length. */
const line = (s: string | null | undefined, max = 80) => {
  // eslint-disable-next-line no-control-regex
  const t = (s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
};

export function money(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

// ---------------------------------------------------------------- building blocks (HTML + plain text together)

type Inline = string | { b: string } | { a: string; href: string };
interface Block {
  html: string;
  text: string;
}

const inlineHtml = (parts: Inline[]) =>
  parts
    .map((p) => {
      if (typeof p === "string") return esc(p);
      if ("b" in p) return `<strong style="color:${C.ink};font-weight:600" class="pp-strong">${esc(p.b)}</strong>`;
      const href = safeUrl(p.href);
      return href ? `<a href="${esc(href)}" class="pp-link" style="color:${C.brand};text-decoration:underline">${esc(p.a)}</a>` : esc(p.a);
    })
    .join("");
const inlineText = (parts: Inline[]) => parts.map((p) => (typeof p === "string" ? p : "b" in p ? p.b : safeUrl(p.href) ? `${p.a} (${safeUrl(p.href)})` : p.a)).join("");

/** Multi-line user text → escaped HTML with <br>. */
const multiline = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

const td = (inner: string, style = "") => `<tr><td style="padding:0 0 16px 0;${style}">${inner}</td></tr>`;

export const blocks = {
  heading(t: string): Block {
    return {
      html: td(`<h1 class="pp-ink" style="margin:0;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:700;color:${C.ink}">${esc(t)}</h1>`, "padding-bottom:12px"),
      text: `${t}\n${"=".repeat(Math.min(60, t.length))}`,
    };
  },
  para(...parts: Inline[]): Block {
    return {
      html: td(`<p class="pp-text" style="margin:0;font-family:${FONT};font-size:16px;line-height:1.55;color:${C.text}">${inlineHtml(parts)}</p>`),
      text: inlineText(parts),
    };
  },
  small(...parts: Inline[]): Block {
    return {
      html: td(`<p class="pp-muted" style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.muted}">${inlineHtml(parts)}</p>`),
      text: inlineText(parts),
    };
  },
  button(label: string, url: string | null | undefined): Block {
    const href = safeUrl(url);
    if (!href) return { html: "", text: "" };
    const h = esc(href);
    return {
      html:
        td(
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr>` +
            `<td align="center" bgcolor="${C.brand}" style="border-radius:10px;background:${C.brand}">` +
            `<a href="${h}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:10px;border:1px solid ${C.brand};border-bottom:2px solid ${C.brandDark};mso-padding-alt:0">${esc(label)}</a>` +
            `</td></tr></table>`,
          "padding:4px 0 12px 0",
        ) +
        td(
          `<p class="pp-muted" style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted};word-break:break-all">Or open this link: <a href="${h}" class="pp-link" style="color:${C.brand};text-decoration:underline">${esc(href)}</a></p>`,
          "padding-bottom:20px",
        ),
      text: `${label}: ${href}`,
    };
  },
  code(code: string, caption: string): Block {
    return {
      html: td(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td align="center" bgcolor="${C.brandSoft}" class="pp-code" style="padding:18px 12px;border:1px solid ${C.brandLine};border-radius:4px;background:${C.brandSoft}">` +
          `<div class="pp-muted" style="font-family:${FONT};font-size:13px;color:${C.muted};padding-bottom:6px">${esc(caption)}</div>` +
          `<div class="pp-ink pp-code-text" style="font-family:${MONO};font-size:32px;line-height:1.2;font-weight:700;letter-spacing:3px;color:${C.ink}">${esc(code)}</div>` +
          `</td></tr></table>`,
      ),
      text: `${caption}: ${code}`,
    };
  },
  details(rows: [string, string][]): Block {
    const shown = rows.filter(([, v]) => v);
    if (!shown.length) return { html: "", text: "" };
    const tr = shown
      .map(
        ([k, v], i) =>
          `<tr><td class="pp-muted pp-rule" valign="top" style="padding:10px 12px 10px 0;width:38%;font-family:${FONT};font-size:14px;line-height:1.4;color:${C.muted};${i ? `border-top:1px solid ${C.line};` : ""}">${esc(k)}</td>` +
          `<td class="pp-ink pp-rule" valign="top" style="padding:10px 0;font-family:${FONT};font-size:14px;line-height:1.4;color:${C.ink};font-weight:600;${i ? `border-top:1px solid ${C.line};` : ""}">${multiline(v)}</td></tr>`,
      )
      .join("");
    return {
      html: td(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${tr}</table>`, "padding-bottom:20px"),
      text: shown.map(([k, v]) => `${k}: ${v.replace(/\n/g, "\n  ")}`).join("\n"),
    };
  },
  quote(label: string, body: string): Block {
    return {
      html: td(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td class="pp-quote" style="padding:12px 16px;border-left:4px solid ${C.brand};background:${C.page};border-radius:4px">` +
          `<div class="pp-muted" style="font-family:${FONT};font-size:13px;font-weight:600;color:${C.muted};padding-bottom:6px">${esc(label)}</div>` +
          `<div class="pp-text" style="font-family:${FONT};font-size:15px;line-height:1.55;color:${C.text}">${multiline(body)}</div>` +
          `</td></tr></table>`,
      ),
      text: `${label}:\n${body
        .split(/\r?\n/)
        .map((l) => `> ${l}`)
        .join("\n")}`,
    };
  },
  list(title: string, items: { title: string; body?: string; href?: string }[], ordered = true): Block {
    if (!items.length) return { html: "", text: "" };
    const rows = items
      .map((it, i) => {
        const href = safeUrl(it.href);
        const t = href ? `<a href="${esc(href)}" style="color:${C.ink};text-decoration:underline" class="pp-ink">${esc(it.title)}</a>` : esc(it.title);
        return (
          `<tr><td valign="top" style="width:30px;padding:0 0 12px 0">` +
          `<div style="width:22px;height:22px;border-radius:11px;background:${C.brand};color:#ffffff;font-family:${FONT};font-size:12px;font-weight:700;line-height:22px;text-align:center">${ordered ? i + 1 : "&#8226;"}</div></td>` +
          `<td valign="top" style="padding:1px 0 12px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${C.text}" class="pp-text">` +
          `<strong style="color:${C.ink};font-weight:600" class="pp-strong">${t}</strong>${it.body ? `<br><span class="pp-muted" style="color:${C.muted};font-size:14px">${esc(it.body)}</span>` : ""}</td></tr>`
        );
      })
      .join("");
    return {
      html:
        (title ? td(`<h2 class="pp-ink" style="margin:0;font-family:${FONT};font-size:16px;line-height:1.4;font-weight:700;color:${C.ink}">${esc(title)}</h2>`, "padding:8px 0 10px 0") : "") +
        td(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`, "padding-bottom:8px"),
      text: `${title ? `${title}\n` : ""}${items.map((it, i) => `${ordered ? `${i + 1}.` : "-"} ${it.title}${it.body ? ` — ${it.body}` : ""}${safeUrl(it.href) ? ` (${safeUrl(it.href)})` : ""}`).join("\n")}`,
    };
  },
  divider(): Block {
    return { html: td(`<div class="pp-rule" style="border-top:1px solid ${C.line};height:1px;line-height:1px;font-size:1px">&nbsp;</div>`, "padding:4px 0 20px 0"), text: "---" };
  },
};

// ---------------------------------------------------------------- page layout

/** `sender`: client-facing mail, headed by the company's name instead of Northpin's. */
export function layout(opts: { subject: string; preheader: string; company?: string; blocks: Block[]; footer: string; sender?: string }): EmailContent {
  const company = line(opts.company, 80);
  const sender = line(opts.sender, 80);
  const body = opts.blocks.map((b) => b.html).join("");
  const header = sender
    ? `<span class="pp-ink" style="font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-0.3px;color:${C.ink}">${esc(sender)}</span>`
    : `<span class="pp-ink" style="font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-0.3px;color:${C.ink}">${esc(PRODUCT_NAME)}</span>` +
      (company ? `<span class="pp-muted" style="font-family:${FONT};font-size:14px;color:${C.muted}">&nbsp;&nbsp;·&nbsp;&nbsp;${esc(company)}</span>` : "");
  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(opts.subject)}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }
  a { color:${C.brand}; }
  @media (max-width:620px) {
    .pp-pad { padding:24px 20px !important; }
    .pp-code-text { font-size:26px !important; letter-spacing:2px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .pp-bg { background:${D.page} !important; }
    .pp-card { background:${D.card} !important; border-color:${D.line} !important; }
    .pp-ink, .pp-strong { color:${D.ink} !important; }
    .pp-text { color:${D.text} !important; }
    .pp-muted { color:${D.muted} !important; }
    .pp-rule { border-color:${D.line} !important; }
    .pp-code { background:${D.soft} !important; border-color:${C.brand} !important; }
    .pp-quote { background:${D.soft} !important; }
    .pp-link { color:${D.link} !important; }
  }
  [data-ogsc] .pp-ink, [data-ogsc] .pp-strong { color:${D.ink} !important; }
  [data-ogsc] .pp-text { color:${D.text} !important; }
  [data-ogsc] .pp-muted { color:${D.muted} !important; }
  [data-ogsc] .pp-link { color:${D.link} !important; }
  [data-ogsb] .pp-bg { background:${D.page} !important; }
  [data-ogsb] .pp-card { background:${D.card} !important; }
  [data-ogsb] .pp-code, [data-ogsb] .pp-quote { background:${D.soft} !important; }
</style>
</head>
<body class="pp-bg" style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page}">${esc(opts.preheader)}${"&#8199;&#65279;&#847; ".repeat(20)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" class="pp-bg" style="background:${C.page}">
<tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">
<tr><td style="padding:4px 4px 16px 4px">${header}</td></tr>
<tr><td class="pp-card pp-pad" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:4px;padding:32px 36px 20px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
</td></tr>
<tr><td class="pp-muted" style="padding:16px 8px 8px 8px;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted};text-align:center">${esc(opts.footer)}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
  const text = [sender || `${PRODUCT_NAME}${company ? ` · ${company}` : ""}`, "", ...opts.blocks.map((b) => b.text).filter(Boolean).flatMap((t) => [t, ""]), "--", opts.footer].join("\n");
  return { subject: opts.subject, html, text };
}

const sentFor = (company: string) => (company ? `Sent by ${PRODUCT_NAME} on behalf of ${company}.` : `Sent by ${PRODUCT_NAME}.`);

// ---------------------------------------------------------------- team invite

export interface TeamInviteEmail {
  inviterName?: string | null;
  teamName: string;
  role: "admin" | "tech";
  code: string;
  joinUrl: string;
  inviteeName?: string | null;
  expiresAt?: string | null;
}

export function teamInviteEmail(o: TeamInviteEmail): EmailContent {
  const team = line(o.teamName) || "your team";
  const from = line(o.inviterName, 60);
  const role = o.role === "admin" ? "Office admin" : "Technician";
  const code = formatCode(o.code);
  const until = fmtDate(o.expiresAt);
  const host = safeUrl(o.joinUrl) ? new URL(o.joinUrl).host : "";
  const subject = from ? `${from} invited you to join ${team} on ${PRODUCT_NAME}` : `You're invited to join ${team} on ${PRODUCT_NAME}`;
  return layout({
    subject,
    preheader: `Your invite code is ${code}.${until ? ` It works once, until ${until}.` : ""}`,
    company: team,
    blocks: [
      blocks.heading(`Join ${team} on ${PRODUCT_NAME}`),
      ...(line(o.inviteeName, 60) ? [blocks.para(`Hi ${line(o.inviteeName, 60)},`)] : []),
      blocks.para(from ? { b: from } : "You've been", from ? " invited you to join " : " invited to join ", { b: team }, ` on ${PRODUCT_NAME} as ${/^[aeiou]/i.test(role) ? "an" : "a"} `, { b: role }, "."),
      blocks.small(ROLE_INFO[o.role]?.description ?? ""),
      blocks.button(`Join ${team}`, o.joinUrl),
      blocks.code(code, "Your invite code"),
      blocks.small(`The code works once${until ? `, until ${until}` : ""}. Set up your login with this email address and a password of your choice.`),
      blocks.list("On an iPad or iPhone", [
        { title: `Open ${PRODUCT_NAME} on the iPad or iPhone` },
        { title: "Settings → Team → Join a team", body: `Type the code ${code} (dashes and capitals don't matter).` },
        { title: "Or sign in with the same email and password", body: `if you already set up your login with the button above${host ? ` or at ${host}/join` : ""}.` },
      ]),
      blocks.divider(),
      blocks.small("Weren't expecting this? You can ignore this email. The code does nothing until someone uses it."),
    ],
    footer: sentFor(team),
  });
}

// ---------------------------------------------------------------- proposal / plan review answered

export interface ProposalResponseEmail {
  kind: "proposal" | "review";
  outcome: "accepted" | "declined";
  companyName?: string | null;
  /** The client on the job (from the proposal). */
  clientName?: string | null;
  /** The name they typed when answering. */
  signerName?: string | null;
  jobName: string;
  title?: string | null;
  acceptedOptions?: string[];
  total?: number | null;
  currency?: string;
  /** client_note as stored (a plan review may pack pinned comments into it). */
  note?: string | null;
  respondedAt?: string | null;
  jobUrl: string;
}

export function proposalResponseEmail(o: ProposalResponseEmail): EmailContent {
  const job = line(o.jobName) || "your job";
  const who = line(o.signerName, 60) || line(o.clientName, 60) || "Your client";
  const company = line(o.companyName);
  const on = fmtDate(o.respondedAt);
  const { text: noteText, pins } = parseClientNote(o.note);
  const review = o.kind === "review";
  const accepted = o.outcome === "accepted";

  const subject = review
    ? accepted
      ? `Plan approved: ${job}`
      : `Changes requested: ${job}`
    : accepted
      ? `Proposal accepted: ${job}`
      : `Proposal declined: ${job}`;
  const heading = review ? (accepted ? "Your client approved the plan" : "Your client asked for changes") : accepted ? "Proposal accepted" : "Proposal declined";

  const intro: Inline[] = review
    ? accepted
      ? [{ b: who }, " approved the device layout for ", { b: job }, "."]
      : [{ b: who }, " asked for changes to the plan for ", { b: job }, "."]
    : accepted
      ? [{ b: who }, " accepted and signed your proposal for ", { b: job }, "."]
      : [{ b: who }, " declined your proposal for ", { b: job }, "."];

  const rows: [string, string][] = [
    ["Client", line(o.clientName, 80)],
    ["Job", job],
    [review ? "Answered by" : accepted ? "Signed by" : "Answered by", line(o.signerName, 80)],
    [accepted ? (review ? "Approved on" : "Accepted on") : "Answered on", on],
  ];
  if (!review && accepted) {
    if (typeof o.total === "number" && Number.isFinite(o.total)) rows.push(["Accepted total", money(o.total, o.currency || "USD")]);
    rows.push(["Options chosen", (o.acceptedOptions ?? []).length ? (o.acceptedOptions ?? []).map((x) => line(x, 120)).join("\n") : "None"]);
  }
  if (review && !accepted) rows.push(["Pins on the plan", String(pins.length)]);

  const next = review
    ? accepted
      ? "Next: send them the priced proposal for this layout."
      : "Open the job to see their pins on the plan, update it and send a new version."
    : accepted
      ? "Open the job to see the signed proposal, then schedule the work and send the deposit invoice."
      : "Open the job to see their answer.";

  const out: Block[] = [blocks.heading(heading), blocks.para(...intro), blocks.details(rows)];
  if (noteText) out.push(blocks.quote(review && !accepted ? "Their note" : "Note from the client", noteText.slice(0, 4000)));
  if (pins.length)
    out.push(
      blocks.list(
        `${pins.length} ${pins.length === 1 ? "pin" : "pins"} on the plan`,
        pins.slice(0, 25).map((p) => ({ title: `${line(p.floor, 60)} · pin ${p.n}`, body: line(p.note, 300) || "(no comment)" })),
        false,
      ),
    );
  if (pins.length > 25) out.push(blocks.small(`…and ${pins.length - 25} more. See them all on the job.`));
  out.push(blocks.para(next), blocks.button(review && !accepted ? "Review the changes" : "Open the job", o.jobUrl));
  return layout({
    subject,
    preheader: review ? (accepted ? `${who} approved the layout.` : `${who} left ${pins.length} ${pins.length === 1 ? "pin" : "pins"}${noteText ? " and a note" : ""}.`) : `${who} ${accepted ? "accepted" : "declined"} ${line(o.title, 80) || "your proposal"}.`,
    company,
    blocks: out,
    footer: `${PRODUCT_NAME} sent this because a client answered a link from ${company || "your company"}.`,
  });
}

// ---------------------------------------------------------------- welcome after company sign-up

export interface WelcomeEmail {
  name?: string | null;
  companyName?: string | null;
  appUrl: string;
  trialDays?: number | null;
}

export function welcomeEmail(o: WelcomeEmail): EmailContent {
  const company = line(o.companyName);
  const name = line(o.name, 60);
  const base = (safeUrl(o.appUrl) ?? "").replace(/\/+$/, "");
  const link = (p: string) => (base ? `${base}${p}` : undefined);
  return layout({
    subject: company ? `Welcome to ${PRODUCT_NAME}, ${company}` : `Welcome to ${PRODUCT_NAME}`,
    preheader: "Five steps from a floor plan to a signed proposal.",
    company,
    blocks: [
      blocks.heading(`Welcome to ${PRODUCT_NAME}${name ? `, ${name}` : ""}`),
      blocks.para(
        `You're set up${company ? " for " : ""}`,
        ...(company ? [{ b: company }] : []),
        `. ${PRODUCT_NAME} turns floor plans into device counts, priced estimates and proposals your clients sign on their phone.`,
      ),
      ...(o.trialDays ? [blocks.small(`Your free trial runs for ${o.trialDays} days. No card is needed to look around.`)] : []),
      blocks.list("Getting started", [
        { title: "Add your business details", body: "Name, logo, colours and terms appear on every proposal.", href: link("/settings#business") },
        { title: "Create a job and upload the plans", body: "PDF or photos of the floor plans, one sheet per floor.", href: link("/jobs") },
        { title: "Pin the devices", body: "Cameras, Wi-Fi, speakers, keypads… counts and wire runs add up per floor." },
        { title: "Price it and send a proposal", body: "The estimate uses your catalog; the client signs online." },
        { title: "Invite your crew", body: "Technicians get their own login without prices.", href: link("/settings") },
      ]),
      blocks.button(`Open ${PRODUCT_NAME}`, link("/jobs")),
      blocks.small("Works offline on the iPad in the field and syncs when you're back online. Reply to this email if you get stuck."),
    ],
    footer: `You're receiving this because you created a ${PRODUCT_NAME} account${company ? ` for ${company}` : ""}.`,
  });
}

// ---------------------------------------------------------------- billing (sent by the billing side)

export interface TrialEndingEmail {
  name?: string | null;
  companyName?: string | null;
  /** Default 3. */
  daysLeft?: number;
  endsAt?: string | null;
  planName?: string | null;
  billingUrl: string;
}

export function trialEndingEmail(o: TrialEndingEmail): EmailContent {
  const days = Math.max(0, Math.round(o.daysLeft ?? 3));
  const company = line(o.companyName);
  const name = line(o.name, 60);
  const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  const ends = fmtDate(o.endsAt);
  return layout({
    subject: `Your ${PRODUCT_NAME} trial ends ${when}`,
    preheader: `Add a payment method to keep ${company || "your team"} working without a break.`,
    company,
    blocks: [
      blocks.heading(`Your trial ends ${when}`),
      ...(name ? [blocks.para(`Hi ${name},`)] : []),
      blocks.para(
        `The free trial for `,
        { b: company || "your team" },
        ` ends ${when}${ends ? ` (${ends})` : ""}. Add a payment method to keep everyone working${line(o.planName) ? ` on ${line(o.planName)}` : ""}.`,
      ),
      blocks.button("Start subscription", o.billingUrl),
      blocks.small("If you don't, your jobs stay safe and read-only. You can subscribe any time to pick up where you left off."),
    ],
    footer: `You're receiving this because you own ${company ? `${company}'s` : "a"} ${PRODUCT_NAME} account.`,
  });
}

export interface PaymentFailedEmail {
  name?: string | null;
  companyName?: string | null;
  amount?: number | null;
  currency?: string;
  /** When the card will be tried again, if known. */
  nextAttemptAt?: string | null;
  billingUrl: string;
}

export function paymentFailedEmail(o: PaymentFailedEmail): EmailContent {
  const company = line(o.companyName);
  const name = line(o.name, 60);
  const amount = typeof o.amount === "number" && Number.isFinite(o.amount) ? money(o.amount, o.currency || "USD") : "";
  const retry = fmtDate(o.nextAttemptAt);
  return layout({
    subject: `Action needed: your ${PRODUCT_NAME} payment didn't go through`,
    preheader: "Update your card to keep your team working.",
    company,
    blocks: [
      blocks.heading("Your payment didn't go through"),
      ...(name ? [blocks.para(`Hi ${name},`)] : []),
      blocks.para(`We couldn't charge ${amount ? `${amount} ` : ""}for `, { b: company || "your team" }, `'s ${PRODUCT_NAME} subscription. Your team can keep working while you sort it out.`),
      blocks.details([
        ["Amount", amount],
        ["Next try", retry],
      ]),
      blocks.button("Update payment method", o.billingUrl),
      blocks.small("Banks often decline a charge they don't recognise or a card that's expired. Updating the card retries the payment right away."),
    ],
    footer: `You're receiving this because you own ${company ? `${company}'s` : "a"} ${PRODUCT_NAME} account.`,
  });
}

// ---------------------------------------------------------------- quotes / invoices to the client

export interface DocumentEmail {
  /** document: "here is your quote/invoice"; reminder: payment reminder; receipt: thanks for your payment. */
  kind: "document" | "reminder" | "receipt";
  docKind: "quote" | "invoice" | "credit_note";
  /** "Estimate", "Invoice"… */
  title: string;
  number?: string | null;
  companyName?: string | null;
  clientName?: string | null;
  total: number;
  balanceDue?: number | null;
  amountPaid?: number | null;
  currency?: string;
  dueDate?: string | null;
  validUntil?: string | null;
  overdue?: boolean;
  /** The client link (/d?t=…): view online, download the PDF, accept or pay. */
  url: string;
  /** The company's own pay-online link, already filled in. */
  payUrl?: string | null;
  message?: string | null;
  lastPayment?: { amount: number; date: string; method: string } | null;
}

export function documentEmail(o: DocumentEmail): EmailContent {
  const company = line(o.companyName) || "Your contractor";
  const title = line(o.title, 40) || "Document";
  const name = [title, line(o.number, 40)].filter(Boolean).join(" ");
  const cur = o.currency || "USD";
  const hi = line(o.clientName, 60);
  const due = fmtDate(o.dueDate);
  const valid = fmtDate(o.validUntil);
  const balance = typeof o.balanceDue === "number" ? o.balanceDue : o.total;
  // Only a known payment site (allowedPayUrl), whatever the caller passed.
  const pay = o.docKind === "invoice" && o.kind !== "receipt" && balance > 0 ? allowedPayUrl(o.payUrl) : null;
  const out: Block[] = [];
  let subject: string;
  let preheader: string;
  if (o.kind === "receipt") {
    subject = `Payment received — ${name}`;
    preheader = `Thank you for your payment${o.lastPayment ? ` of ${money(o.lastPayment.amount, cur)}` : ""}.`;
    out.push(blocks.heading("Thank you for your payment"));
    if (hi) out.push(blocks.para(`Hi ${hi},`));
    out.push(blocks.para(`${company} received your payment for `, { b: name }, "."));
    out.push(
      blocks.details([
        ["Payment", o.lastPayment ? money(o.lastPayment.amount, cur) : ""],
        ["Date", fmtDate(o.lastPayment?.date)],
        ["Method", line(o.lastPayment?.method, 40)],
        ["Invoice total", money(o.total, cur)],
        ["Paid so far", typeof o.amountPaid === "number" ? money(o.amountPaid, cur) : ""],
        ["Balance", money(Math.max(0, balance), cur)],
      ]),
    );
  } else if (o.kind === "reminder") {
    subject = o.overdue ? `Past due: ${name} from ${company}` : `Reminder: ${name} from ${company}${due ? ` is due ${due}` : ""}`;
    preheader = `${money(balance, cur)} ${o.overdue ? "is past due" : `due${due ? ` ${due}` : ""}`}.`;
    out.push(blocks.heading(o.overdue ? "Your invoice is past due" : "A friendly reminder"));
    if (hi) out.push(blocks.para(`Hi ${hi},`));
    out.push(blocks.para("This is a reminder that ", { b: name }, ` from ${company} has `, { b: money(balance, cur) }, o.overdue ? ` outstanding${due ? ` (due ${due})` : ""}.` : ` due${due ? ` on ${due}` : ""}.`));
    out.push(
      blocks.details([
        ["Invoice", name],
        ["Balance due", money(balance, cur)],
        ["Due date", due],
      ]),
    );
  } else {
    subject = `${name} from ${company}`;
    preheader = o.docKind === "quote" ? `${money(o.total, cur)} — review and accept online.` : o.docKind === "invoice" ? `${money(balance, cur)} due${due ? ` ${due}` : ""}.` : `Credit of ${money(o.total, cur)}.`;
    out.push(blocks.heading(o.docKind === "quote" ? `Your ${title.toLowerCase()} from ${company}` : `${name} from ${company}`));
    if (hi) out.push(blocks.para(`Hi ${hi},`));
    out.push(
      blocks.para(
        o.docKind === "quote"
          ? `Here is your ${title.toLowerCase()}. You can review it online, download a PDF and accept it with your signature.`
          : o.docKind === "invoice"
            ? `Here is your invoice. You can view it online and download a PDF${pay ? ", or pay online" : ""}.`
            : "Here is your credit note.",
      ),
    );
    const rows: [string, string][] =
      o.docKind === "quote"
        ? [
            ["Total", money(o.total, cur)],
            ["Valid until", valid],
          ]
        : o.docKind === "invoice"
          ? [
              ["Total", money(o.total, cur)],
              ["Balance due", money(balance, cur)],
              ["Due date", due],
            ]
          : [["Credit", money(o.total, cur)]];
    out.push(blocks.details(rows));
  }
  if (o.message?.trim()) out.push(blocks.quote(`Message from ${company}`, o.message.trim().slice(0, 4000)));
  out.push(blocks.button(o.docKind === "quote" && o.kind === "document" ? "Review & accept" : `View ${title.toLowerCase()}`, o.url));
  if (pay) {
    out.push(blocks.button(`Pay ${money(balance, cur)} online`, pay));
    // Say where the money goes, so a client can tell a real pay link from a fake one.
    out.push(blocks.small("The payment page is on ", { b: new URL(pay).hostname }, `, chosen by ${company}.`));
  }
  out.push(blocks.small("Questions? Just reply to this email."));
  return layout({ subject, preheader, sender: company, blocks: out, footer: `Sent on behalf of ${company} with ${PRODUCT_NAME}.` });
}

export interface DocumentResponseEmail {
  outcome: "accepted" | "declined";
  title: string;
  number?: string | null;
  signerName?: string | null;
  clientName?: string | null;
  jobName: string;
  total?: number | null;
  currency?: string;
  note?: string | null;
  respondedAt?: string | null;
  url: string;
  companyName?: string | null;
}

/** To the company: a client accepted or declined a quote from its link. */
export function documentResponseEmail(o: DocumentResponseEmail): EmailContent {
  const job = line(o.jobName) || "your job";
  const name = [line(o.title, 40) || "Quote", line(o.number, 40)].filter(Boolean).join(" ");
  const who = line(o.signerName, 60) || line(o.clientName, 60) || "Your client";
  const accepted = o.outcome === "accepted";
  const out: Block[] = [
    blocks.heading(accepted ? `${name} accepted` : `${name} declined`),
    blocks.para({ b: who }, accepted ? " accepted and signed " : " declined ", { b: name }, " for ", { b: job }, "."),
    blocks.details([
      ["Client", line(o.clientName, 80)],
      ["Job", job],
      [accepted ? "Signed by" : "Answered by", line(o.signerName, 80)],
      ["Total", typeof o.total === "number" ? money(o.total, o.currency || "USD") : ""],
      [accepted ? "Accepted on" : "Answered on", fmtDate(o.respondedAt)],
    ]),
  ];
  if (o.note?.trim()) out.push(blocks.quote("Note from the client", o.note.trim().slice(0, 4000)));
  out.push(blocks.para(accepted ? "Next: create the deposit invoice from the quote and schedule the work." : "Open the job to see their answer."), blocks.button(`Open in ${PRODUCT_NAME}`, o.url));
  return layout({
    subject: `${accepted ? "Accepted" : "Declined"}: ${name} — ${job}`,
    preheader: `${who} ${accepted ? "accepted" : "declined"} ${name}.`,
    company: line(o.companyName),
    blocks: out,
    footer: `${PRODUCT_NAME} sent this because a client answered a link from ${line(o.companyName) || "your company"}.`,
  });
}

// ---------------------------------------------------------------- change order / RFI answered (to the office)

export interface ChangeOrderResponseEmail {
  outcome: "approved" | "rejected";
  /** "CO-003" */
  code: string;
  title?: string | null;
  /** The name they typed when answering. */
  signerName?: string | null;
  clientName?: string | null;
  jobName: string;
  total?: number | null;
  currency?: string;
  comment?: string | null;
  respondedAt?: string | null;
  url: string;
  companyName?: string | null;
}

/** To the office: a client approved (signed) or rejected a change order from its link. */
export function changeOrderResponseEmail(o: ChangeOrderResponseEmail): EmailContent {
  const job = line(o.jobName) || "your job";
  const code = line(o.code, 20) || "Change order";
  const title = line(o.title, 80);
  const name = title ? `${code} ${title}` : code;
  const who = line(o.signerName, 60) || line(o.clientName, 60) || "Your client";
  const approved = o.outcome === "approved";
  const company = line(o.companyName);
  const out: Block[] = [
    blocks.heading(approved ? `${code} approved` : `${code} rejected`),
    blocks.para({ b: who }, approved ? " approved and signed change order " : " rejected change order ", { b: name }, " for ", { b: job }, "."),
    blocks.details([
      ["Client", line(o.clientName, 80)],
      ["Job", job],
      [approved ? "Signed by" : "Answered by", line(o.signerName, 80)],
      ["Total", typeof o.total === "number" && Number.isFinite(o.total) ? money(o.total, o.currency || "USD") : ""],
      [approved ? "Approved on" : "Answered on", fmtDate(o.respondedAt)],
    ]),
  ];
  if (o.comment?.trim()) out.push(blocks.quote("Comment from the client", o.comment.trim().slice(0, 4000)));
  out.push(
    blocks.para(approved ? "Next: schedule the extra work. The change is now part of the job's contract total." : "Open the job to see their comment, then revise and send it again if needed."),
    blocks.button("Open the change order", o.url),
  );
  return layout({
    subject: `${approved ? "Approved" : "Rejected"}: ${name} — ${job}`,
    preheader: `${who} ${approved ? "approved" : "rejected"} ${code}.`,
    company,
    blocks: out,
    footer: `${PRODUCT_NAME} sent this because a client answered a link from ${company || "your company"}.`,
  });
}

export interface RfiAnsweredEmail {
  /** "RFI-007" */
  code: string;
  subject?: string | null;
  question?: string | null;
  answer: string;
  /** The name they typed when answering. */
  answeredBy?: string | null;
  /** Who it was sent to (GC, architect…), as written on the RFI. */
  toCompany?: string | null;
  jobName: string;
  answeredAt?: string | null;
  url: string;
  companyName?: string | null;
}

/** To the office: someone answered an RFI from its link. */
export function rfiAnsweredEmail(o: RfiAnsweredEmail): EmailContent {
  const job = line(o.jobName) || "your job";
  const code = line(o.code, 20) || "RFI";
  const subj = line(o.subject, 100);
  const name = subj ? `${code}: ${subj}` : code;
  const who = line(o.answeredBy, 60) || "Someone";
  const company = line(o.companyName);
  const out: Block[] = [
    blocks.heading(`${code} answered`),
    blocks.para({ b: who }, line(o.toCompany, 60) ? ` (${line(o.toCompany, 60)})` : "", " answered ", { b: name }, " on ", { b: job }, "."),
    blocks.details([
      ["Job", job],
      ["Answered by", line(o.answeredBy, 80)],
      ["Answered on", fmtDate(o.answeredAt)],
    ]),
  ];
  if (o.question?.trim()) out.push(blocks.quote("Your question", o.question.trim().slice(0, 2000)));
  out.push(blocks.quote("Their answer", o.answer.trim().slice(0, 5000) || "(no answer text)"));
  out.push(blocks.para("Open the RFI to close it, or ask a follow-up."), blocks.button("Open the RFI", o.url));
  return layout({
    subject: `Answered: ${name} — ${job}`,
    preheader: `${who} answered ${code}.`,
    company,
    blocks: out,
    footer: `${PRODUCT_NAME} sent this because someone answered an RFI link from ${company || "your company"}.`,
  });
}

// ---------------------------------------------------------------- Supabase Auth's own emails

/**
 * The emails Supabase Auth sends (sign-up, invite, sign-in link, password reset, email change, re-authentication) in
 * the same look, as pasted into Supabase → Authentication → Email Templates. Kept in supabase/templates/<name>.html
 * (a test checks the files match). Supabase fills in the {{ .Placeholders }}.
 */
export function authEmailTemplates(): Record<string, { subject: string; html: string }> {
  const MARK = "https://confirmation-url.invalid/";
  const footer = `Sent by ${PRODUCT_NAME}. You're receiving this because someone used this address on ${PRODUCT_NAME}.`;
  const page = (subject: string, preheader: string, body: Block[]) => ({
    subject,
    html: layout({ subject, preheader, blocks: body, footer }).html.split(esc(MARK)).join("{{ .ConfirmationURL }}"),
  });
  return {
    "confirm-signup": page(`Confirm your ${PRODUCT_NAME} email`, "One tap to finish setting up your account.", [
      blocks.heading("Confirm your email"),
      blocks.para(`Tap the button to confirm {{ .Email }} and finish setting up your ${PRODUCT_NAME} account.`),
      blocks.button("Confirm my email", MARK),
      blocks.small(`If you didn't sign up for ${PRODUCT_NAME}, you can ignore this email.`),
    ]),
    invite: page(`You're invited to ${PRODUCT_NAME}`, "Accept the invite to set up your login.", [
      blocks.heading(`You're invited to ${PRODUCT_NAME}`),
      blocks.para(`You've been invited to create a ${PRODUCT_NAME} account for {{ .Email }}. Tap the button to accept and choose a password.`),
      blocks.button("Accept the invite", MARK),
      blocks.small("If you weren't expecting this, you can ignore this email."),
    ]),
    "magic-link": page(`Your ${PRODUCT_NAME} sign-in link`, "Tap to sign in. The link works once.", [
      blocks.heading(`Sign in to ${PRODUCT_NAME}`),
      blocks.para("Tap the button to sign in as {{ .Email }}. The link works once and expires soon."),
      blocks.button("Sign in", MARK),
      blocks.small("If you didn't ask to sign in, you can ignore this email. Nobody can sign in without this link."),
    ]),
    "reset-password": page(`Reset your ${PRODUCT_NAME} password`, "Choose a new password for your account.", [
      blocks.heading("Reset your password"),
      blocks.para("Someone (hopefully you) asked to reset the password for {{ .Email }}. Tap the button to choose a new one."),
      blocks.button("Choose a new password", MARK),
      blocks.small("If you didn't ask, ignore this email. Your password stays the same."),
    ]),
    "change-email": page(`Confirm your new ${PRODUCT_NAME} email`, "Confirm the change to your login email.", [
      blocks.heading("Confirm your new email"),
      blocks.para(`Tap the button to change your ${PRODUCT_NAME} login from {{ .Email }} to {{ .NewEmail }}.`),
      blocks.button("Confirm the new email", MARK),
      blocks.small("If you didn't ask for this, don't tap the button, and change your password in Settings."),
    ]),
    reauthentication: page(`Your ${PRODUCT_NAME} confirmation code`, "Enter the code to confirm it's you.", [
      blocks.heading("Confirm it's you"),
      blocks.para(`Enter this code in ${PRODUCT_NAME} to finish changing your account settings.`),
      blocks.code("{{ .Token }}", "Your code"),
      blocks.small("The code works once and expires soon. If you didn't ask for it, change your password."),
    ]),
  };
}
