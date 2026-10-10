"use client";

import { useActionState } from "react";
import { Field, inputClass, Notice, primaryButton } from "@/components/shared/ui";
import { uploadDocumentAction, type DocumentState } from "./actions";

export function UploadForm({ organizations, events }: { organizations: { id: string; name: string }[]; events: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState<DocumentState, FormData>(uploadDocumentAction, {});
  return (
    <form action={action} className="grid max-w-2xl gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card sm:grid-cols-2">
      <h2 className="font-medium sm:col-span-2">Upload a document</h2>
      {state.error && <div className="sm:col-span-2"><Notice kind="error">{state.error}</Notice></div>}
      {state.success && <div className="sm:col-span-2"><Notice kind="success">{state.success}</Notice></div>}
      <Field id="organizationId" label="Organization">
        <select id="organizationId" name="organizationId" required className={inputClass}>
          {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </Field>
      <Field id="category" label="Category"><select id="category" name="category" className={inputClass}><option value="MINUTES">Meeting minutes</option><option value="ATTENDANCE_SHEET">Attendance sheet</option><option value="RESOLUTION">Resolution</option><option value="EVENT_DOCUMENT">Event document</option><option value="OTHER">Other</option></select></Field>
      <Field id="doc-event" label="Related event (optional)"><select id="doc-event" name="eventId" className={inputClass}><option value="">— none —</option>{events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></Field>
      <Field id="title" label="Title"><input id="title" name="title" required className={inputClass} /></Field>
      <div className="sm:col-span-2"><Field id="description" label="Description (optional)"><input id="description" name="description" className={inputClass} /></Field></div>
      <div className="sm:col-span-2">
        <Field id="file" label="File" hint="PDF, Word, Excel, PowerPoint, PNG, JPG, TXT or CSV. Up to 10 MB.">
          <input id="file" name="file" type="file" required className={inputClass} />
        </Field>
      </div>
      <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>{pending ? "Uploading…" : "Upload"}</button>
    </form>
  );
}
