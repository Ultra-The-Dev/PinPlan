# Billdu: one account per company

Each company (team) connects **its own** Billdu account in **Settings → Billdu**. Estimates, orders and invoices
that a company sends go to that company's Billdu account only. Before this, the server had one set of Billdu
credentials (`BILLDU_API_KEY` / `BILLDU_API_SECRET`, `.data/billdu.json` or the `app_secrets` row `billdu`), so every
customer would have sent invoices into the founder's account.

## Who uses which credentials

The server decides from **how the request signs in** (`src/lib/server/billduCreds.ts`, `resolveBillduCaller`):

| Caller | Credentials used | Server-wide fallback? |
| --- | --- | --- |
| Signed in (Supabase `Authorization: Bearer …`), owner/admin of a team | that team's row in `team_secrets` | **only** if the team is the founder's (`teams.plan_status = 'comped'`) |
| Signed in, technician | — (403 `office_only`) | — |
| Signed in, no team (solo user) | their own row in `user_secrets` | no |
| Access code only (`x-pinplan-access`, no bearer), e.g. the iPad app today | the server-wide credentials | yes (unchanged behaviour) |
| Server without Supabase (access-code or open mode) | the server-wide credentials | yes (unchanged behaviour) |

A non-founder team **never** falls back to the server-wide credentials: without its own row it gets
`412 { code: "not_configured" }`. When a request carries both a bearer token and an access code, the bearer token
wins, so a signed-in user always gets their own company.

All routes under `/api/billdu/*` (`credentials`, `test`, `products`, `send`) use this resolution.

## Storage and security

- Table `team_secrets(team_id, name, payload, key_hint, updated_at, updated_by, last_test_*)` and the same
  `user_secrets(user_id, …)` for solo users (migration `supabase/migrations/20261122010000_team_secrets.sql`).
- RLS is on with **no policies**, and table grants are revoked from `anon` / `authenticated`: browsers can't read or
  write them. Only the server, with `SUPABASE_SERVICE_ROLE_KEY`, touches them.
- `payload` is AES-256-GCM with `PINPLAN_ENCRYPTION_KEY`. The ciphertext is bound to its owner with additional
  authenticated data (`pinplan:team:<team id>:billdu`), so a row copied to another team fails to decrypt (the
  status then says "can't be decrypted — connect again"; it is never used).
- Responses never contain the secret or the full key: only `configured`, a key hint (`AB…1234`), who saved it and
  when, and the last connection test result.
- `POST /api/billdu/test` is rate-limited (10 per 10 minutes per user / IP); saving is limited to 20 per 10 minutes.
- The server needs `PINPLAN_ENCRYPTION_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to store company credentials. Without
  them, Settings shows what's missing and a non-founder company simply can't connect.

## API (`/api/billdu/credentials`)

- `GET` → status: `{ mode: "team" | "solo" | "single_company", teamName, configured, source: "team" | "user" | "env" | "file" | "database" | null, keyHint, own: { keyHint, updatedAt, updatedBy, lastTest, error } | null, server: {…} | null, canMoveServer, storageReady, storageMessage }`.
  `server` (the server-wide credentials) is only ever filled in for the founder's company and single-company servers.
- `POST { apiKey, apiSecret }` → save for the caller's company (or, on a single-company server, the server-wide store).
- `POST { action: "move_server_credentials" }` → founder only: copies the server-wide credentials into the founder
  team's own row.
- `DELETE` → disconnect the caller's company. `DELETE ?target=server` → remove the server-wide copy (founder or
  single-company server only; env vars can't be removed from the app).

## The founder's company: moving off the server-wide credentials

1. Sign in as the founder (owner/admin of the comped team) → **Settings → Billdu** → **Move these credentials to my
   company**. The company now uses its own copy; nothing changes in Billdu.
2. Keep the server-wide credentials **as long as the iPad app signs in with only the access code** — those
   requests still use them.
3. Once the iPad sends a Supabase bearer token (below), remove the server-wide credentials:
   - stored in the app: Settings → Billdu → **Remove the server-wide credentials** (or SQL:
     `delete from public.app_secrets where name = 'billdu';`, or delete `.data/billdu.json` on a disk-backed host);
   - env vars: delete `BILLDU_API_KEY` and `BILLDU_API_SECRET` on the host and redeploy.

## What the iOS app should send (for the iOS update)

Today `ios/PinPlan/Services/APIClient.swift` sends only `x-pinplan-access`, so Billdu calls from the iPad use the
server-wide (founder) credentials. That keeps working unchanged.

For multi-company use the app should, when the user is signed in to their PinPlan account:

- send `Authorization: Bearer <Supabase access token>` on `POST /api/billdu/send` (and `/api/billdu/products`,
  `/api/billdu/test`, `GET /api/billdu/credentials`), refreshing the token as the Supabase SDK does;
- keep sending `x-pinplan-access` too if it has one — it's ignored for Billdu when a bearer is present;
- handle `412 { code: "not_configured" }` with "Connect Billdu for your company in Settings → Billdu (on the web)",
  `403 { code: "office_only" }` (technicians) and `401 { code: "sign_in_required" }` (expired session);
- for its connection check, call `GET /api/billdu/credentials` with the bearer and show `configured` (the
  `billdu` flag in `/api/health` describes the server-wide credentials only).

## One send at a time (`billdu_send_claims`)

`POST /api/billdu/send` takes a claim per company, job and document type (`20261126001000_audit_hardening.sql`,
service role only; `src/lib/server/billduClaims.ts`) before it calls Billdu. A second send of the same document while
the first is under way (less than 2 minutes, no document yet) gets `409 { code: "already_sending" }`. The id of the
document Billdu returns is kept, so a resend without `existingDocId` (a lost answer, a double click, another device)
updates that document instead of making another; an `existingDocId` sent by the app wins. A definite refusal from
Billdu (4xx) lets the claim go at once; after a timeout or a 5xx it stays until it is 2 minutes old. Deposit documents
are new each time: their claim (`<type>_deposit`) only keeps two sends apart.
