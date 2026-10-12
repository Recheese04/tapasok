"use server";

import { redirect, RedirectType } from "next/navigation";
import { headers } from "next/headers";
import { clientIp } from "@/lib/security/rate-limit";
import { db } from "@/lib/database/client";
import { createSession, destroySession } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/auth";
import { safeNext } from "@/lib/auth/next";
import { attemptLogin } from "./login";

export type LoginState = { error?: string; fieldErrors?: { email?: string; password?: string } };

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

  const result = await attemptLogin(email, password, clientIp(await headers()));
  if (!result.ok) return { error: result.error };

  await createSession(result.userId);
  await db.auditLog.create({
    data: { actorUserId: result.userId, action: "auth.login", targetType: "user", targetId: result.userId },
  });

  // Replace, not push: the sign-in page must not stay in the back-button history once you are in.
  if (result.mustChangePassword) redirect("/change-password", RedirectType.replace);
  redirect(safeNext(formData.get("next")), RedirectType.replace);
}

async function endSession() {
  const userId = await destroySession();
  if (userId) {
    await db.auditLog.create({
      data: { actorUserId: userId, action: "auth.logout", targetType: "user", targetId: userId },
    });
  }
}

export async function logoutAction() {
  await endSession();
  redirect("/login", RedirectType.replace);
}

/**
 * Ends the session without navigating. The caller then does a full page load to /login (window.location.replace), which
 * also empties the browser's in-memory copy of signed-in pages, so Back cannot show them after signing out.
 */
export async function signOutAction() {
  await endSession();
}
