import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { staffFieldsSchema, type StaffFields } from "@/lib/validation/staff";
import { newActivationToken, setupPath } from "@/features/auth/activation";
import { newAccountCredential, type NewCredential } from "@/lib/auth/unusable";

// Faculty / staff accounts. Same model as students: one login account (users) plus a profile row, with organization
// positions held separately. Creating a staff account never grants any position or privilege.

type Fail = { ok: false; error?: string; fieldErrors?: Record<string, string> };
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

async function checkPlacement(f: Pick<StaffFields, "collegeId" | "departmentId">): Promise<Record<string, string> | null> {
  if (f.departmentId) {
    const d = await db.department.findUnique({ where: { id: f.departmentId }, select: { collegeId: true, active: true } });
    if (!d?.active) return { departmentId: "Choose an active department." };
    if (f.collegeId && d.collegeId !== f.collegeId) return { departmentId: "That department does not belong to the chosen college." };
  }
  if (f.collegeId) {
    const c = await db.college.findUnique({ where: { id: f.collegeId }, select: { active: true } });
    if (!c?.active) return { collegeId: "Choose an active college." };
  }
  return null;
}

async function duplicate(f: Pick<StaffFields, "employeeId" | "email">, exceptUserId?: string): Promise<Record<string, string> | null> {
  const [byId, byEmail] = await Promise.all([
    db.staffProfile.findUnique({ where: { employeeId: f.employeeId }, select: { userId: true } }),
    db.user.findUnique({ where: { email: f.email }, select: { id: true } }),
  ]);
  if (byId && byId.userId !== exceptUserId) return { employeeId: "A staff member with this employee ID already exists." };
  if (byEmail && byEmail.id !== exceptUserId) return { email: "An account with this email already exists." };
  return null;
}

/** Creates a password-less (INVITED) staff account and a one-time setup link. */
export async function createStaff(actorId: string, fields: StaffFields, credential?: NewCredential): Promise<{ ok: true; userId: string; setupPath: string | null; initialPassword: string | null } | Fail> {
  const bad = (await duplicate(fields)) ?? (await checkPlacement(fields));
  if (bad) return { ok: false, fieldErrors: bad };
  const cred = credential ?? (await newAccountCredential());
  const t = newActivationToken();
  try {
    const user = await db.user.create({
      data: {
        email: fields.email, passwordHash: cred.hash, firstName: fields.firstName, lastName: fields.lastName, status: cred.active ? "ACTIVE" : "INVITED",
        // systemRole stays USER; no organization position is created here.
        staffProfile: { create: { employeeId: fields.employeeId, middleName: fields.middleName ?? null, contactNumber: fields.contactNumber ?? null, collegeId: fields.collegeId ?? null, departmentId: fields.departmentId ?? null, jobTitle: fields.jobTitle ?? null } },
        ...(cred.active ? {} : { activationTokens: { create: { tokenHash: t.tokenHash, expiresAt: t.expiresAt, createdById: actorId } } }),
      },
    });
    await db.auditLog.create({ data: { actorUserId: actorId, action: "staff.create", targetType: "user", targetId: user.id } });
    return { ok: true, userId: user.id, setupPath: cred.active ? null : setupPath(t.token), initialPassword: cred.initialPassword };
  } catch (e) {
    if (isUnique(e)) return { ok: false, fieldErrors: (await duplicate(fields)) ?? { email: "An account with this email already exists." } };
    throw e;
  }
}

export async function updateStaff(actorId: string, userId: string, fields: Omit<StaffFields, "email" | "firstName" | "lastName">): Promise<{ ok: true } | Fail> {
  const profile = await db.staffProfile.findUnique({ where: { userId } });
  if (!profile) return { ok: false, error: "Staff profile not found." };
  const bad = (await duplicate({ employeeId: fields.employeeId, email: "" }, userId)) ?? (await checkPlacement(fields));
  // the e-mail comparison above is skipped for updates (the account email is changed through updateUser)
  if (bad && !("email" in bad)) return { ok: false, fieldErrors: bad };
  try {
    await db.staffProfile.update({
      where: { userId },
      data: { employeeId: fields.employeeId, middleName: fields.middleName ?? null, contactNumber: fields.contactNumber ?? null, collegeId: fields.collegeId ?? null, departmentId: fields.departmentId ?? null, jobTitle: fields.jobTitle ?? null },
    });
    await db.auditLog.create({ data: { actorUserId: actorId, action: "staff.update", targetType: "user", targetId: userId } });
    return { ok: true };
  } catch (e) {
    if (isUnique(e)) return { ok: false, fieldErrors: { employeeId: "A staff member with this employee ID already exists." } };
    throw e;
  }
}

export { staffFieldsSchema };
