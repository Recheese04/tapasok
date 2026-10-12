"use server";

import { z } from "zod";
import { db } from "@/lib/database/client";
import { requireUser, requireUserForPasswordChange } from "@/lib/auth/dal";
import { weakPasswordReason } from "@/lib/security/password-policy";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { currentSessionHash } from "@/lib/auth/session";
import { assertSystemPermission } from "@/lib/permissions";
import { fieldErrorsOf } from "@/lib/format";
import { passwordSchema } from "@/lib/validation/users";
import { saveSettings } from "./system-settings";

export type SettingsState = { error?: string; success?: string; fieldErrors?: Record<string, string | undefined> };

const name = (label: string) => z.string().trim().min(1, `${label} is required.`).max(80);

export async function updateProfileAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = z.object({ firstName: name("First name"), lastName: name("Last name") }).safeParse({ firstName: fd.get("firstName"), lastName: fd.get("lastName") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  await db.user.update({ where: { id: user.id }, data: parsed.data });
  await db.auditLog.create({ data: { actorUserId: user.id, action: "profile.update", targetType: "user", targetId: user.id } });
  return { success: "Profile updated." };
}

export async function changePasswordAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const user = await requireUserForPasswordChange();
  const parsed = z.object({ current: z.string().min(1, "Enter your current password.").max(200), password: passwordSchema, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match." })
    .safeParse({ current: fd.get("current"), password: fd.get("password"), confirm: fd.get("confirm") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(parsed.data.current, row.passwordHash))) return { fieldErrors: { current: "Your current password is incorrect." } };
  const weak = weakPasswordReason(parsed.data.password, parsed.data.current, user.email);
  if (weak) return { fieldErrors: { password: weak } };

  const keep = await currentSessionHash();
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.password), mustChangePassword: false } }),
    // Sign out every other device; this one stays signed in.
    db.session.deleteMany({ where: { userId: user.id, ...(keep ? { tokenHash: { not: keep } } : {}) } }),
    db.auditLog.create({ data: { actorUserId: user.id, action: "auth.password_change", targetType: "user", targetId: user.id } }),
  ]);
  return { success: "Password changed. Other devices were signed out." };
}

export async function saveSystemSettingsAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const admin = await assertSystemPermission("settings.system");
  const parsed = z.object({
    school: z.string().trim().min(2, "Enter the school name.").max(120),
    grace: z.coerce.number().int("Use a whole number of minutes.").min(0).max(240),
  }).safeParse({ school: fd.get("school"), grace: fd.get("grace") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  await saveSettings(admin.id, { "school.name": parsed.data.school, "attendance.late_grace_minutes": String(parsed.data.grace) });
  return { success: "Settings saved." };
}
