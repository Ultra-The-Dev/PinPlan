// Job health at a glance: counts, checklist progress, tasks, photos, logs and the one thing to do next.
// Pure; works offline from the local job data. Mirrors PinPlanCore/JobSummary.swift.
import { checklistProgress, taskBucket } from "./fieldDocs";
import type { ProposalStatus } from "./proposal";
import type { Checklist, JobLog, Marker, Photo, Project, Run, Sheet } from "./types";

/** A sent proposal or plan review (cloud data — pass it only when it is already loaded). */
export interface ProposalInfo {
  kind: "proposal" | "review";
  status: ProposalStatus;
  createdAt: string;
}

/** Web tab ids (the iPad app maps "info" to its Job tab). */
export type JobTab = "plan" | "sheets" | "photos" | "field" | "takeoff" | "estimate" | "crew" | "info";

export type NextStepKind =
  | "addPlans"
  | "placeDevices"
  | "overdueTasks"
  | "priceEstimate"
  | "sendReview"
  | "sendProposal"
  | "awaitClient"
  | "reviseProposal"
  | "markApproved"
  | "tasksToday"
  | "startChecklist"
  | "checklistPhotos"
  | "finishChecklists"
  | "markInstalled"
  | "closeTasks"
  | "invoice"
  | "done";

export interface NextStep {
  kind: NextStepKind;
  text: string;
  tab: JobTab;
}

export interface JobSummaryInput {
  project: Project;
  sheets: Sheet[];
  markers: Marker[];
  runs: Run[];
  photos: Photo[];
  checklists: Checklist[];
  jobLogs: JobLog[];
  /** From the local estimate: grand total and how many included lines have no price yet. */
  estimate?: { total: number; unpriced: number } | null;
  /** Proposals and plan reviews, when known. Leave out (undefined/null) when they haven't been loaded. */
  proposals?: ProposalInfo[] | null;
  /** Local day, YYYY-MM-DD. */
  today: string;
}

