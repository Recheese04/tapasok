"use server";

import { z } from "zod";
import { db } from "@/lib/database/client";
import { assertSystemPermission } from "@/lib/permissions";
import { fieldErrorsOf } from "@/lib/format";
import { validateAddress } from "@/lib/psgc";
import { addressFormSchema, studentFieldsSchema } from "@/lib/validation/students";
import { staffFieldsSchema } from "@/lib/validation/staff";
import { createStudent, updateStudent } from "@/features/students/service";
import { saveStudentPhoto } from "@/features/students/photo";
import { createMembership } from "@/features/organizations/membership";
import { ACCOUNT_TYPES } from "./types";
import { createPlainAccount, setSystemAdmin, setUserActive, updateUser } from "./service";
import { createStaff, updateStaff } from "./staff";

export type UserFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string | undefined>;
  /** One-time account setup link, shown to the admin exactly once. */
  setupPath?: string;
  userId?: string;
};

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString();
const uuid = z.uuid();

const plainSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  lastName: z.string().trim().min(1, "Last name is required.").max(80),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address.")),
});

const readStudent = (fd: FormData) => ({
  studentNumber: str(fd, "studentNumber"), firstName: str(fd, "firstName"), lastName: str(fd, "lastName"), middleName: str(fd, "middleName"),
  email: str(fd, "email"), programId: str(fd, "programId"), rfidUid: str(fd, "rfidUid"), yearLevel: str(fd, "yearLevel"),
  contactNumber: str(fd, "contactNumber"), streetAddress: str(fd, "streetAddress"),
});
const readStaff = (fd: FormData) => ({
  employeeId: str(fd, "employeeId"), firstName: str(fd, "firstName"), lastName: str(fd, "lastName"), middleName: str(fd, "middleName"),
  email: str(fd, "email"), contactNumber: str(fd, "contactNumber"), collegeId: str(fd, "collegeId"), departmentId: str(fd, "departmentId"), jobTitle: str(fd, "jobTitle"),
});
const readAddress = (fd: FormData) =>
  addressFormSchema.parse({ regionCode: str(fd, "regionCode"), provinceCode: str(fd, "provinceCode"), cityCode: str(fd, "cityCode"), barangayCode: str(fd, "barangayCode") });

async function maybePhoto(userId: string, fd: FormData) {
  const photo = fd.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return null;
  const res = await saveStudentPhoto(userId, photo);
  return res.ok ? null : res.error;
}

// Every action authorizes (system admin, users.manage) before it reads or parses any input.

/** Creates ONE account of the chosen type. It is invited without a password, holds no position and no privilege. */
export async function createAccountAction(_prev: UserFormState, fd: FormData): Promise<UserFormState> {
  const admin = await assertSystemPermission("users.manage");
  const type = z.enum(ACCOUNT_TYPES).safeParse(fd.get("accountType"));
  if (!type.success) return { error: "Choose the account type." };

  const done = (userId: string, setupPath: string, note = ""): UserFormState => ({ success: `Account created. Share the setup link below; it is shown only once.${note}`, setupPath, userId });

  if (type.data === "STUDENT") {
    const parsed = studentFieldsSchema.safeParse(readStudent(fd));
    if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
    const addr = await validateAddress(readAddress(fd));
    if (!addr.ok) return { error: addr.error, fieldErrors: addr.field ? { [addr.field]: addr.error } : undefined };
    const res = await createStudent(admin.id, parsed.data, addr.address);
    if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors };
    const photoError = await maybePhoto(res.userId, fd);
    return done(res.userId, res.setupPath, photoError ? ` The photo was not saved: ${photoError}` : "");
  }
  if (type.data === "STAFF") {
    const parsed = staffFieldsSchema.safeParse(readStaff(fd));
    if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
    const res = await createStaff(admin.id, parsed.data);
    if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors };
    return done(res.userId, res.setupPath);
  }
  const parsed = plainSchema.safeParse({ firstName: str(fd, "firstName"), lastName: str(fd, "lastName"), email: str(fd, "email") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const res = await createPlainAccount(admin.id, parsed.data);
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors };
  return done(res.userId, res.setupPath);
}

/**
 * Edits an account and its profile. The profile type is fixed by the account (a student stays a student; an officer
 * is still the same student). System role, status and positions are never read from this form.
 */
