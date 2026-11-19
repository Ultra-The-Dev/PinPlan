"use client";
// Replaces the root layout when the layout itself fails, so it brings its own <html>, <body> and styles.
import { ErrorFallback } from "@/components/ErrorBoundary";
import "./globals.css";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex h-full flex-col bg-slate-50 text-slate-900">
        <title>Something went wrong · PinPlan</title>
        <ErrorFallback error={error} retry={retry} />
      </body>
    </html>
  );
}
