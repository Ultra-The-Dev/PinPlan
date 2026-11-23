// The newest iPhone/iPad build on TestFlight, for the app's "new version" banner (docs/testflight.md).
// Every upload comes from the "iOS TestFlight" workflow and its build number is that workflow's run number, so the
// newest successful run is the newest build. App Store Connect needs some time to process an upload before testers
// can install it, so a run only counts once it finished at least `minAgeMinutes` ago.

export interface WorkflowRun {
  run_number: number;
  status: string;
  conclusion: string | null;
  updated_at: string;
}

export interface IosLatest {
  /** The newest build testers can install (CFBundleVersion), or null when none is known. */
  build: number | null;
}

/** The newest successful run that finished at least `minAgeMinutes` before `now`. */
export function latestBuild(runs: WorkflowRun[], now: Date, minAgeMinutes = 30): number | null {
  const cutoff = now.getTime() - minAgeMinutes * 60_000;
  let best: number | null = null;
  for (const r of runs) {
    if (r.status !== "completed" || r.conclusion !== "success") continue;
    const at = Date.parse(r.updated_at);
    if (!Number.isFinite(at) || at > cutoff) continue;
    if (best === null || r.run_number > best) best = r.run_number;
  }
  return best;
}

/** A build number pinned by configuration (IOS_LATEST_BUILD), when set to a positive whole number. */
export function pinnedBuild(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return n > 0 ? n : null;
}
