import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/database/client";
import { hashPassword } from "@/lib/auth/password";
import { weakPasswordReason } from "@/lib/security/password-policy";

// One-time account setup links. Only a SHA-256 hash is stored; the raw token exists in the link
// handed to the admin once. Used for imported students (INVITED) and for password setup/recovery.

const TOKEN_TTL_DAYS = 14;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function newActivationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000) };
}

export const setupPath = (token: string) => `/activate/${token}`;

/** Replaces any unused link for the user with a fresh one. Caller must have authorized the actor. */
export async function createSetupLink(actorId: string, userId: string): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!user) return { ok: false, error: "User not found." };
  if (user.status === "DISABLED") return { ok: false, error: "Activate the account before creating a setup link." };

  const t = newActivationToken();
  await db.$transaction([
    db.activationToken.deleteMany({ where: { userId, usedAt: null } }),
    db.activationToken.create({ data: { userId, tokenHash: t.tokenHash, expiresAt: t.expiresAt, createdById: actorId } }),
    db.auditLog.create({ data: { actorUserId: actorId, action: "user.setup_link", targetType: "user", targetId: userId } }),
  ]);
  return { ok: true, path: setupPath(t.token) };
}

export async function lookupActivation(token: string) {
  const row = await db.activationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { firstName: true, status: true } } },
  });
  if (!row || row.usedAt || row.expiresAt <= new Date() || row.user.status === "DISABLED") return null;
  return { firstName: row.user.firstName };
}

/** Sets the password, activates the account and ends all existing sessions. Token is single-use. */
export async function activateAccount(token: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await db.activationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, status: true, email: true } } },
  });
  const invalid = { ok: false as const, error: "This setup link is invalid or has expired. Ask an administrator for a new one." };
  if (!row || row.usedAt || row.expiresAt <= new Date() || row.user.status === "DISABLED") return invalid;

  const weak = weakPasswordReason(password, null, row.user.email);
  if (weak) return { ok: false, error: weak };

  const passwordHash = await hashPassword(password);
  // Claim the token atomically so two concurrent submissions cannot both succeed.
  const claimed = await db.activationToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count === 0) return invalid;

  await db.$transaction([
    db.user.update({
      where: { id: row.userId },
      data: { passwordHash, status: "ACTIVE", failedLoginCount: 0, lockedUntil: null, mustChangePassword: false },
    }),
    db.session.deleteMany({ where: { userId: row.userId } }),
    db.auditLog.create({ data: { actorUserId: row.userId, action: "user.activate_account", targetType: "user", targetId: row.userId } }),
  ]);
  return { ok: true };
}
