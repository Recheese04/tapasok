"use server";

import { z } from "zod";
import { assertSystemPermission } from "@/lib/permissions";
import { fieldErrorsOf } from "@/lib/format";
import {
  createCollege, createDepartment, createProgram, createSchoolYear, createSemester, deleteAcademicRecord, setActiveTerm, setUnitActive, updateSchoolYear, updateSemester, updateUnit,
} from "./service";

export type AcademicState = { error?: string; success?: string; fieldErrors?: Record<string, string | undefined> };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.").transform((v) => new Date(`${v}T00:00:00Z`));
const code = z.string().trim().min(2, "Code is required.").max(20).regex(/^[A-Za-z0-9-]+$/, "Letters, digits and dashes only.").transform((v) => v.toUpperCase());
const name = z.string().trim().min(2, "Name is required.").max(120);
const uuid = z.uuid();
const raw = (fd: FormData, ...keys: string[]) => Object.fromEntries(keys.map((k) => [k, (fd.get(k) ?? "").toString()]));

// Every action authorizes before reading input; academic configuration is a system-admin capability.

export async function createSchoolYearAction(_p: AcademicState, fd: FormData): Promise<AcademicState> {
  const admin = await assertSystemPermission("academic.manage");
  const parsed = z.object({ label: z.string().trim().regex(/^\d{4}-\d{4}$/, "Use a label like 2025-2026."), startsOn: date, endsOn: date }).safeParse(raw(fd, "label", "startsOn", "endsOn"));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const res = await createSchoolYear(admin.id, parsed.data);
  return res.ok ? { success: "School year added." } : { error: res.error };
}

export async function createSemesterAction(_p: AcademicState, fd: FormData): Promise<AcademicState> {
  const admin = await assertSystemPermission("academic.manage");
  const parsed = z.object({ schoolYearId: uuid, name, sequence: z.coerce.number().int().min(1).max(4), startsOn: date, endsOn: date }).safeParse(raw(fd, "schoolYearId", "name", "sequence", "startsOn", "endsOn"));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const res = await createSemester(admin.id, parsed.data);
  return res.ok ? { success: "Semester added." } : { error: res.error };
}

export async function setActiveTermAction(_p: AcademicState, fd: FormData): Promise<AcademicState> {
  const admin = await assertSystemPermission("academic.manage");
  const id = uuid.safeParse(fd.get("semesterId"));
  if (!id.success) return { error: "Choose a semester." };
  const res = await setActiveTerm(admin.id, id.data);
  return res.ok ? { success: "Active term updated." } : { error: res.error };
}

export async function createCollegeAction(_p: AcademicState, fd: FormData): Promise<AcademicState> {
  const admin = await assertSystemPermission("academic.manage");
  const parsed = z.object({ code, name }).safeParse(raw(fd, "code", "name"));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const res = await createCollege(admin.id, parsed.data);
  return res.ok ? { success: "College added." } : { error: res.error };
}

export async function createDepartmentAction(_p: AcademicState, fd: FormData): Promise<AcademicState> {
  const admin = await assertSystemPermission("academic.manage");
  const parsed = z.object({ collegeId: uuid, code, name }).safeParse(raw(fd, "collegeId", "code", "name"));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const res = await createDepartment(admin.id, parsed.data);
  return res.ok ? { success: "Department added." } : { error: res.error };
}

export async function createProgramAction(_p: AcademicState, fd: FormData): Promise<AcademicState> {
  const admin = await assertSystemPermission("academic.manage");
  const parsed = z.object({ departmentId: uuid, code, name }).safeParse(raw(fd, "departmentId", "code", "name"));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const res = await createProgram(admin.id, parsed.data);
  return res.ok ? { success: "Program added." } : { error: res.error };
}

export async function setUnitActiveAction(fd: FormData) {
  const admin = await assertSystemPermission("academic.manage");
  const parsed = z.object({ kind: z.enum(["college", "department", "program"]), id: uuid, active: z.enum(["true", "false"]) }).safeParse(raw(fd, "kind", "id", "active"));
  if (!parsed.success) return;
  await setUnitActive(admin.id, parsed.data.kind, parsed.data.id, parsed.data.active === "true");
}

export async function updateSchoolYearAction(_p: AcademicState, fd: FormData): Promise<AcademicState> {
  const admin = await assertSystemPermission("academic.manage");
  const parsed = z.object({ id: uuid, label: z.string().trim().regex(/^\d{4}-\d{4}$/, "Use a label like 2025-2026."), startsOn: date, endsOn: date }).safeParse(raw(fd, "id", "label", "startsOn", "endsOn"));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const { id, ...data } = parsed.data;
  const res = await updateSchoolYear(admin.id, id, data);
  return res.ok ? { success: "School year saved." } : { error: res.error };
}

export async function updateSemesterAction(_p: AcademicState, fd: FormData): Promise<AcademicState> {
  const admin = await assertSystemPermission("academic.manage");
  const parsed = z.object({ id: uuid, name, sequence: z.coerce.number().int().min(1).max(4), startsOn: date, endsOn: date }).safeParse(raw(fd, "id", "name", "sequence", "startsOn", "endsOn"));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const { id, ...data } = parsed.data;
  const res = await updateSemester(admin.id, id, data);
  return res.ok ? { success: "Semester saved." } : { error: res.error };
}

export async function updateUnitAction(_p: AcademicState, fd: FormData): Promise<AcademicState> {
  const admin = await assertSystemPermission("academic.manage");
  const parsed = z.object({ kind: z.enum(["college", "department", "program"]), id: uuid, code, name }).safeParse(raw(fd, "kind", "id", "code", "name"));
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const res = await updateUnit(admin.id, parsed.data.kind, parsed.data.id, { code: parsed.data.code, name: parsed.data.name });
  return res.ok ? { success: "Saved." } : { error: res.error };
}

/** Permanent delete, only for entries nothing refers to. Everything else is archived instead. */
export async function deleteAcademicAction(_p: AcademicState, fd: FormData): Promise<AcademicState> {
  const admin = await assertSystemPermission("academic.manage");
  const parsed = z.object({ kind: z.enum(["school_year", "semester", "college", "department", "program"]), id: uuid }).safeParse(raw(fd, "kind", "id"));
  if (!parsed.success) return { error: "Invalid request." };
  const res = await deleteAcademicRecord(admin.id, parsed.data.kind, parsed.data.id);
  return res.ok ? { success: "Deleted." } : { error: res.error };
}
