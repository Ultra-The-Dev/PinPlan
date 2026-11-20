"use client";
// Settings › Account: "Download all my data", "Export my data" and "Delete account" (required by the App Store for
// apps with sign-up). Both downloads read this device only, so they keep working while the account is read-only.
import { Archive, Download, Loader2, Trash2, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { downloadAccountExport } from "@/lib/accountExport";
import { exportAllBackup } from "@/lib/backup";
import { clearLocalData } from "@/lib/onboarding";
import { DELETE_WORD, deleteConfirmed } from "@/lib/onboardingLogic";
import { useT } from "@/lib/i18n";
import { PRODUCT_NAME } from "@/lib/plans";
import { getSupabase } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import { useTeam } from "@/lib/team";
import { toast } from "@/lib/toast";
import { useAccountDelete } from "./auth/DeleteAccountReauth";
import { rich } from "./ui/richText";

export default function AccountData() {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [zipping, setZipping] = useState(false);
  const tm = useTeam();
  const t = useT();
  // Office roles (and people without a team): the full download includes prices and invoices.
  const office = tm.role !== "tech";
  const downloadAll = async () => {
    setZipping(true);
    try {
      const team = tm.team ? { name: tm.team.name, myRole: tm.role, members: tm.members.map((m) => ({ name: m.name, role: m.role, email: m.email })) } : null;
      const n = await downloadAccountExport(team);
      toast(t.tn("Downloaded your data ({n} job)", "Downloaded your data ({n} jobs)", n));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setZipping(false);
    }
  };
  const exportAll = async () => {
    setExporting(true);
    try {
      const n = await exportAllBackup();
      toast(n ? t.tn("Exported {n} job", "Exported {n} jobs", n) : t("No jobs on this device yet"));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="text-sm font-medium">{t("Your data")}</div>
      {office && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-0 flex-1 text-xs text-slate-500">
            {t("Everything on this device in one .zip: a backup of every job, all quotes, invoices and payments (also as spreadsheets), your price list, products and company settings. Works offline and when your account is read-only.")}
          </span>
          <button type="button" className="btn btn-sm" disabled={zipping} onClick={() => void downloadAll()}>
            {zipping ? <Loader2 className="animate-spin" /> : <Archive />} {t("Download all my data")}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 text-xs text-slate-500">
          {t("Download every job on this device (plans, devices, photos and pricing) as one backup file. Restore it with “Restore backup” on the Jobs page.")}
        </span>
        <button type="button" className="btn btn-sm" disabled={exporting} onClick={() => void exportAll()}>
          {exporting ? <Loader2 className="animate-spin" /> : <Download />} {t("Export my data")}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
        <span className="min-w-0 flex-1 text-xs text-slate-500">{t("Permanently delete your {product} login and the jobs you own in the cloud.", { product: PRODUCT_NAME })}</span>
        <button type="button" className="btn btn-sm btn-danger" onClick={() => setDeleting(true)}>
          <Trash2 /> {t("Delete account")}
        </button>
      </div>
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} onExport={exportAll} exporting={exporting} />}
    </div>
  );
}

function DeleteAccountDialog({ onClose, onExport, exporting }: { onClose: () => void; onExport: () => void; exporting: boolean }) {
  const email = useSyncStatus((s) => s.email);
  const tm = useTeam();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  const owner = tm.role === "owner";
  const others = tm.members.filter((m) => m.userId !== tm.userId).length;
  const blocked = owner && others > 0;
  // The server may ask the person to prove it's them (password or email again): see auth/DeleteAccountReauth.tsx.
  const account = useAccountDelete(email);

  const del = async () => {
    const sb = getSupabase();
    if (!sb || !deleteConfirmed(typed)) return;
    setBusy(true);
    setError(null);
    try {
      if (!(await account.request())) {
        setBusy(false);
        return;
      }
      // The login is gone: forget it and everything on this device, then leave.
      await sb.auth.signOut({ scope: "local" }).catch(() => undefined);
      await clearLocalData();
      window.location.replace("/welcome?deleted=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] sm:items-center" onClick={busy ? undefined : onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="del-title"
        className="card animate-in max-h-full w-full max-w-md space-y-4 overflow-y-auto p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void del();
        }}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <TriangleAlert className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="del-title" className="text-base font-semibold">
              {t("Delete your account?")}
            </h2>
            <p className="mt-1 text-sm break-words text-slate-500">{email}</p>
          </div>
          <button type="button" className="btn btn-sm btn-icon btn-ghost -mt-1 -mr-1" onClick={onClose} aria-label={t("Close")} disabled={busy}>
            <X />
          </button>
        </div>

        {blocked ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
            {rich(
              t.tn(
                "You own {team} and {n} other person is on it. Remove them in {link} first (their own logins stay), then delete your account.",
                "You own {team} and {n} other people are on it. Remove them in {link} first (their own logins stay), then delete your account.",
                others,
              ),
              {
                team: <span className="font-medium">{tm.team?.name || t("your team")}</span>,
                link: (
                  <a href="#team" className="font-medium underline" onClick={onClose}>
                    {t("Settings › Team")}
                  </a>
                ),
              },
            )}
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm text-slate-600">
            <li>· {t("Your login is deleted — it won’t sign in on any device again.")}</li>
            {tm.team && tm.role !== "owner" ? (
              <li>· {tm.team.name ? t("The jobs you created stay with {company}.", { company: tm.team.name }) : t("The jobs you created stay with your company.")}</li>
            ) : (
              <li>· {t("The jobs you own, with their plans, photos, pricing, quotes and client links, are deleted from the cloud.")}</li>
            )}
            {owner && <li>· {t("Your company team ({team}) is deleted.", { team: tm.team?.name ?? "" })}</li>}
            <li>· {t("Everything {product} stored on this device is cleared.", { product: PRODUCT_NAME })}</li>
            <li className="font-medium text-slate-900">{t("This can’t be undone.")}</li>
          </ul>
        )}

        {!blocked && (
          <>
            <button type="button" className="btn btn-sm" disabled={exporting} onClick={onExport}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />} {t("Keep a backup first")}
            </button>
            <div>
              <label className="label" htmlFor="del-confirm">
                {rich(t("Type {word} to confirm"), { word: <span className="font-mono font-semibold text-slate-900">{DELETE_WORD}</span> })}
              </label>
              <input
                id="del-confirm"
                className="input font-mono"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={busy}
              />
            </div>
          </>
        )}
        {!blocked && account.fields}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t("Cancel")}
          </button>
          {!blocked && (
            <button className="btn border-red-600 bg-red-600 text-white hover:border-red-700 hover:bg-red-700 hover:text-white" disabled={busy || !deleteConfirmed(typed)}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} {t("Delete my account")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
