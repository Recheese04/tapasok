import { z } from "zod";

// bcrypt only uses the first 72 bytes, so longer passwords are rejected rather than silently truncated.
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .refine((v) => new TextEncoder().encode(v).length <= 72, "Password must be at most 72 bytes.");

const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address."));
const name = (label: string) => z.string().trim().min(1, `${label} is required.`).max(80);

// An empty password field means "generate one for me".
const optionalPassword = z
  .string()
  .transform((v) => (v === "" ? undefined : v))
  .pipe(passwordSchema.optional());

// Deliberately has no role/privilege fields: accounts are always created as regular users.
export const createUserSchema = z.object({
  firstName: name("First name"),
  lastName: name("Last name"),
  email,
  password: optionalPassword,
});

export const updateUserSchema = z.object({
  userId: z.uuid(),
  firstName: name("First name"),
  lastName: name("Last name"),
  email,
});

export const resetPasswordSchema = z.object({
  userId: z.uuid(),
  password: optionalPassword,
});

export const userIdSchema = z.object({ userId: z.uuid() });
