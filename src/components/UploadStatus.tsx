"use client";
// "N photos waiting to upload · Sync now" — shown on the Photos tab and Documents list while this job has files queued.
import { CloudUpload, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useSyncStatus } from "@/lib/sync";
import { usePendingUploads } from "@/lib/usePendingUploads";

export default function UploadStatus({ fileIds, noun }: { fileIds: string[]; noun: "photo" | "file" }) {
  const count = usePendingUploads(fileIds);
  const { configured, signedIn, authReady, online, syncing, error, syncNow } = useSyncStatus();
  // Without cloud sync nothing ever uploads, so "waiting" would be misleading.
  if (!configured || !authReady || count === 0) return null;
  const what = `${count} ${noun}${count === 1 ? "" : "s"} waiting to upload`;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
      <CloudUpload className="h-4 w-4 shrink-0" aria-hidden />
      <span className="mr-auto" role="status">
        {what}
        {!online ? " · offline, will upload when you're back online" : !signedIn ? " · sign in to upload" : error && !syncing ? " · last sync failed" : ""}
      </span>
      {!signedIn ? (
        <Link href="/settings#account" className="btn btn-sm">
          Sign in
        </Link>
      ) : (
        <button className="btn btn-sm" disabled={!online || syncing} title={error ?? undefined} onClick={() => void syncNow()}>
          <RefreshCw className={syncing ? "animate-spin" : ""} aria-hidden /> {syncing ? "Syncing…" : "Sync now"}
        </button>
      )}
    </div>
  );
}
