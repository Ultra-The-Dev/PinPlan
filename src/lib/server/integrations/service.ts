// Integration work that isn't HTTP (server-only): the provider context (tokens refreshed with compare-and-swap) and
// pushing one document with its payments (links, fingerprints, idempotency keys, audit events, total warnings).
import { money } from "@/lib/estimate";
import type { DocPayment, SalesDoc } from "@/lib/types";
import type { IntegrationCaller } from "./caller";
import { idempotencyKey, sha256, stableJson } from "./http";
import { customerKey, documentFingerprint, totalsDiffer } from "./payload";
import { addEvent, readConnection, readLink, saveLink, setConnectionStatus, swapTokens } from "./store";
import { IntegrationError, type Connection, type Link, type Provider, type ProviderContext, type TokenSet } from "./types";

/** Refresh a little before the access token runs out. */
const REFRESH_EARLY_MS = 2 * 60_000;
const fresh = (t: TokenSet | null | undefined, now = Date.now()) => !!t?.accessToken && (!t.expiresAt || new Date(t.expiresAt).getTime() - now > REFRESH_EARLY_MS);

/** Mark the connection as needing a new sign-in and log why (best effort). */
export async function markReconnect(provider: Provider, ic: IntegrationCaller, message: string) {
  if (!ic.owner) return;
  await setConnectionStatus(ic.owner, provider.id, { status: "needs_reconnect", lastError: message }).catch(() => undefined);
  await addEvent(ic.owner, provider.id, { kind: "refresh", ok: false, message, actor: ic.userId });
}

export function makeContext(provider: Provider, ic: IntegrationCaller, connection: Connection | null): ProviderContext {
  let conn = connection;
  const notConnected = () => new IntegrationError(`${provider.label} isn't connected for your company.`, 412, "not_connected");

  async function refreshNow(): Promise<string> {
    if (!ic.owner || !conn) throw notConnected();
    // Another request may have refreshed already: use its tokens rather than rotating them again.
    const latest = await readConnection(ic.owner, provider.id);
    if (!latest?.tokens) throw notConnected();
    if (latest.status === "needs_reconnect") throw new IntegrationError(`${provider.label} needs to be connected again.`, 409, "needs_reconnect", true);
    if (latest.version !== conn.version && fresh(latest.tokens)) {
      conn = latest;
      return latest.tokens.accessToken;
    }
    conn = latest;
    let next: TokenSet;
    try {
      next = await provider.refresh(latest.tokens);
    } catch (e) {
      if (e instanceof IntegrationError && e.reconnect) await markReconnect(provider, ic, e.message);
      throw e;
    }
    if (await swapTokens(ic.owner, provider.id, latest.version, next)) {
      conn = { ...latest, tokens: next, version: latest.version + 1, status: "connected" };
      return next.accessToken;
    }
    // Lost the race: the winner's tokens are the ones stored now.
    const winner = await readConnection(ic.owner, provider.id);
    if (!winner?.tokens) throw notConnected();
    conn = winner;
    return winner.tokens.accessToken;
  }

  return {
    owner: ic.owner,
    caller: ic.caller,
    get connection() {
      return conn;
    },
    get settings() {
      return conn?.settings ?? {};
    },
    async accessToken() {
      if (!conn?.tokens) throw conn?.tokenError ? new IntegrationError(conn.tokenError, 409, "needs_reconnect", true) : notConnected();
      if (conn.status === "needs_reconnect") throw new IntegrationError(`${provider.label} needs to be connected again.`, 409, "needs_reconnect", true);
      if (fresh(conn.tokens)) return conn.tokens.accessToken;
      return refreshNow();
    },
    forceRefresh: refreshNow,
  };
}

export interface PaymentReport {
  id: string;
  status: "sent" | "unchanged" | "deleted" | "skipped" | "error";
  message?: string;
}

export interface PushReport {
  status: "sent" | "unchanged" | "voided" | "skipped";
  remoteId: string | null;
  remoteNumber: string | null;
  remoteTotal: number | null;
  warnings: string[];
  payments: PaymentReport[];
}

