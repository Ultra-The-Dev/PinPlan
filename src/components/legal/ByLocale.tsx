"use client";
// Picks one language's version of server-rendered content (the legal and support pages' Russian translation). The
// server and the first render show English, like everything else (docs/i18n.md); the visitor's language follows.
import { useLocale } from "@/lib/i18n";

export default function ByLocale({ en, ru }: { en: React.ReactNode; ru: React.ReactNode }) {
  return <>{useLocale() === "ru" ? ru : en}</>;
}
