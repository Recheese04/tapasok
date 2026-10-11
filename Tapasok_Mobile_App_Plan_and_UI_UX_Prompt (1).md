# Tapasok Mobile App — React Native + Expo

## Goal

Create a separate mobile app for **Tapasok** using **React Native + Expo**, stored in a new directory alongside the existing web app. The mobile app must use the **same existing backend and database as the web app** through the existing authenticated API/server endpoints where possible.

This is a mobile-first companion app, not a recreation of the entire web dashboard. Prioritize the everyday tasks members use most often. Keep the app navigation small, simple, fast, and genuinely native-feeling.

## 1. Start with an audit — do not code blindly

Before implementation:

1. Inspect the repository structure, current Next.js web app, authentication/session setup, API routes/server actions, Prisma models, permissions, and existing business rules.
2. Identify which backend endpoints are safe and usable by a React Native client.
3. Make a short implementation plan and list any backend/API gaps before making architectural changes.
4. Keep the mobile app in a separate directory, for example `mobile/`, at the repository root. Do not move, replace, or recreate the web app.
5. Reuse the existing backend and database. Do not create a second database or duplicate business logic in the mobile app.
6. Do not expose database credentials, server secrets, or privileged server-only logic in the Expo client.
7. Preserve existing data and migrations. Never reset, drop, or wipe the database.

If existing Next.js server actions cannot be called safely from a mobile client, create or adapt authenticated API endpoints in the existing web/backend project. Validate input and enforce authorization on the server for every protected operation. Do not assume hiding a button is security.

## 2. Mobile app scope — essential daily features only

Design the navigation around the tasks ordinary members need frequently. Do not copy every web sidebar menu into the app.

### Main navigation

Use a simple bottom tab bar with approximately four tabs:

- **Home** — personalized summary, next relevant event, useful announcements, and a few quick actions.
- **Events** — browse upcoming and relevant events and view event details.
- **Scan** — scan an event/session QR code for attendance, after the user chooses an eligible session when required by the existing rules.
- **Account** — profile, My Organizations, personal fees/payments, notifications, and sign-out in a small, organized list.

Keep the navigation short and consistent. Do not add a tab for every feature.

### Strict role scope: no System Admin mobile app

The mobile app is for **students/members and the everyday tasks needed by each non-admin role**. Do not build a System Admin mobile interface or expose administration features in the mobile app.

- Do not include System Admin dashboards, user management, Academic Setup, bulk CSV import, system configuration, global organization management, or other system-wide administration screens.
- Do not show System Admin-only navigation items, even if the signed-in account has System Admin privileges. The web app remains the place for system administration.
- Keep the app focused on student/member workflows first.
- For every non-admin role, show only the small set of mobile actions that role genuinely needs. Use existing role and organization permissions to decide which optional actions are available.
- A user may hold different roles in different organizations. Any optional organization-specific action must be scoped to the organization where the user has that permission.
- Do not build a separate copy of the entire web interface for Presidents, Treasurers, Secretaries, Advisers, Auditors, or Officers. Add only essential, mobile-friendly tasks where there is a clear daily use case and existing backend support.
- If a user has both a student/member identity and an organization position, retain their normal personal member features alongside the few authorized role-specific actions. Do not duplicate the same destination in navigation.
- All access checks must be enforced by the backend. Hiding an admin screen in the app is not a substitute for server-side authorization.

### Core user workflows

Implement only features appropriate for a mobile user and supported by the existing backend:

- Secure sign-in and sign-out, using the existing account system.
- Home screen with relevant upcoming events, announcements, and personal status.
- Browse events and open event details.
- QR attendance scanning using the device camera. Request permission with a clear explanation and show helpful states for permission denied, no camera, or scanner failure. Keep all attendance eligibility checks and duplicate prevention on the server.
- View My Organizations and organization details relevant to the signed-in member.
- View personal fees and payment status. Do not give regular members access to organization-wide finance management.
- View notifications and announcements.
- Edit only profile fields the existing system allows the user to edit.
- Display loading, empty, offline/network-error, and retry states throughout.

Do not include System Admin functionality, Academic Setup, bulk CSV imports, user-management administration, system configuration, global organization management, or other system-wide admin screens anywhere in the mobile app. Keep complex organization finance management on the web; at most, provide an authorized role with a compact read-only summary if it is genuinely useful.

