import "server-only";
import Link from "next/link";
import { ModalFrame } from "@/components/shared/modal";
import { Badge, primaryButton } from "@/components/shared/ui";
import { formatDateTime } from "@/lib/format";
import { academicTree } from "@/features/academic/service";
import { ROLE_LABEL } from "@/features/auth/roles";
import { ImportForm } from "@/features/students/student-forms";
import { getUserForAdmin } from "./queries";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPES, type AccountType } from "./types";
import { UserForm } from "./user-form";

// Dialogs for User Management, opened from the list through ?new=, ?import=, ?view=<id> and ?edit=<id>. Only reachable on
// pages that already require users.manage, and every query below checks it again (getUserForAdmin). Passwords, hashes and
// tokens are never loaded.

type FullUser = NonNullable<Awaited<ReturnType<typeof getUserForAdmin>>>;

export const typeOf = (u: FullUser): AccountType => (u.studentProfile ? "STUDENT" : u.staffProfile ? "STAFF" : "ACCOUNT_ONLY");

/** Values the account form starts from for an existing person. */
export function userFormValues(user: FullUser) {
  const sp = user.studentProfile;
  const st = user.staffProfile;
  const dept = sp?.program?.department;
  return {
    userId: user.id, type: typeOf(user), firstName: user.firstName, lastName: user.lastName, email: user.email,
    middleName: sp?.middleName ?? st?.middleName ?? null,
    contactNumber: sp?.contactNumber ?? st?.contactNumber ?? null,
    studentNumber: sp?.studentNumber, programId: sp?.programId ?? null, yearLevel: sp?.yearLevel ?? null, rfidUid: sp?.rfidUid ?? null,
    streetAddress: sp?.streetAddress ?? null, regionCode: sp?.regionCode ?? null, provinceCode: sp?.provinceCode ?? null,
    cityCode: sp?.cityCode ?? null, barangayCode: sp?.barangayCode ?? null, hasPhoto: !!sp?.photoKey,
    collegeId: st?.collegeId ?? dept?.collegeId ?? null, departmentId: st?.departmentId ?? dept?.id ?? null,
    employeeId: st?.employeeId, jobTitle: st?.jobTitle ?? null,
  };
}

export async function NewAccountModal({ type, closeHref }: { type?: string; closeHref: string }) {
  const tree = await academicTree();
  const initialType = (ACCOUNT_TYPES as readonly string[]).includes(type ?? "") ? (type as AccountType) : "STUDENT";
  return (
    <ModalFrame title="New account" description="One account per person. Positions are added afterwards, per organization." size="lg" closeHref={closeHref}>
      <UserForm tree={tree} initialType={initialType} />
    </ModalFrame>
  );
}

export function ImportModal({ closeHref }: { closeHref: string }) {
  return (
    <ModalFrame title="Import accounts from CSV" description="Required: first_name, last_name, email, plus student_number (students) or employee_id (staff). Imports never create administrators or assign positions." size="lg" closeLabel="Close" closeHref={closeHref}>
      <ImportForm />
    </ModalFrame>
  );
}

export async function EditAccountModal({ userId, closeHref }: { userId: string; closeHref: string }) {
  const [user, tree] = await Promise.all([getUserForAdmin(userId), academicTree()]);
  if (!user) return null;
  return (
    <ModalFrame title="Edit account" description={`${user.firstName} ${user.lastName} · ${ACCOUNT_TYPE_LABEL[typeOf(user)]}`} size="lg" closeHref={closeHref}>
      <UserForm tree={tree} values={userFormValues(user)} />
    </ModalFrame>
  );
}

const STATUS = { ACTIVE: ["green", "Active"], INVITED: ["amber", "Awaiting setup"], DISABLED: ["red", "Deactivated"] } as const;

/** Read-only summary. Positions, status changes and administrator access live on the full record. */
export async function ViewAccountModal({ userId, editHref, closeHref }: { userId: string; editHref: string; closeHref: string }) {
  const user = await getUserForAdmin(userId);
  if (!user) return null;
  const sp = user.studentProfile;
  const st = user.staffProfile;
  const active = user.memberships.filter((m) => !m.endedAt);
  const [tone, statusLabel] = STATUS[user.status];
  const rows: [string, React.ReactNode][] = [
    ["Email", user.email],
    ["Account type", ACCOUNT_TYPE_LABEL[typeOf(user)]],
    ...(sp ? ([["Student number", sp.studentNumber], ["Program", sp.program?.name ?? "—"], ["Year level", sp.yearLevel ?? "—"], ["Contact number", sp.contactNumber ?? "—"]] as [string, React.ReactNode][]) : []),
    ...(st ? ([["Employee ID", st.employeeId], ["Job title", st.jobTitle ?? "—"], ["Contact number", st.contactNumber ?? "—"]] as [string, React.ReactNode][]) : []),
    ["Last sign-in", user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"],
    ["Created", formatDateTime(user.createdAt)],
  ];
  return (
    <ModalFrame title={`${user.firstName} ${user.lastName}`} description="Account details" size="md" closeLabel="Close" closeHref={closeHref}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tone}>{statusLabel}</Badge>
          {user.systemRole === "SYSTEM_ADMIN" && <Badge tone="purple">System administrator</Badge>}
        </div>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-muted">{k}</dt><dd className="break-words font-medium">{v}</dd></div>
          ))}
        </dl>
        <section aria-label="Organizations and positions">
          <h3 className="mb-2 text-sm font-semibold">Organizations and positions</h3>
          {active.length === 0 ? <p className="text-sm text-muted">Not a member of any organization.</p> : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {active.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                  <span className="font-medium">{m.organization.name}</span>
                  <Badge tone="purple">{m.title ? `${m.title} (${ROLE_LABEL[m.role]})` : ROLE_LABEL[m.role]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="flex flex-wrap gap-2">
          <Link href={editHref} scroll={false} className={primaryButton}>Edit account</Link>
          <Link href={`/users/${user.id}`} className="inline-flex items-center rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium shadow-sm hover:border-primary/40 hover:bg-sidebar">Open full record: positions &amp; access</Link>
        </div>
      </div>
    </ModalFrame>
  );
}
