import { redirect } from "next/navigation";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, Page, PageHeader, secondaryButton, Table, Td } from "@/components/shared/ui";
import { requireUser } from "@/lib/auth/dal";
import { canOrgAnywhere, canSystem } from "@/lib/permissions";
import { formatDate, formatDateTime, formatPeso } from "@/lib/format";
import { attendanceSummary, consequenceSummary, financeSummary, systemReport } from "@/features/reports/queries";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

export default async function ReportsPage() {
  const user = await requireUser();
  const sys = canSystem(user, "reports.system");
  const att = canOrgAnywhere(user, "reports.attendance");
  const con = canOrgAnywhere(user, "reports.consequences");
  const fin = canOrgAnywhere(user, "reports.finance");
  if (!sys && !att && !con && !fin) redirect("/dashboard");

  const [system, attendance, consequences, finance] = await Promise.all([
    sys ? systemReport() : null, att ? attendanceSummary(user) : null, con ? consequenceSummary(user) : null, fin ? financeSummary(user) : null,
  ]);

  return (
    <Page>
      <PageHeader title="Reports" subtitle="Summaries you are authorized to see." />

      {system && (
        <section aria-labelledby="sys" className="flex flex-col gap-4">
          <h2 id="sys" className="font-medium">System overview</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card title="Users"><p className="text-2xl font-semibold">{system.users}</p><p className="text-xs text-muted">{system.activeUsers} active</p></Card>
            <Card title="Students"><p className="text-2xl font-semibold">{system.students}</p></Card>
            <Card title="Active organizations"><p className="text-2xl font-semibold">{system.organizations}</p></Card>
            <Card title="Active memberships"><p className="text-2xl font-semibold">{system.memberships}</p></Card>
            <Card title="Events"><p className="text-2xl font-semibold">{system.events}</p></Card>
          </div>
          <Card title="Recent activity (audit log)">
            {system.recent.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
              <Table head={["When", "Who", "Action"]}>
                {system.recent.map((r) => <tr key={r.id}><Td>{formatDateTime(r.createdAt)}</Td><Td>{r.actor ? `${r.actor.firstName} ${r.actor.lastName}` : "—"}</Td><Td>{r.action}</Td></tr>)}
              </Table>
            )}
          </Card>
        </section>
      )}

      {attendance && (
        <section aria-labelledby="att" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="att" className="font-medium">Attendance by event</h2>{/* Downloads a file from a route handler; client-side <Link> navigation does not apply. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className={secondaryButton} href="/reports/export/attendance">Export CSV</a></div>
          {attendance.length === 0 ? <EmptyState title="No published events yet" /> : (
            <Table head={["Event", "Organization", "Date", "Sessions", "Present", "Late", "Absent", "Excused", "Attendance rate"]}>
              {attendance.map((e) => <tr key={e.id}><Td>{e.title}</Td><Td>{e.org}</Td><Td>{formatDate(e.startsAt)}</Td><Td>{e.sessions}</Td><Td>{e.present}</Td><Td>{e.late}</Td><Td>{e.absent}</Td><Td>{e.excused}</Td><Td>{e.rate === null ? "—" : `${e.rate}%`}</Td></tr>)}
            </Table>
          )}
        </section>
      )}

      {consequences && (
        <section aria-labelledby="con" className="flex flex-col gap-3">
          <h2 id="con" className="font-medium">Consequences</h2>
          {consequences.length === 0 ? <EmptyState title="No consequences recorded" /> : (
            <Table head={["Organization", "Pending", "Completed", "Waived"]}>
              {consequences.map((c) => <tr key={c.org}><Td>{c.org}</Td><Td>{c.pending}</Td><Td>{c.completed}</Td><Td>{c.waived}</Td></tr>)}
            </Table>
          )}
        </section>
      )}

      {finance && (
        <section aria-labelledby="fin" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="fin" className="font-medium">Fees and collections</h2>{/* Downloads a file from a route handler; client-side <Link> navigation does not apply. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className={secondaryButton} href="/reports/export/finance">Export CSV</a></div>
          {finance.length === 0 ? <EmptyState title="No fees yet" /> : (
            <Table head={["Fee", "Organization", "Assigned", "Due", "Collected", "Outstanding"]}>
              {finance.map((f) => <tr key={f.id}><Td>{f.name}</Td><Td>{f.org}</Td><Td>{f.assigned}</Td><Td>{formatPeso(f.due.toString())}</Td><Td>{formatPeso(f.collected.toString())}</Td><Td>{formatPeso(f.outstanding.toString())}</Td></tr>)}
            </Table>
          )}
        </section>
      )}
    </Page>
  );
}
