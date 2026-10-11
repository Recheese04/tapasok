# Tapasok Mobile

React Native + Expo (TypeScript, Expo Router) companion app for **members and officers** of Tapasok. It uses the same
backend and database as the web app, through the authenticated `/api/mobile/*` endpoints in `../src/app/api/mobile`.
System Administrator accounts are not supported on mobile: they get a "web only" message when they try to sign in.

## Screens

| Area | What it does |
| --- | --- |
| Sign in | Same email and password as the web. Token kept in the device's secure storage (Keychain / Keystore). |
| Home | Next event, open attendance, your attendance counts, balance due, latest announcements. |
| Events | Upcoming / Past events of your organizations, event detail with attendance sessions and your status. |
| Scan | Pick an open session, scan the organizer's QR code with the camera. The server checks eligibility, time window, revocation and duplicates. No location is read. |
| Account | Profile (edit contact details only), My organizations and positions, your own Fees and payments (read only), Announcements, Notifications, Sign out (with confirmation). |

Loading, empty, offline and error states (with retry) are on every data screen.

## Role-based experience

Every account gets the full member experience (Home, Events, Scan, Account, My Organizations, My Fees, announcements,
notifications, profile). Officers get **additional** organization tools for the *active organization*, chosen with the
organization chip on Home / Manage. A person can be President in one organization and a member in another; the tools
follow the position held in the selected organization, while personal features never change.

| Position | Home leads with | Manage tab |
| --- | --- | --- |
| Member | next event, attendance, balance, announcements | hidden |
| President | members, events, check-ins, join requests, finance strip, payments to verify | Events, Finance, Announcements, Members, Documents |
| Treasurer | collected / outstanding / awaiting verification, payments to verify, recent payments | Finance (verify, reject, record payment), Members |
| Secretary | members, join requests, documents, events | Events, Announcements, Members, Documents |
| Auditor | read-only finance summary and recent payments | Finance (read-only), Members |
| Adviser | members, attendance, finance (read-only), evaluations | Finance (read-only), Members |
| Officer | events, check-ins, obligations, drafts | Events, Members |

What each position receives comes from `GET /api/mobile/org/{orgId}/overview`, which returns a `capabilities` map from the
same policy table as the web (`src/lib/permissions/policy.ts`). The app only mirrors it; every organization route checks
membership and the exact capability again, so hiding a button is never the protection.

Organization endpoints: `overview`, `finance`, `payments/{id}` (confirm/reject), `fees/{id}/payments` (record payment),
`announcements` (+ status), `events` (+ status, session open/close), `members`, `documents`.

Not on mobile (web only): file upload/download, audiences and multi-session events, join-request review, consequence rules,
evaluations, reports export, user and system administration.

## Run it

```bash
cd mobile
cp .env.example .env        # set EXPO_PUBLIC_API_BASE_URL
npm install
npx expo start              # scan the QR with Expo Go, or press a / i for an emulator
```

`EXPO_PUBLIC_API_BASE_URL` is the web app's address with no trailing slash:

- Deployed: `https://tapasok-beta.vercel.app`
- Local web app on a physical phone: `http://<your-computer-LAN-IP>:3000` (not `localhost`). The phone and computer must be on the same network.

Accounts: use any member/officer account from the web app. If `DEFAULT_ACCOUNT_PASSWORD` is set on the server, new accounts use it.

Camera scanning needs a real device (or an emulator with a camera feed). Expo Go supports `expo-camera`.

## Checks

```bash
npm run typecheck           # tsc --noEmit
npm run export              # builds the Android JS bundle (catches import / bundling errors)
npx expo-doctor
```

`expo-doctor` may report a duplicate `react` because this folder sits inside the web project (the web app's own
`node_modules/react` is one level up). Metro resolves from `mobile/node_modules`, so the app is unaffected. `.npmrc`
sets `legacy-peer-deps` because some Expo packages declare loose peer ranges that npm otherwise refuses to resolve.

## Design system

All screens are built from one set of tokens and components:

- `src/theme.ts`: palette (university navy foundation, royal-blue actions, one warm gold accent, semantic success /
  warning / danger / info each with solid, soft and ink shades), Plus Jakarta Sans type scale, spacing, radii, elevation.
- `src/components/ui.tsx`: primitives (`Txt`, `Button`, `IconButton`, `Card` incl. the navy `dark` hero, `ListGroup` /
  `ListItem`, `Badge`, `Chips`, `ScreenHeader`, `Body`, `StatTile`, `ProgressBar`, `SegmentBar`, `BarChart`, `DateBlock`,
  skeletons, `Empty` / `ErrorState` with spot illustrations).
- `src/components/kit.tsx`: `Sheet`, `Field`, `DateTimeField`, `useToast`, `useConfirm` (one confirmation dialog on every
  platform), `Notice`, `OrgChip`.

The one decorative motif is a set of faint concentric rings on navy surfaces, echoing the reference's layered header.
Charts use real six-month series from the overview endpoint (`attendance.byMonth`, `finance.byMonth`).

## Structure

```
app/                 Expo Router screens (login, (tabs)/index|events|scan|account, event/[id], fees, ...)
src/api/client.ts    Typed API client: bearer token, timeout, offline/error mapping, 401 handler
src/api/types.ts     Response types for /api/mobile/*
src/auth/            AuthProvider: restore session on launch, sign in / out
src/components/ui.tsx Shared components
src/theme.ts         Design tokens
```

## Security notes

- The server stores only a SHA-256 hash of the token. Signing out, expiry (default 30 days, `MOBILE_SESSION_DAYS`) and account deactivation take effect on the next request.
- Every endpoint re-checks the member's own data; fees, notifications and attendance are always the signed-in member's.
- Wrong password lockout (5 failures, 15 minutes) is shared with the web.
- The app never reads GPS. Camera permission is requested only when the Scan tab is used.

## Not verified

The app type-checks and bundles for Android, and the API behind it is covered by `../tests/mobile-api.test.ts`.
It has **not** been run on a physical phone or emulator in this repository's development, so camera permission
prompts, QR scanning and visual layout still need a hands-on pass on a device.
