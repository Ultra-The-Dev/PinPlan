"use client";
// Who the signed-in person is, under every name they go by (see myNames in tasks.ts): the name on this device,
// their team member label and their email's first part. "Mine" filters match any of them.
import { useMemo, useSyncExternalStore } from "react";
import { DEFAULT_AUTHOR } from "./fieldDocs";
import { getAuthor } from "./photos";
import { useSyncStatus } from "./sync";
import { useTeam } from "./team";
import { isMyName, myNames } from "./tasks";

export interface Me {
  /** The name to show and stamp on new work (this device's name, else the team name, else the email's first part). */
  me: string;
  /** All of my names, `me` first. */
  names: string[];
  isMe(name: string | null | undefined): boolean;
}

const noop = () => () => {};

export function useMe(): Me {
  const email = useSyncStatus((s) => s.email);
  const userId = useTeam((s) => s.userId);
  const members = useTeam((s) => s.members);
  // The device name lives in localStorage: read it only after hydration, so the first render matches the static HTML.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  return useMemo(() => {
    const author = hydrated ? getAuthor(email) : DEFAULT_AUTHOR;
    const names = myNames({ author, email, userId, members });
    const all = names.length ? names : [author];
    return { me: all[0], names: all, isMe: (n: string | null | undefined) => isMyName(n, all) };
  }, [hydrated, email, userId, members]);
}