### Essential role-specific features (non-admin only)

Start with the student/member experience for every user. Where it is useful, add a small number of mobile-friendly actions for non-admin organization roles:

- **President:** view relevant organization events and, if supported and genuinely useful, review event/evaluation status.
- **Treasurer:** view a limited organization finance summary only for organizations where authorized; do not recreate full finance management.
- **Secretary:** view organization announcements, documents, or event details relevant to the role, subject to existing permissions.
- **Adviser/Auditor:** view only the information permitted by existing read-only permissions.
- **Officer/other positions:** show only the specific organization tasks supported by the current backend and authorized for that user.

These are examples, not permission changes. Audit the real roles and rules before implementing any action. Do not grant new privileges just to make a mobile screen work. Do not build full web admin pages. Keep organization-specific actions scoped to the correct organization and enforce all permissions server-side.

**System Admin is web-only:** do not create mobile navigation or screens for System Admin functions. If a System Admin signs in to the mobile app, provide only the normal member experience if the existing account is eligible for it; otherwise show a clear, safe message that system administration is available on the web app.

## 3. Authentication and backend integration

- Reuse the existing Tapasok user identities, login flow where technically appropriate, and permissions. A mobile user must not need a separate account.
- Audit whether the current authentication relies on browser cookies, Next.js server actions, or other browser-only assumptions. Choose a secure mobile-compatible authentication approach based on the actual code.
- Never store passwords or long-lived secrets in plain text. Use an appropriate secure token/session storage approach supported by Expo, such as `expo-secure-store`, if token-based auth is needed.
- Do not invent a new authentication protocol or weaken the current one. If backend work is needed, document it and implement only a secure, compatible approach.
- Use a single typed API client with a configurable base URL via Expo public environment configuration, e.g. `EXPO_PUBLIC_API_BASE_URL`. Only public configuration belongs in `EXPO_PUBLIC_*`; never put secrets there.
- Ensure API requests handle expired sessions, unauthorized responses, network failures, and validation errors.
- Do not connect the app directly to PostgreSQL or Prisma from the device.
- Share validation and business rules where practical, but do not import server-only code into the Expo bundle.

## 4. Recommended technical direction

First inspect the repository and choose compatible stable versions based on the existing project. Prefer:

- React Native with Expo and TypeScript.
- Expo Router for navigation if appropriate.
- React Hook Form and the existing compatible validation library, if suitable.
- A typed API/data-fetching layer with consistent loading/error handling.
- Expo Camera or a currently supported Expo QR-scanning approach.
- Expo SecureStore if token storage is required by the selected auth architecture.
- A small, consistent design-token system for colors, spacing, type, radius, and shadows.

Avoid installing unnecessary dependencies. Keep Expo and React Native versions compatible; use Expo's recommended install commands for native packages.

## 5. UI/UX prompt — create a polished, app-like experience

The UI/UX should feel like a thoughtfully designed modern mobile app, not a web dashboard squeezed onto a phone.

### Visual direction

- Mobile-first, clean, calm, and professional, appropriate for a campus organization platform.
- Use a light neutral background, white or subtly elevated surfaces, dark readable text, and a restrained purple accent that fits the Tapasok web design.
- Use consistent typography, spacing, rounded cards, subtle separators, and restrained shadows.
- Use safe-area insets and account for the status bar, bottom navigation, keyboard, and device cutouts.
- Respect platform conventions for touch targets, scrolling, gestures, and keyboard behavior.
- Use a consistent icon family and clear labels. Avoid emoji as primary navigation icons.
- Keep screens breathable, but do not waste space with oversized headers, giant empty areas, or excessive cards.
- Use a clear hierarchy: screen title, concise context, primary action, then supporting information.
- Use small, purposeful transitions only where they improve feedback. Avoid flashy animation.
- Provide accessible contrast, readable font sizes, and clear focus/pressed/disabled states.

### Home screen

- Show a concise personalized greeting and a compact summary of what matters now.
- Prioritize the next upcoming event, attendance/check-in when relevant, and the latest useful announcement.
- Offer no more than a few quick actions.
- Avoid fake metrics, placeholder statistics, decorative charts, and duplicated information.
- Every item shown must come from real backend data or be omitted.

### Events

