// Português (Brasil), merged from one file per area so translators working in parallel never edit the same file.
// A key may appear in more than one area only with the same translation (tests/i18n.test.ts checks).
import type { Dictionary } from "../types";
import field from "./field";
import jobViews from "./job-views";
import libStrings from "./lib-strings";
import moneyOffice from "./money-office";
import planEditor from "./plan-editor";
import shellSettings from "./shell-settings";
import siteAuth from "./site-auth";

/** Every area, by file name (the checker and tests report per area). */
export const PT_AREAS: Record<string, Dictionary> = {
  "site-auth": siteAuth,
  "shell-settings": shellSettings,
  "plan-editor": planEditor,
  field,
  "money-office": moneyOffice,
  "job-views": jobViews,
  "lib-strings": libStrings,
};

const pt: Dictionary = Object.assign({}, ...Object.values(PT_AREAS));

export default pt;
