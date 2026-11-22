// <Link> for the public website pages. Other public pages are prefetched as usual; the app and the sign-in pages are
// not, because their code carries the local database and the Supabase client, which the public pages otherwise never
// download (src/lib/publicPages.ts). Those pages load on click, and the service worker caches them for offline use.
import Link from "next/link";
import type { ComponentProps } from "react";
import { isPublicPage } from "@/lib/publicPages";

export default function SiteLink(props: ComponentProps<typeof Link>) {
  const path = typeof props.href === "string" ? props.href.split(/[?#]/)[0] || "/" : (props.href.pathname ?? "/");
  return <Link prefetch={isPublicPage(path) ? undefined : false} {...props} />;
}
