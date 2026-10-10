import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v));

const optionalUuid = z.union([z.uuid(), z.literal("")]).transform((v) => v || null);

export const organizationSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(120),
  acronym: optionalText(20),
  description: optionalText(1000),
  scope: z.enum(["DEPARTMENTAL", "COLLEGE_WIDE", "UNIVERSITY_WIDE", "CO_CURRICULAR"]),
  collegeId: optionalUuid,
  departmentId: optionalUuid,
  programId: optionalUuid,
  autoEnroll: z.boolean(),
  adviserEmail: z.string().trim().toLowerCase().max(254).transform((v) => v || null),
});

export const memberRoles = ["PRESIDENT", "SECRETARY", "TREASURER", "AUDITOR", "OFFICER", "ADVISER", "MEMBER"] as const;

export const addMemberSchema = z.object({
  organizationId: z.uuid(),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address.")),
  role: z.enum(memberRoles),
  title: optionalText(60),
});

export const membershipIdSchema = z.object({
  organizationId: z.uuid(),
  membershipId: z.uuid(),
});
