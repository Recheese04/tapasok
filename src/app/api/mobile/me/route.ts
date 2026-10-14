import { db } from "@/lib/database/client";
import { authed, fail, json } from "@/lib/mobile/api";
import { unreadCount } from "@/features/notifications/service";
import { photoVersion } from "@/features/profile/photo";
import { ownProfileSchema } from "@/lib/validation/students";

const profile = async (userId: string) =>
  db.studentProfile.findUnique({
    where: { userId },
    select: {
      studentNumber: true, middleName: true, yearLevel: true, contactNumber: true, streetAddress: true, regionName: true, provinceName: true, cityName: true, barangayName: true,
      program: { select: { name: true, code: true, department: { select: { name: true, college: { select: { name: true } } } } } },
    },
  });

async function me(userId: string) {
  const [u, sp, unread, photo] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, firstName: true, lastName: true, lastLoginAt: true } }),
    profile(userId),
    unreadCount(userId),
    photoVersion(userId),
  ]);
  return {
    id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, unread,
    photoVersion: photo, // the person's own picture (null = none); the app loads /me/photo?v=<version>
    student: sp && {
      studentNumber: sp.studentNumber, middleName: sp.middleName, yearLevel: sp.yearLevel, contactNumber: sp.contactNumber, streetAddress: sp.streetAddress,
      program: sp.program?.name ?? null, department: sp.program?.department.name ?? null, college: sp.program?.department.college.name ?? null,
      address: [sp.barangayName, sp.cityName, sp.provinceName, sp.regionName].filter(Boolean).join(", ") || null,
    },
  };
}

export const GET = authed(async (user) => {
  const orgs = await db.organization.findMany({ where: { id: { in: user.memberships.map((m) => m.organizationId) } }, select: { id: true, acronym: true } });
  const acr = new Map(orgs.map((o) => [o.id, o.acronym]));
  return json({
    ...(await me(user.id)),
    memberships: user.memberships.map((m) => ({ organizationId: m.organizationId, organization: m.organizationName, acronym: acr.get(m.organizationId) ?? null, role: m.role, title: m.title })),
  });
});

/** A student may edit only their own contact details. The student number, name, program and email are managed by an administrator. */
export const PATCH = authed(async (user, request) => {
  const parsed = ownProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    return fail(400, "VALIDATION", Object.values(fields)[0] ?? "Check the values and try again.");
  }
  if (!(await db.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } }))) return fail(400, "NO_PROFILE", "No student profile is linked to your account.");
  await db.studentProfile.update({
    where: { userId: user.id },
    data: { middleName: parsed.data.middleName ?? null, contactNumber: parsed.data.contactNumber ?? null, streetAddress: parsed.data.streetAddress ?? null },
  });
  await db.auditLog.create({ data: { actorUserId: user.id, action: "student.update_own_mobile", targetType: "user", targetId: user.id } });
  return json(await me(user.id));
});
