# Tapasok Web App --- UI/UX and Technical Specification

## 1. Purpose

Build the **Tapasok web application first**. This document defines the
initial web architecture, UI/UX direction, core screens, and
backend/database expectations. The uploaded SINIW dashboard image is a
visual reference for layout and dashboard density only; do not copy its
branding, labels, or business-specific metrics.

Tapasok is a school/college organization management system for system
administrators and organization users such as presidents, treasurers,
other officers, advisers, and members. The system includes organization
management, events, QR-code attendance scanning, consequences, event
evaluation, announcements, documents, fees, and reports.

This specification is for the **web application only**. A mobile app may be considered in a later phase, but do not create its project, folders, or dependencies now. Keep business logic and database access on the server so future expansion remains possible.

## 2. Technology Stack

### Web

-   **Next.js** --- primary web framework
-   **React** --- UI components
-   **TypeScript** --- application language
-   **Tailwind CSS** --- suggested styling system
-   **A component library** such as shadcn/ui --- optional, for
    accessible base components
-   **Vite** --- optional only if a separate React SPA is explicitly
    needed; it is not required inside the Next.js app

### Backend and data

-   **PostgreSQL** --- primary database
-   **Node.js + TypeScript API** --- recommended shared backend, or a
    Next.js server/API layer if the project is simpler
-   A server-side database access layer such as Prisma, Drizzle, or
    parameterized SQL
-   Version-controlled database migrations
-   Server-side input validation and authorization

### Scope note

-   No mobile framework or separate Vite SPA is needed for this phase.
-   A future mobile client, if approved, must use the same server-side API and must never connect directly to PostgreSQL.

## 3. Visual Inspiration and Design Direction

Use the uploaded dashboard screenshot as inspiration for the following:

-   A persistent, light-gray left sidebar with icons and grouped
    navigation
-   A compact user/profile block near the top of the sidebar
-   A clear page heading with a short explanatory subtitle
-   Small top-right utility actions and a date/period filter when
    relevant
-   A row of pastel summary cards
-   Clean charts and data visualizations below the summary cards
-   Generous whitespace, subtle borders, soft corner radii, and
    restrained shadows
-   A muted, professional color palette with dark text and a strong blue
    accent

Do **not** copy the reference product's logo, company name, labels,
business metrics, or exact screen. Adapt the visual style to Tapasok's
organization-management use cases.

### Suggested Tapasok visual tokens

-   App background: very light cool gray
-   Sidebar: pale gray or white
-   Main content: white or near-white surfaces
-   Primary accent: confident blue
-   Success: muted green
-   Warning: muted amber
-   Error: muted red
-   Main text: deep charcoal/navy
-   Secondary text: cool gray
-   Cards: rounded corners, subtle border, restrained shadow
-   Typography: readable sans-serif with clear heading/body hierarchy

Keep colors accessible and maintain sufficient contrast. Use icons
consistently and do not rely on color alone to communicate status.

## 4. Web App Navigation

Use role-aware navigation: show each user only the sections permitted by
their access level.

Suggested primary sidebar:

``` text
Tapasok
├── Dashboard
├── Organizations
│   ├── All Organizations (system admin)
│   ├── My Organization(s)
│   ├── Members
│   └── Officers & Advisers
├── Events
├── Attendance
│   ├── Attendance Records
│   └── QR Scanner
├── Consequences
├── Event Evaluations
├── Announcements
├── Documents
├── Fees & Payments
├── Reports
└── Settings
```

Potential role behavior: - **System admin:** system-wide organization
and account management, approvals, reports, settings - **President:**
own organization's members, officers, events, announcements, attendance,
and organization reports - **Treasurer:** assigned fees, payment
records, and financial reports - **Other officer:** only assigned
modules/permissions - **Adviser:** oversight, review, and approvals
according to policy - **Member:** personal attendance, event
information, announcements, evaluations, and own fee/consequence records
as allowed

Do not treat these examples as finalized permissions. Define the actual
permission matrix with the project owner/instructor and enforce it on
the server.

## 5. Main Web Screens

### 5.1 Login

-   Tapasok logo/name
-   Email or configured identifier and password
-   Clear validation errors
-   Loading and failure states
-   Accessible form labels
-   Optional password visibility toggle
-   Secure session handling

### 5.2 Dashboard

Follow the reference image's overall structure while adapting its
contents to Tapasok.

