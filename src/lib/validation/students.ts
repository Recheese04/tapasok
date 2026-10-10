import { z } from "zod";

const optional = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable().optional();

export const studentNumberSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]{2,19}$/, "Student number must be 3-20 letters, digits or dashes.");

const yearLevel = z
  .union([z.string().trim(), z.number()])
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().int("Year level must be a whole number.").min(1).max(10).nullable())
  .optional();

const contactNumber = z
  .string()
  .trim()
  .regex(/^(\+?63|0)9\d{9}$/, "Use a Philippine mobile number like 09171234567.")
  .or(z.literal(""))
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const studentFieldsSchema = z.object({
  studentNumber: studentNumberSchema,
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  lastName: z.string().trim().min(1, "Last name is required.").max(80),
  middleName: optional(80),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address.")),
  programId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null).nullable().optional(),
  yearLevel,
  rfidUid: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9A-F]{4,20}$/, "RFID UID is 4-20 hexadecimal characters.")
    .or(z.literal(""))
    .transform((v) => v || null)
    .nullable()
    .optional(),
  contactNumber,
  streetAddress: optional(200),
});

export type StudentFields = z.infer<typeof studentFieldsSchema>;

/** What a student may edit on their own profile (never the student number or email). */
export const ownProfileSchema = studentFieldsSchema.pick({ middleName: true, contactNumber: true, streetAddress: true });

export const addressFormSchema = z.object({
  regionCode: z.string().trim().optional(),
  provinceCode: z.string().trim().optional(),
  cityCode: z.string().trim().optional(),
  barangayCode: z.string().trim().optional(),
});

export const activationPasswordSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: z
      .string()
      .min(10, "Password must be at least 10 characters.")
      .refine((v) => new TextEncoder().encode(v).length <= 72, "Password must be at most 72 bytes."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match." });
