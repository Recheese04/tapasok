import { ROLE_LABEL } from "@/features/auth/roles";
import { eventStatusLabel } from "@/features/events/constants";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { BarChart, DonutChart } from "@/components/shared/charts";
import { Icon } from "@/components/layout/icons";
import { Badge, ButtonLink, Card, Page, PageHeader, StatCard } from "@/components/shared/ui";
import { requireUser } from "@/lib/auth/dal";
import { canOrgAnywhere, canSystem } from "@/lib/permissions";
import { formatDate, formatDateTime, formatPeso } from "@/lib/format";
import { adminDashboard, adviserOverview, memberDashboard } from "@/features/dashboard/queries";
import { isAdviserOnly } from "@/config/navigation";

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
          actions={<><ButtonLink href="/users?new=STUDENT">+ New account</ButtonLink><ButtonLink href="/organizations?new=1" variant="secondary">+ New organization</ButtonLink></>}
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
  // An Adviser-only account oversees organizations (read-only) and has no personal attendance or fees.
  const adviser = isAdviserOnly(user);
  const showMgmt = d.members !== null || d.pendingOrg !== null || d.orgOutstanding !== null || d.scansToday !== null;
  const oversight = adviser ? await adviserOverview(user) : null;

  return (
    <Page>
      <PageHeader
        title={greeting}
        subtitle={adviser ? "Your organizations at a glance (read-only oversight)." : "Your activities and, where you hold a position, your organizations' numbers."}
        actions={
          user.memberships.length === 0 ? <ButtonLink href="/organizations">+ Join an organization</ButtonLink>
          : adviser ? undefined
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
          {!adviser && <section aria-label="My summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Upcoming events" value={d.upcoming.length} href="/events" icon={<Icon name="calendar" />} />
            <StatCard label="Events attended" value={d.attended} href="/attendance" icon={<Icon name="check" />} tone="green" />
            <StatCard label="Evaluations to answer" value={d.openEvals} href="/evaluations" icon={<Icon name="star" />} tone="amber" />
            <StatCard label="Balance due" value={formatPeso(d.outstanding.toString())} href="/fees" icon={<Icon name="wallet" />} tone={d.outstanding.isZero() ? "green" : "red"} />
          </section>}

          {showMgmt && (
            <section aria-label="Organization management" className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Organization management</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {d.members !== null && <StatCard label="Active members" value={d.members} href="/organizations/manage" icon={<Icon name="users" />} />}
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

          {oversight && (
            <section aria-label="Oversight" className="grid gap-4 lg:grid-cols-2">
              <Card title="Recent attendance changes" action={<Link href="/attendance/records" className="text-sm font-medium text-primary hover:underline">All records</Link>}>
                {oversight.reasons.length === 0 ? <EmptyState title="No excuses or corrections yet" /> : (
                  <ul className="flex flex-col gap-3 text-sm">
                    {oversight.reasons.map((r) => (
                      <li key={r.id} className="flex flex-col gap-0.5">
                        <span><span className="font-medium">{r.user.lastName}, {r.user.firstName}</span>{r.user.studentProfile?.studentNumber ? <span className="text-muted"> · {r.user.studentProfile.studentNumber}</span> : null} · <Badge tone={r.status === "EXCUSED" ? "gray" : r.status === "ABSENT" ? "red" : r.status === "LATE" ? "amber" : "green"}>{eventStatusLabel(r.status)}</Badge></span>
                        <span className="text-muted">“{r.remark}”</span>
                        <a href={`/events/${r.event.id}/sessions/${r.session.id}`} className="text-xs text-muted hover:text-primary hover:underline">{r.event.organization.name} · {r.event.title} · {r.session.label} · {formatDateTime(r.modifiedAt ?? r.scannedAt)}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Newest members">
                {oversight.newest.length === 0 ? <EmptyState title="No members yet" /> : (
                  <ul className="flex flex-col gap-3 text-sm">
                    {oversight.newest.map((m) => (
                      <li key={m.id} className="flex flex-col gap-0.5">
                        <span className="font-medium">{m.user.lastName}, {m.user.firstName}</span>
                        <span className="text-xs text-muted">{[m.user.studentProfile?.studentNumber, m.user.studentProfile?.program?.code ?? m.user.studentProfile?.course, m.user.studentProfile?.yearLevel ? `Year ${m.user.studentProfile.yearLevel}` : null].filter(Boolean).join(" · ") || "No student profile"}</span>
                        <Link href={`/organizations/${m.organization.id}`} className="text-xs text-muted hover:text-primary hover:underline">{m.organization.name} · {ROLE_LABEL[m.role]} · since {formatDate(m.startedAt)}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          )}

          <section className={`grid gap-4 ${adviser ? "" : "lg:grid-cols-3"}`}>
            {!adviser && <Card title="My attendance" action={<Link href="/attendance" className="text-sm font-medium text-primary hover:underline">View all</Link>}>
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
            </Card>}
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
            {!adviser && <Card title="Waiting for you">
              <ul className="flex flex-col gap-3 text-sm">
                <li className="flex items-center justify-between gap-3"><Link href="/evaluations" className="font-medium text-primary hover:underline">Event evaluations to answer</Link><span className="tabular-nums">{d.openEvals}</span></li>
                <li className="flex items-center justify-between gap-3"><Link href="/consequences" className="font-medium text-primary hover:underline">Pending consequences</Link><span className="tabular-nums">{d.pendingMine}</span></li>
                <li className="flex items-center justify-between gap-3"><Link href="/fees" className="font-medium text-primary hover:underline">Balance due</Link><span className="tabular-nums">{formatPeso(d.outstanding.toString())}</span></li>
              </ul>
            </Card>}
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card title="Latest announcements" className={adviser ? "lg:col-span-3" : "lg:col-span-2"} action={<Link href="/announcements" className="text-sm font-medium text-primary hover:underline">All announcements</Link>}>
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
            {!adviser && <Card title="Needs your attention">
              <ul className="flex flex-col gap-2 text-sm">
                <li><Link className="text-primary hover:underline" href="/consequences">My pending consequences</Link>: <strong>{d.pendingMine}</strong></li>
                <li><Link className="text-primary hover:underline" href="/evaluations">Evaluations to complete</Link>: <strong>{d.openEvals}</strong></li>
              </ul>
            </Card>}
          </section>
        </>
      )}
    </Page>
  );
}
