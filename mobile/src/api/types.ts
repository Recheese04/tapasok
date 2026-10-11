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
export type Payment = { id: string; amount: string; method: string; status: string; receiptCode: string; paidAt: string; rejectionReason: string | null };
export type Fee = { id: string; title: string; kind: string; organization: string; dueDate: string | null; amountDue: string; adjustments: string; paid: string; pending: string; balance: string; status: string; payments: Payment[] };
export type Notice = { id: string; kind: string; title: string; body: string | null; at: string; read: boolean };
