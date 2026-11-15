"use client";
// "Check cloud setup": tries each piece the app needs on the live Supabase project and says what to fix.
import { getSupabase, supabaseConfigured } from "./supabase";

export interface CheckResult {
  name: string;
  ok: boolean;
  /** What to do when it fails (plain words). */
  fix?: string;
  detail?: string;
}

const MIG = {
  init: "20261112000000_init.sql",
  products: "20261115000000_products.sql",
  icons: "20261115010000_device_icons.sql",
  proposals: "20261116000000_proposals.sql",
  upsertFix: "20261117000000_fix_project_upsert.sql",
};
const runFile = (f: string) => `In Supabase → SQL Editor, run supabase/migrations/${f} (copy the whole file, Run).`;
const missing = (msg: string) => /does not exist|schema cache|could not find/i.test(msg);

/** Turn a Supabase error into something an installer can act on. */
export function explainCloudError(message: string): string {
  if (/proposals/.test(message) && missing(message)) return `The proposals table isn't set up yet. ${runFile(MIG.proposals)}`;
  if (/get_proposal|respond_proposal/.test(message) && missing(message)) return `The proposal functions aren't set up yet. ${runFile(MIG.proposals)}`;
  if (/bucket not found/i.test(message)) return `The proposal image storage isn't set up yet. ${runFile(MIG.proposals)}`;
  if (/row-level security|violates row-level/i.test(message)) return `The database refused the save. ${runFile(MIG.upsertFix)} Then sign out and in again.`;
  if (/JWT|expired|invalid claim|not authorized/i.test(message)) return "Your sign-in expired. Sign out and sign in again under Settings → Account.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return "Couldn't reach Supabase. Check the internet connection and the Supabase URL in Vercel.";
  return message;
}

export async function checkCloudSetup(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  if (!supabaseConfigured) {
    out.push({ name: "Supabase keys on the server", ok: false, fix: "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel → Settings → Environment Variables, then Redeploy." });
    return out;
  }
  out.push({ name: "Supabase keys on the server", ok: true });
  const sb = getSupabase()!;

  const { data: auth } = await sb.auth.getUser();
  const user = auth.user;
  out.push(
    user
      ? { name: "Signed in", ok: true, detail: user.email ?? undefined }
      : { name: "Signed in", ok: false, fix: "Sign in below (confirm your email first if you just created the account)." },
  );

  const table = async (t: string, file: string, label: string) => {
    const { error } = await sb.from(t).select("id").limit(1);
    out.push(error ? { name: label, ok: false, fix: missing(error.message) ? runFile(file) : explainCloudError(error.message), detail: error.message } : { name: label, ok: true });
  };
  await table("projects", MIG.init, "Jobs tables");
  await table("products", MIG.products, "Products table");
  const icon = await sb.from("device_types").select("icon").limit(1);
  out.push(icon.error ? { name: "Device icons column", ok: false, fix: runFile(MIG.icons), detail: icon.error.message } : { name: "Device icons column", ok: true });
  await table("proposals", MIG.proposals, "Proposals table");

  const rpc = await sb.rpc("get_proposal", { p_token: "setup-check-000000000000" });
  out.push(rpc.error ? { name: "Proposal link functions", ok: false, fix: runFile(MIG.proposals), detail: rpc.error.message } : { name: "Proposal link functions", ok: true });

  if (user) {
    const bucket = await sb.storage.from("proposals").list(user.id, { limit: 1 });
    out.push(bucket.error ? { name: "Proposal image storage", ok: false, fix: runFile(MIG.proposals), detail: bucket.error.message } : { name: "Proposal image storage", ok: true });

    // Save and remove a throwaway job the same way sync does (this caught the 403 upsert bug).
    const id = `setup-check-${user.id.slice(0, 8)}`;
    const now = new Date().toISOString();
    const up = await sb
      .from("projects")
      .upsert({ id, client_name: "Setup check", address: "", status: "estimate", billdu_docs: [], created_at: now, updated_at: now, deleted: true }, { onConflict: "id" });
    if (up.error) out.push({ name: "Saving jobs (sync)", ok: false, fix: explainCloudError(up.error.message), detail: up.error.message });
    else {
      await sb.from("projects").delete().eq("id", id);
      out.push({ name: "Saving jobs (sync)", ok: true });
    }
  }
  return out;
}
