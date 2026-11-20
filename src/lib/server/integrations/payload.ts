// Pure mapping from PinPlan documents to QuickBooks Online and Xero API bodies. Uses the same lines as the accountant
// export (exportLines), so what is pushed always adds up to the document total. See docs/integrations.md.
import { exportLines, type ExportLine } from "@/lib/accountingExport";
import { money } from "@/lib/estimate";
import type { DocClient, DocPayment, SalesDoc } from "@/lib/types";
import { qtyPrice } from "./http";

/** Lines in the remote document's own direction: credit notes are positive documents in both apps. */
export function remoteLines(doc: SalesDoc): (ExportLine & { remoteAmount: number })[] {
  const sign = doc.kind === "credit_note" ? -1 : 1;
  return exportLines(doc).map((l) => ({ ...l, remoteAmount: money(sign * l.amount) }));
}

const clip = (s: string | null | undefined, n: number) => (s ?? "").trim().slice(0, n);
export const customerDisplayName = (c: DocClient) => clip(c.company?.trim() || c.name?.trim() || "Customer", 100);
/** One customer per email (else per name) across a company's documents. */
export const customerKey = (c: DocClient) => (c.email?.trim().toLowerCase() || customerDisplayName(c).toLowerCase()).slice(0, 200);

/** Does the accounting app's total match ours (to the cent)? */
export const totalsDiffer = (remote: number | null | undefined, local: number) => remote != null && Number.isFinite(remote) && Math.abs(money(remote) - money(local)) >= 0.01;

// ---------------------------------------------------------------- QuickBooks Online

export interface QboSettings {
  /** Product/service id for ordinary lines. */
  itemId: string;
  /** Product/service id for the sales tax lines (a non-taxable service mapped to the tax liability account). */
  taxItemId: string;
  /** Product/service id for fees (defaults to itemId). */
  feeItemId: string;
  /** Product/service id for "less amount already invoiced" lines (defaults to itemId). */
  deductionItemId: string;
  /** Tax code put on every line ("NON" in US companies: our tax is its own line). */
  taxCode: string;
  /** Bank / undeposited funds account id for payments (optional). */
  depositAccountId: string;
}

export function qboSettings(s: Record<string, string>): QboSettings {
  const itemId = s.itemId?.trim() || "1";
  return {
    itemId,
    taxItemId: s.taxItemId?.trim() || itemId,
    feeItemId: s.feeItemId?.trim() || itemId,
    deductionItemId: s.deductionItemId?.trim() || itemId,
    taxCode: s.taxCode?.trim() || "NON",
    depositAccountId: s.depositAccountId?.trim() || "",
  };
}

export function qboCustomer(c: DocClient) {
  const body: Record<string, unknown> = { DisplayName: customerDisplayName(c) };
  if (c.company?.trim()) body.CompanyName = clip(c.company, 100);
  if (c.name?.trim()) body.GivenName = clip(c.name, 100);
  if (c.email?.trim()) body.PrimaryEmailAddr = { Address: clip(c.email, 100) };
  if (c.phone?.trim()) body.PrimaryPhone = { FreeFormNumber: clip(c.phone, 30) };
  if (c.billingAddress?.trim()) body.BillAddr = { Line1: clip(c.billingAddress.split(/\r?\n/)[0], 500) };
  return body;
}

/** Invoice or credit memo body (same shape). Lines are not taxable: tax is its own line, so the totals match. */
export function qboDocument(doc: SalesDoc, customerId: string, settings: Record<string, string>) {
  const s = qboSettings(settings);
  const Line = remoteLines(doc).map((l) => {
    if (l.kind === "discount") return { DetailType: "DiscountLineDetail", Amount: money(-l.remoteAmount), Description: l.description, DiscountLineDetail: { PercentBased: false } };
    const item = l.kind === "tax" ? s.taxItemId : l.kind === "fee" ? s.feeItemId : l.kind === "deduction" ? s.deductionItemId : s.itemId;
    const qp = qtyPrice(l.qty, l.unitPrice, l.remoteAmount);
    return {
      DetailType: "SalesItemLineDetail",
      Amount: l.remoteAmount,
      Description: clip(l.sku ? `${l.sku} · ${l.description}` : l.description, 4000),
      SalesItemLineDetail: { ItemRef: { value: item }, Qty: qp.qty, UnitPrice: qp.price, TaxCodeRef: { value: s.taxCode } },
    };
  });
  const body: Record<string, unknown> = {
    CustomerRef: { value: customerId },
    TxnDate: doc.issueDate ?? undefined,
    Line,
    PrivateNote: clip(`From PinPlan${doc.title ? ` · ${doc.title}` : ""}`, 4000),
  };
  if (doc.number) body.DocNumber = clip(doc.number, 21);
  if (doc.kind === "invoice" && doc.dueDate) body.DueDate = doc.dueDate;
  if (doc.client?.email) body.BillEmail = { Address: clip(doc.client.email, 100) };
  if (doc.notes?.trim()) body.CustomerMemo = { value: clip(doc.notes, 1000) };
  return body;
}

