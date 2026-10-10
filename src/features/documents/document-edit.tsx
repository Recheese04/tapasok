"use client";

import { useActionState } from "react";
import { ModalButton } from "@/components/shared/modal";
import { Field, inputClass, Notice, primaryButton } from "@/components/shared/ui";
import { updateDocumentAction, type DocumentEditState } from "./actions";

const CATEGORIES: [string, string][] = [["MINUTES", "Minutes"], ["ATTENDANCE_SHEET", "Attendance sheet"], ["RESOLUTION", "Resolution"], ["EVENT_DOCUMENT", "Event document"], ["OTHER", "Other"]];

type Props = { id: string; title: string; description: string; category: string };

/** Edit a document's details in a dialog. The stored file and uploader are never changed. */
export function DocumentEdit(props: Props) {
  return (
    <ModalButton label="Edit" variant="link" title="Edit document details" description={props.title} size="md">
      <DocumentEditForm {...props} />
    </ModalButton>
  );
}

function DocumentEditForm({ id, title, description, category }: Props) {
  const [state, action, pending] = useActionState<DocumentEditState, FormData>(updateDocumentAction, {});
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="documentId" value={id} />
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.success && <Notice kind="success">{state.success}</Notice>}
      <Field id={`de-title-${id}`} label="Title"><input id={`de-title-${id}`} name="title" required minLength={2} maxLength={150} defaultValue={title} className={inputClass} /></Field>
      <Field id={`de-desc-${id}`} label="Description (optional)"><input id={`de-desc-${id}`} name="description" maxLength={500} defaultValue={description} className={inputClass} /></Field>
      <Field id={`de-cat-${id}`} label="Category"><select id={`de-cat-${id}`} name="category" defaultValue={category} className={inputClass}>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <button type="submit" disabled={pending} className={primaryButton}>{pending ? "Saving…" : "Save changes"}</button>
    </form>
  );
}