const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Send one issued invoice or credit note (and an invoice's payments). Drafts are refused. A document whose content
 * hasn't changed since the last successful send is not sent again; a void one is voided remotely if it was sent, and
 * refused (400 "void") if it never was. The caller passes the database's copy (routes.ts loads it), never the browser's.
 */
export async function pushDocument(provider: Provider, ic: IntegrationCaller, ctx: ProviderContext, doc: SalesDoc, payments: DocPayment[]): Promise<PushReport> {
  const owner = ic.owner;
  if (!owner) throw new IntegrationError("Sign in with your company account to send to an accounting app.", 400, "needs_account");
  if (doc.kind !== "invoice" && doc.kind !== "credit_note") throw new IntegrationError("Only invoices and credit notes go to accounting.", 400, "wrong_kind");
  if (doc.deleted) throw new IntegrationError("This document was deleted.", 400, "deleted");
  if (doc.status === "draft") throw new IntegrationError("Drafts are never sent. Send the invoice to the client first, then to accounting.", 400, "draft");

  const localType = doc.kind;
  const link = await readLink(owner, provider.id, localType, doc.id);
  const hash = sha256(stableJson(documentFingerprint(doc)));
  const report: PushReport = { status: "unchanged", remoteId: link?.remoteId ?? null, remoteNumber: link?.remoteNumber ?? null, remoteTotal: link?.remoteTotal ?? null, warnings: [], payments: [] };

  let customer: string | null = null;
  const customerId = async () => {
    if (customer) return customer;
    const key = customerKey(doc.client ?? { name: "" });
    const clink = await readLink(owner, provider.id, "customer", key);
    const out = await provider.pushCustomer(ctx, doc.client ?? { name: "" }, clink);
    if (out.remoteId !== clink?.remoteId) await saveLink(owner, provider.id, { localType: "customer", localId: key, remoteId: out.remoteId, lastError: null });
    customer = out.remoteId;
    return customer;
  };

  const isVoid = doc.status === "void";
  const remoteGone = (l: Link | null) => !!l && ["void", "voided", "deleted"].includes(l.remoteStatus ?? "");
  // A void document only goes out to void the copy already there; one that never went out is refused.
  if (isVoid && !link?.remoteId) throw new IntegrationError(`This document is void and was never sent to ${provider.label}.`, 400, "void");
  if (isVoid && remoteGone(link)) return report;

  if (!(link?.remoteId && link.hash === hash && !link.lastError)) {
    // The key also covers the mapping and the remote copy's state: after a failed send the user fixes the mapping and
    // retries, and the accounting app must not answer with its saved reply to the earlier (failed) request.
    const key = idempotencyKey([owner.kind, owner.id, provider.id, localType, doc.id, hash, stableJson(ctx.settings), link?.remoteId, link?.syncToken]);
    let out;
    try {
      // A document the provider won't take is refused before the customer is sent (no client is made for nothing).
      const refusal = provider.refuses?.(doc);
      if (refusal) throw refusal;
      out = await provider.pushInvoice(ctx, { doc, customerId: isVoid ? "" : await customerId(), link, idempotencyKey: key });
    } catch (e) {
      await saveLink(owner, provider.id, { localType, localId: doc.id, lastError: errMessage(e) }, false).catch(() => undefined);
      await addEvent(owner, provider.id, { kind: "error", ok: false, localType, localId: doc.id, remoteId: link?.remoteId ?? null, message: `${doc.number ?? "Document"}: ${errMessage(e)}`, actor: ic.userId });
      throw e;
    }
    await saveLink(owner, provider.id, {
      localType,
      localId: doc.id,
      remoteId: out.remoteId || link?.remoteId || null,
      remoteNumber: out.remoteNumber ?? link?.remoteNumber ?? null,
      syncToken: out.syncToken ?? null,
      hash,
      remoteTotal: out.remoteTotal ?? null,
      remoteStatus: out.remoteStatus ?? null,
      lastError: null,
    });
    report.status = isVoid ? "voided" : "sent";
    report.remoteId = out.remoteId || link?.remoteId || null;
    report.remoteNumber = out.remoteNumber ?? report.remoteNumber;
    report.remoteTotal = out.remoteTotal ?? null;
    const name = doc.number ?? (doc.kind === "credit_note" ? "Credit note" : "Invoice");
    if (!isVoid && totalsDiffer(out.remoteTotal, doc.total))
      report.warnings.push(`${provider.label} shows ${money(out.remoteTotal!).toFixed(2)} for ${name}, Northpin shows ${doc.total.toFixed(2)}. Check its tax and item settings.`);
    await addEvent(owner, provider.id, {
      kind: isVoid ? "void" : "push",
      ok: report.warnings.length === 0,
      localType,
      localId: doc.id,
      remoteId: report.remoteId,
      message: report.warnings[0] ?? `${isVoid ? "Voided" : link?.remoteId ? "Updated" : "Sent"} ${name}`,
      actor: ic.userId,
    });
  }

  if (doc.kind === "invoice" && !isVoid) {
    const invoiceLink = await readLink(owner, provider.id, "invoice", doc.id);
    for (const p of payments.filter((x) => x.documentId === doc.id)) {
      const plink = await readLink(owner, provider.id, "payment", p.id);
      const gone = !!(p.voided || p.deleted);
      const phash = sha256(stableJson({ amount: money(p.amount), date: p.date, method: p.method, reference: p.reference ?? null, gone }));
      if ((gone && (!plink?.remoteId || plink.remoteStatus === "deleted")) || (plink?.hash === phash && !plink.lastError)) {
        report.payments.push({ id: p.id, status: "unchanged" });
        continue;
      }
      if (!invoiceLink?.remoteId) {
        report.payments.push({ id: p.id, status: "skipped", message: "The invoice isn't in the accounting app yet." });
        continue;
      }
      const key = idempotencyKey([owner.kind, owner.id, provider.id, "payment", p.id, phash, stableJson(ctx.settings), invoiceLink.remoteId, plink?.remoteId, plink?.syncToken]);
      try {
        const out = await provider.pushPayment(ctx, { payment: p, doc, invoice: invoiceLink, customerId: gone ? "" : await customerId(), link: plink, idempotencyKey: key });
        if (!out && gone) {
          // Already gone in the accounting app: remember that, so it isn't tried again.
          await saveLink(owner, provider.id, { localType: "payment", localId: p.id, hash: phash, remoteStatus: "deleted", lastError: null });
          report.payments.push({ id: p.id, status: "deleted" });
          continue;
        }
        if (!out) {
          report.payments.push({ id: p.id, status: "skipped", message: `Record payments in ${provider.label}.` });
          continue;
        }
        await saveLink(owner, provider.id, { localType: "payment", localId: p.id, remoteId: out.remoteId, syncToken: out.syncToken ?? null, hash: phash, remoteTotal: out.remoteTotal ?? null, remoteStatus: out.remoteStatus ?? null, lastError: null });
        report.payments.push({ id: p.id, status: gone ? "deleted" : "sent" });
        await addEvent(owner, provider.id, { kind: "push", ok: true, localType: "payment", localId: p.id, remoteId: out.remoteId, message: `${gone ? "Removed" : "Sent"} payment of ${money(p.amount).toFixed(2)} on ${doc.number ?? "invoice"}`, actor: ic.userId });
      } catch (e) {
        if (e instanceof IntegrationError && e.reconnect) throw e;
        await saveLink(owner, provider.id, { localType: "payment", localId: p.id, lastError: errMessage(e) }, false).catch(() => undefined);
        await addEvent(owner, provider.id, { kind: "error", ok: false, localType: "payment", localId: p.id, message: `Payment on ${doc.number ?? "invoice"}: ${errMessage(e)}`, actor: ic.userId });
        report.payments.push({ id: p.id, status: "error", message: errMessage(e) });
      }
    }
  }

  await setConnectionStatus(owner, provider.id, { lastSyncAt: new Date().toISOString(), lastError: null }).catch(() => undefined);
  return report;
}
