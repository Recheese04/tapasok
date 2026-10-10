import { Badge, Page, PageHeader } from "@/components/shared/ui";
import { db } from "@/lib/database/client";
import { requireUser } from "@/lib/auth/dal";
import { canSystem } from "@/lib/permissions";
import { ROLE_LABEL } from "@/features/auth/roles";
import { getSettings } from "@/features/settings/system-settings";
import { PasswordForm, ProfileForm, SettingsSection, SystemSettingsForm } from "@/features/settings/forms";
import { StudentForm } from "@/features/students/student-forms";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function SettingsPage() {
  const user = await requireUser();
  const [profile, staff] = await Promise.all([
    db.studentProfile.findUnique({ where: { userId: user.id } }),
    db.staffProfile.findUnique({ where: { userId: user.id }, select: { employeeId: true, jobTitle: true } }),
  ]);
  const settings = canSystem(user, "settings.system") ? await getSettings() : null;
  const isAdmin = user.systemRole === "SYSTEM_ADMIN";
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();

  return (
    <Page>
      <PageHeader title="Profile & Settings" subtitle="Manage your personal details, your password and, where it applies, your student profile." />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
        {/* Who you are: read-only summary that never changes layout with the forms on the right. */}
        <aside className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card lg:sticky lg:top-24">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-xl font-semibold text-primary-foreground" aria-hidden="true">{initials || "?"}</span>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{user.firstName} {user.lastName}</p>
              <p className="truncate text-sm text-muted">{user.email}</p>
            </div>
          </div>
          <dl className="flex flex-col gap-3 border-t border-border pt-4 text-sm">
            <div>
              <dt className="text-muted">Account</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {isAdmin && <Badge tone="purple">System administrator</Badge>}
                {profile && <Badge tone="gray">Student</Badge>}
                {staff && <Badge tone="gray">Faculty / staff</Badge>}
                {!isAdmin && !profile && !staff && <Badge tone="gray">Account</Badge>}
              </dd>
            </div>
            {profile && <div><dt className="text-muted">Student number</dt><dd className="font-medium">{profile.studentNumber}</dd></div>}
            {staff && <div><dt className="text-muted">Employee ID</dt><dd className="font-medium">{staff.employeeId}{staff.jobTitle ? ` · ${staff.jobTitle}` : ""}</dd></div>}
            {!isAdmin && (
              <div>
                <dt className="text-muted">Organizations</dt>
                <dd className="mt-1">
                  {user.memberships.length === 0 ? <span className="text-muted">None yet. Join one from My Organizations.</span> : (
                    <ul className="flex flex-col gap-1.5">
                      {user.memberships.map((m) => (
                        <li key={`${m.organizationId}:${m.role}`} className="flex flex-col">
                          <span className="font-medium">{m.organizationName}</span>
                          <span className="text-xs text-muted">{m.title ? `${m.title} (${ROLE_LABEL[m.role]})` : ROLE_LABEL[m.role]}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          <SettingsSection title="Personal details" description="Your name as it appears to other people in Tapasok.">
            <ProfileForm firstName={user.firstName} lastName={user.lastName} email={user.email} />
          </SettingsSection>

          <SettingsSection title="Security" description="Choose a strong password you don't use anywhere else.">
            <PasswordForm />
          </SettingsSection>

          {profile && (
            <SettingsSection title="Student profile" description="Your contact details, photo and address. Your student number, name and program are managed by an administrator.">
              <StudentForm ownProfile student={{ ...profile, firstName: user.firstName, lastName: user.lastName, email: user.email }} />
            </SettingsSection>
          )}

          {settings && (
            <SettingsSection title="System settings" description="School-wide settings. Only system administrators can see and change these.">
              <SystemSettingsForm school={settings["school.name"]} grace={settings["attendance.late_grace_minutes"]} />
            </SettingsSection>
          )}
        </div>
      </div>
    </Page>
  );
}
