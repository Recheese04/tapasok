import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { BarChart, DonutChart } from "@/components/shared/charts";
import { Icon } from "@/components/layout/icons";
import { ButtonLink, Card, Page, PageHeader, StatCard } from "@/components/shared/ui";
import { requireUser } from "@/lib/auth/dal";
import { canOrgAnywhere, canSystem } from "@/lib/permissions";
import { formatDateTime, formatPeso } from "@/lib/format";
import { adminDashboard, memberDashboard } from "@/features/dashboard/queries";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const ACTION_LABEL = (a: string) => a.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default async function DashboardPage() {
  const user = await requireUser();
  const greeting = `Welcome back, ${user.firstName}`;

  if (canSystem(user, "users.manage")) {
    const s = await adminDashboard();
    return (
      <Page>
        <PageHeader
          title={greeting}
          subtitle="System administration overview."
          actions={<><ButtonLink href="/users/new">+ New account</ButtonLink><ButtonLink href="/organizations/new" variant="secondary">+ New organization</ButtonLink></>}
        />
        <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Accounts" value={s.users} href="/users" icon={<Icon name="users" />} />
          <StatCard label="Students" value={s.students} href="/users?type=STUDENT" icon={<Icon name="academic" />} tone="blue" />
          <StatCard label="Active organizations" value={s.organizations} href="/organizations" icon={<Icon name="building" />} tone="green" />
          <StatCard label="Active term" value={s.term ? s.term.schoolYear.label : "Not set"} hint={s.term ? s.term.semester.name : "Set it under Academic Setup"} href="/academic" icon={<Icon name="calendar" />} tone="amber" />
        </section>
        <section className="grid gap-4 lg:grid-cols-3">
          <Card title="Accounts by status" className="lg:col-span-1">
            <DonutChart
              centerLabel="accounts"
              segments={[
                { label: "Active", value: s.active, color: "var(--success)" },
                { label: "Awaiting setup", value: s.awaitingSetup, color: "var(--warning)" },
                { label: "Deactivated", value: s.disabled, color: "var(--danger)" },
              ]}
            />
            {s.noAdviser > 0 && <p className="mt-4 text-sm text-warning">{s.noAdviser} organization{s.noAdviser === 1 ? "" : "s"} without an adviser. <Link href="/organizations" className="underline">Review</Link></p>}
          </Card>
          <Card title="Recent activity" className="lg:col-span-2">
            {s.recent.length === 0 ? <EmptyState title="No activity recorded yet" /> : (
              <ul className="divide-y divide-border text-sm">
                {s.recent.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <span><span className="font-medium">{ACTION_LABEL(a.action)}</span>{a.actor && <span className="text-muted"> · {a.actor.firstName} {a.actor.lastName}</span>}</span>
                    <time className="shrink-0 text-xs text-muted" dateTime={a.createdAt.toISOString()}>{formatDateTime(a.createdAt)}</time>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </Page>
    );
  }

  const d = await memberDashboard(user);
  const a = d.attendanceByStatus;
  const attendanceTotal = a.PRESENT + a.LATE + a.ABSENT + a.EXCUSED;
  const showMgmt = d.members !== null || d.pendingOrg !== null || d.orgOutstanding !== null || d.scansToday !== null || d.openObligationsOrg !== null;

  return (
    <Page>
      <PageHeader
        title={greeting}
        subtitle="Your activities and, where you hold a position, your organizations' numbers."
        actions={
          user.memberships.length === 0 ? <ButtonLink href="/organizations">+ Join an organization</ButtonLink>
          : <>
              <ButtonLink href="/attendance/scan">Scan attendance QR</ButtonLink>
              {canOrgAnywhere(user, "events.manage") && <ButtonLink href="/events/new" variant="secondary">+ Create event</ButtonLink>}
            </>
        }
      />
      {user.memberships.length === 0 ? (
        <EmptyState title="You are not in an organization yet" hint="Open My Organizations and enter a join code from an organization officer to get started." />
      ) : (
        <>
          <section aria-label="My summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Upcoming events" value={d.upcoming.length} href="/events" icon={<Icon name="calendar" />} />
            <StatCard label="Events attended" value={d.attended} href="/attendance" icon={<Icon name="check" />} tone="green" />
            <StatCard label="Pending obligations" value={d.myOpenObligations.length} href="/obligations" icon={<Icon name="task" />} tone="amber" />
            <StatCard label="Balance due" value={formatPeso(d.outstanding.toString())} href="/fees" icon={<Icon name="wallet" />} tone={d.outstanding.isZero() ? "green" : "red"} />
          </section>

          {showMgmt && (
            <section aria-label="Organization management" className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Organization management</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {d.members !== null && <StatCard label="Active members" value={d.members} href="/organizations/manage" icon={<Icon name="users" />} />}
                {d.openObligationsOrg !== null && <StatCard label="Open obligations" value={d.openObligationsOrg} href="/obligations/manage" icon={<Icon name="task" />} tone="amber" />}
                {d.pendingOrg !== null && <StatCard label="Pending consequences" value={d.pendingOrg} href="/consequences/manage" icon={<Icon name="alert" />} tone="red" />}
                {d.orgOutstanding !== null && <StatCard label="Outstanding fees" value={formatPeso(d.orgOutstanding.toString())} hint="Across your organizations" href="/fees/manage" icon={<Icon name="wallet" />} tone="red" />}
                {d.scansToday !== null && <StatCard label="Your check-ins today" value={d.scansToday} href="/events" icon={<Icon name="scan" />} tone="blue" />}
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                {d.checkinsByMonth && (
                  <Card title="Check-ins per month" className="lg:col-span-2">
                    {d.checkinsByMonth.every((m) => m.value === 0) ? <EmptyState title="No check-ins in the last six months" /> : <BarChart data={d.checkinsByMonth} label="Check-ins per month" />}
                  </Card>
                )}
                {d.orgCollected !== null && d.orgOutstanding !== null && (
                  <Card title="Collections" action={<Link href="/fees/manage" className="text-sm font-medium text-primary hover:underline">Open ledger</Link>}>
                    {d.orgCollected.isZero() && d.orgOutstanding.isZero() ? <EmptyState title="Nothing assessed yet" /> : (
                      <DonutChart
                        centerLabel="collected"
                        centerValue={formatPeso(d.orgCollected.toString())}
                        segments={[
                          { label: "Collected", value: Number(d.orgCollected.toString()), color: "var(--success)" },
                          { label: "Outstanding", value: Math.max(0, Number(d.orgOutstanding.toString())), color: "var(--warning)" },
                        ]}
                      />
                    )}
                  </Card>
                )}
              </div>
            </section>
          )}

          <section className="grid gap-4 lg:grid-cols-3">
            <Card title="My attendance" action={<Link href="/attendance" className="text-sm font-medium text-primary hover:underline">View all</Link>}>
              {attendanceTotal === 0 ? <EmptyState title="No attendance recorded yet" hint="Scan an event's QR code to check in." /> : (
                <DonutChart
                  centerLabel="records"
                  segments={[
                    { label: "Present", value: a.PRESENT, color: "var(--success)" },
                    { label: "Late", value: a.LATE, color: "var(--warning)" },
                    { label: "Absent", value: a.ABSENT, color: "var(--danger)" },
                    { label: "Excused", value: a.EXCUSED, color: "#8b93a7" },
                  ]}
                />
              )}
            </Card>
            <Card title="Upcoming events" action={<Link href="/events" className="text-sm font-medium text-primary hover:underline">All events</Link>}>
              {d.upcoming.length === 0 ? <EmptyState title="No upcoming events" /> : (
                <ul className="flex flex-col gap-3 text-sm">
                  {d.upcoming.map((e) => (
                    <li key={e.id}>
                      <Link className="font-medium text-primary hover:underline" href={`/events/${e.id}`}>{e.title}</Link>
                      <div className="text-xs text-muted">{e.organization.name} · {formatDateTime(e.startsAt)} · {e.venue}{e.status === "DRAFT" ? " · draft" : ""}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="My open obligations" action={<Link href="/obligations" className="text-sm font-medium text-primary hover:underline">View all</Link>}>
              {d.myOpenObligations.length === 0 ? <EmptyState title="Nothing pending" /> : (
                <ul className="flex flex-col gap-3 text-sm">
                  {d.myOpenObligations.map((o) => (
                    <li key={o.id}>
                      <span className="font-medium">{o.title}</span>
                      <div className="text-xs text-muted">{o.organization.name}{o.dueAt ? ` · due ${formatDateTime(o.dueAt)}` : ""}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card title="Latest announcements" className="lg:col-span-2" action={<Link href="/announcements" className="text-sm font-medium text-primary hover:underline">All announcements</Link>}>
              {d.announcements.length === 0 ? <EmptyState title="No announcements yet" /> : (
                <ul className="flex flex-col gap-3 text-sm">
                  {d.announcements.map((n) => (
                    <li key={n.id}>
                      <Link className="font-medium text-primary hover:underline" href="/announcements">{n.title}</Link>
                      <div className="text-xs text-muted">{n.organization.name}{n.publishedAt ? ` · ${formatDateTime(n.publishedAt)}` : ""}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Needs your attention">
              <ul className="flex flex-col gap-2 text-sm">
                <li><Link className="text-primary hover:underline" href="/consequences">My pending consequences</Link>: <strong>{d.pendingMine}</strong></li>
                <li><Link className="text-primary hover:underline" href="/evaluations">Evaluations to complete</Link>: <strong>{d.openEvals}</strong></li>
              </ul>
            </Card>
          </section>
        </>
      )}
    </Page>
  );
}
