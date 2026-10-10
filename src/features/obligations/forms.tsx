"use client";

import { useActionState } from "react";
import { ModalButton } from "@/components/shared/modal";
import { Field, inputClass, Notice, primaryButton, secondaryButton } from "@/components/shared/ui";
import { createObligationAction, submitObligationAction, updateObligationAction, type ObligationState } from "./actions";

type Opt = { id: string; label: string };

/** Assign one obligation to one or more members of a single organization. */
export function ObligationForm({ organizationId, members, events }: { organizationId: string; members: Opt[]; events: Opt[] }) {
  const [state, action, pending] = useActionState<ObligationState, FormData>(createObligationAction, {});
  return (
    <form action={action} className="grid max-w-2xl gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
      <h3 className="font-medium">Assign an obligation</h3>
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.success && <Notice kind="success">{state.success}</Notice>}
      <input type="hidden" name="organizationId" value={organizationId} />
      <Field id="o-title" label="Title"><input id="o-title" name="title" required minLength={3} maxLength={150} className={inputClass} placeholder="e.g. Return borrowed equipment" /></Field>
      <Field id="o-desc" label="Description and instructions (optional)"><textarea id="o-desc" name="description" rows={3} maxLength={2000} className={inputClass} /></Field>
      <Field id="o-req" label="What counts as completed (optional)"><textarea id="o-req" name="completionRequirements" rows={2} maxLength={1000} className={inputClass} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="o-due" label="Due (optional)"><input id="o-due" name="dueAt" type="datetime-local" className={inputClass} /></Field>
        <Field id="o-event" label="Related event (optional)"><select id="o-event" name="eventId" className={inputClass}><option value="">— none —</option>{events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select></Field>
      </div>
      <fieldset className="max-h-56 overflow-y-auto rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-medium">Assign to</legend>
        {members.length === 0 ? <p className="text-sm text-muted">No members.</p> : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {members.map((m) => <li key={m.id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="userIds" value={m.id} /> {m.label}</label></li>)}
          </ul>
        )}
      </fieldset>
      <p className="text-xs text-muted">An obligation is a requirement. It does not create a fine or consequence by itself.</p>
      <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>{pending ? "Assigning…" : "Assign obligation"}</button>
    </form>
  );
}

/** The member reports progress; an officer verifies completion. */
export function SubmitObligationForm({ obligationId }: { obligationId: string }) {
  const [state, action, pending] = useActionState<ObligationState, FormData>(submitObligationAction, {});
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="obligationId" value={obligationId} />
      <input name="note" aria-label="Completion note" maxLength={1000} placeholder="What did you do? (optional)" className={inputClass} />
      <button type="submit" disabled={pending} className={`${secondaryButton} self-start`}>{pending ? "Sending…" : "Submit for verification"}</button>
      {state.error && <span role="alert" className="text-xs text-danger">{state.error}</span>}
      {state.success && <span role="status" className="text-xs text-success">{state.success}</span>}
    </form>
  );
}

type EditProps = { id: string; title: string; description: string; completionRequirements: string; dueAt: string };

/** Edit an open obligation's details (not its status or the member's submission), in a dialog. */
export function ObligationEdit(props: EditProps) {
  return (
    <ModalButton label="Edit" variant="link" title="Edit obligation" description={props.title} size="md">
      <ObligationEditForm {...props} />
    </ModalButton>
  );
}

// A separate component so each time the dialog opens it starts from the saved values, with no old messages.
function ObligationEditForm({ id, title, description, completionRequirements, dueAt }: EditProps) {
  const [state, action, pending] = useActionState<ObligationState, FormData>(updateObligationAction, {});
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="obligationId" value={id} />
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.success && <Notice kind="success">{state.success}</Notice>}
      <Field id={`oe-title-${id}`} label="Title"><input id={`oe-title-${id}`} name="title" required minLength={3} maxLength={150} defaultValue={title} className={inputClass} /></Field>
      <Field id={`oe-desc-${id}`} label="Description and instructions (optional)"><textarea id={`oe-desc-${id}`} name="description" rows={3} maxLength={2000} defaultValue={description} className={inputClass} /></Field>
      <Field id={`oe-req-${id}`} label="What counts as completed (optional)"><textarea id={`oe-req-${id}`} name="completionRequirements" rows={2} maxLength={1000} defaultValue={completionRequirements} className={inputClass} /></Field>
      <Field id={`oe-due-${id}`} label="Due (optional)"><input id={`oe-due-${id}`} name="dueAt" type="datetime-local" defaultValue={dueAt} className={inputClass} /></Field>
      <button type="submit" disabled={pending} className={primaryButton}>{pending ? "Saving…" : "Save changes"}</button>
    </form>
  );
}
