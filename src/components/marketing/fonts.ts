// The Northpin typeface: IBM Plex Sans, one variable family with a width axis and full Cyrillic (docs/brand.md,
// "Northpin type"). Condensed (width 75) and bold for headlines, like the lettering on panels and equipment labels;
// normal width for reading. Self-hosted by next/font at build time. The variable `--font-mk` scopes it to the public
// pages (the `.mk` wrapper), the auth pages and the app's `.page-title`; the rest of the app keeps Geist.
import { IBM_Plex_Sans } from "next/font/google";

export const plex = IBM_Plex_Sans({ subsets: ["latin", "cyrillic"], axes: ["wdth"], variable: "--font-mk", display: "swap" });

/** The Northpin wordmark's face: the same Plex Sans load, so the name and the page share one font file. */
export const brandFont = plex;

/** Class names for a marketing root: the font variable and the token scope. */
export const MK_ROOT = `mk ${plex.variable}`;

/** Id of the public pages' <main>, the target of the "Skip to content" link. (Here, not in the client Site.tsx, so server
 *  components can import it as a plain string.) */
export const MAIN_ID = "main";
