"use client";
// "Email invite" on an invite card. Only shows when the server has email switched on (GET /api/email/status).
import { Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { emailEnabled, emailInvite } from "@/lib/emailClient";
import { toast } from "@/lib/toast";

export default function InviteEmail({ code, name }: { code: string; name?: string }) {
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void emailEnabled().then((on) => live && setEnabled(on));
    return () => {
      live = false;
    };
  }, []);
  if (!enabled) return null;

  return (
    <form
      className="mt-3 border-t border-brand-200/70 pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const to = email.trim();
        if (!to) return;
        setBusy(true);
        try {
          await emailInvite(code, to, name);
          setSentTo(to);
          setEmail("");
          toast(`Invite emailed to ${to}`);
        } catch (err) {
          toast((err as Error).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="label" htmlFor={`invite-email-${code}`}>
        Or email it
      </label>
      <div className="flex gap-2">
        <input
          id={`invite-email-${code}`}
          className="input h-9 min-w-0"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="sam@example.com"
          maxLength={254}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="btn shrink-0" type="submit" disabled={busy || !email.trim()}>
          <Mail /> {busy ? "Sending…" : "Email invite"}
        </button>
      </div>
      {sentTo && <p className="mt-1.5 text-xs text-slate-500">Sent to {sentTo}. It has the code, a join button and iPad steps.</p>}
    </form>
  );
}
