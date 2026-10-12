"use client";

import { useActionState } from "react";
import { activateAccountAction, type ActivationState } from "./activation-actions";
import { Field, inputClass, Notice, primaryButton } from "@/components/shared/ui";

export function ActivationForm({ token, firstName }: { token: string; firstName: string }) {
  const [state, action, pending] = useActionState<ActivationState, FormData>(activateAccountAction, {});
  return (
    <form action={action} className="flex w-full flex-col gap-5">
      <p className="rounded-xl border border-primary/20 bg-primary-soft/60 px-4 py-3 text-sm">Welcome, <span className="font-semibold">{firstName}</span>. Choose a password to finish setting up your account.</p>
      {state.error && <Notice kind="error">{state.error}</Notice>}
      <input type="hidden" name="token" value={token} />
      <Field id="password" label="New password" error={state.fieldErrors?.password} hint="At least 10 characters.">
        <input id="password" name="password" type="password" autoComplete="new-password" required className={`${inputClass} min-h-12 rounded-xl`} />
      </Field>
      <Field id="confirm" label="Confirm password" error={state.fieldErrors?.confirm}>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={`${inputClass} min-h-12 rounded-xl`} />
      </Field>
      <button type="submit" disabled={pending} className={`${primaryButton} min-h-12 w-full rounded-xl text-[15px]`}>{pending ? "Saving…" : "Save password"}</button>
    </form>
  );
}
