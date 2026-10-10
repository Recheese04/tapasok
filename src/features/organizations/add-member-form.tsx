"use client";

import { useActionState } from "react";
import { Field, inputClass, Notice, primaryButton } from "@/components/shared/ui";
import { addMemberAction, type FormState } from "./actions";

export function AddMemberForm({ organizationId, canAssignPrivileged }: { organizationId: string; canAssignPrivileged: boolean }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addMemberAction, {});
  return (
    <form action={formAction} className="grid gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card sm:grid-cols-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <h2 className="font-medium sm:col-span-2">Add member or officer</h2>
      {state.error && <div className="sm:col-span-2"><Notice kind="error">{state.error}</Notice></div>}
      {state.success && <div className="sm:col-span-2"><Notice kind="success">{state.success}</Notice></div>}
      <Field id="member-email" label="Account email" error={state.fieldErrors?.email}><input id="member-email" name="email" type="email" required className={inputClass} /></Field>
      <Field id="member-role" label="Position">
        <select id="member-role" name="role" defaultValue="MEMBER" className={inputClass}>
          <option value="MEMBER">Member</option>
          <option value="OFFICER">Officer</option>
          <option value="SECRETARY">Secretary</option>
          <option value="TREASURER">Treasurer</option>
          <option value="AUDITOR">Auditor</option>
          {canAssignPrivileged && <option value="ADVISER">Adviser</option>}
          {canAssignPrivileged && <option value="PRESIDENT">President</option>}
        </select>
      </Field>
      <div className="sm:col-span-2"><Field id="member-title" label="Display title (optional)" hint="Shown next to the name; permissions come from the position, not the title."><input id="member-title" name="title" placeholder="e.g. Vice President" className={inputClass} /></Field></div>
      <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>{pending ? "Adding…" : "Add"}</button>
    </form>
  );
}
