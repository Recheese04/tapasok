import { z } from "zod";

const optional = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable().optional();
const optUuid = z.union([z.uuid(), z.literal("")]).transform((v) => v || null).nullable().optional();

export const employeeIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]{2,19}$/, "Employee ID must be 3-20 letters, digits or dashes.");

/** Faculty / staff profile fields. Staff profiles never carry student-only fields (student number, program, year level). */
export const staffFieldsSchema = z.object({
  employeeId: employeeIdSchema,
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  lastName: z.string().trim().min(1, "Last name is required.").max(80),
  middleName: optional(80),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address.")),
  contactNumber: z
    .string()
    .trim()
    .regex(/^(\+?63|0)9\d{9}$/, "Use a Philippine mobile number like 09171234567.")
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  collegeId: optUuid,
  departmentId: optUuid,
  jobTitle: optional(100),
});

export type StaffFields = z.infer<typeof staffFieldsSchema>;
