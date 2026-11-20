// Manrope, the typeface of the pages a contractor's client opens (proposal /p, photo report /r, RFI /q). Self-hosted
// by next/font at build time, so opening a client link sends nothing (no IP address) to Google, and the CSP needs no
// Google Fonts origins. Kept apart from fonts.ts so client pages don't preload the marketing face.
import { Manrope } from "next/font/google";

export const manrope = Manrope({ subsets: ["latin"], display: "swap" });

/** CSS font-family for client pages: Manrope, then the app font. */
export const CLIENT_FONT_FAMILY = `${manrope.style.fontFamily}, var(--font-sans), system-ui, sans-serif`;
