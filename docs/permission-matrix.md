# Tapasok role-permission matrix (implemented)

Source of truth in code: `src/lib/permissions/policy.ts` (one table of **capabilities**). Positions are bundles of capabilities:
code checks the capability, never a position's display name. Every page, query, server action and route handler checks it on
the server; sidebar visibility (`src/config/navigation.ts`) is cosmetic. `tests/permissions.test.ts` asserts this exact matrix
for every position, inside and outside the user's organization.

Rules: least privilege. Organization positions apply only inside the organization where they are held (one person can be
President of one and Member of another). **System Admin is a separate system-level flag, not an organization position, and has
no implicit access to organization modules.** Nothing (join codes, join requests, CSV imports, automatic academic mapping,
forms) can grant any position other than Member.

| Capability | Admin | President | Secretary | Treasurer | Auditor | Officer | Adviser | Member |
|---|---|---|---|---|---|---|---|---|
| User Management (students, faculty/staff, CSV import, positions), academic setup, organizations, system settings & report | Yes | - | - | - | - | - | - | - |
| Assign President / Adviser | Yes | - | - | - | - | - | - | - |
| Add / remove members; join codes | Yes | Yes | - | - | - | - | - | - |
| Designate officers (change a position among Member, Officer, Secretary, Treasurer, Auditor) | Yes | Yes | - | - | - | - | Yes | - |
| Join code (generate/revoke) | Yes | Yes | - | - | - | - | - | - |
| Review join requests (approve / reject, own organization only) | - | Yes | Yes | - | - | - | - | - |
| Request to join an organization; see the decision | - | - | - | - | - | - | - | Yes (any student) |
| Roster with emails | Yes | Yes | Yes | - | - | - | Yes | - |
| Names + student numbers only | - | Yes | Yes | Yes | Yes | Yes | Yes | - |
| View events / announcements / documents | - | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Create & edit events (sessions, venue, targets, rules) | - | Yes | Yes | - | - | Yes | - | - |
| Activate scanner, scan attendance (QR / ID), show check-in QR | - | Yes | Yes | - | - | Yes | - | - |
| Manual entry, corrections, **finalize sessions** | - | Yes | Yes | - | - | - | - | - |
| Excuse an absence | - | Yes | Yes | - | - | - | - | - |
| Register / revoke RFID terminals | - | Yes | Yes | - | - | - | - | - |
| Register, replace or remove a student's RFID card | Yes | - | - | - | - | - | - | - |
| View organization attendance / attendance report & CSV | - | Yes | Yes | - | - | Yes | Yes | - |
| Own attendance, obligations, consequences, fees | - | Yes | Yes | Yes | Yes | Yes | - (not an attendee or fee payer) | Yes |
| Check in by scanning the session QR | - | Yes | Yes | Yes | Yes | Yes | - | Yes |
| Post announcements (targeted); upload / remove documents | - | Yes | Yes | - | - | - | - | - |
| Document audit trail | - | Yes | - | - | - | - | Yes | - |
| Configure consequence rules, review / correct consequences | - | Yes | - | - | - | - | - | - |
| Waive a consequence | - | Yes | - | - | - | - | - | - |
| View organization consequences | - | Yes | Yes | - | - | Yes | Yes | - |
| Create & run evaluations; view aggregate results | - | Yes | Yes | - | - | Yes | results only | - |
| Submit an evaluation (must have attended) | - | Yes | Yes | Yes | Yes | Yes | - | Yes |
| Create/edit fees, assess, record cash, verify digital payments, adjust the ledger | - | Yes | - | Yes | - | - | - | - |
| View the organization ledger / finance report & CSV | - | Yes | - | Yes | Yes | - | Yes | - |
| Consequence report | - | Yes | - | - | - | - | Yes | - |
| Obligations: assign, verify, cancel | - | Yes | Yes | - | - | Yes | - | - |
| Obligations: view organization | - | Yes | Yes | - | - | Yes | Yes | - |

## Decisions where the specification gave no explicit rule
- **Positions are capability bundles.** Secretary: attendance, minutes/documents, announcements, join requests. Treasurer and President: all money.
  Auditor: read-only finance. Officer: events and scanning. **Adviser: read-only** oversight, with one approved exception: designating officers (rosters, attendance,
  obligations, consequences, evaluation results, finance and reports); the Adviser holds no capability that changes data, never
  scans attendance and is not assessed member fees. Waivers and excuses moved to the President (and Secretary for excuses).
  A test (`tests/role-rules.test.ts`) fails if any write capability is ever given to the Adviser.
- **Attendance, obligations and consequences are separate records.** An absence or an unfinished obligation never creates a consequence by itself; only a rule attached to the event, or an authorized manual record, does.
- **Advisers are not student attendees**, so they are never marked absent.
- **Fines are completed by payment**, not by hand; only community-service obligations are completed manually.
- Messaging between members is intentionally not part of the system (adviser's guidance); use announcements and notifications.
