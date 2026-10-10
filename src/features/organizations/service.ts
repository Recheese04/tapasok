import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { OrganizationScope } from "@/generated/prisma/enums";
import { db } from "@/lib/database/client";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error?: string; fieldErrors?: Record<string, string> };
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export type OrgInput = {
  name: string; acronym: string | null; description: string | null; scope: OrganizationScope;
  collegeId: string | null; departmentId: string | null; programId: string | null; autoEnroll: boolean;
};

/**
 * Validates scope against the configured academic structure and returns the normalized links:
 * departmental needs a college+department (program optional), college-wide needs a college, and
 * university-wide / co-curricular organizations carry no academic unit. Co-curricular organizations
 * can never auto-enroll students.
 */
async function normalize(input: OrgInput): Promise<{ ok: true; data: OrgInput } | { ok: false; fieldErrors: Record<string, string> }> {
  const d = { ...input };
  const err = (fieldErrors: Record<string, string>) => ({ ok: false as const, fieldErrors });

  if (d.scope === "UNIVERSITY_WIDE" || d.scope === "CO_CURRICULAR") {
    d.collegeId = d.departmentId = d.programId = null;
    if (d.scope === "CO_CURRICULAR") d.autoEnroll = false;
    return { ok: true, data: d };
  }
  if (!d.collegeId) return err({ collegeId: "Choose the college this organization belongs to." });
  const college = await db.college.findUnique({ where: { id: d.collegeId } });
  if (!college?.active) return err({ collegeId: "Choose an active college." });

  if (d.scope === "COLLEGE_WIDE") {
    d.departmentId = d.programId = null;
    return { ok: true, data: d };
  }
  if (!d.departmentId) return err({ departmentId: "Choose the department." });
  const dept = await db.department.findUnique({ where: { id: d.departmentId } });
  if (!dept?.active || dept.collegeId !== d.collegeId) return err({ departmentId: "That department does not belong to the chosen college." });
  if (d.programId) {
    const prog = await db.program.findUnique({ where: { id: d.programId } });
    if (!prog?.active || prog.departmentId !== d.departmentId) return err({ programId: "That program does not belong to the chosen department." });
  }
  return { ok: true, data: d };
}

/** Every organization needs an official faculty/staff adviser; the account must already exist. */
export async function createOrganization(actorId: string, input: OrgInput, adviserEmail: string | null): Promise<Result<{ id: string }>> {
  if (!adviserEmail) return { ok: false, fieldErrors: { adviserEmail: "Assign the official faculty/staff adviser (their account email)." } };
  const adviser = await db.user.findUnique({ where: { email: adviserEmail }, select: { id: true, status: true } });
  if (!adviser || adviser.status === "DISABLED") return { ok: false, fieldErrors: { adviserEmail: "No active account with this email. Create the adviser's account first." } };

  const n = await normalize(input);
  if (!n.ok) return n;
  try {
    const org = await db.$transaction(async (tx) => {
      const created = await tx.organization.create({ data: n.data });
      await tx.organizationMember.create({ data: { organizationId: created.id, userId: adviser.id, role: "ADVISER", title: "Adviser", source: "ADMIN" } });
      await tx.auditLog.create({ data: { actorUserId: actorId, action: "organization.create", targetType: "organization", targetId: created.id, metadata: { scope: n.data.scope } } });
      return created;
    });
    return { ok: true, id: org.id };
  } catch (e) {
    if (isUnique(e)) return { ok: false, fieldErrors: { name: "An organization with this name already exists." } };
    throw e;
  }
}

export async function updateOrganization(actorId: string, id: string, input: OrgInput): Promise<Result> {
  const n = await normalize(input);
  if (!n.ok) return n;
  try {
    await db.organization.update({ where: { id }, data: n.data });
    await db.auditLog.create({ data: { actorUserId: actorId, action: "organization.update", targetType: "organization", targetId: id } });
    return { ok: true };
  } catch (e) {
    if (isUnique(e)) return { ok: false, fieldErrors: { name: "An organization with this name already exists." } };
    throw e;
  }
}

/** True when the organization has no active adviser (shown as a warning to admins). */
export async function missingAdviser(organizationId: string) {
  return (await db.organizationMember.count({ where: { organizationId, role: "ADVISER", endedAt: null } })) === 0;
}
