import "server-only";
import { db } from "@/lib/database/client";
import { verifyPassword } from "@/lib/auth/password";
import { hit, peek } from "@/lib/security/rate-limit";

// Credential check shared by the web login form and the mobile API, so both enforce exactly the same rules:
// constant-time-ish comparison, five failures lock the account for 15 minutes, only ACTIVE accounts sign in, and
// every outcome is audited. It never reveals whether an email exists.

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
export const GENERIC_LOGIN_ERROR = "Invalid email or password.";
export const LOCKED_LOGIN_ERROR = "Too many failed attempts. Try again in a few minutes.";
export const NETWORK_LIMIT_ERROR = "Too many failed sign-ins from this network. Try again in 15 minutes.";

// Failed sign-ins per network address. Generous, because a whole campus can share one address, but it stops one
// source from guessing passwords across many accounts (each account also locks after 5 failures).
const IP_FAILURES = 30;
const IP_WINDOW_MS = 15 * 60_000;

export type LoginResult = { ok: true; userId: string; systemRole: "USER" | "SYSTEM_ADMIN"; mustChangePassword: boolean } | { ok: false; error: string };

export async function attemptLogin(email: string, password: string, ip = "unknown"): Promise<LoginResult> {
  const ipKey = `login:ip:${ip}`;
  if ((await peek(ipKey, IP_WINDOW_MS)) >= IP_FAILURES) {
    await db.auditLog.create({ data: { action: "auth.login_rate_limited", metadata: { ip } } });
    return { ok: false, error: NETWORK_LIMIT_ERROR };
  }
  const user = await db.user.findUnique({ where: { email } });
  const locked = user?.lockedUntil && user.lockedUntil > new Date();

  // Always run a hash comparison so timing does not reveal whether the account exists.
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? null);

  if (locked) {
    await hit(ipKey, IP_WINDOW_MS);
    return { ok: false, error: LOCKED_LOGIN_ERROR };
  }

  if (!user || !passwordOk || user.status !== "ACTIVE") {
    if (user) {
      const updated = await db.user.update({ where: { id: user.id }, data: { failedLoginCount: { increment: 1 } } });
      if (updated.failedLoginCount >= MAX_FAILED_ATTEMPTS) {
        await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } });
      }
    }
    await hit(ipKey, IP_WINDOW_MS);
    await db.auditLog.create({ data: { actorUserId: user?.id ?? null, action: "auth.login_failed", targetType: "user", targetId: user?.id ?? null, metadata: { ip } } });
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  return { ok: true, userId: user.id, systemRole: user.systemRole, mustChangePassword: user.mustChangePassword };
}
