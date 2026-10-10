"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/database/client";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/auth";
import { safeNext } from "@/lib/auth/next";

export type LoginState = { error?: string; fieldErrors?: { email?: string; password?: string } };

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const GENERIC_ERROR = "Invalid email or password.";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return { fieldErrors: { email: flat.email?.[0], password: flat.password?.[0] } };
  }
  const { email, password } = parsed.data;

  const user = await db.user.findUnique({ where: { email } });
  const locked = user?.lockedUntil && user.lockedUntil > new Date();

  // Always run a hash comparison so timing does not reveal whether the account exists.
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? null);

  if (locked) {
    return { error: "Too many failed attempts. Try again in a few minutes." };
  }

  if (!user || !passwordOk || user.status !== "ACTIVE") {
    if (user) {
      const updated = await db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
      });
      if (updated.failedLoginCount >= MAX_FAILED_ATTEMPTS) {
        await db.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
        });
      }
    }
    await db.auditLog.create({
      data: { actorUserId: user?.id ?? null, action: "auth.login_failed", targetType: "user", targetId: user?.id ?? null },
    });
    return { error: GENERIC_ERROR };
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await createSession(user.id);
  await db.auditLog.create({
    data: { actorUserId: user.id, action: "auth.login", targetType: "user", targetId: user.id },
  });

  redirect(safeNext(formData.get("next")));
}

export async function logoutAction() {
  const userId = await destroySession();
  if (userId) {
    await db.auditLog.create({
      data: { actorUserId: userId, action: "auth.logout", targetType: "user", targetId: userId },
    });
  }
  redirect("/login");
}
