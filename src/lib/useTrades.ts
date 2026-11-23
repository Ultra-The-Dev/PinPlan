"use client";
// The company's trades (primary first). Kept in this device's settings and, on a team, on the team row so every
// member shares them. Cached in localStorage so screens render the right palette before IndexedDB answers.
// Nothing set = low voltage only: the app looks exactly as it always has.
import { useEffect } from "react";
import { create } from "zustand";
import { db, ensureSeeded, getCatalog, getSettings, nowIso, putMany } from "./db";
import { getSupabase } from "./supabase";
import { useTeam } from "./team";
import { DEFAULT_TRADES, normalizeTrades, packAdditions, tradePack } from "./trades";
import type { AppSettings, TradeId } from "./types";

const CACHE_KEY = "pinplan.trades";
export const TRADES_EVENT = "pinplan:trades";

function readCache(): TradeId[] {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(CACHE_KEY);
    return raw ? normalizeTrades(JSON.parse(raw)) : [...DEFAULT_TRADES];
  } catch {
    return [...DEFAULT_TRADES];
  }
}
function writeCache(t: TradeId[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(t));
  } catch {
    /* storage unavailable */
  }
}

interface TradeState {
  trades: TradeId[];
  /** Read from settings (and the team) at least once on this page load. */
  loaded: boolean;
}

export const useTradeStore = create<TradeState>(() => ({ trades: [...DEFAULT_TRADES], loaded: false }));

let loading: Promise<TradeId[]> | null = null;
let checkedTeam: string | null = null;

/** Read the trades from this device's settings, then from the team (the team wins when it has some). */
export function loadTrades(): Promise<TradeId[]> {
  if (!useTradeStore.getState().loaded) useTradeStore.setState({ trades: readCache() });
  loading ??= (async () => {
    try {
      const s = await getSettings();
      const local = normalizeTrades(s.trades);
      useTradeStore.setState({ trades: local, loaded: true });
      writeCache(local);
      return local;
    } catch {
      useTradeStore.setState({ loaded: true });
      return useTradeStore.getState().trades;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** The team's shared trades (null when not on a team, offline, or the database doesn't have the column yet). */
async function teamTrades(teamId: string): Promise<TradeId[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from("teams").select("trades").eq("id", teamId).maybeSingle();
  if (error || !data) return null;
  const raw = (data as { trades?: unknown }).trades;
  return Array.isArray(raw) && raw.length ? normalizeTrades(raw) : null;
}

/** Adopt the team's trades on this device (another member changed them, or this is a new device). */
async function syncFromTeam(teamId: string) {
  if (checkedTeam === teamId) return;
  checkedTeam = teamId;
  const t = await teamTrades(teamId).catch(() => null);
  if (!t) return;
  const cur = await loadTrades();
  if (JSON.stringify(cur) === JSON.stringify(t)) return;
  await storeLocal(t, true);
}

/** `fromCloud`: the team's trades coming down keep the settings' save time (not a change made here). */
async function storeLocal(t: TradeId[], fromCloud = false) {
  await ensureSeeded();
  const d = db();
  await d.transaction("rw", d.settings, async () => {
    const s = (await d.settings.get("app")) as AppSettings | undefined;
    if (s) await d.settings.put({ ...s, trades: t, updatedAt: fromCloud ? s.updatedAt : nowIso() });
  });
  useTradeStore.setState({ trades: t, loaded: true });
  writeCache(t);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TRADES_EVENT));
}

/** The company's trades (primary first). Loads once per page and follows the team. */
export function useTrades(): TradeId[] {
  const trades = useTradeStore((s) => s.trades);
  const loaded = useTradeStore((s) => s.loaded);
  const teamId = useTeam((s) => s.team?.id ?? null);
  useEffect(() => {
    if (!loaded) void loadTrades();
  }, [loaded]);
  useEffect(() => {
    if (teamId) void syncFromTeam(teamId);
  }, [teamId]);
  return trades;
}

/** The current trades outside React (exports, prompts). */
export const tradesNow = (): TradeId[] => useTradeStore.getState().trades;

/**
 * Save the company's trades on this device and (owner/admin on a team) on the team, so the whole crew follows.
 * Returns an error message when the team couldn't be updated (the local change still stands).
 */
export async function saveTrades(trades: TradeId[]): Promise<string | null> {
  const t = normalizeTrades(trades);
  await storeLocal(t);
  const team = useTeam.getState();
  if (!team.team || !(team.role === "owner" || team.role === "admin")) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { error } = await sb.from("teams").update({ trades: t, updated_at: new Date().toISOString() }).eq("id", team.team.id);
  if (error) return /column|schema/i.test(error.message) ? "Saved on this device. Run the latest database update to share trades with your team." : error.message;
  checkedTeam = team.team.id;
  return null;
}

export interface AddedPack {
  types: number;
  wirePrices: number;
  checklists: number;
}

/** Add a trade's starting catalog and wire prices to the company's own (only what's missing; nothing is replaced or deleted). */
export async function addTradePack(trade: TradeId, opts: { unarchive?: boolean } = {}): Promise<AddedPack> {
  // The price list belongs to the office: a technician's device never adds items (the database would refuse them,
  // and they would sit in this device's queue as refused changes).
  if (useTeam.getState().role === "tech") return { types: 0, wirePrices: 0, checklists: 0 };
  const [catalog, settings] = await Promise.all([getCatalog(), getSettings()]);
  const add = packAdditions(trade, catalog, settings.pricing.wirePrices, nowIso());
  // Archived items come back only when the trade is newly switched on (not from "add missing items").
  const rows = [...add.types, ...(opts.unarchive ? add.unarchive : [])];
  if (rows.length) await putMany("deviceTypes", rows);
  if (Object.keys(add.wirePrices).length) {
    const d = db();
    await d.transaction("rw", d.settings, async () => {
      const s = (await d.settings.get("app")) as AppSettings | undefined;
      if (!s) return;
      const cur = s.pricing?.wirePrices ?? {};
      const merged = { ...cur };
      for (const [k, v] of Object.entries(add.wirePrices)) if (merged[k] == null) merged[k] = v;
      await d.settings.put({ ...s, pricing: { ...s.pricing, wirePrices: merged }, updatedAt: nowIso() });
    });
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("pinplan:catalog"));
  return { types: rows.length, wirePrices: Object.keys(add.wirePrices).length, checklists: tradePack(trade).checklists.length };
}

/** Set the trades and add each newly enabled trade's pack (used by sign-up and Settings). */
export async function chooseTrades(trades: TradeId[], opts: { addPacks?: boolean } = {}): Promise<{ error: string | null; added: AddedPack }> {
  const before = useTradeStore.getState().trades;
  const t = normalizeTrades(trades);
  const added: AddedPack = { types: 0, wirePrices: 0, checklists: 0 };
  if (opts.addPacks !== false)
    for (const id of t) {
      // Only newly enabled trades: the low-voltage catalog is the starting catalog, and a trade already on keeps
      // whatever the company did to its items (archived ones stay archived).
      if (before.includes(id)) continue;
      const a = await addTradePack(id, { unarchive: true });
      added.types += a.types;
      added.wirePrices += a.wirePrices;
      added.checklists += a.checklists;
    }
  const error = await saveTrades(t);
  return { error, added };
}