export async function updateAccountAction(_prev: UserFormState, fd: FormData): Promise<UserFormState> {
  const admin = await assertSystemPermission("users.manage");
  const id = uuid.safeParse(fd.get("userId"));
  if (!id.success) return { error: "Invalid user." };
  const user = await db.user.findUnique({ where: { id: id.data }, select: { id: true, studentProfile: { select: { id: true } }, staffProfile: { select: { id: true } } } });
  if (!user) return { error: "User not found." };

  if (user.studentProfile) {
    const parsed = studentFieldsSchema.safeParse(readStudent(fd));
    if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
    const addr = await validateAddress(readAddress(fd));
    if (!addr.ok) return { error: addr.error, fieldErrors: addr.field ? { [addr.field]: addr.error } : undefined };
    const base = await updateUser(admin.id, user.id, { firstName: parsed.data.firstName, lastName: parsed.data.lastName, email: parsed.data.email });
    if (!base.ok) return { error: base.error, fieldErrors: base.fieldErrors };
    const { email: _email, ...profile } = parsed.data;
    void _email;
    const res = await updateStudent(admin.id, user.id, profile, addr.address);
    if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors };
    const photoError = await maybePhoto(user.id, fd);
    return photoError ? { error: photoError, fieldErrors: { photo: photoError } } : { success: "Saved." };
  }
  if (user.staffProfile) {
    const parsed = staffFieldsSchema.safeParse(readStaff(fd));
    if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
    const base = await updateUser(admin.id, user.id, { firstName: parsed.data.firstName, lastName: parsed.data.lastName, email: parsed.data.email });
    if (!base.ok) return { error: base.error, fieldErrors: base.fieldErrors };
    const res = await updateStaff(admin.id, user.id, parsed.data);
    return res.ok ? { success: "Saved." } : { error: res.error, fieldErrors: res.fieldErrors };
  }
  const parsed = plainSchema.safeParse({ firstName: str(fd, "firstName"), lastName: str(fd, "lastName"), email: str(fd, "email") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const res = await updateUser(admin.id, user.id, parsed.data);
  return res.ok ? { success: "Saved." } : { error: res.error, fieldErrors: res.fieldErrors };
}

export async function setUserActiveAction(_prev: UserFormState, fd: FormData): Promise<UserFormState> {
  const admin = await assertSystemPermission("users.manage");
  const id = uuid.safeParse(fd.get("userId"));
  if (!id.success) return { error: "Invalid user." };
  const active = fd.get("active") === "true";
  const res = await setUserActive(admin.id, id.data, active);
  if (!res.ok) return { error: res.error };
  return { success: active ? "Account activated." : "Account deactivated and signed out everywhere." };
}

/** Table-row variant of the same operation (used with a confirmation dialog). */
export async function toggleUserStatusAction(fd: FormData) {
  const admin = await assertSystemPermission("users.manage");
  const id = uuid.safeParse(fd.get("userId"));
  if (id.success) await setUserActive(admin.id, id.data, fd.get("active") === "true");
}

/** System Admin is a system-level privilege; it is granted here, explicitly, and never through registration or import. */
export async function setSystemAdminAction(_prev: UserFormState, fd: FormData): Promise<UserFormState> {
  const admin = await assertSystemPermission("users.manage");
  const id = uuid.safeParse(fd.get("userId"));
  if (!id.success) return { error: "Invalid user." };
  const make = fd.get("makeAdmin") === "true";
  const res = await setSystemAdmin(admin.id, id.data, make);
  return res.ok ? { success: make ? "System administrator privilege granted." : "System administrator privilege removed." } : { error: res.error };
}

const positionSchema = z.object({
  userId: uuid, organizationId: uuid,
  role: z.enum(["PRESIDENT", "SECRETARY", "TREASURER", "AUDITOR", "OFFICER", "ADVISER", "MEMBER"]),
  title: z.string().trim().max(60).transform((v) => v || null),
});

/** Adds a membership/position for an existing account. Other positions of the same person are untouched. */
export async function assignMembershipAction(_prev: UserFormState, fd: FormData): Promise<UserFormState> {
  const admin = await assertSystemPermission("users.manage");
  const parsed = positionSchema.safeParse({ userId: fd.get("userId"), organizationId: fd.get("organizationId"), role: fd.get("role"), title: str(fd, "title") });
  if (!parsed.success) return { error: "Choose an organization and a position." };
  const res = await createMembership({ actorId: admin.id, canAssignPrivileged: true, ...parsed.data });
  return res.ok ? { success: "Membership added." } : { error: res.error };
}
