"use client";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useRole, useTeam } from "@/lib/team";
import { can, ROLE_INFO, type TeamAction } from "@/lib/teamLogic";

/** Shows `children` when the signed-in user's team role allows `action`; otherwise a short "office only" note. */
export default function RoleGate({ action, what, children }: { action: TeamAction; what: string; children: React.ReactNode }) {
  const role = useRole();
  const team = useTeam((s) => s.team);
  if (can(role, action)) return <>{children}</>;
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold">{what} is managed by the office</h1>
        <p className="mt-1 text-sm text-slate-500">
          You’re on {team?.name ? <span className="font-medium text-slate-700">{team.name}</span> : "the team"} as a {role ? ROLE_INFO[role].name.toLowerCase() : "member"}. Ask an
          owner or admin if something here needs changing.
        </p>
        <Link href="/" className="btn btn-brand mt-5">
          Back to jobs
        </Link>
      </div>
    </div>
  );
}
