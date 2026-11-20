"use client";
// The avatar in the header: who you are and your role, plus Settings, Team, Plan & billing and Sign out.
import { CreditCard, LogOut, Settings, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import { useTeam } from "@/lib/team";
import { ROLE_INFO } from "@/lib/teamLogic";
import RoleBadge from "./RoleBadge";

/** One or two letters for the avatar: the person's name on the team, else their email. */
export function initials(name: string | null | undefined, email: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const e = (email ?? "").trim();
  return e ? e[0].toUpperCase() : "";
}

export default function AccountMenu() {
  const { signedIn, configured, email, userId } = useSyncStatus();
  const { role, team, members } = useTeam();
  const me = members.find((m) => m.userId === userId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const letters = signedIn ? initials(me?.name, email) : "";
  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-slate-400";
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white ring-2 ring-white transition hover:bg-slate-800 focus-visible:ring-brand-300"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title="Account"
        onClick={() => setOpen((o) => !o)}
      >
        {letters || <Settings className="h-4 w-4" />}
      </button>
      {open && (
        <div role="menu" className="card animate-in absolute right-0 z-40 mt-2 w-64 p-1 shadow-pop">
          {(signedIn || role) && (
            <div className="border-b border-slate-100 px-3 pt-2 pb-2.5">
              {me?.name && <div className="truncate text-sm font-semibold text-slate-900">{me.name}</div>}
              {email && <div className="truncate text-xs text-slate-500">{email}</div>}
              {(team || role) && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                  {role && <RoleBadge role={role} />}
                  <span className="truncate">{team?.name || (role ? ROLE_INFO[role].name : "")}</span>
                </div>
              )}
            </div>
          )}
          <Link role="menuitem" href="/settings" className={item} onClick={() => setOpen(false)}>
            <Settings /> Settings
          </Link>
          <Link role="menuitem" href="/settings#team" className={item} onClick={() => setOpen(false)}>
            <Users /> Team
          </Link>
          <Link role="menuitem" href="/settings#billing" className={item} onClick={() => setOpen(false)}>
            <CreditCard /> Plan &amp; billing
          </Link>
          {configured && signedIn && (
            <button
              role="menuitem"
              type="button"
              className={`${item} border-t border-slate-100`}
              onClick={() => {
                setOpen(false);
                void getSupabase()?.auth.signOut();
              }}
            >
              <LogOut /> Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
