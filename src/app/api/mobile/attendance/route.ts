import { authed, json } from "@/lib/mobile/api";
import { myAttendance } from "@/features/attendance/queries";

export const GET = authed(async (user) => {
  const rows = await myAttendance(user);
  return json({ records: rows.map((r) => ({ event: r.event.title, eventId: r.event.id, organization: r.event.organization.name, session: r.session.label, status: r.status, at: r.scannedAt.toISOString() })) });
});
