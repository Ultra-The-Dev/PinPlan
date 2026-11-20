"use client";
// Following a plan hyperlink: switch sheets (with a back stack), open a job document, a photo or a web page.
import { db } from "@/lib/db";
import { openBlankTab, openJobFile } from "@/lib/openJobFile";
import { brokenReason } from "@/lib/sheetIndex";
import { useSheetLinks } from "@/lib/sheetLinks";
import { useEditor } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { JobDocument, SheetLink } from "@/lib/types";

/** Open a job document the way the Documents list does: verified PDFs and images in a new tab, anything else downloads. */
export async function openJobDocument(d: JobDocument) {
  // Open the tab inside the tap (Safari/iPad block windows opened after an await), then fill it in.
  const win = openBlankTab(d.mime);
  const rec = await db().images.get(d.fileId);
  if (!rec) {
    win?.close();
    return toast("This file hasn't downloaded to this device yet — try again after sync.", "info");
  }
  await openJobFile(rec, d, win);
}

/** Go back to the sheet the last link was followed from. */
export function goBack() {
  const st = useEditor.getState();
  const links = useSheetLinks.getState();
  for (let id = links.popBack(); id; id = links.popBack()) {
    if (st.sheets.some((s) => s.id === id && !s.deleted)) {
      st.setActiveSheet(id);
      return;
    }
  }
}

/**
 * Follow a link from the sheet it's on. Broken links explain themselves instead. `touch`: the tap was a finger, so
 * anything that opens over the plan (photo, web-link check) waits for the click the browser sends after the tap.
 */
export function followLink(link: SheetLink, touch = false) {
  const st = useEditor.getState();
  const reason = brokenReason(link, { sheets: st.sheets, documents: st.documents, photos: st.photos });
  if (reason) return toast(reason, "info");
  const t = link.target;
  const links = useSheetLinks.getState();
  switch (t.kind) {
    case "sheet": {
      if (t.sheetId === st.activeSheetId) return;
      if (st.activeSheetId) links.pushBack(st.activeSheetId);
      st.setActiveSheet(t.sheetId);
      if (t.x != null && t.y != null) useEditor.setState((s) => ({ focus: { sheetId: t.sheetId, x: t.x!, y: t.y!, n: (s.focus?.n ?? 0) + 1 } }));
      return;
    }
    case "document": {
      const d = st.documents.find((x) => x.id === t.documentId);
      if (d) void openJobDocument(d);
      return;
    }
    case "photo":
      return later(touch, () => links.setPhoto(t.photoId));
    case "url":
      return later(touch, () => links.setConfirmUrl(t.url));
  }
}

function later(touch: boolean, fn: () => void) {
  if (touch) setTimeout(fn, 350);
  else fn();
}
