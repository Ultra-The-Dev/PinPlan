"use client";
// Moving around the job page from anywhere inside it (tabs, Money steps, the Manage sheets drawer) without
// building URLs by hand. Uses router.replace so tab switches don't pile up in the back history.
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { switchTabQuery, withParam, type JobTabId } from "@/lib/tabRoutes";

export function useJobNav() {
  const router = useRouter();
  const params = useSearchParams();
  const search = params.toString();
  /** Open a tab (sub-view params of the old tab are dropped). */
  const setTab = useCallback((tab: JobTabId, extra: Record<string, string> = {}) => router.replace(`/project?${switchTabQuery(search, tab, extra)}`), [router, search]);
  /** Set or clear one param on the current tab, e.g. the Money step or the Takeoff view. */
  const setParam = useCallback((key: string, value: string | null) => router.replace(`/project?${withParam(search, key, value)}`), [router, search]);
  /** The Plan tab with the Manage sheets drawer open (upload, rename, order and scale sheets). */
  const openManageSheets = useCallback(() => router.replace(`/project?${switchTabQuery(search, "plan", { manage: "1" })}`), [router, search]);
  const closeManageSheets = useCallback(() => router.replace(`/project?${withParam(search, "manage", null)}`), [router, search]);
  return { params, setTab, setParam, openManageSheets, closeManageSheets };
}
