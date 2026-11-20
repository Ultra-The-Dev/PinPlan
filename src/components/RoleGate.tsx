"use client";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useRole, useTeam } from "@/lib/team";
import { can, ROLE_INFO, type TeamAction } from "@/lib/teamLogic";
import { useT } from "@/lib/i18n";

/** Shows `children` when the signed-in user's team role allows `action`; otherwise a short "office only" note. */
export default function RoleGate({ action, what, children }: { action: TeamAction; what: string; children: React.ReactNode }) {
  const t = useT();
  const role = useRole();
  const team = useTeam((s) => s.team);
  if (can(role, action)) return <>{children}</>;
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold">{t("{what} is managed by the office", { what: t(what) })}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {team?.name
            ? t("You’re on {team} as a {role}. Ask an owner or admin if something here needs changing.", { team: team.name, role: role ? t(ROLE_INFO[role].name).toLowerCase() : t("member") })
            : t("You’re on the team as a {role}. Ask an owner or admin if something here needs changing.", { role: role ? t(ROLE_INFO[role].name).toLowerCase() : t("member") })}
        </p>
        <Link href="/" className="btn btn-brand mt-5">
          {t("Back to jobs")}
        </Link>
      </div>
    </div>
  );
}
