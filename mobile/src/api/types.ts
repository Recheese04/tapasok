// Shapes returned by the Tapasok web app's /api/mobile/* endpoints (see src/app/api/mobile in the web project).
export type Membership = { organizationId: string; organization: string; acronym: string | null; role: string; title: string | null };
export type Me = {
  id: string; email: string; firstName: string; lastName: string; unread: number; memberships: Membership[];
  student: null | { studentNumber: string; middleName: string | null; yearLevel: number | null; contactNumber: string | null; streetAddress: string | null; program: string | null; department: string | null; college: string | null; address: string | null };
};
export type EventItem = { id: string; title: string; startsAt: string; endsAt: string; venue: string | null; status: string; organization: string };
export type Announcement = { id: string; title: string; body: string; organization: string; at: string };
export type Home = {
  firstName: string; unread: number; nextEvents: EventItem[];
  openSessions: { id: string; label: string; eventTitle: string; organization: string }[];
  announcements: Announcement[]; attendance: Record<"PRESENT" | "LATE" | "ABSENT" | "EXCUSED", number>; balanceDue: string;
};
export type EventsPage = { total: number; page: number; events: EventItem[] };
export type EventSession = { id: string; label: string; kind: string; opensAt: string; closesAt: string; open: boolean; myStatus: string | null };
export type EventDetail = { id: string; title: string; description: string | null; venue: string | null; status: string; organization: string; startsAt: string; endsAt: string; creator: string | null; sessions: EventSession[] };
export type ScanSession = { id: string; label: string; kind: string; state: string; myStatus: string | null; opensAt: string; closesAt: string; event: { id: string; title: string; venue: string | null; startsAt: string; endsAt: string; organization: string } };
export type ScanResult = { ok: true; status: string; at: string } | { ok: false; reason: string; message: string };
export type AttendanceRecord = { event: string; eventId: string; organization: string; session: string; status: string; at: string };
export type Organization = { id: string; name: string; acronym: string | null; description: string | null; scope: string; memberCount: number; positions: { role: string; title: string | null }[] };
export type JoinableOrg = { id: string; name: string; acronym: string | null; description: string | null };
export type MyJoinRequest = { id: string; organization: string; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; message: string | null; note: string | null; createdAt: string; decidedAt: string | null };
export type PendingJoinRequest = {
  id: string; userId: string; name: string; email: string; studentNumber: string | null; yearLevel: number | null; program: string | null;
  college: string | null; department: string | null; message: string | null; createdAt: string; rejectedBefore: number;
};
export type DecidedJoinRequest = { id: string; name: string; status: "APPROVED" | "REJECTED"; decidedAt: string | null; decidedBy: string | null; note: string | null };
export type Payment = { id: string; amount: string; method: string; status: string; receiptCode: string; paidAt: string; rejectionReason: string | null };
export type Fee = { id: string; title: string; kind: string; organization: string; dueDate: string | null; amountDue: string; adjustments: string; paid: string; pending: string; balance: string; status: string; payments: Payment[] };
export type Notice = { id: string; kind: string; title: string; body: string | null; at: string; read: boolean };

// ---- Organization tools (officers). Every field comes from /api/mobile/org/[orgId]/*; the server decides what each position receives.
export type CapabilityKey =
  | "members.basic" | "members.roster" | "joinrequests.review" | "events.manage" | "attendance.view_org" | "announcements.manage"
  | "documents.manage" | "fees.view_org" | "fees.manage" | "reports.finance" | "expenses.record" | "expenses.approve" | "evaluations.results" | "evaluations.manage" | "obligations.view_org";
export type Caps = Record<CapabilityKey, boolean>;
export type FinanceTotals = { assessed: string; collected: string; pendingVerification: string; outstanding: string; collectionRate: number | null; assessments: number; membersAssessed: number; membersWithBalance: number };
export type OrgPayment = { id: string; amount: string; method: string; status: string; reference: string | null; receiptCode: string; at: string; member: string; fee: string };
export type OrgOverview = {
  organization: { id: string; name: string; acronym: string | null };
  roles: { role: string; title: string | null }[];
  capabilities: Caps;
  events: { upcoming: number; drafts: number | null };
  members: { count: number; pendingJoinRequests: number | null } | null;
  attendance: { checkins30Days: number; checkinsToday: number; byMonth: { label: string; value: number }[] | null } | null;
  announcements: { published: number; drafts: number | null } | null;
  documents: { count: number } | null;
  evaluations: { open: number } | null;
  obligations: { open: number } | null;
  finance: (FinanceTotals & { pendingCount: number | null; recent: OrgPayment[] | null; byMonth: { label: string; value: string }[] | null; otherIncome: string; expenses: string; available: string; pendingExpenseCount: number; pendingExpenses: string }) | null;
};
export type Owing = { userId: string; name: string; studentNumber: string | null; due: string; paid: string; balance: string; fees: { id: string; title: string; balance: string; pending: string }[] };
export type OrgFinance = { canManage: boolean; totals: FinanceTotals; owing: Owing[]; owingTruncated: boolean; pending: OrgPayment[]; recent: OrgPayment[] };
export type ManagedAnnouncement = { id: string; title: string; body: string; status: "DRAFT" | "PUBLISHED"; at: string };
export type ManagedEvent = { id: string; title: string; venue: string | null; status: "DRAFT" | "PUBLISHED" | "CANCELLED"; startsAt: string; endsAt: string; checkIns: number; sessions: { id: string; label: string; active: boolean; finalized: boolean }[] };
export type OrgMember = { userId: string; name: string; role: string; title: string | null; studentNumber: string | null; yearLevel: number | null; email?: string };
export type OrgDocument = { id: string; title: string; description: string | null; fileName: string; category: string; sizeBytes: number; at: string };
export type MemberDetail = {
  userId: string; name: string; email?: string; studentNumber: string | null; yearLevel: number | null; program: string | null;
  positions: { role: string; title: string | null }[]; memberSince: string;
  attendance: null | { counts: Record<"PRESENT" | "LATE" | "ABSENT" | "EXCUSED", number>; rate: number | null; onTimeRate: number | null; recent: { id: string; status: string; at: string; session: string; event: string; eventId: string }[] };
  finance: null | { due: string; paid: string; pending: string; balance: string; fees: { id: string; title: string; due: string; paid: string; balance: string; status: string }[] };
  obligations: null | { id: string; title: string; status: string; dueAt: string | null }[];
};

// ---- Organization funds: expenses and other money received (see web src/features/finance/funds.ts)
export type FundStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "REVERSED";
export type FundRecord = {
  id: string; type: "EXPENSE" | "INCOME"; title: string; amount: string; category: string; categoryLabel: string; occurredOn: string; purpose: string; notes: string | null;
  status: FundStatus; hasReceipt: boolean; receiptName: string | null; recordedById: string; recordedBy: string; decidedBy: string | null; decidedAt: string | null;
  decisionReason: string | null; reversedAt: string | null; reversalReason: string | null; createdAt: string;
};
export type FundSummary = { collected: string; otherIncome: string; expenses: string; available: string; pendingExpenses: string; pendingExpenseCount: number; pendingIncome: string; pendingIncomeCount: number };
export type OrgExpenses = { canRecord: boolean; canApprove: boolean; me: string; summary: FundSummary; records: FundRecord[] };
