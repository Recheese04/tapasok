"use client";

import { useActionState } from "react";
import { Field, inputClass, Notice, primaryButton } from "@/components/shared/ui";
import {
  createCollegeAction, createDepartmentAction, createProgramAction, createSchoolYearAction, createSemesterAction, setActiveTermAction,
  type AcademicState,
} from "./actions";

type Act = (prev: AcademicState, fd: FormData) => Promise<AcademicState>;
type Opt = { id: string; label: string };

/** One small form shell shared by every academic setup form. */
function Mini({ title, action, button, children }: { title: string; action: Act; button: string; children: (fe: Record<string, string | undefined>) => React.ReactNode }) {
  const [s, run, pending] = useActionState<AcademicState, FormData>(action, {});
  return (
    <form action={run} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
      <h3 className="font-medium">{title}</h3>
      {s.error && <Notice kind="error">{s.error}</Notice>}
      {s.success && <Notice kind="success">{s.success}</Notice>}
      {children(s.fieldErrors ?? {})}
      <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>{pending ? "Saving…" : button}</button>
    </form>
  );
}

const select = (id: string, name: string, opts: Opt[], placeholder: string) => (
  <select id={id} name={name} required className={inputClass} defaultValue={opts.length === 1 ? opts[0].id : ""}>
    <option value="" disabled>{placeholder}</option>
    {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
  </select>
);

export function SchoolYearForm() {
  return (
    <Mini title="Add school year" action={createSchoolYearAction} button="Add school year">
      {(fe) => (
        <>
          <Field id="sy-label" label="Label" error={fe.label}><input id="sy-label" name="label" required placeholder="2025-2026" className={inputClass} /></Field>
          <Field id="sy-start" label="Starts" error={fe.startsOn}><input id="sy-start" name="startsOn" type="date" required className={inputClass} /></Field>
          <Field id="sy-end" label="Ends" error={fe.endsOn}><input id="sy-end" name="endsOn" type="date" required className={inputClass} /></Field>
        </>
      )}
    </Mini>
  );
}

export function SemesterForm({ years }: { years: Opt[] }) {
  return (
    <Mini title="Add semester" action={createSemesterAction} button="Add semester">
      {(fe) => (
        <>
          <Field id="se-year" label="School year" error={fe.schoolYearId}>{select("se-year", "schoolYearId", years, "Choose school year")}</Field>
          <Field id="se-name" label="Name" error={fe.name}><input id="se-name" name="name" required placeholder="1st Semester" className={inputClass} /></Field>
          <Field id="se-seq" label="Order in the year" error={fe.sequence}><input id="se-seq" name="sequence" type="number" min={1} max={4} required defaultValue={1} className={inputClass} /></Field>
          <Field id="se-start" label="Starts" error={fe.startsOn}><input id="se-start" name="startsOn" type="date" required className={inputClass} /></Field>
          <Field id="se-end" label="Ends" error={fe.endsOn}><input id="se-end" name="endsOn" type="date" required className={inputClass} /></Field>
        </>
      )}
    </Mini>
  );
}

export function ActiveTermForm({ semesters }: { semesters: Opt[] }) {
  return (
    <Mini title="Set active term" action={setActiveTermAction} button="Set active">
      {() => <Field id="at-sem" label="Semester">{select("at-sem", "semesterId", semesters, "Choose semester")}</Field>}
    </Mini>
  );
}

export function CollegeForm() {
  return (
    <Mini title="Add college" action={createCollegeAction} button="Add college">
      {(fe) => (
        <>
          <Field id="co-code" label="Code" error={fe.code}><input id="co-code" name="code" required placeholder="CAS" className={inputClass} /></Field>
          <Field id="co-name" label="Name" error={fe.name}><input id="co-name" name="name" required placeholder="College of Arts and Sciences" className={inputClass} /></Field>
        </>
      )}
    </Mini>
  );
}

export function DepartmentForm({ colleges }: { colleges: Opt[] }) {
  return (
    <Mini title="Add department" action={createDepartmentAction} button="Add department">
      {(fe) => (
        <>
          <Field id="de-col" label="College" error={fe.collegeId}>{select("de-col", "collegeId", colleges, "Choose college")}</Field>
          <Field id="de-code" label="Code" error={fe.code}><input id="de-code" name="code" required className={inputClass} /></Field>
          <Field id="de-name" label="Name" error={fe.name}><input id="de-name" name="name" required className={inputClass} /></Field>
        </>
      )}
    </Mini>
  );
}

export function ProgramForm({ departments }: { departments: Opt[] }) {
  return (
    <Mini title="Add degree program" action={createProgramAction} button="Add program">
      {(fe) => (
        <>
          <Field id="pr-dep" label="Department" error={fe.departmentId}>{select("pr-dep", "departmentId", departments, "Choose department")}</Field>
          <Field id="pr-code" label="Code" error={fe.code}><input id="pr-code" name="code" required placeholder="BSIT" className={inputClass} /></Field>
          <Field id="pr-name" label="Name" error={fe.name}><input id="pr-name" name="name" required placeholder="BS Information Technology" className={inputClass} /></Field>
        </>
      )}
    </Mini>
  );
}
