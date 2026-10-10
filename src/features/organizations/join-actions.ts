"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { assertOrgRole } from "@/lib/permissions";
import { createJoinCode, formatJoinCode, redeemJoinCode, revokeJoinCode, REDEEM_MESSAGES } from "./join-codes";

export type JoinState = { error?: string; success?: string };
export type JoinCodeState = { error?: string; success?: string; code?: string };

const orgIdSchema = z.uuid();

const generateSchema = z.object({
  organizationId: z.uuid(),
  expiresOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  maxUses: z.string().trim().regex(/^\d{1,6}$/, "Maximum uses must be a whole number.").optional().or(z.literal("")),
});

/** Any signed-in, active user. The role is fixed to MEMBER inside redeemJoinCode; no form field can change it. */
export async function joinOrganizationAction(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const user = await requireUser();
  if (user.systemRole === "SYSTEM_ADMIN") return { error: "System administrators manage organizations instead of joining them." };
  const code = z.string().max(64).safeParse(formData.get("code"));
  if (!code.success || code.data.trim() === "") return { error: "Enter a join code." };

  const result = await redeemJoinCode(user.id, code.data);
  if (!result.ok) return { error: REDEEM_MESSAGES[result.reason] };
  redirect(`/organizations/${result.organizationId}`);
}

// Managing codes needs the same authority as managing members: system admin or the organization's president.

export async function generateJoinCodeAction(_prev: JoinCodeState, formData: FormData): Promise<JoinCodeState> {
  const parsed = generateSchema.safeParse({
    organizationId: formData.get("organizationId"),
    expiresOn: formData.get("expiresOn") ?? "",
    maxUses: formData.get("maxUses") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { organizationId, expiresOn, maxUses } = parsed.data;

  const actor = await assertOrgRole(organizationId, ["PRESIDENT"]);
  const result = await createJoinCode(actor.id, organizationId, {
    expiresAt: expiresOn ? new Date(`${expiresOn}T23:59:59`) : null,
    maxUses: maxUses ? Number(maxUses) : null,
  });
  if (!result.ok) return { error: result.error };
  // The raw code is returned once; only its hash is stored.
  return { success: "New code generated. Copy it now; it can't be shown again.", code: formatJoinCode(result.code) };
}

export async function revokeJoinCodeAction(_prev: JoinCodeState, formData: FormData): Promise<JoinCodeState> {
  const organizationId = orgIdSchema.safeParse(formData.get("organizationId"));
  if (!organizationId.success) return { error: "Invalid organization." };

  const actor = await assertOrgRole(organizationId.data, ["PRESIDENT"]);
  const result = await revokeJoinCode(actor.id, organizationId.data);
  return result.ok ? { success: "Code revoked." } : { error: result.error };
}
