// The public site's typeface: Archivo, a grotesque with a width axis. Condensed and heavy for headlines (the look of
// the labels on panels and equipment), normal width for reading. Scoped to the marketing pages through the `.mk`
// wrapper + this variable, so the app keeps Geist until it adopts the brand (see docs/brand.md).
import { Archivo } from "next/font/google";

export const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-mk", display: "swap" });

/** Class names for a marketing root: the font variable and the token scope. */
export const MK_ROOT = `mk ${archivo.variable}`;

/** Id of the public pages' <main>, the target of the "Skip to content" link. (Here, not in the client Site.tsx, so server
 *  components can import it as a plain string.) */
export const MAIN_ID = "main";
