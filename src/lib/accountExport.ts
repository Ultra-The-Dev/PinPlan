"use client";
// Settings › Account › "Download all my data": one .zip with everything this device holds for the company, so a
// customer can leave (or keep their own archive) without asking us. Reads this device only and writes nothing, so it
// also works while the account is read-only (trial over / payment failed) and offline.
//
// Contents (see README.txt inside the zip):
//   jobs/<address>-<id>.pinplan.json   one backup per job, same format as "Download backup" (restores with "Restore backup")
//   sales/documents.json, sales/payments.json   every quote, invoice and credit note and payment, including job-less ones
//   invoices-and-quotes.csv, payments.csv       the accountant's CSVs (same columns as the Invoices page)
//   catalog.csv                                 device price list (same as Settings › Price list › Export)
//   products.json, job-templates.json           company products and job templates
//   settings/company-settings.json              business details, pricing, document and form settings
//   settings/team.json                          company name, members and their roles
// The zip is "stored" (no compression): plan images are already compressed, and it keeps this file dependency-free.
import { projectWithImages } from "./backup";
import { catalogToCsv } from "./catalogCsv";
import { db, loadProject, nowIso } from "./db";
import { documentsCsv, paymentsCsv } from "./documents";
import { downloadBlob, slug } from "./download";
import type { AppSettings, DeviceType, DocPayment, JobTemplate, Product, Project, SalesDoc } from "./types";

// ---------------------------------------------------------------- zip (pure)

export interface ZipEntry {
  name: string;
  data: Uint8Array | string;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** A plain (stored, uncompressed) zip archive with UTF-8 file names. Under 4 GB / 65535 files (no zip64). */
export function buildZip(entries: ZipEntry[], when = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(when);
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = typeof e.data === "string" ? enc.encode(e.data) : e.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    parts.push(local, data);
    central.push(cen);
    offset += local.length + data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + end.length);
  let p = 0;
  for (const part of [...parts, ...central, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

// ---------------------------------------------------------------- what goes in (pure)

/** One job as "Download backup" writes it (bundle + images + its quotes/invoices). */
export type JobBackup = Awaited<ReturnType<typeof projectWithImages>>["project"];

export interface TeamInfo {
  name: string | null;
  myRole: string | null;
  members: { name: string; role: string; email: string | null }[];
}

export interface AccountExportInput {
  exportedAt: string;
  /** Each job with the products it uses (as projectWithImages returns them). */
  jobs: { backup: JobBackup; products: Product[] }[];
  catalog: DeviceType[];
  products: Product[];
  jobTemplates: JobTemplate[];
  salesDocs: SalesDoc[];
  salesPayments: DocPayment[];
  settings: AppSettings | null;
  team: TeamInfo | null;
}

const BACKUP_FORMAT = "pinplan-backup";

/** Unique, readable file name for a job's backup. */
export function jobFileName(project: Pick<Project, "id" | "address" | "clientName">, used: Set<string>): string {
  const base = `${slug(project.address || project.clientName || "job").slice(0, 60)}-${project.id.slice(0, 8)}`;
  let name = `jobs/${base}.pinplan.json`;
  for (let i = 2; used.has(name); i++) name = `jobs/${base}-${i}.pinplan.json`;
  used.add(name);
  return name;
}

/** The files in the zip, in order. */
export function accountExportEntries(input: AccountExportInput): ZipEntry[] {
  const alive = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);
  const docs = alive(input.salesDocs);
  const payments = alive(input.salesPayments);
  const projects = new Map(input.jobs.map((j) => [j.backup.project.id, j.backup.project] as const));
  const used = new Set<string>();
  const entries: ZipEntry[] = [
    {
      name: "README.txt",
      data: [
        "Your PinPlan data",
        `Exported ${input.exportedAt}`,
        "",
        `jobs/ — ${input.jobs.length} job backup file${input.jobs.length === 1 ? "" : "s"}. Each one restores in PinPlan with Projects › Restore backup,`,
        "        and includes the job's plans, devices, cable runs, photos, estimate, checklists, logs and its quotes and invoices.",
        "sales/documents.json, sales/payments.json — every quote, invoice and credit note and every payment (also ones not tied to a job).",
        "invoices-and-quotes.csv, payments.csv — the same, as spreadsheets for your accountant.",
        "catalog.csv — your device price list.",
        "products.json, job-templates.json — your products and job templates.",
        "settings/ — company details, pricing and document settings, and your team.",
        "",
      ].join("\r\n"),
    },
  ];
  for (const job of input.jobs) {
    // Same payload as "Download backup" (exportProjectBackup), so "Restore backup" reads it.
    const payload = { format: BACKUP_FORMAT, version: 1, exportedAt: input.exportedAt, catalog: input.catalog, products: job.products, projects: [job.backup] };
    entries.push({ name: jobFileName(job.backup.project, used), data: JSON.stringify(payload) });
  }
  entries.push(
    { name: "sales/documents.json", data: JSON.stringify(docs, null, 1) },
    { name: "sales/payments.json", data: JSON.stringify(payments, null, 1) },
    { name: "invoices-and-quotes.csv", data: documentsCsv(docs, projects, input.exportedAt.slice(0, 10)) },
    { name: "payments.csv", data: paymentsCsv(payments, new Map(docs.map((d) => [d.id, d] as const))) },
    { name: "catalog.csv", data: catalogToCsv(input.catalog) },
    { name: "products.json", data: JSON.stringify(alive(input.products), null, 1) },
    { name: "job-templates.json", data: JSON.stringify(alive(input.jobTemplates), null, 1) },
    { name: "settings/company-settings.json", data: JSON.stringify(input.settings, null, 1) },
    { name: "settings/team.json", data: JSON.stringify(input.team, null, 1) },
  );
  return entries;
}

// ---------------------------------------------------------------- download (reads this device's database)

/** Gather everything on this device and download it as one zip. Returns how many jobs went in. */
export async function downloadAccountExport(team: TeamInfo | null): Promise<number> {
  const d = db();
  const ids = (await d.projects.toArray()).filter((p) => !p.deleted).map((p) => p.id);
  const jobs: AccountExportInput["jobs"] = [];
  for (const id of ids) {
    const bundle = await loadProject(id);
    if (!bundle) continue;
    const r = await projectWithImages(bundle);
    jobs.push({ backup: r.project, products: r.products });
  }
  const [catalog, products, jobTemplates, salesDocs, salesPayments, settings] = await Promise.all([
    d.deviceTypes.toArray(),
    d.products.toArray(),
    d.jobTemplates.toArray(),
    d.salesDocs.toArray(),
    d.salesPayments.toArray(),
    d.settings.get("app"),
  ]);
  const exportedAt = nowIso();
  const zip = buildZip(accountExportEntries({ exportedAt, jobs, catalog, products, jobTemplates, salesDocs, salesPayments, settings: settings ?? null, team }));
  downloadBlob(new Blob([zip as BlobPart], { type: "application/zip" }), `pinplan-data-${exportedAt.slice(0, 10)}.zip`);
  return jobs.length;
}
