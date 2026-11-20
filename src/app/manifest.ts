import type { MetadataRoute } from "next";
import { PRODUCT_NAME } from "@/lib/plans";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME,
    description: "Pin devices on your plans, get the count, send the quote and run the job.",
    start_url: "/jobs",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F2F6FA",
    theme_color: "#0F2340",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
