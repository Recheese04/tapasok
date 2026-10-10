"use server";

import { redirect } from "next/navigation";
import { fieldErrorsOf } from "@/lib/format";
import { activationPasswordSchema } from "@/lib/validation/students";
import { activateAccount } from "./activation";

export type ActivationState = { error?: string; fieldErrors?: Record<string, string | undefined> };

/** Public action: possession of the single-use link is the credential. */
export async function activateAccountAction(_prev: ActivationState, fd: FormData): Promise<ActivationState> {
  const parsed = activationPasswordSchema.safeParse({
    token: fd.get("token"),
    password: fd.get("password"),
    confirm: fd.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const res = await activateAccount(parsed.data.token, parsed.data.password);
  if (!res.ok) return { error: res.error };
  redirect("/login?activated=1");
}
