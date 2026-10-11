import { db } from "@/lib/database/client";
import { json } from "@/lib/mobile/api";
import { capabilitiesIn, orgAuthed } from "@/lib/mobile/org";

/**
 * Members of the organization with their positions (members.basic: names and student numbers). Emails are included only
 * for those who hold members.roster, the same split as the web.
 */
export const GET = orgAuthed("members.basic", async (user, _request, orgId) => {
  const withEmail = capabilitiesIn(user, orgId)["members.roster"];
  const rows = await db.organizationMember.findMany({
    where: { organizationId: orgId, endedAt: null },
    orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
    take: 500,
    select: { role: true, title: true, user: { select: { id: true, firstName: true, lastName: true, email: true, studentProfile: { select: { studentNumber: true, yearLevel: true } } } } },
  });
  return json({
    members: rows.map((m) => ({
      userId: m.user.id, name: `${m.user.firstName} ${m.user.lastName}`, role: m.role, title: m.title,
      studentNumber: m.user.studentProfile?.studentNumber ?? null, yearLevel: m.user.studentProfile?.yearLevel ?? null,
      ...(withEmail ? { email: m.user.email } : {}),
    })),
  });
});
