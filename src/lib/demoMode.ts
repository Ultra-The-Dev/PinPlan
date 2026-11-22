// Demo mode on this device ("Try it without an account"). On its own, with no dependencies, so the public pages can
// start the demo without loading the app's onboarding code; onboarding.ts re-exports it.
export const DEMO_KEY = "pinplan.demo";

/** "Try it without an account": the jobs list stays, even with no jobs and nobody signed in. */
export function isDemo(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === "true";
  } catch {
    return false;
  }
}

export function startDemo(): void {
  try {
    localStorage.setItem(DEMO_KEY, "true");
  } catch {
    /* storage unavailable */
  }
}
