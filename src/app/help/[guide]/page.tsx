import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HelpGuidePage from "@/components/help/HelpGuidePage";
import { publicMetadata } from "@/components/marketing/seo";
import { GUIDES, guideById } from "@/lib/help/guides";
import { PRODUCT_NAME } from "@/lib/plans";

// Every guide is prerendered at build time (and precached by the service worker: scripts/build-sw.mjs); any other id
// is a 404.
export function generateStaticParams() {
  return GUIDES.map((g) => ({ guide: g.id }));
}

export async function generateMetadata({ params }: PageProps<"/help/[guide]">): Promise<Metadata> {
  const g = guideById((await params).guide);
  if (!g) return {};
  return publicMetadata({ path: `/help/${g.id}`, title: `${g.title} · ${PRODUCT_NAME} Help`, description: g.summary });
}

export default async function GuidePage({ params }: PageProps<"/help/[guide]">) {
  const { guide } = await params;
  if (!guideById(guide)) notFound();
  return <HelpGuidePage id={guide} />;
}
