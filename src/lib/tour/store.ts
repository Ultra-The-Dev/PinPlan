"use client";
// Tour and tip state on this device (localStorage "pinplan.tour", every read and write in try/catch) and on the
// signed-in account (Supabase user_metadata.tour, like the language: src/lib/i18n/account.ts), so finished tours and
// "Don't show tips" follow the person to a new device. The rules are pure: ./model.ts.
import { create } from "zustand";
import { getSupabase } from "../supabase";
import { accountDiffers, EMPTY_PREFS, mergeAccount, parsePrefs, toAccount, tourReducer, type ActiveTour, type TipId, type TourAction, type TourActionInput, type TourId, type TourPrefs, type TourState } from "./model";

const KEY = "pinplan.tour";
const ACTIVE_KEY = "pinplan.tour.active";

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private window, blocked): the tour still runs, it just isn't remembered */
  }
}

function readActive(): ActiveTour | null {
  const a = readJson(ACTIVE_KEY) as ActiveTour | null;
  if (!a || typeof a !== "object" || typeof a.id !== "string" || !Number.isInteger(a.step)) return null;
  return { id: a.id, step: a.step, jobId: typeof a.jobId === "string" ? a.jobId : null };
}

interface TourStore extends TourState {
  /** Read from this device (after hydration; the server render has nothing). */
  loaded: boolean;
  load: () => void;
  dispatch: (a: TourActionInput) => void;
  start: (id: TourId, jobId: string | null, from?: number) => void;
  setTipsOff: (off: boolean) => void;
  tipSeen: (id: TipId) => void;
  answerOffer: () => void;
  setSampleJob: (id: string | null) => void;
  /** Forget every tour and tip on this device and the account ("Show tours and tips again"). */
  resetAll: () => void;
}

function persist(s: TourState) {
  writeJson(KEY, s.prefs);
  writeJson(ACTIVE_KEY, s.active);
  scheduleAccountSave(s.prefs);
}

export const useTour = create<TourStore>((set, get) => {
  const update = (next: TourState) => {
    set(next);
    persist(next);
  };
  return {
    prefs: EMPTY_PREFS,
    active: null,
    loaded: false,
    load() {
      set({ prefs: parsePrefs(readJson(KEY)), active: readActive(), loaded: true });
    },
    dispatch(a) {
      const s = get();
      update(tourReducer({ prefs: s.prefs, active: s.active }, { ...a, now: a.now ?? new Date().toISOString() } as TourAction));
    },
    start(id, jobId, from) {
      get().dispatch({ type: "start", id, jobId, from });
    },
    setTipsOff(off) {
      const s = get();
      update({ prefs: { ...s.prefs, tipsOff: off }, active: s.active });
    },
    tipSeen(id) {
      const s = get();
      if (s.prefs.tips[id]) return;
      update({ prefs: { ...s.prefs, tips: { ...s.prefs.tips, [id]: new Date().toISOString() } }, active: s.active });
    },
    answerOffer() {
      const s = get();
      update({ prefs: { ...s.prefs, offerAnswered: true }, active: s.active });
    },
    setSampleJob(id) {
      const s = get();
      update({ prefs: { ...s.prefs, sampleJobId: id }, active: s.active });
    },
    resetAll() {
      const s = get();
      update({ prefs: { ...EMPTY_PREFS, tours: {}, tips: {}, sampleJobId: s.prefs.sampleJobId }, active: null });
    },
  };
});

// ---------------- the account copy ----------------

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let accountSeen: unknown = undefined;

/** Save to the account a moment after the last change (best effort: nothing when signed out, offline or local-only). */
function scheduleAccountSave(p: TourPrefs) {
  if (typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveToAccount(p), 1500);
}

async function saveToAccount(p: TourPrefs): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return;
    const current = accountSeen !== undefined ? accountSeen : user.user_metadata?.tour;
    if (!accountDiffers(p, current)) return;
    const tour = toAccount(p);
    await sb.auth.updateUser({ data: { tour } });
    accountSeen = tour;
  } catch {
    // Offline: this device keeps it; the next change tries again.
  }
}

/** Pick up the account's tours and tips on sign-in (and on load). Returns an unsubscribe. Called once from TourHost. */
export function startTourAccountSync(): () => void {
  const sb = getSupabase();
  if (!sb) return () => undefined;
  let seenUser: string | null = null;
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    const user = session?.user;
    if (!user) {
      seenUser = null;
      accountSeen = undefined;
      return;
    }
    if (user.id === seenUser) return;
    seenUser = user.id;
    accountSeen = user.user_metadata?.tour;
    // Not inside the auth callback (supabase-js deadlock): see i18n/account.ts.
    setTimeout(() => {
      const s = useTour.getState();
      if (!s.loaded) s.load();
      const merged = mergeAccount(useTour.getState().prefs, accountSeen);
      useTour.setState({ prefs: merged });
      writeJson(KEY, merged);
      if (accountDiffers(merged, accountSeen)) scheduleAccountSave(merged);
    }, 0);
  });
  return () => data.subscription.unsubscribe();
}