**Header** - Greeting, e.g. "Welcome back" - Current role/organization
context - Short summary such as "Monitor organization activities and
attendance." - Relevant action button, such as "Create event" or "Scan
attendance" - Date range filter only where it affects the displayed data

**Summary cards** (adapt to role) - Total organizations (system admin) -
Active members - Upcoming events - Attendance rate - Pending
consequences or approvals - Outstanding fees (treasurer/authorized
roles)

Display only the most relevant 3--4 cards for the current role. Do not
show financial or sensitive data to users without permission.

**Analytics area** - Attendance trends over time - Event participation
by event or organization - Member growth or active-member distribution -
Event evaluation summary - Fee collection chart, only for authorized
financial roles

**Recent activity** - Recent events - Latest attendance scans - Pending
approvals/consequences - Recent announcements

Use useful empty states when no data exists; do not fabricate real
metrics. Seed data may be used only in clearly marked development/demo
mode.

### 5.3 Organizations

-   Searchable, filterable organization list
-   Organization name, status, college/program association if applicable
-   View organization details
-   Manage officers, advisers, and members according to permission
-   Create/edit/archive organization where authorized

### 5.4 Members and designations

-   Member list with search and filters
-   Profile and membership status
-   Organization designation and term, if tracked
-   Add/remove members with confirmation
-   Keep a history of past officer/member assignments where required

### 5.5 Events

-   List, calendar, and detail views
-   Create/edit event form
-   Date, time, venue, organizer, status, and attendance window
-   Link event to the organization
-   Show event attendance and evaluation status
-   Restrict actions by role and organization scope

### 5.6 Attendance records

-   Table with member, event, timestamp, attendance source, and status
-   Filters by event, date, organization, and source
-   Search and pagination
-   Export only for authorized users
-   Duplicate-scan and invalid-scan feedback

### 5.7 QR Scanner

-   Dedicated scanner page with clear permission and camera states
-   Scan QR code using supported browser camera APIs
-   Validate the QR payload on the backend
-   Show prominent success, duplicate, expired, and invalid states
-   Show attendee/event details only as permitted
-   Provide a manual fallback only if project rules allow it
-   Never trust the QR payload alone; validate event, token, time
    window, and authorization server-side
-   If the existing scanner hardware/session flow is retained, integrate
    it with the same attendance service

### 5.8 Consequences

-   Rules list and rule details
-   Consequence records, status, assigned person, reason, and relevant
    event/attendance reference where appropriate
-   Authorized review and status updates
-   Clear audit history for changes
-   Protect sensitive details from unauthorized roles

Preserve the existing concepts represented by `consequence_rules`,
`consequence_statuses`, and `student_consequences` until their existing
behavior is reviewed.

### 5.9 Event evaluations

-   Create/manage evaluation forms
-   Question and option editor
-   Event association
-   Response status and submission workflow
-   Aggregate results and charts
-   Restrict access to individual responses if required

Preserve and inspect the existing evaluation tables before changing
their relationships.

### 5.10 Announcements and documents

-   Organization-scoped announcements
-   Draft/published states if needed
-   File metadata, upload/download permissions, and event/organization
    associations
-   Clear empty and error states

### 5.11 Fees and payments

-   Fee types and assigned fees
-   Payment status, date, reference, and method
-   Treasurer/authorized financial views and reports
-   Do not implement payment-gateway processing unless explicitly
    required

### 5.12 Reports and settings

-   Attendance, event participation, consequences, evaluations, and
    financial reports as allowed
-   Profile and notification settings
-   Organization-specific settings
-   System settings restricted to administrators

## 6. Dashboard Layout Sketch

``` text
┌──────────────────────┬──────────────────────────────────────────────────┐
│ TAPASOK              │ Welcome back, [User]                [Action]      │
│ [Avatar / Role]      │ Monitor your organizations and activities.        │
│                      │                                                   │
│ Search navigation    │ [Date range / Organization filter]                │
│                      │                                                   │
│ Dashboard            │ [Summary card] [Summary card] [Summary card]      │
│ Organizations        │                                                   │
│ Events               │ [Attendance chart]     [Participation chart]      │
│ Attendance           │                                                   │
│  └ QR Scanner        │ [Recent activity]       [Upcoming events]         │
│ Consequences         │                                                   │
│ Evaluations          │                                                   │
│ Announcements        │                                                   │
│ Fees & Payments      │                                                   │
│ Reports              │                                                   │
│ Settings             │                                                   │
└──────────────────────┴──────────────────────────────────────────────────┘
```

