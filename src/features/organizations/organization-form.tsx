"use client";

import { useActionState, useState } from "react";
import { AcademicSelect, type TreeCollege } from "@/components/shared/academic-select";
import { Field, inputClass, Notice, primaryButton } from "@/components/shared/ui";
import { createOrganizationAction, updateOrganizationAction, type FormState } from "./actions";

type Org = {
  id: string; name: string; acronym: string | null; description: string | null;
  scope: "DEPARTMENTAL" | "COLLEGE_WIDE" | "UNIVERSITY_WIDE" | "CO_CURRICULAR";
  collegeId: string | null; departmentId: string | null; programId: string | null; autoEnroll: boolean;
};

const SCOPES = [
  ["CO_CURRICULAR", "Co-curricular / interest-based (students join by request or code)"],
  ["DEPARTMENTAL", "Departmental"],
  ["COLLEGE_WIDE", "College-wide"],
  ["UNIVERSITY_WIDE", "University-wide"],
] as const;

export function OrganizationForm({ organization, tree }: { organization?: Org; tree: TreeCollege[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(organization ? updateOrganizationAction : createOrganizationAction, {});
  const [scope, setScope] = useState<Org["scope"]>(organization?.scope ?? "CO_CURRICULAR");
  const fe = state.fieldErrors ?? {};
  const depth = scope === "COLLEGE_WIDE" ? "college" : "program";

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
      {organization && <input type="hidden" name="organizationId" value={organization.id} />}
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.success && <Notice kind="success">{state.success}</Notice>}

      <Field id="name" label="Name" error={fe.name}><input id="name" name="name" required defaultValue={organization?.name} className={inputClass} /></Field>
      <Field id="acronym" label="Acronym (optional)" error={fe.acronym}><input id="acronym" name="acronym" defaultValue={organization?.acronym ?? ""} className={inputClass} /></Field>
      <Field id="description" label="Description (optional)" error={fe.description}><textarea id="description" name="description" rows={3} defaultValue={organization?.description ?? ""} className={inputClass} /></Field>

      <Field id="scope" label="Scope" error={fe.scope}>
        <select id="scope" name="scope" value={scope} onChange={(e) => setScope(e.target.value as Org["scope"])} className={inputClass}>
          {SCOPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>

      {(scope === "DEPARTMENTAL" || scope === "COLLEGE_WIDE") && (
        <div>
          <AcademicSelect key={scope} tree={tree} depth={depth} required defaults={organization} errors={fe} />
          {scope === "DEPARTMENTAL" && <p className="mt-1 text-xs text-muted">The program is optional: leave it empty for the whole department.</p>}
        </div>
      )}

      {scope !== "CO_CURRICULAR" && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="autoEnroll" defaultChecked={organization?.autoEnroll} className="mt-1" />
          <span>Automatically add enrolled students of this academic unit as members. Only students enrolled in the active semester are mapped, and only as ordinary members.</span>
        </label>
      )}

      {!organization && (
        <Field id="adviserEmail" label="Official faculty / staff adviser (account email)" error={fe.adviserEmail} hint="Create the adviser's account under Users first.">
          <input id="adviserEmail" name="adviserEmail" type="email" required className={inputClass} />
        </Field>
      )}

      <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>
        {pending ? "Saving…" : organization ? "Save changes" : "Create organization"}
      </button>
    </form>
  );
}
