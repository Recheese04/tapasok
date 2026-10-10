"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { actionDanger, inputClass, Notice, primaryButton } from "@/components/shared/ui";
import { ModalButton, useConfirmSubmit } from "@/components/shared/modal";
import { deleteAcademicAction, updateSchoolYearAction, updateSemesterAction, updateUnitAction, type AcademicState } from "./actions";

type Act = (prev: AcademicState, fd: FormData) => Promise<AcademicState>;

/** "Edit" link that opens a dialog with the given inputs. */
function Inline({ title, description, action, children }: { title: string; description?: string; action: Act; children: React.ReactNode }) {
  return (
    <ModalButton label="Edit" variant="action" title={title} description={description} size="md">
      <InlineForm action={action}>{children}</InlineForm>
    </ModalButton>
  );
}

// Its own component so every opening starts clean (no old success or error message).
function InlineForm({ action, children }: { action: Act; children: React.ReactNode }) {
  const [s, run, pending] = useActionState<AcademicState, FormData>(action, {});
  return (
    <form action={run} className="grid gap-3 sm:grid-cols-2">
      {children}
      {s.error && <div className="sm:col-span-2"><Notice kind="error">{s.error}</Notice></div>}
      {s.success && <div className="sm:col-span-2"><Notice kind="success">{s.success}</Notice></div>}
      {s.fieldErrors && Object.values(s.fieldErrors).filter(Boolean).map((m, i) => <p key={i} role="alert" className="text-sm text-danger sm:col-span-2">{m}</p>)}
      <button type="submit" disabled={pending} className={`${primaryButton} sm:col-span-2`}>{pending ? "Saving…" : "Save changes"}</button>
    </form>
  );
}

const f = (name: string, label: string, value: string, type = "text") => (
  <label className="flex flex-col gap-1 text-sm font-medium">{label}<input name={name} type={type} required defaultValue={value} className={inputClass} /></label>
);

export function SchoolYearEdit({ id, label, startsOn, endsOn }: { id: string; label: string; startsOn: string; endsOn: string }) {
  return (
    <Inline title="Edit school year" description={label} action={updateSchoolYearAction}>
      <input type="hidden" name="id" value={id} />
      {f("label", "Label", label)}{f("startsOn", "Starts", startsOn, "date")}{f("endsOn", "Ends", endsOn, "date")}
    </Inline>
  );
}

export function SemesterEdit({ id, name, sequence, startsOn, endsOn }: { id: string; name: string; sequence: number; startsOn: string; endsOn: string }) {
  return (
    <Inline title="Edit semester" description={name} action={updateSemesterAction}>
      <input type="hidden" name="id" value={id} />
      {f("name", "Name", name)}{f("sequence", "No.", String(sequence), "number")}{f("startsOn", "Starts", startsOn, "date")}{f("endsOn", "Ends", endsOn, "date")}
    </Inline>
  );
}

export function UnitEdit({ kind, id, code, name }: { kind: "college" | "department" | "program"; id: string; code: string; name: string }) {
  return (
    <Inline title={`Edit ${kind}`} description={name} action={updateUnitAction}>
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
      {f("code", "Code", code)}{f("name", "Name", name)}
    </Inline>
  );
}

/**
 * Delete, with a confirmation dialog. The button is only enabled when nothing refers to the entry (`blocked` says why not);
 * the server checks the same rule again, because the database refuses to delete anything that is still referenced.
 */
export function DeleteRecord({ kind, id, label, blocked }: { kind: "school_year" | "semester" | "college" | "department" | "program"; id: string; label: string; blocked?: string }) {
  const [s, run, pending] = useActionState<AcademicState, FormData>(deleteAcademicAction, {});
  const confirmSubmit = useConfirmSubmit();
  const router = useRouter();
  useEffect(() => { if (s.success) router.refresh(); }, [s.success, router]);
  return (
    <form
      action={run}
      className="inline-flex flex-col items-start gap-1"
      onSubmit={confirmSubmit({ title: "Delete permanently?", message: `Permanently delete ${label}? This cannot be undone. If anything uses it, archive it instead.`, confirmLabel: "Delete", danger: true })}
    >
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending || !!blocked} title={blocked ?? undefined} className={actionDanger}>{pending ? "Deleting…" : "Delete"}</button>
      {s.error && <span role="alert" className="max-w-56 text-xs text-danger">{s.error}</span>}
    </form>
  );
}
