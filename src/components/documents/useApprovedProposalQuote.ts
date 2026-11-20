"use client";
// A client approved the job's quote link: make the job's approved quote (locked, with the signature) and mark the job
// approved with the options the client picked. Used on the Quote and Invoices & payments steps, so the approved quote
// is there without anyone opening Pricing first (Pricing's quote card does the same; both make the same quote id and
// check the device first, so there is never a second one).
import { useCallback, useEffect, useRef, useState } from "react";
import { db, nowIso } from "@/lib/db";
import { saveDoc } from "@/lib/docActions";
import { quoteFromProposal } from "@/lib/docFromEstimate";
import { approvalNeedsQuote, newDocument, proposalQuoteId, today } from "@/lib/documents";
import { listProposals, type ProposalRow } from "@/lib/proposalCloud";
import { useEditor } from "@/lib/store";
import { SYNCED_EVENT, useSyncStatus } from "@/lib/sync";
import { toast } from "@/lib/toast";
import type { DocumentSettings, SalesDoc } from "@/lib/types";

export function useApprovedProposalQuote(docs: SalesDoc[] | null, ds: DocumentSettings) {
  const project = useEditor((s) => s.project);
  const updateProject = useEditor((s) => s.updateProject);
  const upsertEstimateLine = useEditor((s) => s.upsertEstimateLine);
  const { signedIn } = useSyncStatus();
  const [accepted, setAccepted] = useState<ProposalRow | null>(null);

  const projectId = project?.id;
  const load = useCallback(async () => {
    if (!projectId || !signedIn) return;
    try {
      const rows = await listProposals(projectId);
      setAccepted(rows.find((r) => r.status === "accepted" && r.snapshot.kind !== "review") ?? null);
    } catch {
      /* offline or no cloud: Pricing's quote card shows the error; the next sync tries again */
    }
  }, [projectId, signedIn]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const onSync = () => void load();
    window.addEventListener(SYNCED_EVENT, onSync);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener(SYNCED_EVENT, onSync);
    };
  }, [load]);

  // Approve the job and switch on the options the client picked (once — the job is then approved).
  useEffect(() => {
    if (!accepted || !project || project.status !== "estimate") return;
    const key = `pinplan.proposal.applied.${accepted.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      /* storage unavailable: the status check above still stops repeats */
    }
    void (async () => {
      const chosen = new Set(accepted.chosen_options ?? []);
      for (const l of accepted.snapshot.lines.filter((x) => x.optional)) await upsertEstimateLine(l.key, { include: chosen.has(l.key) });
      await updateProject({ status: "approved" });
      toast(`${accepted.client_name ?? "The client"} approved the quote — job marked approved`, "success");
    })();
  }, [accepted, project, updateProject, upsertEstimateLine]);

  // ...and the approval becomes the job's approved quote, once.
  const making = useRef(new Set<string>());
  useEffect(() => {
    if (!accepted || !project || !docs || making.current.has(accepted.id) || !approvalNeedsQuote(docs, accepted)) return;
    making.current.add(accepted.id);
    void (async () => {
      const id = proposalQuoteId(accepted.id);
      if (await db().salesDocs.get(id)) return; // made on this device already (the list catches up)
      const base = newDocument({ id, kind: "quote", project, settings: ds, now: nowIso(), day: today() });
      await saveDoc(quoteFromProposal(base, accepted));
    })().catch((e) => toast(`Couldn't save the approved quote: ${(e as Error).message}`, "error"));
  }, [accepted, project, docs, ds]);
}