export function qboPayment(p: DocPayment, invoiceRemoteId: string, customerId: string, settings: Record<string, string>) {
  const s = qboSettings(settings);
  const body: Record<string, unknown> = {
    CustomerRef: { value: customerId },
    TotalAmt: money(p.amount),
    TxnDate: p.date,
    Line: [{ Amount: money(p.amount), LinkedTxn: [{ TxnId: invoiceRemoteId, TxnType: "Invoice" }] }],
  };
  if (p.reference) body.PaymentRefNum = clip(p.reference, 21);
  if (p.note) body.PrivateNote = clip(p.note, 4000);
  if (s.depositAccountId) body.DepositToAccountRef = { value: s.depositAccountId };
  return body;
}

// ---------------------------------------------------------------- Xero

export interface XeroSettings {
  /** Revenue account code for ordinary lines, fees and deductions (e.g. "200"). */
  accountCode: string;
  /** Account code for the sales tax lines (a liability account). */
  taxAccountCode: string;
  /** Tax type on every line ("NONE": our tax is its own line). */
  taxType: string;
  /** Bank account code payments are recorded against. */
  paymentAccountCode: string;
}

export function xeroSettings(s: Record<string, string>): XeroSettings {
  return {
    accountCode: s.accountCode?.trim() || "200",
    taxAccountCode: s.taxAccountCode?.trim() || s.accountCode?.trim() || "200",
    taxType: s.taxType?.trim() || "NONE",
    paymentAccountCode: s.paymentAccountCode?.trim() || "",
  };
}

export function xeroContact(c: DocClient) {
  const body: Record<string, unknown> = { Name: customerDisplayName(c) };
  if (c.email?.trim()) body.EmailAddress = clip(c.email, 255);
  if (c.phone?.trim()) body.Phones = [{ PhoneType: "DEFAULT", PhoneNumber: clip(c.phone, 50) }];
  if (c.billingAddress?.trim()) body.Addresses = [{ AddressType: "POBOX", AddressLine1: clip(c.billingAddress.split(/\r?\n/)[0], 500) }];
  return body;
}

/** Invoice (ACCREC) or credit note (ACCRECCREDIT), approved, tax as its own lines (LineAmountTypes NoTax). */
export function xeroDocument(doc: SalesDoc, contactId: string, settings: Record<string, string>) {
  const s = xeroSettings(settings);
  const credit = doc.kind === "credit_note";
  const LineItems = remoteLines(doc).map((l) => {
    const qp = qtyPrice(l.qty, l.unitPrice, l.remoteAmount);
    const item: Record<string, unknown> = {
      Description: clip(l.description, 4000),
      Quantity: qp.qty,
      UnitAmount: qp.price,
      LineAmount: l.remoteAmount,
      AccountCode: l.kind === "tax" ? s.taxAccountCode : s.accountCode,
      TaxType: s.taxType,
    };
    if (l.kind === "item" && l.sku) item.ItemCode = clip(l.sku, 30);
    return item;
  });
  const body: Record<string, unknown> = {
    Type: credit ? "ACCRECCREDIT" : "ACCREC",
    Contact: { ContactID: contactId },
    Date: doc.issueDate ?? undefined,
    LineAmountTypes: "NoTax",
    Status: "AUTHORISED",
    CurrencyCode: doc.currency || undefined,
    Reference: clip(doc.title ?? "", 255) || undefined,
    LineItems,
  };
  if (credit) body.CreditNoteNumber = doc.number ? clip(doc.number, 255) : undefined;
  else {
    body.InvoiceNumber = doc.number ? clip(doc.number, 255) : undefined;
    body.DueDate = doc.dueDate || doc.issueDate || undefined;
  }
  return body;
}

export function xeroPayment(p: DocPayment, invoiceRemoteId: string, settings: Record<string, string>) {
  const s = xeroSettings(settings);
  return {
    Invoice: { InvoiceID: invoiceRemoteId },
    Account: { Code: s.paymentAccountCode },
    Date: p.date,
    Amount: money(p.amount),
    Reference: clip([p.reference, p.note].filter(Boolean).join(" · "), 255) || undefined,
  };
}

/** What decides whether a document needs sending again: its money, number, dates, client and status. */
export function documentFingerprint(doc: SalesDoc) {
  return {
    kind: doc.kind,
    status: doc.status === "void" ? "void" : "issued",
    number: doc.number ?? null,
    issueDate: doc.issueDate ?? null,
    dueDate: doc.dueDate ?? null,
    currency: doc.currency,
    total: doc.total,
    client: customerKey(doc.client ?? { name: "" }),
    lines: remoteLines(doc).map((l) => [l.kind, l.description, l.sku, l.qty, l.unitPrice, l.remoteAmount]),
  };
}
