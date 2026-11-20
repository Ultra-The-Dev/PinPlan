"use client";
import { Building, CreditCard, LayoutTemplate, MoreHorizontal, Plug, ReceiptText, Save, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DOC_DEFAULT_ACCENT, DOC_DEFAULT_BRAND } from "@/lib/brandDefaults";
import { msg, useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { COMPANY_SETTINGS_EVENT, saveSettingsAndCompany } from "@/lib/companySettings";
import { getSettings } from "@/lib/db";
import { PRODUCT_NAME } from "@/lib/plans";
import { tradeWireTypes, tradeVocab } from "@/lib/trades";
import { TRADES_EVENT, useTrades } from "@/lib/useTrades";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import type { AppSettings } from "@/lib/types";
import AccessCodePanel from "./AccessCodePanel";
import AccountPanel from "./AccountPanel";
import BillduSettings from "./BillduSettings";
import BillingPanel from "./BillingPanel";
import ChecklistTemplatesSettings from "./ChecklistTemplatesSettings";
import FormTemplatesSettings from "./forms/FormTemplatesSettings";
import DocSettingsPanel from "./documents/DocSettingsPanel";
import TeamPanel from "./TeamPanel";
import TemplatesSettings from "./templates/TemplatesSettings";
import TradeSettings from "./TradeSettings";
import InstallSettings from "./progress/InstallSettings";

/** A group of settings with a small heading; `id` is what the side nav (and links like /settings#team) jump to. */
function Group({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <div id={id} className="scroll-mt-6 space-y-4">
      <h2 className="px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t(title)}</h2>
      {children}
    </div>
  );
}

/**
 * Settings, in sections: Company · Team · Plan & billing · Quotes & invoices · Connected apps · Templates · More.
 * Older anchors (#trades, #business, #pricing, #wire, #invoicing, #billdu, #checklists, #forms, #account, …) still
 * land on their card.
 */
export default function SettingsForm({ connectedApps }: { connectedApps?: React.ReactNode } = {}) {
  const [s, setS] = useState<AppSettings | null>(null);
  const [orig, setOrig] = useState<string>("");
  // The last saved copy, for the company-settings listener (which must not throw away unsaved edits).
  const origRef = useRef(orig);
  useEffect(() => {
    origRef.current = orig;
  }, [orig]);
  useEffect(() => {
    const load = () =>
      void getSettings().then((x) => {
        // Adding a trade adds wire prices: pick them up without losing unsaved edits elsewhere.
        setS((cur) => (cur ? { ...cur, trades: x.trades, pricing: { ...cur.pricing, wirePrices: { ...x.pricing.wirePrices, ...cur.pricing.wirePrices } } } : x));
        setOrig((o) => (o ? JSON.stringify({ ...JSON.parse(o), trades: x.trades, pricing: { ...JSON.parse(o).pricing, wirePrices: { ...x.pricing.wirePrices, ...JSON.parse(o).pricing.wirePrices } } }) : JSON.stringify(x)));
      });
    // The company's details changed (another device, or a sync): show them, unless this business card has unsaved edits.
    const onCompany = () =>
      void getSettings().then((x) => {
        const saved = origRef.current ? (JSON.parse(origRef.current) as AppSettings) : null;
        setS((cur) => {
          if (!cur || !saved) return x;
          return JSON.stringify(cur.business) === JSON.stringify(saved.business) ? { ...cur, business: x.business } : cur;
        });
        setOrig((o) => (o ? JSON.stringify({ ...JSON.parse(o), business: x.business }) : JSON.stringify(x)));
      });
    load();
    window.addEventListener(TRADES_EVENT, load);
    window.addEventListener(COMPANY_SETTINGS_EVENT, onCompany);
    return () => {
      window.removeEventListener(TRADES_EVENT, load);
      window.removeEventListener(COMPANY_SETTINGS_EVENT, onCompany);
    };
  }, []);
  const trades = useTrades();
  const t = useT();
  // Technicians don't see prices, the business branding or connected apps (office work).
  const office = can(useRole(), "prices");
  if (!s) return <p className="p-6 text-slate-500">{t("Loading…")}</p>;
  const b = s.business;
  const p = s.pricing;
  const setB = (k: keyof typeof b, v: string) => setS({ ...s, business: { ...b, [k]: v } });
  const setP = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setS({ ...s, pricing: { ...p, [k]: v } });

  const dirty = JSON.stringify(s) !== orig;
  const save = async () => {
    try {
      // The business name, contact details, logo and quote terms belong to the company: they go up for everyone.
      const r = await saveSettingsAndCompany(s, orig ? (JSON.parse(orig) as AppSettings) : null);
      setS(r.settings);
      setOrig(JSON.stringify(r.settings));
      if (r.error) toast(t("Settings saved on this device. Your business details go to your team on the next sync ({error}).", { error: r.error }), "info");
      else toast(t("Settings saved"));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };
  // The cards that edit the settings record (business, wire, pricing) save together with the bar at the bottom.
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void save();
  };
  const NAV = [
    { id: "company", label: msg("Company"), icon: Building },
    { id: "team", label: msg("Team"), icon: Users },
    { id: "billing", label: msg("Plan & billing"), icon: CreditCard },
    { id: "quotes", label: msg("Quotes & invoices"), icon: ReceiptText, office: true },
    { id: "connected", label: msg("Connected apps"), icon: Plug, office: true },
    { id: "library", label: msg("Templates"), icon: LayoutTemplate },
    { id: "more", label: msg("More"), icon: MoreHorizontal },
  ].filter((n) => office || !n.office);
  const wireWord = tradeVocab(trades).wire === "Cable" ? "Wire" : tradeVocab(trades).wire;

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-6 sm:px-6 sm:py-8 md:grid-cols-[180px_1fr]">
      <aside className="hidden md:block">
        <div className="sticky top-6">
          <h1 className="page-title mb-4">{t("Settings")}</h1>
          <nav className="space-y-0.5" aria-label={t("Settings sections")}>
            {NAV.map((n) => (
              <a
                key={n.id}
                href={`#${n.id}`}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm"
              >
                <n.icon className="h-4 w-4 text-slate-400" />
                {t(n.label)}
              </a>
            ))}
          </nav>
        </div>
      </aside>
      <div className="min-w-0 space-y-10">
        <div className="space-y-3 md:hidden">
          <h1 className="page-title">{t("Settings")}</h1>
          {/* Phones: the sections as a scrolling row of chips. */}
          <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label={t("Settings sections")}>
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} className="chip shrink-0 bg-white px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200">
                {t(n.label)}
              </a>
            ))}
          </nav>
        </div>

        <Group id="company" title={msg("Company")}>
          <TradeSettings />
          {office && (
          <form onSubmit={onSubmit}>
          <section id="business" className="card grid scroll-mt-6 gap-4 p-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h2 className="text-lg font-semibold">{t("Your business")}</h2>
              <p className="text-sm text-slate-500">{t("Your name, logo and colours on quotes, invoices and client links.")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <div className="flex h-20 w-48 items-center justify-center rounded-xl bg-white p-2 ring-1 ring-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.logo ? <img src={b.logo} alt={t("Logo")} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">{t("No logo")}</span>}
              </div>
              <div className="space-y-2">
                <label className="btn btn-sm cursor-pointer">
                  {t("Upload logo")}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      // Keep it small: proposals and PDFs carry the logo with them.
                      const img = await createImageBitmap(f);
                      const k = Math.min(1, 800 / Math.max(img.width, img.height));
                      const c = document.createElement("canvas");
                      c.width = Math.round(img.width * k);
                      c.height = Math.round(img.height * k);
                      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
                      setB("logo", c.toDataURL("image/png"));
                      e.target.value = "";
                    }}
                  />
                </label>
                <div className="flex gap-3">
                  {(
                    [
                      ["brandColor", msg("Brand colour"), DOC_DEFAULT_BRAND],
                      ["accentColor", msg("Accent"), DOC_DEFAULT_ACCENT],
                    ] as const
                  ).map(([k, label, def]) => (
                    <label key={k} className="flex items-center gap-2 text-sm text-slate-600">
                      <input type="color" className="h-8 w-10 cursor-pointer rounded-md border border-slate-200 bg-white p-0.5" value={b[k] || def} onChange={(e) => setB(k, e.target.value)} />
                      {t(label)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {(
              [
                ["name", msg("Business name")],
                ["phone", msg("Phone")],
                ["email", msg("Email")],
                ["website", msg("Website")],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <label className="label" htmlFor={`set-${k}`}>{t(label)}</label>
                <input id={`set-${k}`} className="input" value={b[k]} onChange={(e) => setB(k, e.target.value)} />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="label" htmlFor="set-address">{t("Address")}</label>
              <input id="set-address" className="input" value={b.address} onChange={(e) => setB("address", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="set-tagline">{t("Tagline")}</label>
              <input id="set-tagline" className="input" placeholder={t("Electrical · Low voltage · Security")} value={b.tagline ?? ""} onChange={(e) => setB("tagline", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="set-service-area">{t("Service area")}</label>
              <input id="set-service-area" className="input" placeholder={t("Serving the metro area and nearby towns")} value={b.serviceArea ?? ""} onChange={(e) => setB("serviceArea", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="set-estimate-terms">{t("Quote terms")}</label>
              <textarea id="set-estimate-terms" className="input min-h-20" value={b.estimateTerms} onChange={(e) => setB("estimateTerms", e.target.value)} />
            </div>
          </section>
          </form>
          )}

          <form onSubmit={onSubmit}>
          <section id="wire" className="card grid scroll-mt-6 gap-4 p-6 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <h2 className="text-lg font-semibold">{t(wireWord)}</h2>
              <p className="text-sm text-slate-500">{office ? (wireWord === "Wire" ? t("How home-run lengths are estimated from the plan, and the price per foot of each cable.") : t("How home-run lengths are estimated from the plan, and the price per foot of each type.")) : t("How home-run lengths are estimated from the plan.")}</p>
            </div>
            <div>
              <label className="label" htmlFor="set-slack-service-loop">{t("Slack / service loop %")}</label>
              <input id="set-slack-service-loop" className="input" type="number" value={p.wireSlackPct} onChange={(e) => setP("wireSlackPct", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className="label" htmlFor="set-extra-ft-per-home-run">{t("Extra ft per home run")}</label>
              <input id="set-extra-ft-per-home-run" className="input" type="number" value={p.wireDropFt} onChange={(e) => setP("wireDropFt", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className="label" htmlFor="set-floor-to-floor-height-ft">{t("Floor-to-floor height ft")}</label>
              <input id="set-floor-to-floor-height-ft" className="input" type="number" value={p.floorHeightFt} onChange={(e) => setP("floorHeightFt", Number(e.target.value) || 0)} />
            </div>
            {office && tradeWireTypes(trades).map((w) => (
              <div key={w}>
                <label className="label" htmlFor={`set-wire-${w.replace(/[^a-zA-Z0-9]+/g, "-")}`}>{t("{wire} $/ft", { wire: w })}</label>
                <input
                  id={`set-wire-${w.replace(/[^a-zA-Z0-9]+/g, "-")}`}
                  className="input"
                  type="number"
                  step="0.01"
                  value={p.wirePrices[w] ?? 0}
                  onChange={(e) => setP("wirePrices", { ...p.wirePrices, [w]: Number(e.target.value) || 0 })}
                />
              </div>
            ))}
          </section>
          </form>
          {office && <InstallSettings value={s.installPhotoRequired} onChange={(v) => setS({ ...s, installPhotoRequired: v })} />}
        </Group>

        <Group title={msg("Team")}>
          <TeamPanel businessName={s.business.name} />
        </Group>

        <Group title={msg("Plan & billing")}>
          <BillingPanel />
        </Group>

        {office && (
          <Group id="quotes" title={msg("Quotes & invoices")}>
            <form onSubmit={onSubmit}>
            <section id="pricing" className="card grid scroll-mt-6 gap-4 p-6 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <h2 className="text-lg font-semibold">{t("Pricing defaults")}</h2>
                <p className="text-sm text-slate-500">{t("New jobs start from these; each job can change markup, tax and labor.")}</p>
              </div>
              <div>
                <label className="label" htmlFor="set-markup-on-materials">{t("Markup on materials %")}</label>
                <input id="set-markup-on-materials" className="input" type="number" step="0.1" value={p.markupPct} onChange={(e) => setP("markupPct", Number(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label" htmlFor="set-sales-tax">{t("Sales tax %")}</label>
                <input id="set-sales-tax" className="input" type="number" step="0.01" value={p.taxPct} onChange={(e) => setP("taxPct", Number(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label" htmlFor="set-currency">{t("Currency")}</label>
                <input id="set-currency" className="input" value={p.currency} maxLength={3} onChange={(e) => setP("currency", e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="label" htmlFor="set-labor-on-estimate">{t("Labor on the quote")}</label>
                <select id="set-labor-on-estimate" className="input" value={p.laborMode} onChange={(e) => setP("laborMode", e.target.value as "combined" | "separate")}>
                  <option value="combined">{t("Combined (“— installed” price)")}</option>
                  <option value="separate">{t("Separate labor lines")}</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={p.includeTentative} onChange={(e) => setP("includeTentative", e.target.checked)} />
                {t("Include optional (?) items in totals by default")}
              </label>
            </section>
            </form>
            <section id="invoicing" className="card scroll-mt-6 space-y-4 p-6">
              <div>
                <h2 className="text-lg font-semibold">{t("Quotes, invoices and credit notes")}</h2>
                <p className="text-sm text-slate-500">{t("Titles, numbering, terms, taxes and how clients pay, for documents made in {product}. Shared by everyone in the office.", { product: PRODUCT_NAME })}</p>
              </div>
              <DocSettingsPanel />
            </section>
          </Group>
        )}

        {office && (
          <Group id="connected" title={msg("Connected apps")}>
            {/* Other connected apps render here too (passed in by the settings page). */}
            {connectedApps}
            <section id="billdu" className="card scroll-mt-6 space-y-4 p-6">
              <div>
                <h2 className="text-lg font-semibold">Billdu</h2>
                <p className="text-sm text-slate-500">{t("Optional: if you already invoice in Billdu, connect it to send quotes and invoices there from a job.")}</p>
              </div>
              <BillduSettings />
            </section>
          </Group>
        )}

        <Group id="library" title={msg("Templates")}>
          <section id="checklists" className="card scroll-mt-6 space-y-4 p-6">
            <div>
              <h2 className="text-lg font-semibold">{t("Checklist templates")}</h2>
              <p className="text-sm text-slate-500">{t("Your own checklists, saved from a job with “Save as template”. They show first under “Start a checklist”.")}</p>
            </div>
            <ChecklistTemplatesSettings />
          </section>
          <TemplatesSettings />
          <section id="forms" className="card scroll-mt-6 space-y-4 p-6">
            <div>
              <h2 className="text-lg font-semibold">{t("Forms")}</h2>
              <p className="text-sm text-slate-500">{t("Inspections, test records, T&M tags and sign-offs your crew fills on jobs (Field → Forms). Duplicate a built-in to make it yours.")}</p>
            </div>
            <FormTemplatesSettings />
          </section>
        </Group>

        <Group id="more" title={msg("More")}>
          <AccessCodePanel />
          <div className="card scroll-mt-6 p-6">
            <AccountPanel />
          </div>
        </Group>

        <div className={`sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-xl px-4 py-3 transition ${dirty ? "bg-ink/95 shadow-pop backdrop-blur" : "pointer-events-none opacity-0"}`} aria-hidden={!dirty}>
          {dirty && <span className="mr-auto text-sm text-white/80">{t("You have unsaved changes")}</span>}
          <button type="button" className="btn btn-brand" disabled={!dirty} onClick={() => void save()}>
            <Save /> {t("Save settings")}
          </button>
        </div>
      </div>
    </div>
  );
}