- Use clean event list cards with the title, date/time, organization, and status where available.
- Make the whole card an obvious tap target and provide a clear event details screen.
- Clearly distinguish upcoming, ongoing, and past events without visual clutter.
- Show check-in actions only when permitted by the actual event/session rules.

### QR scanner

- Make the scan screen focused, easy to use, and permission-aware.
- Include a clear camera preview, a visible scan frame, concise instructions, and a distinct scanning/loading/success/error state.
- Ask for camera permission in context. If denied or unavailable, explain how to resolve it and offer a retry where appropriate.
- Stop camera resources when leaving the screen and prevent duplicate scans.
- Do not display a fake camera preview or claim a scan succeeded before server confirmation.

### Account and personal records

- Use a clean grouped list for profile, My Organizations, My Fees & Payments, notifications, and sign-out.
- Keep personal fee/payment records separate from organization-wide finance tools.
- Make the signed-in account and organization context clear.
- Use confirmation for consequential actions such as sign-out if appropriate, and never use confirmation dialogs for every minor action.

### Forms and feedback

- Use proper native text inputs, date pickers, dropdowns, and keyboard types where appropriate.
- Clearly mark required fields and show validation messages next to the relevant input.
- Keep forms short and divide genuinely complex workflows into sensible steps.
- Disable submission only when necessary and explain why. Show progress during submission and clear success/error feedback.
- Prevent accidental double submission.

### Design consistency

Create reusable components for buttons, fields, cards, list rows, badges/status labels, loading skeletons, empty states, error states, and confirmation sheets/dialogs. Define shared design tokens instead of styling every screen independently.

Do not make every item a card. Use compact lists and section headings when they work better. Avoid cluttered dashboards, excessive gradients, oversized pill buttons, arbitrary color use, inconsistent radii, and generic template-like screens.

## 6. Responsive behavior and platform details

- Test on both iOS and Android through Expo where available.
- Ensure the layout works on smaller phones and larger devices.
- Handle keyboard overlap and scrolling in forms.
- Use native-feeling status bar, safe area, back navigation, and bottom tabs.
- Request only permissions the app actually needs; camera access is for QR attendance scanning.
- Do not request GPS/location permission. Tapasok attendance uses event/session QR codes, not geolocation.

## 7. Data safety and permissions

- Keep existing backend authorization and organization-scoped permissions authoritative.
- Do not trust role names, organization IDs, event IDs, payment amounts, or attendance eligibility supplied by the client.
- Do not expose other members' private data to ordinary members.
- Do not allow members to access admin-only data by guessing API routes.
- Do not place real credentials or private student/payment data in source control, sample files, logs, or screenshots.
- Use fake/test accounts and data for testing.
- Preserve historical records and existing web app behavior.

## 8. Testing and acceptance criteria

Before considering the mobile app complete:

- Web app still builds and works as before.
- Mobile app starts with Expo using documented commands.
- Sign-in/sign-out works with the existing backend and account system.
- A signed-in member can view relevant events and details.
- QR scanning requests camera permission correctly and handles success, denial, and errors.
- Personal organizations, fees/payment status, announcements, and notifications load from real backend data where supported.
- Unauthorized API calls are rejected server-side.
- Loading, empty, offline, and error states are implemented.
- No database reset or destructive migration was performed.
- No secret is embedded in the mobile bundle.
- No System Admin mobile screens or system-wide admin navigation exist.
- Each non-admin role sees only essential mobile features allowed by existing permissions.
- Run the available lint, type-check, tests, and Expo checks.
- Document setup, required environment variables, API/backend changes, and how to run on a device.

Do not claim device camera testing unless it was actually tested on a device or simulator with camera support. If a backend gap blocks a feature, explain the gap instead of faking the feature.

## 9. Work sequence

1. Audit the current repository, backend, authentication, and permissions.
2. Propose the app structure and identify API gaps.
3. Create the separate Expo app directory.
4. Implement the mobile design system and navigation shell.
5. Implement authentication and typed API integration.
6. Implement the highest-priority member workflows.
7. Add only minimal role-specific manager features if justified.
8. Test web compatibility and mobile behavior.
9. Document setup and remaining limitations.

Keep the implementation focused. The goal is a small, reliable, polished companion app that reuses Tapasok's existing backend—not a second copy of the entire web system.
