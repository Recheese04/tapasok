"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { OrganizationRole } from "@/generated/prisma/enums";
import { db } from "@/lib/database/client";
import { assertOrgRole, assertSystemAdmin, isSystemAdmin } from "@/lib/permissions";
import { fieldErrorsOf } from "@/lib/format";
import { addMemberSchema, membershipIdSchema, organizationSchema } from "@/lib/validation/organizations";
import { ADMIN_ONLY_ROLES } from "@/features/auth/roles";
import { createOrganization, updateOrganization } from "./service";
import { syncOrganizationMembers } from "./mapping";
import { createMembership } from "./membership";

export type FormState = { error?: string; fieldErrors?: Record<string, string | undefined>; success?: string };

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

function parseOrganization(fd: FormData) {
  const s = (k: string) => (fd.get(k) ?? "").toString();
  return organizationSchema.safeParse({
    name: s("name"), acronym: s("acronym"), description: s("description"), scope: s("scope") || "CO_CURRICULAR",
    collegeId: s("collegeId"), departmentId: s("departmentId"), programId: s("programId"),
    autoEnroll: fd.get("autoEnroll") === "on", adviserEmail: s("adviserEmail"),
  });
}

export async function createOrganizationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await assertSystemAdmin();
  const parsed = parseOrganization(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const { adviserEmail, ...input } = parsed.data;

  const res = await createOrganization(admin.id, input, adviserEmail);
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors };
  if (input.autoEnroll) await syncOrganizationMembers(res.id, admin.id);
  redirect(`/organizations/${res.id}`);
}

export async function updateOrganizationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await assertSystemAdmin();
  const id = membershipIdSchema.shape.organizationId.safeParse(formData.get("organizationId"));
  if (!id.success) return { error: "Invalid organization." };
  const parsed = parseOrganization(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const { adviserEmail: _ignored, ...input } = parsed.data; // the adviser is changed through member management
  void _ignored;
  const res = await updateOrganization(admin.id, id.data, input);
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors };
  if (input.autoEnroll) await syncOrganizationMembers(id.data, admin.id);
  return { success: "Saved." };
}

export async function setOrganizationStatusAction(formData: FormData) {
  const admin = await assertSystemAdmin();
  const id = membershipIdSchema.shape.organizationId.parse(formData.get("organizationId"));
  const status = formData.get("status") === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
  await db.organization.update({ where: { id }, data: { status } });
  await db.auditLog.create({
    data: { actorUserId: admin.id, action: status === "ARCHIVED" ? "organization.archive" : "organization.restore", targetType: "organization", targetId: id },
  });
}

/** Re-runs the explicitly configured academic mapping (admin or the organization's president). */
export async function syncMembersAction(formData: FormData) {
  const id = membershipIdSchema.shape.organizationId.parse(formData.get("organizationId"));
  const actor = await assertOrgRole(id, ["PRESIDENT"]);
  await syncOrganizationMembers(id, actor.id);
}

export async function addMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = addMemberSchema.safeParse({
    organizationId: formData.get("organizationId"), email: formData.get("email"), role: formData.get("role"), title: formData.get("title") ?? "",
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const { organizationId, email, role, title } = parsed.data;

  const actor = await assertOrgRole(organizationId, ["PRESIDENT"]);
  const target = await db.user.findUnique({ where: { email }, select: { id: true, status: true } });
  if (!target || target.status === "DISABLED") return { fieldErrors: { email: "No active account with this email." } };
  const res = await createMembership({ actorId: actor.id, canAssignPrivileged: isSystemAdmin(actor), organizationId, userId: target.id, role, title });
  if (!res.ok) return { error: res.error };
  return { success: "Member added." };
}

export async function endMembershipAction(formData: FormData) {
  const { organizationId, membershipId } = membershipIdSchema.parse({
    organizationId: formData.get("organizationId"), membershipId: formData.get("membershipId"),
  });
  const actor = await assertOrgRole(organizationId, ["PRESIDENT"]);

  // Look the row up by both ids so a forged organizationId cannot reach another organization's member.
  const membership = await db.organizationMember.findFirst({ where: { id: membershipId, organizationId, endedAt: null } });
  if (!membership) return;
  if (ADMIN_ONLY_ROLES.includes(membership.role) && !isSystemAdmin(actor)) throw new Error("Only a system admin can remove a president or adviser.");

  await db.organizationMember.update({ where: { id: membership.id }, data: { endedAt: new Date() } });
  await db.auditLog.create({
    data: { actorUserId: actor.id, action: "membership.end", targetType: "user", targetId: membership.userId, metadata: { organizationId, role: membership.role } },
  });
}

/** Changing a position ends the old assignment and starts a new one, so officer history is preserved. */
export async function changeMemberRoleAction(formData: FormData) {
  const { organizationId, membershipId } = membershipIdSchema.parse({
    organizationId: formData.get("organizationId"), membershipId: formData.get("membershipId"),
  });
  const role = z.enum(["PRESIDENT", "SECRETARY", "TREASURER", "AUDITOR", "OFFICER", "ADVISER", "MEMBER"]).parse(formData.get("role")) as OrganizationRole;
  const actor = await assertOrgRole(organizationId, ["PRESIDENT"]);

  const current = await db.organizationMember.findFirst({ where: { id: membershipId, organizationId, endedAt: null } });
  if (!current || current.role === role) return;
  if (!isSystemAdmin(actor) && (ADMIN_ONLY_ROLES.includes(role) || ADMIN_ONLY_ROLES.includes(current.role))) return;

  try {
    await db.$transaction([
      db.organizationMember.update({ where: { id: current.id }, data: { endedAt: new Date() } }),
      db.organizationMember.create({ data: { organizationId, userId: current.userId, role, source: current.source, semesterId: current.semesterId } }),
      db.auditLog.create({ data: { actorUserId: actor.id, action: "membership.role_change", targetType: "user", targetId: current.userId, metadata: { organizationId, from: current.role, to: role } } }),
    ]);
  } catch (e) {
    if (!isUniqueViolation(e)) throw e; // e.g. the organization already has a president
  }
}
