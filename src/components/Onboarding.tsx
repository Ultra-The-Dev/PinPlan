"use client";
// First-run checklist: the full page (/start) and a compact card on the jobs list until it's done or dismissed.
import { ArrowRight, Building2, Check, ChevronDown, FileUp, ImagePlus, Loader2, Smartphone, Sparkles, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS } from "@/lib/catalog";
import { getSettings, newId, nowIso, put, saveSettings } from "@/lib/db";
import { dismissOnboarding, isSampleBusiness, refreshOnboarding, tickOnboarding, useOnboarding } from "@/lib/onboarding";
import type { OnboardingStepId } from "@/lib/onboardingLogic";
import { PRODUCT_NAME, TRIAL_DAYS } from "@/lib/plans";
import { useSyncStatus } from "@/lib/sync";
import { useTeam } from "@/lib/team";
import { toast } from "@/lib/toast";
import type { AppSettings, Project } from "@/lib/types";

const STEPS: Record<OnboardingStepId, { title: string; body: string; icon: React.ElementType }> = {
  business: { title: "Your business", body: "Name, phone and logo for your estimates and client proposals.", icon: Building2 },
  plan: { title: "Upload your first floor plan", body: "Start a job and add the plan — a PDF or a photo of it.", icon: FileUp },
  team: { title: "Invite your team", body: "Office staff and technicians each get their own login.", icon: Users },
  app: { title: "Get the iPad app", body: "Walk the site with the plan; it all syncs to the office.", icon: Smartphone },
};

