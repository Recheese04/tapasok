import { addMembership, db, makeOrg, makeUser, toAuthUser } from "./db";
import type { OrganizationRole } from "@/generated/prisma/enums";

export const ROLES = ["PRESIDENT", "SECRETARY", "TREASURER", "AUDITOR", "OFFICER", "ADVISER", "MEMBER"] as const satisfies readonly OrganizationRole[];

/** Two organizations; one account per role in A, a president + member in B, a system admin and a roleless user. */
export async function makeWorld() {
  const orgA = await makeOrg("Org A");
  const orgB = await makeOrg("Org B");
  const admin = await makeUser({ systemRole: "SYSTEM_ADMIN", name: "Admin" });
  const a: Record<(typeof ROLES)[number], Awaited<ReturnType<typeof makeUser>>> = {} as never;
  for (const role of ROLES) {
    a[role] = await makeUser({ name: role });
    await addMembership(a[role].id, orgA.id, role);
  }
  const presidentB = await makeUser({ name: "PresidentB" });
  await addMembership(presidentB.id, orgB.id, "PRESIDENT");
  const memberB = await makeUser({ name: "MemberB" });
  await addMembership(memberB.id, orgB.id, "MEMBER");
  const nobody = await makeUser({ name: "Nobody" });
  return { orgA, orgB, admin, a, presidentB, memberB, nobody };
}

export const auth = toAuthUser;

/** A published event with one ACTIVE session (opened 40 min ago, started 10 min ago, closes in 2 hours) unless overridden. */
export async function makeEvent(
  organizationId: string,
  over: Partial<{ title: string; status: "DRAFT" | "PUBLISHED" | "CANCELLED"; startsAt: Date; endsAt: Date; opens: Date; closes: Date; active: boolean; grace: number; targetMode: "ALL_MEMBERS" | "FILTERED"; semesterId: string | null; sessions: number; ruleIds: string[]; requireEvaluation: boolean }> = {},
) {
  const now = Date.now();
  const startsAt = over.startsAt ?? new Date(now - 10 * 60_000);
  const opens = over.opens ?? new Date(now - 40 * 60_000);
  const closes = over.closes ?? new Date(now + 2 * 3600_000);
  const event = await db.event.create({
    data: {
      organizationId, title: over.title ?? "Assembly", venue: "Gym", status: over.status ?? "PUBLISHED", startsAt, endsAt: over.endsAt ?? new Date(now + 2 * 3600_000),
      attendanceOpensAt: opens, attendanceClosesAt: closes, targetMode: over.targetMode ?? "ALL_MEMBERS", semesterId: over.semesterId ?? null, requireEvaluation: over.requireEvaluation ?? false,
      sessions: { create: Array.from({ length: over.sessions ?? 1 }, (_, i) => ({ label: `Session ${i + 1}`, kind: i % 2 ? ("TIME_OUT" as const) : ("TIME_IN" as const), position: i + 1, opensAt: opens, startsAt, closesAt: closes, graceMinutes: over.grace ?? 15, active: over.active ?? true })) },
      ...(over.ruleIds?.length ? { rules: { create: over.ruleIds.map((ruleId) => ({ ruleId })) } } : {}),
    },
    include: { sessions: { orderBy: { position: "asc" } } },
  });
  return Object.assign(event, { session: event.sessions[0] });
}
