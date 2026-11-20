"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { t, tn, useLocale } from "@/lib/i18n";
import { useSyncStatus, type SyncStatus } from "@/lib/sync";

export type SyncBadgeState = {
  /** Full label (from sm up, and the accessible name). */
  text: string;
  /** Short label for phones, where the header is tight. */
  short: string;
  /** Nothing needs the person's attention (synced, syncing, or a device without cloud sync): phones hide the badge. */
  quiet: boolean;
  cls: string;
};

type BadgeInput = Pick<SyncStatus, "configured" | "signedIn" | "online" | "syncing" | "pending" | "refused" | "error" | "readOnly" | "ownerMismatch">;

/** What the sync badge says. Pure, so the wording for each state is tested (tests/syncBadge.test.ts). */
export function syncBadgeState(s: BadgeInput): SyncBadgeState {
  const { configured, signedIn, online, syncing, pending, refused, error, readOnly, ownerMismatch } = s;
  const amber = "bg-amber-100 text-amber-800";
  const red = "bg-red-100 text-red-700";
  const grey = "bg-slate-100 text-slate-600";
  if (!online) return { text: pending && configured ? t("Offline · {n} pending", { n: pending }) : t("Offline"), short: t("Offline"), quiet: false, cls: amber };
  if (!configured) return { text: t("Local only"), short: t("Local only"), quiet: true, cls: grey };
  if (!signedIn) return { text: t("Not signed in"), short: t("Sign in"), quiet: false, cls: grey };
  if (ownerMismatch) return { text: t("Sync paused"), short: t("Paused"), quiet: false, cls: amber };
  if (readOnly) return { text: pending ? t("Read-only · {n} kept here", { n: pending }) : t("Read-only"), short: t("Read-only"), quiet: false, cls: amber };
  if (refused) return { text: tn("{n} change not accepted", "{n} changes not accepted", refused), short: t("Not accepted"), quiet: false, cls: red };
  if (error) return { text: t("Sync error"), short: t("Sync error"), quiet: false, cls: red };
  // Syncing comes and goes every few seconds; on phones it would make the header jump, so it stays quiet there.
  if (syncing) return { text: t("Syncing…"), short: t("Syncing"), quiet: true, cls: "bg-blue-100 text-blue-700" };
  if (pending) return { text: t("{n} pending", { n: pending }), short: t("{n} pending", { n: pending }), quiet: false, cls: amber };
  return { text: t("Synced"), short: t("Synced"), quiet: true, cls: "bg-emerald-100 text-emerald-700" };
}

/** Header indicator: offline / local only / pending N / synced. On phones it shows a short word, and only when something
 *  needs attention (offline, pending, errors…); when all is fine it is hidden there rather than a bare dot. */
export default function SyncBadge() {
  const status = useSyncStatus();
  useLocale(); // re-render in the chosen language
  const { authReady, readOnly, ownerMismatch, refused, error } = status;
  // Sync state only exists in the browser; render a neutral badge for the server/hydration pass.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!hydrated || !authReady) return <span className="inline-block h-6 w-20 rounded-md bg-slate-100 max-sm:hidden" aria-hidden />;
  const { text, short, quiet, cls } = syncBadgeState(status);
  return (
    <Link
      href={readOnly ? "/settings#billing" : "/settings#account"}
      title={readOnly ? t("Your company's Northpin subscription is inactive: changes stay on this device until it's restarted.") : ownerMismatch ? t("This device has another account's jobs. Open Settings to remove them before syncing.") : refused ? tn("{n} change wasn't accepted. Open Settings to discard or try again.", "{n} changes weren't accepted. Open Settings to discard or try again.", refused) : (error ?? text)}
      aria-label={t("Sync: {status}", { status: text })}
      data-testid="sync-badge"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap sm:px-2.5 sm:py-1 ${quiet ? "max-sm:hidden" : ""} ${cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${status.syncing ? "animate-pulse" : ""}`} aria-hidden />
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{text}</span>
    </Link>
  );
}
