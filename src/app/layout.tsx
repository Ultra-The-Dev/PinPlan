import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from "@/components/Providers";
import { ErrorReporter } from "@/components/ErrorBoundary";
import { archivo } from "@/components/marketing/fonts";
import { SHARE_IMAGE } from "@/components/marketing/seo";
import { PRODUCT_NAME } from "@/lib/plans";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const DESCRIPTION = "Pin devices on your plans, get the count, send the quote and run the job. For electrical, low-voltage and specialty contractors.";

/** The public address for absolute links (Open Graph images). NEXT_PUBLIC_SITE_URL, else PINPLAN_APP_URL, else localhost. */
function siteUrl(): URL {
  for (const raw of [process.env.NEXT_PUBLIC_SITE_URL, process.env.PINPLAN_APP_URL]) {
    try {
      if (raw?.trim()) return new URL(raw.trim());
    } catch {
      // A malformed value must not break every page: try the next one.
    }
  }
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  // Pages set their own full titles ("Sign in — <name>"), so there is no title template here (it would double them).
  title: `${PRODUCT_NAME} — Plans to quotes to jobs`,
  description: DESCRIPTION,
  applicationName: PRODUCT_NAME,
  appleWebApp: { capable: true, title: PRODUCT_NAME, statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: PRODUCT_NAME,
    title: PRODUCT_NAME,
    description: DESCRIPTION,
    // The 1200 × 630 card from src/app/opengraph-image.tsx, not the square app icon.
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", title: PRODUCT_NAME, description: DESCRIPTION, images: [SHARE_IMAGE] },
};

// No maximumScale / userScalable: people must be able to pinch-zoom pages (WCAG 1.4.4). The plan canvas handles its
// own gestures.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0F2340",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Pages render in English; the browser switches `lang` to the visitor's language before hydration
  // (src/lib/i18n), hence suppressHydrationWarning on <html> (it covers this element's attributes only).
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} h-full antialiased`}>
      <body className="h-full flex flex-col bg-slate-50 text-slate-900">
        <ErrorReporter />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
