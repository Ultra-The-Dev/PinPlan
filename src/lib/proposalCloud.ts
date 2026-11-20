"use client";
// Publishing proposals to Supabase, and reading/answering them from the client page.
import { apiFetch } from "./api";
import { LAYERS } from "./catalog";
import { t } from "./i18n";
import { linkFolder, removeLinkFiles } from "./linkFiles";
import { renderSheet } from "./renderSheet";
import { getSupabase } from "./supabase";
import type { ProposalSnapshot, ProposalStatus } from "./proposal";
import type { Closet, DeviceType, Layer, Marker, Run, Sheet } from "./types";

export interface ProposalRow {
  id: string;
  project_id: string;
  snapshot: ProposalSnapshot;
  status: ProposalStatus;
  valid_until: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  client_name: string | null;
  signature: string | null;
  chosen_options: string[] | null;
  accepted_total: number | null;
  client_note: string | null;
  created_at: string;
}

export interface PublicProposal {
  snapshot: ProposalSnapshot;
  status: ProposalStatus;
  validUntil: string | null;
  respondedAt: string | null;
  clientName: string | null;
  chosenOptions: string[];
  acceptedTotal: number | null;
  expired: boolean;
}

const BUCKET = "proposals";
/** Layers a client sees on the plan: devices and lighting, not the crew's wiring. */
export const CLIENT_LAYERS: Layer[] = LAYERS.map((l) => l.id).filter((l) => l !== "wiring"); // every trade's categories

function need() {
  const sb = getSupabase();
  if (!sb) throw new Error(t("Cloud sync isn't set up — see Settings → Account."));
  return sb;
}

export async function listProposals(projectId: string): Promise<ProposalRow[]> {
  const { data, error } = await need().from("proposals").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProposalRow[];
}

/** Render each sheet with the client's layers, upload it, then save the proposal. Returns the new row. */
export async function publishProposal(args: {
  token: string;
  projectId: string;
  userId: string;
  build: (images: Record<string, string>) => ProposalSnapshot;
  sheets: Sheet[];
  data: { markers: Marker[]; runs: Run[]; closets: Closet[]; catalog: DeviceType[] };
  includePlans: boolean;
  onProgress?: (s: string) => void;
}): Promise<ProposalRow> {
  const sb = need();
  const images: Record<string, string> = {};
  if (args.includePlans) {
    for (const [i, sheet] of args.sheets.entries()) {
      args.onProgress?.(`Rendering plan ${i + 1} of ${args.sheets.length}…`);
      const canvas = await renderSheet(sheet, args.data, { layers: CLIENT_LAYERS, maxSide: 2400, symbolScale: 2 });
      const blob: Blob = await new Promise((r, j) => canvas.toBlob((b) => (b ? r(b) : j(new Error("Couldn't render the plan"))), "image/jpeg", 0.82));
      const path = `${args.userId}/${args.token}/${sheet.id}.jpg`;
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (error) throw new Error(t("Uploading plans: {error}", { error: error.message }));
      images[sheet.id] = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }
  }
  args.onProgress?.("Publishing…");
  const snapshot = args.build(images);
  const { data, error } = await sb
    .from("proposals")
    .insert({ id: args.token, project_id: args.projectId, snapshot, valid_until: snapshot.validUntil })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ProposalRow;
}

export { linkFolder, removeLinkFiles, type LinkFilesBucket } from "./linkFiles";

/**
 * Ask the server to delete a withdrawn link's images with the service role, so they go whoever published it (an
 * office member withdrawing a colleague's link can't reach that folder). True when the server did it.
 */
async function removeOnServer(kind: "proposal" | "photoReport", token: string): Promise<boolean> {
  try {
    const r = await apiFetch("/api/links/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, token }) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function revokeProposal(id: string) {
  const sb = need();
  const { data, error } = await sb.from("proposals").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", id).select("owner_id");
  if (error) throw new Error(error.message);
  const owner = (data as { owner_id: string }[] | null)?.[0]?.owner_id;
  if (await removeOnServer("proposal", id)) return;
  // No server (or an older one): delete what this account can reach itself.
  if (owner) await removeLinkFiles(sb.storage.from(BUCKET), linkFolder(owner, id, "proposal")).catch(() => 0);
}

/** Withdraw a shared photo report: its link stops opening and its photos are deleted from the bucket. */
export async function revokePhotoReport(token: string) {
  const sb = need();
  const { data, error } = await sb.from("photo_reports").update({ revoked: true, updated_at: new Date().toISOString() }).eq("id", token).select("owner_id");
  if (error) throw new Error(error.message);
  const owner = (data as { owner_id: string }[] | null)?.[0]?.owner_id;
  if (await removeOnServer("photoReport", token)) return;
  if (owner) await removeLinkFiles(sb.storage.from(BUCKET), linkFolder(owner, token, "report")).catch(() => 0);
}

export async function fetchPublicProposal(token: string): Promise<PublicProposal | null> {
  const { data, error } = await need().rpc("get_proposal", { p_token: token });
  if (error) throw new Error(error.message);
  return publicProposalOf(data);
}

/**
 * The page's view of what get_proposal returned. Long after its valid-until date the server sends only that it expired
 * and who sent it (no prices or plans): that becomes an error the page shows as it is.
 */
export function publicProposalOf(data: unknown): PublicProposal | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<PublicProposal> & { business?: { name?: string } };
  if (!d.snapshot) {
    const who = d.business?.name?.trim();
    throw new Error(`This quote has expired. Please ask ${who || "the company that sent it"} for an updated one.`);
  }
  return d as PublicProposal;
}

export async function respondToProposal(token: string, r: { accept: boolean; name: string; signature: string | null; options: string[]; note: string }): Promise<PublicProposal> {
  const { data, error } = await need().rpc("respond_proposal", {
    p_token: token,
    p_accept: r.accept,
    p_name: r.name,
    p_signature: r.signature,
    p_options: r.options,
    p_note: r.note,
  });
  if (error) throw new Error(error.message);
  return data as PublicProposal;
}
