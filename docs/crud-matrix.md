# CRUD audit matrix

Legend: **Yes** = supported · **N/A** = does not make sense for the feature · **Restricted** = deliberately not offered (reason given).
"Org" means the permission is checked inside the specific organization that owns the record. Every operation is enforced in the
server action or query, not only in the UI. Roles are from `docs/permission-matrix.md`.

| Module | Create | Read | Update | Delete | Notes / who |
|---|---|---|---|---|---|
| School years, semesters | Yes (System Admin) | Yes (System Admin) | **Yes** (System Admin) | **Yes, only if unused** (System Admin) | Dates validated, semesters must stay inside their year. Delete is refused when any event, fee, enrollment or other record refers to it, and for the active term. Archiving is the normal path. |
| Colleges, departments, programs | Yes (System Admin) | Yes (selects for everyone) | **Yes** (System Admin) | **Yes, only if unused** + Archive/Restore | Unique code/name enforced. Database foreign keys are `RESTRICT`, so used entries can never be deleted. |
| Users / accounts | Yes (System Admin, CSV import) | Yes (System Admin; own profile for self) | Yes (System Admin; own profile) | Restricted | Deactivate/reactivate instead (keeps attendance, finance, audit history). |
| System admin privilege | Grant | Yes | Revoke | N/A | System Admin only; never self; last admin protected. |
| Organizations | Yes (System Admin) | Yes (members: their own; admin: all) | Yes (System Admin) | Restricted | Archive instead; all child records reference it. |
| Memberships and positions | Yes (President; System Admin) | Yes (roster rules by role) | Yes: change position (history kept) | Yes: end membership (history kept) | President/Adviser positions need a System Admin. |
| Join codes, join requests | Yes (President) | Yes | Revoke / approve / reject / cancel own | N/A | Hashed codes; one-time redemption. |
| Events | Yes (President, Secretary, Officer — Org) | Yes (members of the org; drafts hidden) | Yes (same; sessions lock after attendance) | **Yes, only unused drafts**; otherwise Cancel | Creator is recorded server-side and never changes on edit. |
| Event sessions | With the event | Yes | With the event; open/close; revoke QR | With the event (draft only) | Finalizing marks absences and applies attached rules. |
| Attendance | Check-in / manual entry (President, Secretary) | Own; org view for President, Secretary, Officer, Adviser | Correct / excuse with a reason (audited) | Restricted | Attendance is a legal-style record: corrected, never deleted. |
| Obligations | Yes (President, Secretary, Officer — Org) | Own; org view incl. Adviser | **Yes** while open (managers); member submits progress | Cancel (keeps the record) | Never creates a consequence. |
| Consequence rules | Yes (President) | Yes | Restricted | Activate/Deactivate | Not editable so past consequences keep the meaning of the rule they used; create a new rule instead. |
| Consequences | Manual record or via attached rule | Own; org view | Status: complete / waive (President) | Restricted (Cancel via status) | History kept. |
| Fee types | Yes (President, Treasurer — Org) | Yes | **Yes** (already-assessed members keep their amount) | **Yes only if never assessed**; else Deactivate | Auditor/Adviser can view. |
| Assessments (student fees) | Assess all / one member | Own; org ledger | Adjust (waiver/discount/surcharge, audited) | Restricted | Ledger entries are never deleted. |
| Payments | Record cash; members submit proof | Own; org list | Verify / reject | **Void** (kept in history) | President, Treasurer for management; submitter sees own proof. |
| Announcements | Yes (President, Secretary — Org) | Yes (audience-filtered) | Yes (incl. publish/unpublish) | **Yes** (President, Secretary — Org) | Sent notifications remain. |
| Documents | Upload (President, Secretary — Org) | Members of the org | **Yes** (title, description, category) | Soft remove (kept for audit) | Members cannot upload. |
| Evaluations | Yes (President, Secretary, Officer) | Members; results to overseers | Status, add/remove questions | Delete question; evaluation kept | Responses are immutable. |
| RFID devices | Register (President, Secretary) | Yes | N/A | Revoke | Key shown once; stored hashed. |
| Notifications | System generated | Own | Mark read | N/A | |
| Settings | N/A | Yes | Own profile/password; System Admin system settings | N/A | |
| Reports | N/A | Yes (by role) | N/A | N/A | Read-only exports. |

Where a gap was found in this audit and closed: academic update + safe delete, fee-type update/deactivate/delete,
obligation update, announcement delete, draft-event delete, document edit.
