"use client";

import { useActionState } from "react";
import type { TreeCollege } from "@/components/shared/academic-select";
import { TargetsEditor, type TargetValue } from "@/components/shared/targets-editor";
import { Field, inputClass, Notice, primaryButton, secondaryButton } from "@/components/shared/ui";
import { createAnnouncementAction, updateAnnouncementAction, type AnnouncementState } from "./actions";

export function AnnouncementForm({ organizations, values, tree, semesters }: {
  organizations?: { id: string; name: string }[];
  values?: { id: string; title: string; body: string; published: boolean; semesterId: string | null; targetMode: "ALL_MEMBERS" | "FILTERED"; targets: TargetValue[] };
  tree: TreeCollege[]; semesters: { id: string; label: string }[];
}) {
  const editing = !!values;
  const [state, action, pending] = useActionState<AnnouncementState, FormData>(editing ? updateAnnouncementAction : createAnnouncementAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.success && <Notice kind="success">{state.success}</Notice>}
      {editing ? <input type="hidden" name="announcementId" value={values.id} /> : (
        <Field id="organizationId" label="Organization">
          <select id="organizationId" name="organizationId" required className={inputClass}>{organizations!.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </Field>
      )}
      <Field id="title" label="Title" error={fe.title}><input id="title" name="title" required defaultValue={values?.title} className={inputClass} /></Field>
      <Field id="body" label="Message" error={fe.body}><textarea id="body" name="body" rows={6} required defaultValue={values?.body} className={inputClass} /></Field>
      <Field id="semesterId" label="School year and semester" hint="Used for audience matching. Defaults to the active term.">
        <select id="semesterId" name="semesterId" defaultValue={values?.semesterId ?? ""} className={inputClass}><option value="">Active term</option>{semesters.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      </Field>
      <TargetsEditor tree={tree} initialMode={values?.targetMode} initialTargets={values?.targets} allLabel="Everyone in the organization" error={fe.targets} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="intent" value="save" disabled={pending} className={secondaryButton}>{editing && values.published ? "Save changes" : "Save as draft"}</button>
        {!(editing && values.published) && <button type="submit" name="intent" value="publish" disabled={pending} className={primaryButton}>Publish &amp; notify</button>}
        {editing && values.published && <button type="submit" name="intent" value="unpublish" disabled={pending} className={secondaryButton}>Unpublish</button>}
      </div>
    </form>
  );
}
