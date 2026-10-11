"use server";

import { redirect } from "next/navigation";
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

  const result = await attemptLogin(email, password);
  if (!result.ok) return { error: result.error };

  await createSession(result.userId);
  await db.auditLog.create({
    data: { actorUserId: result.userId, action: "auth.login", targetType: "user", targetId: result.userId },
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
