import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PinPlan — Floor Plan Device Mapper",
    short_name: "PinPlan",
    description: "Pin devices on floor plans, get the takeoff, price it and send it to Billdu.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f5f2",
    theme_color: "#161616",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
