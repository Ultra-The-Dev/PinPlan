"use client";
// Settings → Team: start a company team, invite office staff and technicians, manage roles.
import { statusChip } from "@/lib/statusStyle";
import { CircleAlert, Copy, LogIn, LogOut, MessageSquare, Share2, Ticket, UserMinus, UserPlus, Users, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { releaseSeat } from "@/lib/billing";
import { fmtDate, msg, useT } from "@/lib/i18n";
import { getAuthor } from "@/lib/photos";
import { PRODUCT_NAME } from "@/lib/plans";
import { useSyncStatus } from "@/lib/sync";
import {
  createInvite,
  createTeam,
  leaveTeam,
  listInvites,
  removeMember,
  renameTeam,
  revokeInvite,
  setMemberRole,
  setMyName,
  useTeam,
  type TeamInvite,
  type TeamMember,
} from "@/lib/team";
import { can, formatCode, inviteMessage, inviteState, joinUrl, memberInitials, memberLabel, ROLE_INFO, smsHref, sortMembers, type InviteState } from "@/lib/teamLogic";
import { toast } from "@/lib/toast";
import Dialog from "./Dialog";
import InviteEmail from "./InviteEmail";
import RoleBadge from "./RoleBadge";
import { rich } from "./ui/richText";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const shortDate = (iso: string) => fmtDate(iso, { month: "short", day: "numeric" });

/** Copy text, with a fallback for browsers without the async clipboard (plain http, older WebViews). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export default function TeamPanel({ businessName }: { businessName?: string }) {
  const tm = useTeam();
  const t = useT();
  return (
    <section id="team" className="card scroll-mt-6 space-y-5 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {t("Team")}
            {tm.team && tm.role && <RoleBadge role={tm.role} long />}
          </h2>
          <p className="text-sm text-slate-500">{tm.role === "tech" ? t("Who’s on your company team.") : t("Give everyone in the company their own login. Technicians see every job, but not the prices.")}</p>
        </div>
      </div>
      <TeamBody businessName={businessName} />
    </section>
  );
}

function Notice({ tone = "slate", children }: { tone?: "slate" | "amber" | "red"; children: React.ReactNode }) {
  const cls = { slate: "bg-slate-50 text-slate-600 ring-slate-200", amber: "bg-amber-50 text-amber-900 ring-amber-200", red: "bg-red-50 text-red-700 ring-red-200" }[tone];
  return (
    <div className={`flex gap-2.5 rounded-xl p-3 text-sm ring-1 ${cls}`}>
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function RoleGuide() {
  const t = useT();
  return (
    <ul className="space-y-2">
      {(["owner", "admin", "tech"] as const).map((r) => (
        <li key={r} className="flex items-start gap-2.5 text-sm">
          <RoleBadge role={r} className="mt-px w-14 justify-center" />
          <span className="text-slate-600">{t(ROLE_INFO[r].description)}</span>
        </li>
      ))}
    </ul>
  );
}

function TeamBody({ businessName }: { businessName?: string }) {
  const sync = useSyncStatus();
  const tm = useTeam();
  const t = useT();
  if (!sync.configured)
    return (
      <Notice>
        {rich(t("Teams need cloud sync, which isn’t set up on this server. Once Supabase is connected (see “Team accounts” in {file}), everyone signs in with their own account here."), { file: <code>SETUP.md</code> })}
      </Notice>
    );
  if (!sync.authReady) return <p className="text-sm text-slate-500">{t("Checking sign-in…")}</p>;
  if (!sync.signedIn)
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t("Sign in first to set up your company, or to join the company that invited you.")}</p>
        <RoleGuide />
        <div className="flex flex-wrap gap-2">
          <a href="#account" className="btn btn-primary">
            <LogIn /> {t("Sign in below")}
          </a>
          <Link href="/join" className="btn">
            <Ticket /> {t("I have an invite code")}
          </Link>
        </div>
      </div>
    );
  if (tm.needsMigration)
    return (
      <Notice tone="amber">
        <p className="font-medium">{t("The cloud database needs the team update.")}</p>
        <p className="mt-1">
          {rich(t("In Supabase, open {editor}, paste {file} and run it. Then reload this page."), {
            editor: <span className="font-medium">SQL Editor</span>,
            file: <code className="break-all">supabase/migrations/20261120000000_teams.sql</code>,
          })}
        </p>
      </Notice>
    );
  if (!tm.ready || tm.userId !== sync.userId) return <p className="text-sm text-slate-500">{t("Loading your team…")}</p>;
  if (!tm.team)
    return (
      <>
        {tm.error && <Notice tone="red">{t("Couldn’t load your team: {error}", { error: tm.error })}</Notice>}
        <StartTeam businessName={businessName} email={sync.email} />
      </>
    );
  return <OnTeam />;
}

function StartTeam({ businessName, email }: { businessName?: string; email: string | null }) {
  const [company, setCompany] = useState(businessName ?? "");
  const [me, setMe] = useState(() => {
    const a = getAuthor(null);
    return a === "Me" ? "" : a;
  });
  const [busy, setBusy] = useState(false);
  const t = useT();
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await createTeam(company.trim(), me.trim());
            toast(t("Company set up — now invite your crew"));
          } catch (err) {
            toast(errText(err), "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Users className="h-4 w-4 text-slate-400" /> {t("Set up your company")}
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">{t("You’ll be the owner. Everyone you invite works on your jobs and uses your price list.")}</p>
        </div>
        <div>
          <label className="label" htmlFor="team-company">{t("Company name")}</label>
          <input id="team-company" className="input" required maxLength={120} placeholder={t("Acme Low Voltage")} value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="team-myname">{t("Your name")}</label>
          <input id="team-myname" className="input" maxLength={80} autoComplete="name" placeholder={email?.split("@")[0] ?? t("Your name")} value={me} onChange={(e) => setMe(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">{t("Shown to your team and on the photos you take.")}</p>
        </div>
        <button className="btn btn-brand w-full sm:w-auto" disabled={busy || !company.trim()}>
          <Users /> {busy ? t("Setting up…") : t("Set up company")}
        </button>
      </form>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{t("Who can do what")}</h3>
        <RoleGuide />
        <p className="text-sm text-slate-500">
          {rich(t("Were you invited by your company? {link}."), {
            link: (
              <Link href="/join" className="font-medium text-brand-600 hover:underline">
                {t("Enter your invite code")}
              </Link>
            ),
          })}
        </p>
      </div>
    </div>
  );
}

type Confirm = { title: string; description: string; label: string; run: () => Promise<void>; done: string };

function OnTeam() {
  const tm = useTeam();
  const team = tm.team!;
  const manage = can(tm.role, "manageTeam");
  const me = tm.members.find((m) => m.userId === tm.userId);
  const [teamName, setTeamName] = useState(team.name);
  const [myName, setMyNameDraft] = useState(me?.name ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const t = useT();

  // Pick up changes from another device (the store reloads on every sync).
  const [seen, setSeen] = useState({ team: team.name, me: me?.name ?? "" });
  if (seen.team !== team.name || seen.me !== (me?.name ?? "")) {
    setSeen({ team: team.name, me: me?.name ?? "" });
    if (seen.team !== team.name) setTeamName(team.name);
    if (seen.me !== (me?.name ?? "")) setMyNameDraft(me?.name ?? "");
  }

  const act = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {tm.error && <Notice tone="amber">{t("Showing your team as last seen on this device — {error}", { error: tm.error })}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act("team", () => renameTeam(teamName), t("Team name saved"));
          }}
        >
          <label className="label" htmlFor="team-name">{t("Company")}</label>
          {manage ? (
            <div className="flex gap-2">
              <input id="team-name" className="input" required maxLength={120} value={teamName} onChange={(e) => setTeamName(e.target.value)} />
              {teamName.trim() !== team.name && (
                <button className="btn" disabled={busy === "team" || !teamName.trim()}>
                  {t("Save")}
                </button>
              )}
            </div>
          ) : (
            <div id="team-name" className="flex h-10 items-center text-sm font-medium">
              {team.name || t("Your company")}
            </div>
          )}
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act("me", () => setMyName(myName), t("Name saved"));
          }}
        >
          <label className="label" htmlFor="team-my-name">{t("Your name")}</label>
          <div className="flex gap-2">
            <input id="team-my-name" className="input" maxLength={80} autoComplete="name" placeholder={t("First and last name")} value={myName} onChange={(e) => setMyNameDraft(e.target.value)} />
            {myName.trim() !== (me?.name ?? "") && (
              <button className="btn" disabled={busy === "me"}>
                {t("Save")}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">{t("Shown to the team and on photos you take.")}</p>
        </form>
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          {t("People")} <span className="text-xs font-normal text-slate-400">{tm.members.length}</span>
        </h3>
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {sortMembers(tm.members).map((m) => (
            <MemberRow
              key={m.userId}
              m={m}
              isMe={m.userId === tm.userId}
              editable={manage && m.role !== "owner" && m.userId !== tm.userId}
              busy={busy === `role:${m.userId}`}
              onRole={(role) => void act(`role:${m.userId}`, () => setMemberRole(m.userId, role), role === "admin" ? t("{name} is now an admin", { name: memberLabel(m) }) : t("{name} is now a technician", { name: memberLabel(m) }))}
              onRemove={() =>
                setConfirm({
                  title: t("Remove {name}?", { name: memberLabel(m) }),
                  description: team.name
                    ? t("They lose access to {team}’s jobs right away. Photos, notes and checklists they added stay on the jobs.", { team: team.name })
                    : t("They lose access to the team’s jobs right away. Photos, notes and checklists they added stay on the jobs."),
                  label: t("Remove"),
                  // Give back the seat they used (subscribed teams), so the bill follows the team.
                  run: () => removeMember(m.userId).then(releaseSeat),
                  done: t("{name} removed", { name: memberLabel(m) }),
                })
              }
            />
          ))}
        </ul>
      </div>

      {manage && tm.billing?.seatLimit != null && tm.members.length >= tm.billing.seatLimit && (
        <Notice tone="amber">
          {rich(t("All {n} seats are taken, so a new invite can’t be accepted yet. {link} first.", { n: tm.billing.seatLimit }), {
            link: (
              <a href="#billing" className="font-medium underline">
                {t("Add a seat")}
              </a>
            ),
          })}
        </Notice>
      )}
      {manage && <Invites team={team.name} from={me ? memberLabel(me) : ""} members={tm.members} />}

      {tm.role === "tech" && (
        <Notice>
          {t("As a technician you work on every team job — plans, devices, photos, checklists, logs and tasks. Prices, estimates, proposals and Billdu stay with the office.")}
        </Notice>
      )}

      {tm.role !== "owner" && (
        <div className="border-t border-slate-100 pt-4">
          <button
            className="btn btn-danger"
            onClick={() =>
              setConfirm({
                title: team.name ? t("Leave {team}?", { team: team.name }) : t("Leave the team?"),
                description: t("You’ll stop seeing the team’s jobs on this account. Ask an owner or admin for a new invite to come back."),
                label: t("Leave team"),
                run: leaveTeam,
                done: t("You left the team"),
              })
            }
          >
            <LogOut /> {t("Leave team")}
          </button>
        </div>
      )}

      {confirm && (
        <Dialog
          title={confirm.title}
          description={confirm.description}
          fields={[]}
          submitLabel={busy === "confirm" ? t("Working…") : confirm.label}
          error={confirmError}
          onCancel={() => {
            setConfirm(null);
            setConfirmError(null);
          }}
          onSubmit={async () => {
            if (busy) return;
            setBusy("confirm");
            setConfirmError(null);
            try {
              await confirm.run();
              toast(confirm.done);
              setConfirm(null);
            } catch (e) {
              setConfirmError(errText(e));
            } finally {
              setBusy(null);
            }
          }}
        />
      )}
    </div>
  );
}

function MemberRow(props: { m: TeamMember; isMe: boolean; editable: boolean; busy: boolean; onRole: (r: "admin" | "tech") => void; onRemove: () => void }) {
  const { m } = props;
  const t = useT();
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600" aria-hidden>
        {memberInitials(m)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{memberLabel(m)}</span>
          {props.isMe && <span className="chip shrink-0 bg-slate-100 text-slate-500">{t("You")}</span>}
        </div>
        {m.email && <div className="truncate text-xs text-slate-500">{m.email}</div>}
      </div>
      {props.editable ? (
        <>
          <select
            className="input h-8 w-auto shrink-0 py-0 pr-7 pl-2 text-xs"
            aria-label={t("Role for {name}", { name: memberLabel(m) })}
            value={m.role}
            disabled={props.busy}
            onChange={(e) => props.onRole(e.target.value as "admin" | "tech")}
          >
            <option value="tech">{t("Technician")}</option>
            <option value="admin">{t("Office")}</option>
          </select>
          <button className="btn btn-sm btn-icon btn-ghost text-slate-500 hover:text-red-600" onClick={props.onRemove} aria-label={t("Remove {name}", { name: memberLabel(m) })} title={t("Remove from team")}>
            <UserMinus />
          </button>
        </>
      ) : (
        <RoleBadge role={m.role} />
      )}
    </li>
  );
}

const STATE_LABEL: Record<InviteState, string> = { open: msg("Waiting"), used: msg("Joined"), expired: msg("Expired"), revoked: msg("Cancelled") };
const STATE_STYLE: Record<InviteState, string> = { open: statusChip("open"), used: statusChip("used"), expired: statusChip("expired"), revoked: statusChip("revoked") };

function Invites({ team, from, members }: { team: string; from: string; members: TeamMember[] }) {
  const [invites, setInvites] = useState<TeamInvite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [shown, setShown] = useState<TeamInvite | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [revoking, setRevoking] = useState<TeamInvite | null>(null);
  const t = useT();

  const refresh = useCallback(async () => {
    try {
      setInvites(await listInvites());
      setError(null);
    } catch (e) {
      setError(errText(e));
    }
  }, []);
  // Load on open, and again when someone joins (the store reloads members on every sync).
  useEffect(() => {
    let alive = true;
    listInvites().then(
      (list) => {
        if (!alive) return;
        setInvites(list);
        setError(null);
      },
      (e) => alive && setError(errText(e)),
    );
    return () => {
      alive = false;
    };
  }, [members.length]);

  const withState = (invites ?? []).map((i) => ({ ...i, state: inviteState({ used_by: i.usedBy, revoked: i.revoked, expires_at: i.expiresAt }) }));
  const open = withState.filter((i) => i.state === "open");
  const past = withState.filter((i) => i.state !== "open");
  const who = (id: string | null) => {
    const m = id ? members.find((x) => x.userId === id) : null;
    return m ? memberLabel(m) : null;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">{t("Invites")}</h3>
        {!composing && (
          <button
            className="btn btn-brand btn-sm"
            onClick={() => {
              setComposing(true);
              setShown(null);
            }}
          >
            <UserPlus /> {t("Invite someone")}
          </button>
        )}
      </div>
      {composing && (
        <InviteForm
          onCancel={() => setComposing(false)}
          onCreated={(inv) => {
            setComposing(false);
            setShown(inv);
            void refresh();
          }}
        />
      )}
      {shown && <InviteShare invite={shown} team={team} from={from} onClose={() => setShown(null)} />}
      {error && <Notice tone="red">{error}</Notice>}
      {invites && !open.length && !composing && !shown && (
        <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500 ring-1 ring-slate-200">
          {t("No invites waiting. Each invite is a one-time code for one person, good for 14 days.")}
        </p>
      )}
      {open.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {open.map((i) => (
            <InviteRow key={i.code} i={i} detail={t("expires {date}", { date: shortDate(i.expiresAt) })} onShare={() => setShown(i)} onRevoke={() => setRevoking(i)} active={shown?.code === i.code} />
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <div>
          <button className="text-xs font-medium text-slate-500 hover:text-slate-800" onClick={() => setShowPast(!showPast)} aria-expanded={showPast}>
            {showPast ? t("Hide past invites ({n})", { n: past.length }) : t("Show past invites ({n})", { n: past.length })}
          </button>
          {showPast && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
              {past.map((i) => (
                <InviteRow
                  key={i.code}
                  i={i}
                  detail={
                    i.state === "used"
                      ? `${who(i.usedBy) ?? t("joined")}${i.usedAt ? ` · ${shortDate(i.usedAt)}` : ""}`
                      : i.state === "expired"
                        ? t("expired {date}", { date: shortDate(i.expiresAt) })
                        : t("made {date}", { date: shortDate(i.createdAt) })
                  }
                />
              ))}
            </ul>
          )}
        </div>
      )}
      {revoking && (
        <Dialog
          title={t("Cancel this invite?")}
          description={t("Code {code} stops working right away. Anyone who already joined stays on the team.", { code: formatCode(revoking.code) })}
          fields={[]}
          submitLabel={t("Cancel invite")}
          onCancel={() => setRevoking(null)}
          onSubmit={async () => {
            const code = revoking.code;
            setRevoking(null);
            try {
              await revokeInvite(code);
              if (shown?.code === code) setShown(null);
              toast(t("Invite cancelled"));
            } catch (e) {
              toast(errText(e), "error");
            }
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function InviteRow({ i, detail, onShare, onRevoke, active }: { i: TeamInvite & { state: InviteState }; detail: string; onShare?: () => void; onRevoke?: () => void; active?: boolean }) {
  const t = useT();
  return (
    <li className={`flex items-center gap-3 px-3 py-2.5 ${active ? "bg-brand-50/40" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{i.name || t("No name")}</span>
          <RoleBadge role={i.role} />
          <span className={`chip ${STATE_STYLE[i.state]}`}>{t(STATE_LABEL[i.state])}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-slate-500">
          <span className="font-mono">{formatCode(i.code)}</span> · {detail}
        </div>
      </div>
      {onShare && (
        <button className="btn btn-sm" onClick={onShare}>
          <Share2 /> <span className="hidden sm:inline">{t("Share")}</span>
        </button>
      )}
      {onRevoke && (
        <button className="btn btn-sm btn-icon btn-ghost text-slate-500 hover:text-red-600" onClick={onRevoke} aria-label={t("Cancel invite {code}", { code: formatCode(i.code) })} title={t("Cancel invite")}>
          <X />
        </button>
      )}
    </li>
  );
}

function InviteForm({ onCreated, onCancel }: { onCreated: (i: TeamInvite) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "tech">("tech");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  return (
    <form
      className="animate-in space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) {
          setError(t("Enter their name. It’s the name you’ll pick when you give them tasks."));
          return;
        }
        setBusy(true);
        setError(null);
        try {
          const code = await createInvite(role, name);
          const now = new Date();
          onCreated({
            code,
            role,
            name: name.trim(),
            createdAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + 14 * 86400000).toISOString(),
            usedBy: null,
            usedAt: null,
            revoked: false,
          });
        } catch (err) {
          setError(errText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="invite-name">{t("Their name")}</label>
        <input id="invite-name" className="input" required maxLength={80} placeholder={t("e.g. Sam Rivera")} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <p className="mt-1 text-xs text-slate-500">{t("They join under this name, and it’s the name you pick when you give them tasks. Use the name your crew knows them by.")}</p>
      </div>
      <fieldset>
        <legend className="label">{t("Role")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["tech", "admin"] as const).map((r) => (
            <label
              key={r}
              className={`flex cursor-pointer gap-2.5 rounded-lg bg-white p-3 ring-1 transition ${role === r ? "ring-2 ring-brand-500" : "ring-slate-200 hover:ring-slate-300"}`}
            >
              <input type="radio" name="invite-role" className="mt-0.5 accent-brand-600" checked={role === r} onChange={() => setRole(r)} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t(ROLE_INFO[r].name)}</span>
                <span className="block text-xs text-slate-500">{t(ROLE_INFO[r].description)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel}>
          {t("Cancel")}
        </button>
        <button className="btn btn-brand" disabled={busy || !name.trim()}>
          <Ticket /> {busy ? t("Making code…") : t("Create invite")}
        </button>
      </div>
    </form>
  );
}

function InviteShare({ invite, team, from, onClose }: { invite: TeamInvite; team: string; from: string; onClose: () => void }) {
  const [origin] = useState(() => window.location.origin);
  const [canShare] = useState(() => typeof navigator.share === "function");
  const link = joinUrl(origin, invite.code);
  const message = inviteMessage({ team, from, role: invite.role, code: invite.code, link });
  const t = useT();
  const copy = async (text: string, copied: string) => toast((await copyText(text)) ? copied : t("Couldn’t copy — select it and copy by hand"), "info");
  const until = shortDate(invite.expiresAt);
  return (
    <div className="animate-in rounded-xl bg-brand-50/60 p-4 ring-1 ring-brand-200" aria-label={t("Invite code")}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm text-slate-700">
          {invite.name
            ? rich(t("Invite for {name} · {role}. Works once, until {date}.", { role: invite.role === "admin" ? t("Office") : t("Technician"), date: until }), {
                name: <span className="font-medium">{invite.name}</span>,
              })
            : rich(t("Invite for a new {role}. Works once, until {date}.", { date: until }), {
                role: <span className="font-medium">{invite.role === "admin" ? t("office member") : t("technician")}</span>,
              })}
        </p>
        <button className="btn btn-sm btn-icon btn-ghost -mt-1 -mr-1" onClick={onClose} aria-label={t("Close invite")}>
          <X />
        </button>
      </div>
      <button
        type="button"
        className="mt-3 block w-full rounded-xl bg-white py-4 text-center font-mono text-[28px] leading-none font-semibold tracking-wider text-slate-900 shadow-soft select-all sm:text-4xl"
        onClick={() => void copy(formatCode(invite.code), t("Code copied"))}
        title={t("Copy code")}
        aria-label={t("Invite code {code}. Copy code", { code: formatCode(invite.code).split("").join(" ") })}
      >
        {formatCode(invite.code)}
      </button>
      <p className="mt-2 text-center text-xs text-slate-500">
        {rich(t("They open the link below, or go to {page} and type the code."), {
          page: <span className="font-medium text-slate-700">{origin.replace(/^https?:\/\//, "")}/join</span>,
        })}
      </p>
      <div className="mt-3 flex gap-2">
        <input className="input h-9 min-w-0 font-mono text-xs" readOnly value={link} aria-label={t("Join link")} onFocus={(e) => e.currentTarget.select()} />
        <button className="btn shrink-0" onClick={() => void copy(link, t("Link copied"))}>
          <Copy /> {t("Copy link")}
        </button>
      </div>
      <div className={`mt-2 grid grid-cols-2 gap-2 ${canShare ? "sm:grid-cols-3" : ""}`}>
        {canShare && (
          <button
            className="btn btn-brand col-span-2 sm:col-span-1"
            onClick={() => void navigator.share({ title: `Join ${team || "our team"} on ${PRODUCT_NAME}`, text: message }).catch(() => undefined)}
          >
            <Share2 /> {t("Share")}
          </button>
        )}
        <a className="btn" href={smsHref(message)}>
          <MessageSquare /> {t("Text it")}
        </a>
        <button className="btn" onClick={() => void copy(message, t("Message copied"))}>
          <Copy /> {t("Copy message")}
        </button>
      </div>
      <InviteEmail key={invite.code} code={invite.code} name={invite.name} />
    </div>
  );
}

