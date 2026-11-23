import { latestBuild, pinnedBuild, type IosLatest, type WorkflowRun } from "@/lib/iosRelease";

/**
 * The newest iPhone/iPad build on TestFlight (docs/testflight.md): `{ "build": 42 }`, or `{ "build": null }` when it
 * isn't known. Public and secret-free: it reads the public list of "iOS TestFlight" workflow runs on GitHub (the
 * build number is the run number), or IOS_LATEST_BUILD when that is set. Cached for 10 minutes.
 */
const REPO = process.env.IOS_RELEASE_REPO || "Ultra-The-Dev/PinPlan";
const WORKFLOW = "ios-testflight.yml";
const TTL_MS = 10 * 60_000;

let cached: { at: number; body: IosLatest } | null = null;

async function fromGitHub(): Promise<number | null> {
  const url = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?status=success&per_page=10`;
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "northpin-app", "X-GitHub-Api-Version": "2022-11-28" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { workflow_runs?: WorkflowRun[] };
  return latestBuild(data.workflow_runs ?? [], new Date());
}

export async function GET() {
  const pinned = pinnedBuild(process.env.IOS_LATEST_BUILD);
  if (pinned !== null) return Response.json({ build: pinned } satisfies IosLatest, { headers: { "Cache-Control": "public, max-age=600" } });
  if (cached && Date.now() - cached.at < TTL_MS) {
    return Response.json(cached.body, { headers: { "Cache-Control": "public, max-age=600" } });
  }
  let build: number | null = null;
  try {
    build = await fromGitHub();
  } catch {
    build = null;
  }
  const body: IosLatest = { build };
  // Only a real answer is kept; a failed lookup is retried on the next request.
  if (build !== null) cached = { at: Date.now(), body };
  return Response.json(body, { headers: { "Cache-Control": build === null ? "no-store" : "public, max-age=600" } });
}
