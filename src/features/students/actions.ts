"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { assertSystemPermission } from "@/lib/permissions";
import { fieldErrorsOf } from "@/lib/format";
import { validateAddress } from "@/lib/psgc";
import { addressFormSchema, ownProfileSchema, studentFieldsSchema } from "@/lib/validation/students";
import { createSetupLink } from "@/features/auth/activation";
import { createStudent, IMPORT_MAX_BYTES, importStudents, updateOwnProfile, updateStudent, type ImportSummary } from "./service";

export type StudentFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string | undefined>;
  setupPath?: string; // shown once to the admin
  initialPassword?: string; // set when new accounts are active with the shared default password
  summary?: ImportSummary;
};

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString();

function readFields(fd: FormData) {
  return {
    studentNumber: str(fd, "studentNumber"), firstName: str(fd, "firstName"), lastName: str(fd, "lastName"),
    middleName: str(fd, "middleName"), email: str(fd, "email"), programId: str(fd, "programId"), rfidUid: str(fd, "rfidUid"),
    yearLevel: str(fd, "yearLevel"), contactNumber: str(fd, "contactNumber"), streetAddress: str(fd, "streetAddress"),
  };
}

// Profile pictures are not set here: each person manages their own picture (src/features/profile/photo.ts), and a System
// Admin cannot set anyone's picture.

const readAddress = (fd: FormData) =>
  addressFormSchema.parse({
    regionCode: str(fd, "regionCode"), provinceCode: str(fd, "provinceCode"),
    cityCode: str(fd, "cityCode"), barangayCode: str(fd, "barangayCode"),
  });

// Every action authorizes before reading any input.

export async function createStudentAction(_prev: StudentFormState, fd: FormData): Promise<StudentFormState> {
  const admin = await assertSystemPermission("students.manage");
  const parsed = studentFieldsSchema.safeParse(readFields(fd));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const addr = await validateAddress(readAddress(fd));
  if (!addr.ok) return { error: addr.error, fieldErrors: addr.field ? { [addr.field]: addr.error } : undefined };

  const res = await createStudent(admin.id, parsed.data, addr.address);
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors };
  return res.initialPassword
    ? { success: "Student created and active.", initialPassword: res.initialPassword }
    : { success: "Student created. Share the setup link below; it is shown only once.", setupPath: res.setupPath ?? undefined };
}

export async function updateStudentAction(_prev: StudentFormState, fd: FormData): Promise<StudentFormState> {
  const admin = await assertSystemPermission("students.manage");
  const userId = z.uuid().safeParse(fd.get("userId"));
  if (!userId.success) return { error: "Invalid student." };
  const parsed = studentFieldsSchema.omit({ email: true }).safeParse(readFields(fd));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const addr = await validateAddress(readAddress(fd));
  if (!addr.ok) return { error: addr.error, fieldErrors: addr.field ? { [addr.field]: addr.error } : undefined };

  const res = await updateStudent(admin.id, userId.data, parsed.data as never, addr.address);
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors };
  return { success: "Saved." };
}

export async function importStudentsAction(_prev: StudentFormState, fd: FormData): Promise<StudentFormState> {
  const admin = await assertSystemPermission("students.manage");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > IMPORT_MAX_BYTES) return { error: "The file is too large (limit 1 MB)." };
  if (!/\.csv$/i.test(file.name)) return { error: "Upload a .csv file." };

  const result = await importStudents(admin.id, await file.text(), fd.get("intent") !== "import");
  if (!result.ok) return { error: result.error };
  return { summary: result.summary };
}

export async function generateSetupLinkAction(_prev: StudentFormState, fd: FormData): Promise<StudentFormState> {
  const admin = await assertSystemPermission("users.manage");
  const userId = z.uuid().safeParse(fd.get("userId"));
  if (!userId.success) return { error: "Invalid user." };
  const res = await createSetupLink(admin.id, userId.data);
  return res.ok ? { success: "Setup link created. It is shown only once.", setupPath: res.path } : { error: res.error };
}

/** A signed-in student editing their own contact details and address. */
export async function updateOwnProfileAction(_prev: StudentFormState, fd: FormData): Promise<StudentFormState> {
  const user = await requireUser();
  const parsed = ownProfileSchema.safeParse({
    middleName: str(fd, "middleName"), contactNumber: str(fd, "contactNumber"), streetAddress: str(fd, "streetAddress"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const addr = await validateAddress(readAddress(fd));
  if (!addr.ok) return { error: addr.error, fieldErrors: addr.field ? { [addr.field]: addr.error } : undefined };

  const res = await updateOwnProfile(user.id, parsed.data, addr.address);
  if (!res.ok) return { error: res.error };
  return { success: "Profile saved." };
}