/** The full checklist on /start. */
export function OnboardingChecklist() {
  const router = useRouter();
  const o = useOnboarding();
  const team = useTeam((s) => s.team);
  const sync = useSyncStatus();
  // null: the next step to do is open. "none": the user closed it.
  const [open, setOpen] = useState<OnboardingStepId | "none" | null>(null);
  const current = open ?? o.progress.next;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
          <Sparkles className="h-3.5 w-3.5" /> {TRIAL_DAYS}-day free trial
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {team?.name ? `${team.name} is ready` : `Welcome to ${PRODUCT_NAME}`}
        </h1>
        <p className="mt-1.5 text-slate-500">Four quick steps and you’re ready for your next walkthrough. You can come back to this any time.</p>
      </div>

      <div className="card overflow-hidden ring-1 ring-slate-200/60">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-900">
              {o.progress.complete ? "All done" : `${o.progress.done} of ${o.progress.total} done`}
            </div>
            <Progress done={o.progress.done} total={o.progress.total} />
          </div>
        </div>
        <ol className="divide-y divide-slate-100">
          {(Object.keys(STEPS) as OnboardingStepId[]).map((id, i) => {
            const s = STEPS[id];
            const isOpen = current === id;
            return (
              <li key={id}>
                <button
                  className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50"
                  onClick={() => setOpen(isOpen ? "none" : id)}
                  aria-expanded={isOpen}
                >
                  <StepMark done={o.done[id]} n={i + 1} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[15px] font-medium ${o.done[id] ? "text-slate-500" : "text-slate-900"}`}>{s.title}</span>
                    <span className="block text-sm text-slate-500">{s.body}</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 sm:pl-[60px]">
                    {id === "business" && <BusinessStep onDone={() => setOpen(null)} />}
                    {id === "plan" && <PlanStep />}
                    {id === "team" && <TeamStep done={o.done.team} />}
                    {id === "app" && <AppStep email={sync.email} done={o.done.app} />}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          className="btn btn-ghost text-slate-500"
          onClick={() => {
            dismissOnboarding();
            router.push("/");
          }}
        >
          Hide this checklist
        </button>
        <Link href="/" className="btn btn-primary h-11 px-5">
          Go to jobs <ArrowRight />
        </Link>
      </div>
    </div>
  );
}

/** The compact card at the top of the jobs list (new companies, until done or dismissed). */
export function OnboardingCard() {
  const o = useOnboarding();
  if (!o.ready || !o.started || o.dismissed || o.progress.complete) return null;
  const next = o.progress.next ? STEPS[o.progress.next] : null;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8">
      <div className="card flex flex-col gap-3 p-4 ring-1 ring-slate-200/60 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            {next ? <next.icon className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900">
              Get set up · {o.progress.done} of {o.progress.total}
            </div>
            <div className="truncate text-sm text-slate-500">Next: {next?.title}</div>
            <Progress done={o.progress.done} total={o.progress.total} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/start" className="btn btn-brand flex-1 sm:flex-none">
            Continue <ArrowRight />
          </Link>
          <button className="btn btn-ghost btn-icon text-slate-400" onClick={dismissOnboarding} aria-label="Hide the setup checklist" title="Hide">
            <X />
          </button>
        </div>
      </div>
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(done / total) * 100}%` }} />
    </div>
  );
}

function StepMark({ done, n }: { done: boolean; n: number }) {
  return done ? (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white" aria-label="Done">
      <Check className="h-4 w-4" />
    </span>
  ) : (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold text-slate-500 ring-1 ring-slate-300">{n}</span>
  );
}

/** Small logo: proposals and PDFs carry it with them (same as Settings › Business). */
async function shrinkLogo(f: File): Promise<string> {
  const img = await createImageBitmap(f);
  const k = Math.min(1, 800 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

function BusinessStep({ onDone }: { onDone: () => void }) {
  const team = useTeam((s) => s.team);
  const [s, setS] = useState<AppSettings | null>(null);
  const [f, setF] = useState({ name: "", phone: "", email: "", website: "", logo: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getSettings().then((x) => {
      setS(x);
      // The sample company's details are only placeholders: start this company's form empty.
      const b = x.business;
      const own = (k: "phone" | "email" | "website" | "logo") => (b[k] && b[k] !== DEFAULT_SETTINGS.business[k] ? (b[k] ?? "") : "");
      setF({ name: isSampleBusiness(b.name) ? (team?.name ?? "") : b.name, phone: own("phone"), email: own("email"), website: own("website"), logo: own("logo") });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!s) return <Loader2 className="h-4 w-4 animate-spin text-slate-400" />;
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!f.name.trim() || !f.phone.trim()) return;
        setBusy(true);
        const latest = await getSettings();
        await saveSettings({
          ...latest,
          business: {
            ...latest.business,
            name: f.name.trim(),
            phone: f.phone.trim(),
            email: f.email.trim() || latest.business.email,
            website: f.website.trim() || latest.business.website,
            logo: f.logo || latest.business.logo,
          },
        });
        setBusy(false);
        refreshOnboarding();
        toast("Business details saved");
        onDone();
      }}
    >
      <div className="sm:col-span-2">
        <label className="label" htmlFor="ob-name">Business name</label>
        <input id="ob-name" className="input" required value={f.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="ob-phone">Phone</label>
        <input id="ob-phone" className="input" type="tel" autoComplete="tel" required value={f.phone} onChange={(e) => set("phone", e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="ob-email">Email on estimates</label>
        <input id="ob-email" className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="ob-web">Website</label>
        <input id="ob-web" className="input" placeholder="yourcompany.com" value={f.website} onChange={(e) => set("website", e.target.value)} />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <div className="flex h-14 w-28 items-center justify-center rounded-lg bg-white p-1.5 ring-1 ring-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {f.logo ? <img src={f.logo} alt="Your logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">No logo</span>}
        </div>
        <label className="btn btn-sm cursor-pointer">
          <ImagePlus /> {f.logo ? "Change logo" : "Upload logo"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) set("logo", await shrinkLogo(file).catch(() => ""));
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-1 sm:col-span-2">
        <button className="btn btn-brand" disabled={busy || !f.name.trim() || !f.phone.trim()}>
          {busy && <Loader2 className="animate-spin" />} Save
        </button>
        <Link href="/settings#business" className="text-sm text-slate-500 hover:text-slate-900">
          Address, colours and estimate terms →
        </Link>
      </div>
    </form>
  );
}

function PlanStep() {
  const router = useRouter();
  const [f, setF] = useState({ clientName: "", address: "" });
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!f.clientName.trim() && !f.address.trim()) return;
        setBusy(true);
        const p: Project = {
          id: newId(),
          clientName: f.clientName.trim(),
          address: f.address.trim(),
          clientEmail: "",
          clientPhone: "",
          status: "estimate",
          billduDocs: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        await put("projects", p);
        router.push(`/project?id=${p.id}&tab=sheets`);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ob-client">Client</label>
          <input id="ob-client" className="input" placeholder="Dana Whitfield" value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="ob-address">Job address</label>
          <input id="ob-address" className="input" placeholder="14 Harbor View Rd" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </div>
      </div>
      <button className="btn btn-brand" disabled={busy || (!f.clientName.trim() && !f.address.trim())}>
        {busy ? <Loader2 className="animate-spin" /> : <FileUp />} Create job and add the plan
      </button>
      <p className="text-xs text-slate-500">Next you’ll pick the plan file: every page of a PDF becomes a floor.</p>
    </form>
  );
}

function TeamStep({ done }: { done: boolean }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Make an invite code for each person and text it to them. Technicians see plans, devices, photos and checklists — never prices.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/settings#team" className="btn btn-brand">
          <Users /> Invite your team
        </Link>
        {!done && (
          <button className="btn btn-ghost text-slate-500" onClick={() => tickOnboarding("team")}>
            I work alone — skip
          </button>
        )}
      </div>
    </div>
  );
}

function AppStep({ email, done }: { email: string | null; done: boolean }) {
  return (
    <div className="space-y-3 text-sm text-slate-600">
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>Install {PRODUCT_NAME} on your iPad or iPhone from the App Store (or the TestFlight invite we sent you).</li>
        <li>
          Sign in with {email ? <span className="font-medium break-all text-slate-900">{email}</span> : "the same email"} and the same password — your jobs sync
          automatically.
        </li>
        <li>No app yet? Open this website in Safari, tap Share → Add to Home Screen. It works offline too.</li>
      </ol>
      {!done && (
        <button className="btn" onClick={() => tickOnboarding("app")}>
          <Check /> Done
        </button>
      )}
    </div>
  );
}
