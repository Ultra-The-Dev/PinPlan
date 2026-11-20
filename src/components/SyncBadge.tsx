"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
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
  if (!online) return { text: pending && configured ? `Offline · ${pending} pending` : "Offline", short: "Offline", quiet: false, cls: amber };
  if (!configured) return { text: "Local only", short: "Local only", quiet: true, cls: grey };
  if (!signedIn) return { text: "Not signed in", short: "Sign in", quiet: false, cls: grey };
  if (ownerMismatch) return { text: "Sync paused", short: "Paused", quiet: false, cls: amber };
  if (readOnly) return { text: pending ? `Read-only · ${pending} kept here` : "Read-only", short: "Read-only", quiet: false, cls: amber };
  if (refused) return { text: refused === 1 ? "1 change not accepted" : `${refused} changes not accepted`, short: "Not saved", quiet: false, cls: red };
  if (error) return { text: "Sync error", short: "Sync error", quiet: false, cls: red };
  // Syncing comes and goes every few seconds; on phones it would make the header jump, so it stays quiet there.
  if (syncing) return { text: "Syncing…", short: "Syncing", quiet: true, cls: "bg-blue-100 text-blue-700" };
  if (pending) return { text: `${pending} pending`, short: `${pending} pending`, quiet: false, cls: amber };
  return { text: "Synced", short: "Synced", quiet: true, cls: "bg-emerald-100 text-emerald-700" };
}

/** Header indicator: offline / local only / pending N / synced. On phones it shows a short word, and only when something
 *  needs attention (offline, pending, errors…); when all is fine it is hidden there rather than a bare dot. */
export default function SyncBadge() {
  const status = useSyncStatus();
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
      title={readOnly ? "Your company's PinPlan subscription is inactive: changes stay on this device until it's restarted." : ownerMismatch ? "This device has another account's jobs. Open Settings to remove them before syncing." : refused ? `${refused} ${refused === 1 ? "change wasn't" : "changes weren't"} accepted. Open Settings to discard or try again.` : (error ?? text)}
      aria-label={`Sync: ${text}`}
      data-testid="sync-badge"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap sm:px-2.5 sm:py-1 ${quiet ? "max-sm:hidden" : ""} ${cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${status.syncing ? "animate-pulse" : ""}`} aria-hidden />
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{text}</span>
    </Link>
  );
}
