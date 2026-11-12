"use client";
// fetch() wrapper for our own /api routes: attaches the Supabase session token or the team access code.
import { getSupabase } from "./supabase";

const CODE_KEY = "pinplan.accessCode";

export function getAccessCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}
export function setAccessCode(code: string) {
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb.auth.getSession();
    if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  const code = getAccessCode();
  if (code) headers.set("x-pinplan-access", code);
  return fetch(path, { ...init, headers });
}
