"use client";
// Publishing proposals to Supabase, and reading/answering them from the client page.
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
const CLIENT_LAYERS: Layer[] = ["security", "network", "audio", "video", "smarthome", "lighting", "shades", "infrastructure"];

function need() {
  const sb = getSupabase();
  if (!sb) throw new Error("Cloud sync isn't set up — see Settings → Account.");
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
      if (error) throw new Error(`Uploading plans: ${error.message}`);
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

export async function revokeProposal(id: string) {
  const { error } = await need().from("proposals").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchPublicProposal(token: string): Promise<PublicProposal | null> {
  const { data, error } = await need().rpc("get_proposal", { p_token: token });
  if (error) throw new Error(error.message);
  return (data as PublicProposal | null) ?? null;
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
