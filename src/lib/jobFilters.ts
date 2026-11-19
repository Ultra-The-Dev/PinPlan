// Pure helpers for filtering jobs by status and label (Jobs map, company photo feed).
import type { Project, ProjectStatus } from "./types";

export interface JobFilter {
  /** Statuses to keep; empty or missing = every status. */
  statuses?: ProjectStatus[] | null;
  /** Keep only jobs carrying this label (case-insensitive); empty = any. */
  label?: string | null;
}

/** Display name for a job: address, then client, then a fallback. */
export function jobTitle(j: Pick<Project, "address" | "clientName">, fallback = "Untitled job"): string {
  return j.address?.trim() || j.clientName?.trim() || fallback;
}

/** Trimmed, de-duplicated labels on one job (first spelling wins, case-insensitive). */
export function jobLabelList(j: Pick<Project, "labels">): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of j.labels ?? []) {
    const l = typeof raw === "string" ? raw.trim() : "";
    if (!l || seen.has(l.toLowerCase())) continue;
    seen.add(l.toLowerCase());
    out.push(l);
  }
  return out;
}

/** Every label used across the jobs (ignores deleted jobs), most-used first, then A–Z. */
export function labelOptions(jobs: Pick<Project, "labels" | "deleted">[]): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const j of jobs) {
    if (j.deleted) continue;
    for (const l of jobLabelList(j)) {
      const k = l.toLowerCase();
      const c = counts.get(k);
      if (c) c.n++;
      else counts.set(k, { label: l, n: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).map((c) => c.label);
}

/** Does the job carry this label (case-insensitive)? */
export function hasLabel(j: Pick<Project, "labels">, label: string): boolean {
  const k = label.trim().toLowerCase();
  return jobLabelList(j).some((l) => l.toLowerCase() === k);
}

/** Jobs matching the filter (deleted jobs are always dropped). */
export function filterJobs<T extends Pick<Project, "status" | "labels" | "deleted">>(jobs: T[], f: JobFilter): T[] {
  const statuses = f.statuses?.length ? new Set(f.statuses) : null;
  const label = f.label?.trim() || null;
  return jobs.filter((j) => !j.deleted && (!statuses || statuses.has(j.status)) && (!label || hasLabel(j, label)));
}

/** True when the job has a usable map position. */
export function isPlaced(j: Pick<Project, "lat" | "lng">): boolean {
  const { lat, lng } = j;
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Number of (non-deleted) jobs per status, for chip badges. */
export function statusCounts(jobs: Pick<Project, "status" | "deleted">[]): Record<ProjectStatus, number> {
  const out: Record<ProjectStatus, number> = { estimate: 0, approved: 0, installed: 0 };
  for (const j of jobs) if (!j.deleted && j.status in out) out[j.status]++;
  return out;
}
