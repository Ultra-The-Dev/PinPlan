// Before first paint: the language this device will use, so a page doesn't flash English and then jump to it.
// Pages are prerendered in English (src/lib/i18n/index.ts). The root layout puts `bootScript()` inline in <head>: it
// works out the language the same way detectLocale() does and, for anything but English, sets <html lang> and
// WAIT_ATTR, which keeps the page hidden (globals.css) until the translations are shown (revealPage) or, at the
// latest, after WAIT_MAX_MS, so a slow or failed download never leaves a blank page.
import { LOCALES, SOURCE_LOCALE, STORAGE_KEY } from "./locales";

/** On <html> while the visitor's language is still loading. */
export const WAIT_ATTR = "data-i18n-wait";
/** The page shows after this long whatever happens (in English if the language hasn't arrived). */
export const WAIT_MAX_MS = 2000;

/** The inline script for <head>. Plain ES5, no dependencies; every step in try/catch (blocked storage, old browsers). */
export function bootScript(): string {
  const codes = JSON.stringify(LOCALES.map((l) => l.code));
  return `(function(){try{var L=${codes},l=null,s=null;try{s=localStorage.getItem(${JSON.stringify(STORAGE_KEY)})}catch(e){}if(L.indexOf(s)>=0)l=s;else{var n=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language];for(var i=0;i<n.length;i++){var b=String(n[i]).toLowerCase().split(/[-_]/)[0];if(L.indexOf(b)>=0){l=b;break}}}if(!l||l===${JSON.stringify(SOURCE_LOCALE)})return;var d=document.documentElement;d.lang=l;d.setAttribute(${JSON.stringify(WAIT_ATTR)},"");setTimeout(function(){d.removeAttribute(${JSON.stringify(WAIT_ATTR)})},${WAIT_MAX_MS})}catch(e){}})();`;
}

/** Show the page now (the language failed to load). Safe to call any number of times. */
export function revealPage(): void {
  if (typeof document !== "undefined") document.documentElement?.removeAttribute?.(WAIT_ATTR);
}

let settling = false;

/**
 * Show the page once the language switch has reached the screen: React updates parts of the page that are still
 * hydrating a little later than the rest, so wait until the page has stopped changing (the browser is idle and nothing
 * in <body> changed since the last look), then let one more frame paint, still hidden, with the final layout, so the
 * browser doesn't count the switch from English as a layout shift. The inline script's WAIT_MAX_MS still caps it.
 */
export function revealWhenSettled(): void {
  if (typeof document === "undefined" || settling || !document.documentElement.hasAttribute(WAIT_ATTR)) return;
  settling = true;
  let changed = false;
  const mo = new MutationObserver(() => (changed = true));
  mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  const later = (cb: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 150 }) : setTimeout(cb, 50));
  const done = () => {
    mo.disconnect();
    settling = false;
    requestAnimationFrame(() => requestAnimationFrame(revealPage));
  };
  const check = () => {
    if (!document.documentElement.hasAttribute(WAIT_ATTR)) return done();
    if (!changed) return done();
    changed = false;
    later(check);
  };
  // The first look comes after the browser has rendered the current update.
  requestAnimationFrame(() => {
    changed = true;
    later(check);
  });
}
