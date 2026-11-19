// Bot check (Cloudflare Turnstile) for the sign-up, sign-in, password reset and join screens. Off unless
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set at build time. When it's on, every Supabase Auth call from those screens carries
// `options.captchaToken`, so Supabase can require it (Authentication → Attack Protection → CAPTCHA, provider Turnstile),
// and the token goes to /api/team/join too. A token is good once: `take()` hands one out and asks for the next.
//
// The widget runs in "interaction-only" mode: most people never see it; a suspicious visitor gets a checkbox.
// It needs https://challenges.cloudflare.com in the CSP's script-src and frame-src (src/lib/securityHeaders.ts).
import { useCallback, useEffect, useRef, useState } from "react";

export const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();
export const captchaEnabled = TURNSTILE_SITE_KEY.length > 0;
export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** How long `take()` waits for a token before giving up. */
const WAIT_MS = 30_000;

interface Turnstile {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TURNSTILE_SCRIPT;
    s.async = true;
    s.defer = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("captcha script didn’t start")));
    s.onerror = () => {
      loading = null;
      reject(new Error("captcha script didn’t load"));
    };
    document.head.append(s);
  });
  return loading;
}

export interface Captcha {
  enabled: boolean;
  /** Put on an empty <div> where the check may appear. */
  mount: (el: HTMLDivElement | null) => void;
  /** A problem loading or passing the check, in plain words. */
  error: string | null;
  /** A fresh token for one auth call (undefined when the check is off). Waits for one if needed. */
  take: () => Promise<string | undefined>;
}

/** One Turnstile widget for a form. `action` shows up in Cloudflare's analytics (e.g. "signup"). */
export function useCaptcha(action: string): Captcha {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useRef<string | null>(null);
  const widget = useRef<{ ts: Turnstile; id: string } | null>(null);
  const waiters = useRef<((t: string) => void)[]>([]);

  useEffect(() => {
    if (!captchaEnabled || !el) return;
    let live = true;
    loadTurnstile().then(
      (ts) => {
        if (!live) return;
        const id = ts.render(el, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          appearance: "interaction-only",
          "refresh-expired": "auto",
          callback: (t: string) => {
            setError(null);
            const next = waiters.current.shift();
            if (next) next(t);
            else token.current = t;
          },
          "expired-callback": () => {
            token.current = null;
          },
          "error-callback": () => {
            setError("We couldn’t check that you’re a person. Reload the page and try again.");
          },
        });
        widget.current = { ts, id };
      },
      () => live && setError("The sign-in check didn’t load. Check your connection, then reload the page."),
    );
    return () => {
      live = false;
      if (widget.current) widget.current.ts.remove(widget.current.id);
      widget.current = null;
      token.current = null;
    };
  }, [el, action]);

  const take = useCallback(async (): Promise<string | undefined> => {
    if (!captchaEnabled) return undefined;
    let t = token.current;
    token.current = null;
    if (!t) {
      t = await new Promise<string>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          waiters.current = waiters.current.filter((w) => w !== done);
          reject(new Error("captcha: the check didn’t finish"));
        }, WAIT_MS);
        const done = (v: string) => {
          window.clearTimeout(timer);
          resolve(v);
        };
        waiters.current.push(done);
      });
    }
    // Each token works once: ask for the next one now, so a second call (e.g. sign in after creating the login) is ready.
    if (widget.current) widget.current.ts.reset(widget.current.id);
    return t;
  }, []);

  return { enabled: captchaEnabled, mount: setEl, error, take };
}

/** Server side: checks a Turnstile token with Cloudflare. True when the check is off (no secret set). For API routes
 *  that take sign-ups themselves, e.g. /api/team/join (TURNSTILE_SECRET_KEY, server only). */
export async function verifyCaptchaToken(
  token: unknown,
  opts: { secret?: string; ip?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  const secret = opts.secret ?? process.env.TURNSTILE_SECRET_KEY ?? "";
  if (!secret) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (opts.ip) body.set("remoteip", opts.ip);
  try {
    const r = await (opts.fetchImpl ?? fetch)("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const j = (await r.json()) as { success?: boolean };
    return j.success === true;
  } catch {
    return false;
  }
}
