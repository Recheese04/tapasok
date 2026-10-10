# Tapasok

School/college organization management web app (Next.js, React, TypeScript, Tailwind, PostgreSQL, Prisma).
See `tapasok-web-spec-new-database.md` for the specification.

## Local setup

1. Install PostgreSQL locally and create an empty **development** database, e.g. `tapasok_dev`.
   Never point this project at a production database during development.
2. `cp .env.example .env` and set `DATABASE_URL` for the dev database.
3. `npm install` (runs `prisma generate`).
4. `npm run db:migrate` — applies migrations in `prisma/migrations` to the dev database.
5. Optional demo data: `npm run db:seed` (development only; creates `*@tapasok.test` accounts, one per role,
   in a `[DEMO]` organization; the generated password is printed once).
6. `npm run dev`, then open http://localhost:3000 and sign in.

Tests: create a second empty database named `tapasok_test` (owned by your dev role), set `TEST_DATABASE_URL` in `.env`, then `npm test`. The test run applies migrations to that database and refuses to run against any database whose name does not end in `_test`.

Other scripts: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run db:deploy` (apply existing migrations without creating new ones), `npm run db:studio`.

## Database (increment 1)

Tables: `users`, `sessions`, `organizations`, `organization_members`, `organization_join_codes`, `audit_logs`. Schema: `prisma/schema.prisma`.

- `users.system_role` is `SYSTEM_ADMIN` or `USER`. Organization roles (`PRESIDENT`, `TREASURER`, `OFFICER`, `ADVISER`, `MEMBER`) live on `organization_members`, so one person can hold different roles in different organizations.
- Memberships keep history: ending one sets `ended_at`. Partial unique indexes (in the init migration SQL) allow one active membership per user per organization and one active president per organization.
- Sessions are stored server-side; the cookie holds a random token and only its SHA-256 hash is in the database.
- Later modules (events, attendance, consequences, evaluations, fees) are added as separate migrations.

## Authentication and authorization

- Passwords: bcrypt (cost 12). Login failures are generic, timing-equalized, audit-logged, and lock the account for 15 minutes after 5 consecutive failures.
- Session cookie: `httpOnly`, `sameSite=lax`, `secure` in production, validated against the database on every request.
- Authorization is enforced on the server (`src/lib/auth/dal.ts`, `src/lib/permissions`). Sidebar visibility (`src/config/navigation.ts`) is cosmetic only.
- The role-to-permission mapping is provisional until the permission matrix is agreed with the project owner.

## User management and join codes

- `/users` (system admins only): search, create, edit, deactivate/activate, and reset passwords. New accounts are always regular users; there is no UI or form field that grants system admin. Deactivation and password resets delete the user's sessions. Passwords are never displayed after creation; a generated password is shown once to the admin.
- Join codes: a president (or system admin) generates a code on the organization page. Only a SHA-256 hash is stored, so the raw code is shown **once** at generation (copy it then); regenerate to get a new one. Optional expiry date and maximum uses. Entering a code at `/join` always creates a MEMBER membership; redemption is atomic, so the use limit cannot be exceeded under concurrency.

## System structure (see `tapasok-full-system-structure.md`)

Role rules: [docs/permission-matrix.md](docs/permission-matrix.md) (enforced from `src/lib/permissions/policy.ts`). Phase status: [docs/phase-status.md](docs/phase-status.md).

1. **Setup** - `/academic` (school years, semesters, active term, colleges, departments, programs; archived, never deleted), organizations with scope and an
   official adviser, one User Management page for students, faculty/staff and admins, with program, year level (kept per semester), RFID UID, photo and PSGC address, CSV import with one-time account setup links.
2. **Membership** - automatic academic mapping (explicit opt-in per organization, enrolled students of the active semester only, Member role only), join requests
   for interest-based organizations (approve/reject with decision and timestamp), join codes, officer positions.
3. **Events and attendance** - events with sessions (time-in/out), cut-off and grace, target groups, venue (display only, no GPS), rules; capture by RFID terminal
   (`POST /api/rfid/scan`), student QR self check-in (`/check-in`), and officer scan or manual entry; closing a session marks expected students Absent;
   excuses and corrections are audited.
4. **Evaluations** (rating, Likert, choice, comment; per-event requirement; response rates) 5. **Consequence rules** applied automatically on finalize
   (fines or service hours, no duplicates) 6. **Ledger** (assessments, adjustments, receipts, digital payment proof + verification) 7. (Clearance was removed; **Obligations** are separate member requirements) per
   semester with sign-offs 8. **Announcements** (targeted, in-app notifications), **documents** (minutes/archives with audit trail).

### RFID terminals (needs real hardware to verify)
Register a terminal under Attendance (shows its key once). The terminal sends, for each card tap:

    POST /api/rfid/scan
    Authorization: Bearer <device key>
    {"sessionId": "<session uuid>", "cardUid": "04A1B2C3"}

The response is `{"ok":true,"status":"PRESENT"|"LATE","name":"<first name>"}` or `{"ok":false,"code":...,"message":...}`. The endpoint is tested with simulated
requests only; no physical reader has been connected. Push notifications are not implemented; notifications are in-app.

New env vars: `QR_SECRET` (32+ random chars), `APP_URL` (encoded in check-in QR codes), `STORAGE_DIR`, `TEST_DATABASE_URL`. See `.env.example`.
Addresses use https://psgc.gitlab.io/api/ (live check: `LIVE_PSGC=1 npx vitest run tests/psgc-live.test.ts`). Times are Philippine time (UTC+8).
