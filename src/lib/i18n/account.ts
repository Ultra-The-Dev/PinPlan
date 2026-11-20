"use client";
// The language on the signed-in account (Supabase user_metadata.lang), so it follows the person to a new device.
// This device's choice (localStorage) still decides day to day; on a real sign-in the account's language wins.
import { getSupabase } from "@/lib/supabase";
import { getLocale, isLocale, setLocale, storedLocale, type Locale } from "./index";

/** Save `locale` on the signed-in account (best effort; nothing when signed out, offline or local-only). */
export async function saveLocaleToAccount(locale: Locale): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user || user.user_metadata?.lang === locale) return;
    await sb.auth.updateUser({ data: { lang: locale } });
  } catch {
    // Offline: the device keeps its choice; it's saved to the account the next time the language is changed.
  }
}

/** What to do with the account's language when an auth event arrives. Pure, for tests. */
export function localeOnAuth(e: {
  event: "SIGNED_IN" | "INITIAL_SESSION" | string;
  accountLang: unknown;
  deviceChoice: Locale | null;
  current: Locale;
}): { apply: Locale | null; save: Locale | null } {
  const acct = isLocale(e.accountLang) ? e.accountLang : null;
  if (!acct) return { apply: null, save: e.deviceChoice }; // account has none yet: give it the device's choice
  if (e.event === "SIGNED_IN") return { apply: acct === e.current ? null : acct, save: null };
  // A reload (INITIAL_SESSION) or token refresh: the account only fills in when this device never chose.
  return { apply: !e.deviceChoice && acct !== e.current ? acct : null, save: null };
}

/** Follow the account's language on sign-in. Returns an unsubscribe. Called once from Providers. */
export function startLocaleSync(): () => void {
  const sb = getSupabase();
  if (!sb) return () => undefined;
  let seenUser: string | null = null;
  const { data } = sb.auth.onAuthStateChange((event, session) => {
    const user = session?.user;
    if (!user) {
      seenUser = null;
      return;
    }
    // Supabase repeats SIGNED_IN on tab focus and token refresh: act once per user.
    if (user.id === seenUser) return;
    seenUser = user.id;
    const { apply, save } = localeOnAuth({ event, accountLang: user.user_metadata?.lang, deviceChoice: storedLocale(), current: getLocale() });
    if (apply) setLocale(apply);
    if (save) setTimeout(() => void saveLocaleToAccount(save), 0); // not inside the auth callback (supabase-js deadlock)
  });
  return () => data.subscription.unsubscribe();
}
