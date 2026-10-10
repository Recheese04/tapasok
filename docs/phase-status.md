# Phase status against `tapasok-full-system-structure.md`

"Done" means implemented and covered by automated tests that ran. Items needing real hardware or external services are called out.

| Phase | Status | Notes |
|---|---|---|
| 1.1 Academic structure | Done | School years, semesters, active term, colleges > departments > programs, archive instead of delete. |
| 1.2 Organizations | Done | Scope (departmental / college / university / co-curricular), academic links, required official adviser. |
| 1.3 Student profiles & CSV | Done | Program + year level per semester, RFID UID, photo, PSGC address (live-verified), CSV with `program_code`, one-time setup links. |
| 2.1 Joining | Done | Automatic mapping (opt-in), join requests with decision + timestamp, join codes (extra pathway). |
| 2.2 Officer positions | Done | President, Secretary, Treasurer, Auditor, Officer, Adviser; permissions are capabilities. |
| 3.1 Event scheduling | Done | Sessions, cut-offs/grace, targets, term, venue, rules. |
| 3.2 Capture methods | A/B/C done in software | RFID endpoint exists and is tested with simulated requests; **real RC522/NodeMCU hardware not tested**. Session QR self check-in (revocable, session-bound, no GPS) tested. |
| 3.3 Closing & absences | Done | Atomic finalize, no duplicates, advisers/untargeted never marked absent, excuses/corrections audited. |
| 4 Evaluations | Done | Rating, Likert, choice, comment; per-event requirement; response rates; anonymous aggregates. |
| 5 Consequences | Done | Rules per session kind / whole day, automatic calculation, idempotent, excuse cancels, fines flow to the ledger. |
| 6 Finance | Done | Assessments, adjustments, receipts, cash + digital (proof upload, treasurer verification), history never deleted. |
| 7 Clearance | Removed from the UI | Pages, actions and nav removed; the tables and historical rows are kept. Replaced by member Obligations. |
| 8.1 Announcements | Done | Audience targeting, in-app notifications. Push notifications **not implemented** (needs a configured provider). |
| 8.2 Minutes & archives | Done | Categories, term, event link, access control, audit visibility. |
| 8.3 Direct/group communication | Intentionally omitted | Removed on the adviser's guidance (other platforms cover chat). |

Known gaps: no browser-level (UI) testing was performed; email delivery of setup links is manual; there is no rate limiting on login-adjacent endpoints beyond account lockout.
