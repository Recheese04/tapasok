"use client";

import { useActionState } from "react";
import { activateAccountAction, type ActivationState } from "./activation-actions";
import { Field, inputClass, Notice, primaryButton } from "@/components/shared/ui";

export function ActivationForm({ token, firstName }: { token: string; firstName: string }) {
  const [state, action, pending] = useActionState<ActivationState, FormData>(activateAccountAction, {});
  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div>
        <h1 className="text-xl font-semibold text-primary">Set up your account</h1>
        <p className="text-sm text-muted">Welcome, {firstName}. Choose a password to finish.</p>
      </div>
      {state.error && <Notice kind="error">{state.error}</Notice>}
      <input type="hidden" name="token" value={token} />
      <Field id="password" label="New password" error={state.fieldErrors?.password} hint="At least 10 characters.">
        <input id="password" name="password" type="password" autoComplete="new-password" required className={inputClass} />
      </Field>
      <Field id="confirm" label="Confirm password" error={state.fieldErrors?.confirm}>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={inputClass} />
      </Field>
      <button type="submit" disabled={pending} className={primaryButton}>{pending ? "Saving…" : "Save password"}</button>
    </form>
  );
}
