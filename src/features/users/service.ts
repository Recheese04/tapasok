import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { newAccountCredential } from "@/lib/auth/unusable";
import { newActivationToken, setupPath } from "@/features/auth/activation";

// Business rules for account administration. No request/session access here: callers (server actions) authenticate and
// authorize the actor first, then pass the actor's id in. Passwords are never chosen, shown or stored by an administrator:
// new accounts and password recoveries use a one-time setup link (the person picks their own password).

export type ServiceResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error?: string; fieldErrors?: Record<string, string | undefined> };

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const EMAIL_TAKEN = { email: "An account with this email already exists." };

/** An account with no student or staff profile (for example a dedicated administrator). Invited, no password until setup. */
export async function createPlainAccount(
  actorId: string,
  input: { firstName: string; lastName: string; email: string },
): Promise<ServiceResult<{ userId: string; setupPath: string | null; initialPassword: string | null }>> {
  const cred = await newAccountCredential();
  const t = newActivationToken();
  try {
    const user = await db.user.create({
      data: {
        ...input,
        passwordHash: cred.hash,
        mustChangePassword: cred.initialPassword !== null,
        status: cred.active ? "ACTIVE" : "INVITED",
        // systemRole intentionally not set: new accounts are always regular users.
        ...(cred.active ? {} : { activationTokens: { create: { tokenHash: t.tokenHash, expiresAt: t.expiresAt, createdById: actorId } } }),
      },
    });
    await db.auditLog.create({ data: { actorUserId: actorId, action: "user.create", targetType: "user", targetId: user.id } });
    return { ok: true, userId: user.id, setupPath: cred.active ? null : setupPath(t.token), initialPassword: cred.initialPassword };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, fieldErrors: EMAIL_TAKEN };
    throw e;
  }
}

export async function updateUser(
  actorId: string,
  userId: string,
  input: { firstName: string; lastName: string; email: string },
): Promise<ServiceResult> {
  const existing = await db.user.findUnique({ where: { id: userId } });
  if (!existing) return { ok: false, error: "User not found." };

  const changed = (["firstName", "lastName", "email"] as const).filter((k) => existing[k] !== input[k]);
  if (changed.length === 0) return { ok: true };

  try {
    await db.user.update({ where: { id: userId }, data: input });
    await db.auditLog.create({
      data: { actorUserId: actorId, action: "user.update", targetType: "user", targetId: userId, metadata: { changedFields: changed } },
    });
    return { ok: true };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, fieldErrors: EMAIL_TAKEN };
    throw e;
  }
}

/** Deactivating also deletes the user's sessions so they are signed out everywhere immediately. Records are kept. */
export async function setUserActive(actorId: string, userId: string, active: boolean): Promise<ServiceResult> {
  if (userId === actorId && !active) return { ok: false, error: "You cannot deactivate your own account." };

  const existing = await db.user.findUnique({ where: { id: userId }, select: { id: true, status: true, systemRole: true } });
  if (!existing) return { ok: false, error: "User not found." };
  if (active && existing.status === "INVITED") return { ok: false, error: "This account has not been set up yet. Create a setup link instead." };
  if (!active && existing.systemRole === "SYSTEM_ADMIN") {
    const others = await db.user.count({ where: { systemRole: "SYSTEM_ADMIN", status: "ACTIVE", id: { not: userId } } });
    if (others === 0) return { ok: false, error: "This is the last active system administrator and cannot be deactivated." };
  }

  await db.$transaction([
    db.user.update({ where: { id: userId }, data: active ? { status: "ACTIVE" } : { status: "DISABLED" } }),
    ...(active ? [] : [db.session.deleteMany({ where: { userId } })]),
    db.auditLog.create({
      data: { actorUserId: actorId, action: active ? "user.activate" : "user.deactivate", targetType: "user", targetId: userId },
    }),
  ]);
  return { ok: true };
}

/**
 * Grants or revokes the system-level System Admin privilege. It is separate from any organization position, can only be
 * given to an active account that finished setup, never to yourself, and the last active admin can never be removed.
 */
export async function setSystemAdmin(actorId: string, userId: string, makeAdmin: boolean): Promise<ServiceResult> {
  if (userId === actorId) return { ok: false, error: "You cannot change your own system privileges." };
  const target = await db.user.findUnique({ where: { id: userId }, select: { status: true, systemRole: true } });
  if (!target) return { ok: false, error: "User not found." };
  if (makeAdmin) {
    if (target.status !== "ACTIVE") return { ok: false, error: "Only an active account that has finished setup can become a system administrator." };
    if (target.systemRole === "SYSTEM_ADMIN") return { ok: true };
  } else {
    if (target.systemRole !== "SYSTEM_ADMIN") return { ok: true };
    const others = await db.user.count({ where: { systemRole: "SYSTEM_ADMIN", status: "ACTIVE", id: { not: userId } } });
    if (others === 0) return { ok: false, error: "There must always be at least one active system administrator." };
  }
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { systemRole: makeAdmin ? "SYSTEM_ADMIN" : "USER" } }),
    db.auditLog.create({ data: { actorUserId: actorId, action: makeAdmin ? "user.grant_system_admin" : "user.revoke_system_admin", targetType: "user", targetId: userId } }),
  ]);
  return { ok: true };
}
