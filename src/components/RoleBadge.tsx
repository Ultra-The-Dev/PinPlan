"use client";
import { useT } from "@/lib/i18n";
import { ROLE_INFO, type TeamRole } from "@/lib/teamLogic";

export const ROLE_STYLE: Record<TeamRole, string> = {
  owner: "bg-brand-50 text-brand-700 ring-brand-200",
  admin: "bg-sky-50 text-sky-700 ring-sky-200",
  tech: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

/** Small coloured role label: Owner / Admin / Tech. */
export default function RoleBadge({ role, long, className = "" }: { role: TeamRole; long?: boolean; className?: string }) {
  const t = useT();
  // Dynamic keys: the role names are translated in src/lib/i18n/ru/lib-strings.ts.
  return <span className={`chip shrink-0 ring-1 ${ROLE_STYLE[role]} ${className}`}>{t(long ? ROLE_INFO[role].name : ROLE_INFO[role].short)}</span>;
}
