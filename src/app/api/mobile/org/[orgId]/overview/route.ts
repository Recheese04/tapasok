import { db } from "@/lib/database/client";
import { json } from "@/lib/mobile/api";
import { capabilitiesIn, orgAuthed } from "@/lib/mobile/org";
import { orgFinance, recentPayments } from "@/lib/mobile/finance";
import { checkinsByMonth, collectionsByMonth } from "@/lib/mobile/series";
import { fundSummary } from "@/features/finance/funds";

/**
 * The officer dashboard of one organization. Each block is included only when the caller's position in THIS organization
 * holds the matching capability (the same table the web uses); a plain member gets just the organization and no blocks.
 */
export const GET = orgAuthed(null, async (user, _request, orgId) => {
  const caps = capabilitiesIn(user, orgId);
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(-8, 0, 0, 0); // Manila midnight
  if (startOfDay > now) startOfDay.setUTCDate(startOfDay.getUTCDate() - 1);

  const [org, upcoming, drafts, members, joinRequests, checkins30, checkinsToday, announcements, announcementDrafts, documents, openEvaluations, openObligations, finance, pendingCount, recent, checkinSeries, collectionSeries, funds] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { id: true, name: true, acronym: true } }),
    db.event.count({ where: { organizationId: orgId, status: "PUBLISHED", endsAt: { gte: now }, deletedAt: null } }),
    caps["events.manage"] ? db.event.count({ where: { organizationId: orgId, status: "DRAFT", deletedAt: null } }) : null,
    caps["members.basic"] ? db.organizationMember.count({ where: { organizationId: orgId, endedAt: null } }) : null,
    caps["joinrequests.review"] ? db.joinRequest.count({ where: { organizationId: orgId, status: "PENDING" } }) : null,
    caps["attendance.view_org"] ? db.attendanceRecord.count({ where: { event: { organizationId: orgId }, scannedAt: { gte: since30 } } }) : null,
    caps["attendance.view_org"] ? db.attendanceRecord.count({ where: { event: { organizationId: orgId }, scannedAt: { gte: startOfDay } } }) : null,
    caps["announcements.manage"] ? db.announcement.count({ where: { organizationId: orgId, status: "PUBLISHED", deletedAt: null } }) : null,
    caps["announcements.manage"] ? db.announcement.count({ where: { organizationId: orgId, status: "DRAFT", deletedAt: null } }) : null,
    caps["documents.manage"] ? db.document.count({ where: { organizationId: orgId, deletedAt: null } }) : null,
    caps["evaluations.results"] ? db.evaluationForm.count({ where: { organizationId: orgId, status: "OPEN" } }) : null,
    caps["obligations.view_org"] ? db.obligation.count({ where: { organizationId: orgId, status: { in: ["PENDING", "IN_PROGRESS"] } } }) : null,
    caps["fees.view_org"] ? orgFinance(orgId) : null,
    caps["fees.view_org"] ? db.payment.count({ where: { status: "PENDING", voidedAt: null, studentFee: { organizationId: orgId } } }) : null,
    caps["fees.view_org"] ? recentPayments(orgId, 5) : null,
    caps["attendance.view_org"] ? checkinsByMonth(orgId) : null,
    caps["fees.view_org"] ? collectionsByMonth(orgId) : null,
    caps["fees.view_org"] ? fundSummary(orgId) : null,
  ]);

  return json({
    organization: org,
    roles: user.memberships.filter((m) => m.organizationId === orgId).map((m) => ({ role: m.role, title: m.title })),
    capabilities: caps,
    events: { upcoming, drafts },
    members: members === null ? null : { count: members, pendingJoinRequests: joinRequests },
    attendance: checkins30 === null ? null : { checkins30Days: checkins30, checkinsToday, byMonth: checkinSeries },
    announcements: announcements === null ? null : { published: announcements, drafts: announcementDrafts },
    documents: documents === null ? null : { count: documents },
    evaluations: openEvaluations === null ? null : { open: openEvaluations },
    obligations: openObligations === null ? null : { open: openObligations },
    finance: finance && funds && {
      ...finance.totals, pendingCount, recent, byMonth: collectionSeries,
      // money held: confirmed collections + approved other funds − approved expenses (see features/finance/funds.ts)
      otherIncome: funds.otherIncome, expenses: funds.expenses, available: funds.available, pendingExpenseCount: funds.pendingExpenseCount, pendingExpenses: funds.pendingExpenses,
    },
  });
});
