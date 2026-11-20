"use client";
// Start (or resume) a tour from anywhere: Help, the first-run offer, Settings. Picks the job its job steps use and
// hands over to the TourHost, which goes to the first step's place.
import { db } from "@/lib/db";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import type { TourId } from "@/lib/tour/model";
import { createSampleJob, existingSampleJob } from "@/lib/tour/sampleJob";
import { useTour } from "@/lib/tour/store";

/** The open job, if the person is on a job page. */
function currentJobId(): string | null {
  if (typeof window === "undefined" || window.location.pathname !== "/project") return null;
  return new URLSearchParams(window.location.search).get("id");
}

async function newestJob(): Promise<string | null> {
  try {
    const jobs = (await db().projects.toArray()).filter((p) => !p.deleted).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return jobs[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** The sample job: the one made before on this device, else a new one. */
export async function ensureSampleJob(): Promise<string | null> {
  const s = useTour.getState();
  if (!s.loaded) s.load();
  const had = await existingSampleJob(useTour.getState().prefs.sampleJobId);
  if (had) return had;
  try {
    toast(t("Making a sample job…"), "info");
    const id = await createSampleJob();
    useTour.getState().setSampleJob(id);
    return id;
  } catch {
    return null;
  }
}

/**
 * "Your first job" always uses the sample job (it has doors and windows to count). The crew and office tours use the
 * open job, else the newest job, else the sample job.
 */
export async function startTour(id: TourId, o: { from?: number } = {}): Promise<void> {
  const s = useTour.getState();
  if (!s.loaded) s.load();
  let jobId: string | null;
  if (id === "first-job") jobId = await ensureSampleJob();
  else jobId = currentJobId() ?? (await newestJob()) ?? (await ensureSampleJob());
  useTour.getState().start(id, jobId, o.from);
}
