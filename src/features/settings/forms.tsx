"use client";

import { useActionState } from "react";
import { Field, inputClass, Notice, primaryButton } from "@/components/shared/ui";
import { changePasswordAction, saveSystemSettingsAction, updateProfileAction, type SettingsState } from "./actions";

/** A titled card: the heading and its description sit above the form so every section reads the same way. */
export function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <header className="border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </header>
      {children}
    </section>
  );
}

// The card itself comes from SettingsSection; the forms only lay out their fields.
const box = "grid gap-4 p-6 sm:grid-cols-2";
const full = "sm:col-span-2";

function Msg({ s }: { s: SettingsState }) {
  return <>{s.error && <Notice kind="error">{s.error}</Notice>}{s.success && <Notice kind="success">{s.success}</Notice>}</>;
}

export function ProfileForm({ firstName, lastName, email }: { firstName: string; lastName: string; email: string }) {
  const [s, action, pending] = useActionState<SettingsState, FormData>(updateProfileAction, {});
  return (
    <form action={action} className={box}>
      <div className={full}><Msg s={s} /></div>
      <Field id="p-first" label="First name" error={s.fieldErrors?.firstName}><input id="p-first" name="firstName" required defaultValue={firstName} className={inputClass} /></Field>
      <Field id="p-last" label="Last name" error={s.fieldErrors?.lastName}><input id="p-last" name="lastName" required defaultValue={lastName} className={inputClass} /></Field>
      <div className={full}><Field id="p-email" label="Email" hint="Contact an administrator to change your email."><input id="p-email" value={email} readOnly className={`${inputClass} bg-sidebar/60 text-muted`} /></Field></div>
      <button type="submit" disabled={pending} className={`${primaryButton} justify-self-start sm:col-span-2`}>{pending ? "Saving…" : "Save profile"}</button>
    </form>
  );
}

export function PasswordForm() {
  const [s, action, pending] = useActionState<SettingsState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className={box} key={s.success ? "done" : "form"}>
      <div className={full}><Msg s={s} /></div>
      <div className={full}><Field id="pw-current" label="Current password" error={s.fieldErrors?.current}><input id="pw-current" name="current" type="password" autoComplete="current-password" required className={inputClass} /></Field></div>
      <Field id="pw-new" label="New password" error={s.fieldErrors?.password} hint="At least 10 characters."><input id="pw-new" name="password" type="password" autoComplete="new-password" required className={inputClass} /></Field>
      <Field id="pw-confirm" label="Confirm new password" error={s.fieldErrors?.confirm}><input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" required className={inputClass} /></Field>
      <button type="submit" disabled={pending} className={`${primaryButton} justify-self-start sm:col-span-2`}>{pending ? "Changing…" : "Change password"}</button>
    </form>
  );
}

export function SystemSettingsForm({ school, grace }: { school: string; grace: string }) {
  const [s, action, pending] = useActionState<SettingsState, FormData>(saveSystemSettingsAction, {});
  return (
    <form action={action} className={box}>
      <div className={full}><Msg s={s} /></div>
      <div className={full}><Field id="sys-school" label="School name"><input id="sys-school" name="school" required defaultValue={school} className={inputClass} /></Field></div>
      <Field id="sys-grace" label="Late after (minutes past event start)" hint="Attendance scanned later than this is recorded as Late."><input id="sys-grace" name="grace" type="number" min={0} max={240} required defaultValue={grace} className={inputClass} /></Field>
      <button type="submit" disabled={pending} className={`${primaryButton} justify-self-start sm:col-span-2`}>{pending ? "Saving…" : "Save settings"}</button>
    </form>
  );
}