export interface JobSummary {
  sheets: number;
  /** Placed point devices (markers), and how many of them are tentative. */
  devices: number;
  tentative: number;
  /** LED / stair runs. */
  ledRuns: number;
  checklists: { lists: number; done: number; total: number; pct: number; missingPhotos: number };
  /** Open checklist items that are tasks (assigned or dated). */
  tasks: { open: number; overdue: number; dueToday: number };
  photos: { count: number; lastAt: string | null };
  logs: { count: number; lastDate: string | null };
  estimate: { total: number; unpriced: number } | null;
  /** Latest priced proposal and latest plan review (revoked ones skipped); null when none or not loaded. */
  proposal: ProposalInfo | null;
  review: ProposalInfo | null;
  next: NextStep;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function latest(list: ProposalInfo[], kind: ProposalInfo["kind"]): ProposalInfo | null {
  let best: ProposalInfo | null = null;
  for (const p of list) if (p.kind === kind && p.status !== "revoked" && (!best || p.createdAt > best.createdAt)) best = p;
  return best;
}

export function jobSummary(input: JobSummaryInput): JobSummary {
  const { project, today } = input;
  const sheets = input.sheets.filter((s) => !s.deleted).length;
  const markers = input.markers.filter((m) => !m.deleted);
  const ledRuns = input.runs.filter((r) => !r.deleted && (r.kind === "led" || r.kind === "stair")).length;
  const photos = input.photos.filter((p) => !p.deleted);
  const lists = input.checklists.filter((c) => !c.deleted);
  const logs = input.jobLogs.filter((l) => !l.deleted);

  let done = 0,
    total = 0,
    missingPhotos = 0,
    open = 0,
    overdue = 0,
    dueToday = 0;
  for (const c of lists) {
    const p = checklistProgress(c, photos);
    done += p.done;
    total += p.total;
    missingPhotos += p.missingPhotos;
    for (const i of c.items) {
      if (i.done || (!i.assignee && !i.due)) continue;
      open++;
      const b = taskBucket(i.due, today);
      if (b === "overdue") overdue++;
      else if (b === "today") dueToday++;
    }
  }
  const lastAt = photos.reduce<string | null>((a, p) => (p.takenAt && (!a || p.takenAt > a) ? p.takenAt : a), null);
  const lastDate = logs.reduce<string | null>((a, l) => (l.date && (!a || l.date > a) ? l.date : a), null);
  const proposal = input.proposals ? latest(input.proposals, "proposal") : null;
  const review = input.proposals ? latest(input.proposals, "review") : null;

  const s: Omit<JobSummary, "next"> = {
    sheets,
    devices: markers.length,
    tentative: markers.filter((m) => m.tentative).length,
    ledRuns,
    checklists: { lists: lists.length, done, total, pct: total ? Math.round((done / total) * 100) : 0, missingPhotos },
    tasks: { open, overdue, dueToday },
    photos: { count: photos.length, lastAt },
    logs: { count: logs.length, lastDate },
    estimate: input.estimate ?? null,
    proposal,
    review,
  };
  return { ...s, next: nextStep(s, project, input.proposals != null) };
}

/** The single most useful thing to do next on the job. */
export function nextStep(s: Omit<JobSummary, "next">, project: Project, proposalsKnown: boolean): NextStep {
  const step = (kind: NextStepKind, text: string, tab: JobTab): NextStep => ({ kind, text, tab });
  if (!s.sheets) return step("addPlans", "Add the floor plans", "sheets");
  if (!s.devices && !s.ledRuns) return step("placeDevices", "Pin devices on the plan", "plan");
  if (s.tasks.overdue) return step("overdueTasks", `${plural(s.tasks.overdue, "overdue task")}`, "field");
  const unpriced = !!s.estimate && (s.estimate.unpriced > 0 || s.estimate.total <= 0);
  const billed = (project.billduDocs ?? []).length > 0;

  if (project.status === "estimate") {
    const p = s.proposal;
    if (p?.status === "accepted") return step("markApproved", "Client accepted — mark the job approved", "estimate");
    if (p?.status === "declined") return step("reviseProposal", "Proposal declined — revise and resend", "estimate");
    if (p) return step("awaitClient", p.status === "viewed" ? "Client viewed the proposal — follow up" : "Waiting on the client’s answer", "estimate");
    // Not priced yet and the client hasn't seen the layout: a plan review needs no prices.
    if (proposalsKnown && unpriced && !s.review && !billed) return step("sendReview", "Send plan for review", "takeoff");
    if (unpriced)
      return step("priceEstimate", s.estimate!.unpriced ? `Price the estimate (${plural(s.estimate!.unpriced, "line")} without a price)` : "Price the estimate", "estimate");
    if (billed) return step("awaitClient", "Estimate sent — mark the job approved when the client signs", "estimate");
    return step("sendProposal", "Send the proposal", "estimate");
  }

  if (project.status === "approved") {
    if (s.tasks.dueToday) return step("tasksToday", `${plural(s.tasks.dueToday, "task")} due today`, "field");
    if (!s.checklists.lists) return step("startChecklist", "Start an install checklist", "field");
    if (s.checklists.missingPhotos) return step("checklistPhotos", `${plural(s.checklists.missingPhotos, "checklist item")} need${s.checklists.missingPhotos === 1 ? "s" : ""} a photo`, "field");
    if (s.checklists.done < s.checklists.total)
      return step("finishChecklists", `Finish checklists (${s.checklists.done} of ${s.checklists.total} done)`, "field");
    return step("markInstalled", "Everything checked off — mark the job installed", "info");
  }

  // installed
  if (s.tasks.open) return step("closeTasks", `Close out ${plural(s.tasks.open, "open task")}`, "field");
  if (!(project.billduDocs ?? []).some((d) => d.type === "invoice")) return step("invoice", "Send the final invoice", "estimate");
  return step("done", "All wrapped up", "info");
}
