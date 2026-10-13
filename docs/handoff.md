# Tapasok handoff (for the next Claude Code session)

Written 2026-10-13 at the end of a long local session, so work can continue in a cloud session without the PC.
Read this first, together with `AGENTS.md`.

## Project in one paragraph

Tapasok is a student-organization management system.
- **Web:** Next.js 16 App Router (cacheComponents), React 19, TypeScript, Tailwind 4, Prisma 7, PostgreSQL. This version of
  Next.js differs from older ones: read `node_modules/next/dist/docs/` before using an API.
- **Mobile:** an Expo app (SDK 57) in `mobile/`, which talks to `/api/mobile/*`.
- **Hosting:** Vercel project "tapasok", which auto-deploys `main` to https://tapasok-beta.vercel.app, with a Supabase
  PostgreSQL database.
- **Docs:**
  - Functional spec: `tapasok-full-system-structure.md`.
  - Permissions: `docs/permission-matrix.md`, with the code in `src/lib/permissions/policy.ts`.
  - Security: `docs/security.md`.

## Decisions the owner made (follow them)

- **Adviser:** read-only everywhere (web, mobile, API), with ONE approved exception: the Adviser can designate officers
  (`officers.designate`), which means changing an existing member's position among Member, Officer, Secretary, Treasurer
  and Auditor in their own organization. Rules:
  - The Adviser never scans or records attendance, never excuses absences, and never manages or waives consequences.
  - The Adviser never makes approvals or financial actions, and is not assessed member fees.
  - Adviser-only accounts have no personal "My …" pages.
  - `tests/role-rules.test.ts` enforces all of this.
- **Joining organizations is immediate:** no approval step, and always as Member. Old join requests are kept as history and
  are never deleted.
- **Card registration:** RFID card registration is System Admin only. A scan captures the UID and the admin confirms it;
  replacing a card or moving it to another student needs explicit confirmation.
- **RFID terminals:** a terminal records taps into the one session its organization has open ("Activate scanner" on the
  web, "Open" in the app). Two open sessions at once are refused, never guessed.
- **Shared test password:** the shared test password ("password") is intended. Never force password changes.
- **No messaging:** no chat or direct-messaging feature (the adviser said it is not needed).
- **Design:** keep the current purple web UI (`src/app/globals.css`, `src/components/shared/ui.tsx`). Reuse those components.
- **Pushing:** do not commit or push without the owner's explicit OK. Pushing `main` deploys to production immediately.
  No production data changes and no migrations without approval.

## Where things are

| Area | Code |
|---|---|
| Permissions | `src/lib/permissions/policy.ts`; per-organization checks only. System Admin has no implicit org access. |
| Organizations admin dashboard + student population | `src/features/organizations/admin-view.tsx`, `src/features/academic/population.ts` |
| User Management filters / sorting | `src/features/users/queries.ts`, `src/features/users/user-filters.tsx` |
| Joining | `src/features/organizations/requests.ts` (`joinOrganization`) |
| RFID endpoint | `src/app/api/rfid/scan/route.ts`; card registration in `src/features/attendance/rfid-enrollment.ts` |
| Firmware (NodeMCU ESP8266 + RC522, SDA D2, RST D1, 3.3 V) | `firmware/tapasok_rfid/tapasok_rfid.ino`, guide `firmware/README.md` |
| Mobile app | `mobile/` (role-based tools in `mobile/src/roles.ts`) |
| SEO | `src/app/robots.ts`, `src/app/sitemap.ts`, landing metadata in `src/app/page.tsx` |

## How to check work

- **Tests:** run `npx vitest run`. They need a PostgreSQL test database (`TEST_DATABASE_URL`), which may not exist in a
  cloud session; say so if they cannot run.
- **Last local run:** 294 passed, 3 skipped (the live address-API tests).
- **Typecheck:** `npx tsc --noEmit -p .` and `cd mobile && npx tsc --noEmit -p .`.
- **Lint:** `npx eslint src tests`.
- **Local builds:** on the owner's Windows PC Turbopack builds fail locally (process error 0xc0000142). Vercel builds fine.

## Open items

1. **New APK build:** the app's recent changes (direct joining, no Scan tab for Adviser-only accounts, the Adviser home
   screen) reach phones only with a new APK. Use the `mobile/eas.json` "preview" profile. It needs the owner's Expo login.
2. **Real RFID hardware test:** not done yet. Everything was tested by sending the reader's exact HTTP requests. A member
   is testing with a real reader; ask for the Serial Monitor output.
3. **Google Search Console:** the owner must add the site, verify it (a file or meta tag can be added to the app), submit
   `sitemap.xml`, and request indexing.
4. **Old pending join requests in production:** not counted yet. If the owner wants, count them read-only, then (with
   approval) turn them into memberships.
5. **Uploaded files:** stored on Vercel's temporary disk. Move them to object storage (e.g. Supabase Storage) before relying
   on uploads.
6. **No staging environment exists:** a separate staging deployment and database were planned for RFID load and region
   tests.
