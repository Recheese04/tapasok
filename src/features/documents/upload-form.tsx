"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputClass, Notice, primaryButton } from "@/components/shared/ui";
import { uploadDocumentAction, type DocumentState } from "./actions";

const MAX_BYTES = 4 * 1024 * 1024; // same limit as the server (src/features/documents/storage.ts)

export function UploadForm({ organizations, events }: { organizations: { id: string; name: string }[]; events: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState<DocumentState, FormData>(uploadDocumentAction, {});
  const [tooBig, setTooBig] = useState<string | null>(null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // After a successful upload: clear the form and refresh the list behind the dialog so the new document shows at once.
  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    router.refresh();
  }, [state, router]);
  return (
    <form ref={formRef} action={action} onSubmit={(e) => { if (tooBig) e.preventDefault(); }} className="grid max-w-2xl gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card sm:grid-cols-2">
      <h2 className="font-medium sm:col-span-2">Upload a document</h2>
      {(tooBig || state.error) && <div className="sm:col-span-2"><Notice kind="error">{tooBig ?? state.error}</Notice></div>}
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
        <Field id="file" label="File" hint="PDF, Word, Excel, PowerPoint, PNG, JPG, TXT or CSV. Up to 4 MB.">
          <input id="file" name="file" type="file" required className={inputClass}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.csv"
            onChange={(e) => { const f = e.target.files?.[0]; setTooBig(f && f.size > MAX_BYTES ? `"${f.name}" is ${(f.size / 1048576).toFixed(1)} MB. The limit is 4 MB; compress it or split it into smaller files.` : null); }} />
        </Field>
      </div>
      <button type="submit" disabled={pending || !!tooBig} className={`${primaryButton} self-start`}>{pending ? "Uploading…" : "Upload"}</button>
    </form>
  );
}
