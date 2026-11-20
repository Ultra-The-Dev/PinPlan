"use client";
// Picks one language's version of server-rendered content (the legal and support pages' translations). The server
// and the first render show English, like everything else (docs/i18n.md); the visitor's language follows.
import { useLocale, type Locale } from "@/lib/i18n";

export default function ByLocale({ en, versions }: { en: React.ReactNode; versions: Partial<Record<Locale, React.ReactNode>> }) {
  const locale = useLocale();
  return <>{versions[locale] ?? en}</>;
}