The layout should adapt to smaller screens, collapse the sidebar on
narrow viewports, and maintain usable tables and scanner controls.

## 7. Clean, Professional Web Project Structure

Build **one web application with Next.js**. Do not create an `apps/mobile/`, Expo, or React Native project at this stage. Keep the structure feature-based so each module is easy to maintain without creating unnecessary abstractions.

```text
tapasok/
├── public/
│   ├── images/
│   └── icons/
│
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/
│   │   │       └── page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── admin/
│   │   │   ├── president/
│   │   │   ├── treasurer/
│   │   │   ├── officer/
│   │   │   ├── adviser/
│   │   │   └── member/
│   │   ├── api/                  # Next.js route handlers, if needed
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── ui/                   # Reusable base components
│   │   ├── layout/               # Sidebar, topbar, page header
│   │   ├── navigation/
│   │   ├── dashboard/
│   │   └── shared/               # Reusable tables, dialogs, states
│   │
│   ├── features/
│   │   ├── organizations/
│   │   ├── members/
│   │   ├── events/
│   │   ├── attendance/
│   │   ├── rfid/
│   │   ├── consequences/
│   │   ├── evaluations/
│   │   ├── announcements/
│   │   ├── documents/
│   │   ├── fees/
│   │   └── reports/
│   │
│   ├── lib/
│   │   ├── auth/
│   │   ├── database/
│   │   ├── permissions/
│   │   ├── validation/
│   │   └── utils.ts
│   ├── hooks/
│   ├── types/
│   └── config/
│
├── prisma/                       # Only if Prisma is selected
│   ├── schema.prisma
│   └── migrations/
├── tests/
├── .env.example
├── .gitignore
├── components.json               # If using shadcn/ui
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

### Directory responsibilities

- **`src/app/`** defines routes, layouts, loading/error states, and route handlers. Use route groups such as `(auth)` and `(dashboard)` to organize pages without adding those group names to URLs.
- **`src/components/`** contains reusable interface components. Keep components generic here; feature-specific components should live with their feature when they are not reused elsewhere.
- **`src/features/`** groups each module's feature-specific components, schemas, actions, and business logic. Add subfolders only when a feature grows enough to need them.
- **`src/lib/`** contains shared infrastructure such as database access, authentication helpers, permission checks, and validation utilities.
- **`src/hooks/`, `src/types/`, and `src/config/`** hold shared React hooks, TypeScript types, and application configuration.
- **`prisma/`** is used only if Prisma is chosen. If another database access tool is selected, use its appropriate schema/migration convention instead.
- **`tests/`** contains automated tests for critical flows and permission boundaries.

### Architecture rules

1. **Web only for this phase.** Do not add mobile app folders, Expo configuration, React Native dependencies, or a separate Vite app.
2. **Use one backend approach.** For this project's scope, Next.js server components, server actions, and/or route handlers can handle server-side work. Add a separate API service only if there is a clear requirement; do not build two competing backend layers.
3. **Enforce permissions on the server.** Hiding a page or sidebar link is not authorization. Every protected operation must verify the user's role and organization scope on the server.
4. **Keep database access server-side.** Never expose database credentials or connect directly to PostgreSQL from browser code.
5. **Keep features cohesive.** For example, QR and RFID scanning should use the same attendance domain/service and attendance records, while keeping their device-specific logic separated.
6. **Avoid premature abstraction.** Do not create empty files or deeply nested folders for every possible future feature. Add structure as implementation requires it.
7. **Inspect the existing database first.** Map the current tables, columns, foreign keys, and constraints before adding or renaming tables.
8. **Future mobile support is a later phase.** Keep business rules and data access on the server so a future mobile client can use the same backend, but do not create that app now.


## 8. Existing Database Concepts to Preserve

Table names visible in the existing database screenshot:

-   Accounts: `users`, `user_types`, `personal_access_tokens`,
    `push_tokens`
-   Organization/academic: `organizations`, `designations`, `colleges`,
    `courses`, `school_years`, `address`
-   Events: `events`, `announcements`, `documents`
-   Attendance/scanning: `attendances`, `scanner_devices`,
    `scanner_sessions`
-   Consequences: `consequence_rules`, `consequence_statuses`,
    `student_consequences`
-   Evaluation: `event_evaluations`, `evaluation_questions`,
    `evaluation_question_options`, `evaluation_answers`,
    `evaluation_responses`
-   Fees: `student_fees`, `fee_types`, `payment_methods`

These names are based on the screenshot; columns, constraints, and
relationships remain unverified.

### Proposed schema decisions to verify

-   Reuse `designations` if it already defines organization roles.
-   Add `organization_members` only if no existing relationship table
    connects users, organizations, and designations.
-   Add `semesters` only if academic-period tracking is needed and not
    already represented.
-   Determine whether `courses` means degree programs or individual
    subjects before adding `programs`.
-   Add QR token/session tables only if the current attendance/scanner
    tables do not support the required workflow.
-   Preserve consequences and evaluation functionality; inspect foreign
    keys before redesigning these tables.

## 9. Backend and API Expectations

The web app should use server-side functions or an authenticated API for
all sensitive operations.

Example route groups: - `/api/auth` - `/api/organizations` -
`/api/members` - `/api/events` - `/api/attendance` -
`/api/attendance/scan` - `/api/consequences` - `/api/evaluations` -
`/api/announcements` - `/api/documents` - `/api/fees` - `/api/reports`

Every endpoint must validate input, authenticate the user, check
permissions and organization scope, and return consistent errors. QR
attendance should be validated server-side and protected against
duplicate submissions.

## 10. Data Visualization Guidance

Inspired by the reference screenshot: - Use summary cards for
role-relevant KPIs. - Use bar charts for attendance by month/event. -
Use line charts for attendance trends. - Use a donut chart for
participation/status breakdown only when it communicates useful
information. - Place recent activity and upcoming events below the
primary analytics. - Label units, time periods, and chart legends
clearly. - Provide accessible text summaries or tables for charts. -
Show loading, empty, and error states. - Never show fabricated metrics
as live data.

## 11. Responsive Behavior and Accessibility

-   Desktop: persistent sidebar and multi-column dashboard.
-   Tablet: narrower/collapsible sidebar and responsive card grid.
-   Mobile browser: drawer navigation, stacked cards, horizontally
    scrollable data tables only when needed.
-   Keyboard-accessible navigation, forms, dialogs, and scanner
    controls.
-   Visible focus states, labels, contrast, and meaningful status text.
-   Request camera permission only when the user opens the QR scanner.
-   Handle camera denial and unsupported browsers with clear fallback
    messaging.

## 12. Security Requirements

-   Keep database credentials server-side.
-   Enforce authorization on the backend, not only by hiding UI
    elements.
-   Scope organization users to their authorized organization(s).
-   Validate QR tokens, event windows, and scanner/device access.
-   Prevent duplicate attendance through transactional server-side logic
    and database constraints where appropriate.
-   Protect personal, evaluation, consequence, and financial
    information.
-   Use foreign keys, indexes, migrations, and appropriate audit
    history.
-   Do not delete historical records casually.

## 13. Web-First Implementation Roadmap

1.  Confirm the instructor's required features and inspect old database
    relationships.
2.  Create the Next.js + React + TypeScript web project.
3.  Establish PostgreSQL access, migrations, and authentication.
4.  Build the shared dashboard shell: sidebar, topbar, page header,
    responsive layout.
5.  Implement users, roles, organizations, designations, and membership.
6.  Implement events, announcements, and documents.
7.  Implement attendance records and QR scanning.
8.  Implement consequences and event evaluation.
9.  Implement fees/payments and reports if required.
10. Test permission boundaries, duplicate scans, empty/loading/error
    states, and responsiveness.
11. Deploy the web app and document setup.
12. Document the server-side interfaces so a separate mobile app can be considered later; do not build it in this phase.

## 14. Open Questions

-   Which modules are mandatory for the instructor's project?
-   What are the actual columns and foreign keys in the existing tables?
-   How is QR attendance generated and scanned today?
-   Does `designations` represent organization positions?
-   Does `courses` represent degree programs or subjects?
-   Does a membership relationship table already exist?
-   Is the backend standalone or part of Next.js?
-   Is a separate Vite SPA truly needed?

------------------------------------------------------------------------

**Document status:** Web-first specification and UI/UX direction. The
reference image is used for general layout inspiration only. Confirm
existing schema and project requirements before implementing schema
changes.
