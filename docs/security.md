# Tapasok security overview

What protects the system today, and what is deliberately out of scope or still open. Every item marked "tested" has an
automated test in `tests/` that runs against a real PostgreSQL database.

## Authentication and sessions

| Control | Details | Tested |
|---|---|---|
| Password storage | bcrypt, cost 12. Plain passwords are never stored or logged. | yes |
| Password rules | At least 10 characters, at most 72 bytes. Refuses the shared starting password, common passwords, passwords containing the email name, and reusing the current password. | yes (`security.test.ts`) |
| Account lockout | 5 wrong passwords lock that account for 15 minutes. | yes |
| Network rate limit | 30 failed sign-ins per network address per 15 minutes (web and mobile share the counter). Successful sign-ins are not counted, so a shared campus address is not blocked. | yes |
| No user enumeration | Unknown email and wrong password give the identical response; a hash comparison always runs so timing matches. | yes |
| Shared starting password | Accounts created with `DEFAULT_ACCOUNT_PASSWORD` are flagged and can do nothing except choose their own password (web) — the mobile API refuses them. | yes |
| Web sessions | Random 256-bit token; only its SHA-256 hash is stored. Cookie `__Host-tapasok_session`: HttpOnly, Secure, SameSite=Lax, 8-hour lifetime. Changing the password signs out other devices. | yes |
| Mobile sessions | Same table, Bearer token, 30 days; re-validated on every request; logout, expiry and deactivation take effect immediately. System administrators cannot use the mobile API. | yes |
| Account setup links | Single-use, 14-day, only the hash stored; claimed atomically. | yes |
| Open redirects | `next` after sign-in is limited to an allow-list of internal paths. | yes |

## Authorization

- Every server action and API route checks the caller's capability **in the specific organization** using one policy
  table (`src/lib/permissions/policy.ts`). Hiding a button is never the protection.
- IDs in URLs are verified against the caller's memberships (other organizations' records return 404 / 403).
- System administration (`users.manage` etc.) is separate from organization positions; no position grants it.
- Organization, member, finance, payment and RFID routes are covered by permission tests for every position.
- The Adviser is read-only everywhere except designating officers (changing an existing member's position among Member,
  Officer, Secretary, Treasurer and Auditor in their own organization). Every other write action and mobile endpoint refuses
  the Adviser (tested, with a check that nothing was changed or logged in the Adviser's name).
- Join requests are decided only by the President or Secretary of the request's own organization; nobody can decide their
  own request.

## Input, files and output

- All inputs are validated with Zod on the server; database access is through Prisma (parameterised).
- No `dangerouslySetInnerHTML`; React escapes all output.
- CSV exports neutralise spreadsheet formulas (`=`, `+`, `-`, `@`).
- Uploads: extension allow-list **and** magic-byte check, 10 MB limit, random storage key (the user's file name never
  touches the path), served only through authorised routes with `nosniff` and a sandboxing CSP.
- Pictures (profile pictures, landing-page event pictures) are content-sniffed, decoded with a pixel limit, re-encoded to
  WebP with all metadata removed, and stored in the database (persistent). Landing-page pictures are public only while
  their event is shown on the landing page; otherwise only System Admin can load them.
- Landing-page feedback: signed-in accounts only (no anonymous posting), one active entry per account (partial unique
  index), at most 10 changes per hour, plain text up to 500 characters with control and bidi characters removed, and
  nothing is public before a System Admin approves it. Public entries show the first name and last initial only.

## HTTP headers (all routes)

`Content-Security-Policy` (self only, no framing, no plugins, `base-uri`/`form-action` locked),
`Strict-Transport-Security` (2 years, preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera only for this site; microphone and
geolocation off), `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`; the `X-Powered-By` header is removed.

Note: `script-src` includes `'unsafe-inline'` because Next.js inlines its bootstrap script; moving to per-request
nonces would make every page dynamic. All other sources are restricted.

## Auditing

Sign-ins (success, failure, rate-limited), password changes, payments, ledger adjustments, card registrations,
document downloads, exports and administrative changes are written to `audit_logs` with the actor.

## Known gaps / out of scope

- **Uploaded documents, payment proofs and expense receipts on Vercel** are written to the server's disk, which Vercel
  does not keep. Move them to object storage (e.g. Supabase Storage) before relying on them in production. Profile
  pictures and landing-page event pictures are already stored in the database.
- **`DEFAULT_ACCOUNT_PASSWORD`** should be removed from the production environment so new accounts use one-time setup
  links. While it is set, anyone who knows the shared password could sign in to an account that has not yet chosen its
  own password (they would then be forced to change it, taking over the account).
- No multi-factor authentication. No email delivery (setup links are handed out by administrators).
- An attacker who knows an email can lock that account for 15 minutes by failing 5 times (standard lockout trade-off).
- `npm audit` reports issues in the Prisma **CLI** dependency tree (`mysql2`, `deepmerge-ts`), a development tool not
  used at runtime with PostgreSQL.
- RFID terminals authenticate with a 192-bit device key; physical card cloning is outside the system's control (UID-only
  cards are a supervised prototype).
- RFID card registration is System Admin only. A registration scan captures the UID for the admin to confirm and is never
  counted as attendance; replacing a card or moving it from another student needs explicit confirmation; every start,
  capture, cancel, registration, replacement, move and removal is audited. Profile edits cannot change a card.

## Organization funds (expenses and other money received)

- Available balance = confirmed, non-voided fee payments + approved other funds − approved expenses. It is always
  computed from records; there is no stored balance to edit.
- Independent approval: the Treasurer records, the President approves / rejects / reverses. A database constraint
  refuses a decision by the person who recorded the record. Auditor and Adviser are read-only.
- Approvals take a per-organization lock and a conditional status update, so a record counts exactly once and two
  concurrent approvals cannot overdraw the balance. Double-submitted forms are de-duplicated by a request id.
- Records are never deleted: pending ones can be cancelled, approved ones reversed, both with a reason.
- `financial_audit_entries` is append-only at the database level (UPDATE and DELETE are rejected by triggers) and
  records fees, assessments, payments, verifications, voids, adjustments, expenses, approvals, reversals and report exports.
