"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction, type SettingsState } from "@/features/settings/actions";
import { logoutAction } from "./actions";

const input = "min-h-12 w-full rounded-xl border border-border bg-white px-3.5 text-[15px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";

/** Required first step for accounts created with the shared starting password. */
export function ChangePasswordForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState<SettingsState, FormData>(changePasswordAction, {});
  useEffect(() => { if (state.success) router.replace("/dashboard"); }, [state.success, router]);
  const fe = state.fieldErrors ?? {};
  const field = (id: "current" | "password" | "confirm", label: string, hint?: string, auto = "new-password") => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <input id={id} name={id} type="password" autoComplete={auto} required aria-invalid={!!fe[id]} aria-describedby={fe[id] ? `${id}-error` : hint ? `${id}-hint` : undefined} className={`${input} ${fe[id] ? "border-danger" : ""}`} />
      {fe[id] ? <p id={`${id}-error`} className="text-sm text-danger">{fe[id]}</p> : hint ? <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p> : null}
    </div>
  );
  return (
    <div className="flex flex-col gap-5">
      <p className="rounded-xl border border-warning/25 bg-warning/5 px-4 py-3 text-sm text-foreground">
        Your account was set up with a shared starting password. Choose your own before you continue. Other devices will be signed out.
      </p>
      <form action={action} className="flex flex-col gap-5">
        {state.error ? <p role="alert" className="rounded-xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">{state.error}</p> : null}
        {field("current", "Current password", undefined, "current-password")}
        {field("password", "New password", "At least 10 characters. Not your email, not a common password.")}
        {field("confirm", "Confirm new password")}
        <button type="submit" disabled={pending} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-[15px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(106,43,216,0.8)] hover:bg-primary-hover disabled:opacity-60">
          {pending ? "Saving…" : "Save and continue"}
        </button>
      </form>
      <form action={logoutAction}>
        <button type="submit" className="w-full rounded-xl px-4 py-2 text-sm font-medium text-muted hover:bg-primary-soft hover:text-primary">Sign out instead</button>
      </form>
    </div>
  );
}
