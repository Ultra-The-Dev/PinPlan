"use client";
// Live status line for /support, from the public /api/health check (no secrets: only up/down).
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

type Status = "checking" | "ok" | "degraded" | "offline";

export default function StatusCheck() {
  const t = useT();
  const [status, setStatus] = useState<Status>("checking");
  useEffect(() => {
    let live = true;
    fetch("/api/health", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (live) setStatus(r.ok && j.ok !== false ? "ok" : "degraded");
      })
      .catch(() => live && setStatus("offline"));
    return () => {
      live = false;
    };
  }, []);
  const view = {
    checking: ["bg-slate-300", t("Checking {product}’s servers…", { product: "PinPlan" })],
    ok: ["bg-emerald-500", t("All systems operational")],
    degraded: ["bg-amber-500", t("Some services are having problems. Your work is saved on your device and will sync when they recover.")],
    offline: ["bg-slate-400", t("Can’t reach {product} from this device. Check your connection; {product} keeps working offline.", { product: "PinPlan" })],
  }[status];
  return (
    <p className="flex items-start gap-2.5 text-sm text-slate-700" role="status" aria-live="polite">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${view[0]}`} aria-hidden />
      <span>{view[1]}</span>
    </p>
  );
}
