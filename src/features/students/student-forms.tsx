"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { AddressFields } from "@/components/shared/address-fields";
import { AcademicSelect, type TreeCollege } from "@/components/shared/academic-select";
import { parseCsv } from "@/lib/csv";
import { Badge, Field, inputClass, Notice, primaryButton, secondaryButton } from "@/components/shared/ui";
import { checkImportHeader, IMPORT_SPEC, templateCsv } from "./import-spec";
import {
  createStudentAction, generateSetupLinkAction, importStudentsAction, updateOwnProfileAction, updateStudentAction,
  type StudentFormState,
} from "./actions";

export type StudentValues = {
  userId?: string; studentNumber?: string; firstName?: string; lastName?: string; middleName?: string | null; email?: string;
  programId?: string | null; collegeId?: string | null; departmentId?: string | null; rfidUid?: string | null; yearLevel?: number | null; contactNumber?: string | null; streetAddress?: string | null;
  regionCode?: string | null; provinceCode?: string | null; cityCode?: string | null; barangayCode?: string | null;
};

export function SetupLinkBox({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const full = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning px-3 py-2">
      <p className="text-sm">One-time setup link (shown once, valid 14 days). Send it to the student securely:</p>
      <code className="break-all text-xs">{full}</code>
      <button type="button" className={`${secondaryButton} self-start`} onClick={async () => {
        try { await navigator.clipboard.writeText(full); setCopied(true); } catch { setCopied(false); }
      }}>{copied ? "Copied" : "Copy link"}</button>
    </div>
  );
}

function Messages({ state }: { state: StudentFormState }) {
  return (
    <>
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.success && <Notice kind="success">{state.success}</Notice>}
      {state.setupPath && <SetupLinkBox path={state.setupPath} />}
      {state.initialPassword && <Notice kind="info">The account is active. Starting password: {state.initialPassword}</Notice>}
    </>
  );
}

export function StudentForm({ student, ownProfile = false, tree = [] }: { student?: StudentValues; ownProfile?: boolean; tree?: TreeCollege[] }) {
  const editing = !!student?.userId;
  const [state, action, pending] = useActionState<StudentFormState, FormData>(
    ownProfile ? updateOwnProfileAction : editing ? updateStudentAction : createStudentAction, {},
  );
  const fe = state.fieldErrors ?? {};
  const lock = ownProfile; // students may edit only contact details and address themselves
  return (
    <form action={action} className={ownProfile ? "flex flex-col gap-4 p-6" : "flex max-w-3xl flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card"}>
      <Messages state={state} />
      {editing && !ownProfile && <input type="hidden" name="userId" value={student!.userId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="studentNumber" label="Student number" error={fe.studentNumber}>
          <input id="studentNumber" name="studentNumber" required defaultValue={student?.studentNumber} readOnly={lock} className={inputClass} />
        </Field>
        <Field id="email" label="Email" error={fe.email} hint={editing ? "Email is changed from the Users page." : undefined}>
          <input id="email" name="email" type="email" required={!editing} defaultValue={student?.email} readOnly={editing} className={inputClass} />
        </Field>
        <Field id="firstName" label="First name" error={fe.firstName}>
          <input id="firstName" name="firstName" required defaultValue={student?.firstName} readOnly={lock} className={inputClass} />
        </Field>
        <Field id="lastName" label="Last name" error={fe.lastName}>
          <input id="lastName" name="lastName" required defaultValue={student?.lastName} readOnly={lock} className={inputClass} />
        </Field>
        <Field id="middleName" label="Middle name (optional)" error={fe.middleName}>
          <input id="middleName" name="middleName" defaultValue={student?.middleName ?? ""} className={inputClass} />
        </Field>
        <Field id="contactNumber" label="Mobile number (optional)" error={fe.contactNumber}>
          <input id="contactNumber" name="contactNumber" inputMode="tel" placeholder="09171234567" defaultValue={student?.contactNumber ?? ""} className={inputClass} />
        </Field>
        {!ownProfile && (
          <>
            <Field id="yearLevel" label="Year level" error={fe.yearLevel}>
              <input id="yearLevel" name="yearLevel" type="number" min={1} max={10} defaultValue={student?.yearLevel ?? ""} className={inputClass} />
            </Field>
            <Field id="rfidUid" label="RFID card UID (optional)" error={fe.rfidUid} hint="Hexadecimal, as printed by the reader (for example 04A1B2C3).">
              <input id="rfidUid" name="rfidUid" defaultValue={student?.rfidUid ?? ""} autoCapitalize="characters" className={`${inputClass} font-mono`} />
            </Field>
          </>
        )}
      </div>
      {!ownProfile && (
        <div>
          <AcademicSelect tree={tree} depth="program" defaults={student} errors={fe} />
          <p className="mt-1 text-xs text-muted">Program and year level are recorded for the active semester, so past terms keep their own placement.</p>
        </div>
      )}
      <Field id="photo" label="Profile photo (optional)" error={fe.photo} hint="JPG or PNG, up to 2 MB.">
        <input id="photo" name="photo" type="file" accept="image/jpeg,image/png" className={inputClass} />
      </Field>
      <Field id="streetAddress" label="House no. / street (optional)" error={fe.streetAddress}>
        <input id="streetAddress" name="streetAddress" defaultValue={student?.streetAddress ?? ""} className={inputClass} />
      </Field>
      <AddressFields defaults={student} errors={fe} />
      <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>
        {pending ? "Saving…" : editing || ownProfile ? "Save changes" : "Create student"}
      </button>
    </form>
  );
}

export function SetupLinkForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<StudentFormState, FormData>(generateSetupLinkAction, {});
  return (
    <form action={action} className="flex max-w-3xl flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <h2 className="font-medium">Account setup link</h2>
      <p className="text-sm text-muted">Creates a single-use link for the person to choose their own password. Replaces any unused link.</p>
      <input type="hidden" name="userId" value={userId} />
      <Messages state={state} />
      <button type="submit" disabled={pending} className={`${secondaryButton} self-start`}>{pending ? "Creating…" : "Create setup link"}</button>
    </form>
  );
}

function downloadLinks(summary: NonNullable<StudentFormState["summary"]>) {
  const esc = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""');
  const lines = ["student_number,name,email,setup_link", ...summary.links.map((l) =>
    [l.studentNumber, l.name, l.email, `${window.location.origin}${l.path}`].map((c) => `"${esc(c)}"`).join(","))];
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = "tapasok-setup-links.csv"; a.click();
  URL.revokeObjectURL(url);
}

export type ImportReference = {
  programs: { code: string; name: string }[];
  colleges: { code: string; name: string }[];
  departments: { college: string; code: string; name: string }[];
};

const NEED_BADGE = { required: ["red", "Required"], conditional: ["amber", "Depends on type"], optional: ["gray", "Optional"] } as const;

function downloadText(filename: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/**
 * CSV import in three steps: read the requirements (and download the template), check the file (nothing is saved, every row
 * is validated with the same rules the server uses), then confirm the import. Rows with problems are never imported and are
 * always listed with their row number; the result never reports success for rows that failed.
 */
export function ImportForm({ reference }: { reference?: ImportReference }) {
  const [state, action, pending] = useActionState<StudentFormState, FormData>(importStudentsAction, {});
  const [file, setFile] = useState<File | null>(null);
  const [headerProblems, setHeaderProblems] = useState<string[]>([]);
  const [checked, setChecked] = useState<string | null>(null);
  const s = state.summary;
  const sig = file ? `${file.name}:${file.size}:${file.lastModified}` : null;

  // Cheap check in the browser as soon as a file is chosen: the same header rules the server applies.
  async function onFile(f: File | null) {
    setFile(f);
    setChecked(null);
    setHeaderProblems([]);
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) { setHeaderProblems(["Choose a .csv file."]); return; }
    const head = parseCsv(await f.slice(0, 64 * 1024).text())[0] ?? [];
    setHeaderProblems(head.length === 0 ? ["The file is empty."] : checkImportHeader(head));
  }

  // After a check or an import, bring the results into view: the form is taller than the dialog.
  const resultsRef = useRef<HTMLElement>(null);
  useEffect(() => { if (s) resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [s]);

  const checkedThis = !!s?.dryRun && checked === sig;
  const canCheck = !!file && headerProblems.length === 0 && !pending;
  const canImport = canCheck && checkedThis && s!.created > 0;

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="imp-columns" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="imp-columns" className="text-sm font-semibold">1. Prepare your CSV</h3>
          <button type="button" className={secondaryButton} onClick={() => downloadText("tapasok-import-template.csv", templateCsv())}>Download CSV template</button>
        </div>
        <p className="text-sm text-muted">
          The template has every column, one example student and one example staff member. Delete the example rows and add yours. Students need a student number;
          staff need <code>account_type</code> STAFF and an employee ID. Columns not listed here are ignored, and an import can never create administrators or assign positions.
        </p>
        <div className="max-h-64 overflow-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-sidebar text-xs uppercase tracking-wide text-muted">
              <tr><th scope="col" className="px-3 py-2 font-semibold">Column</th><th scope="col" className="px-3 py-2 font-semibold">Needed?</th><th scope="col" className="px-3 py-2 font-semibold">Notes</th></tr>
            </thead>
            <tbody>
              {IMPORT_SPEC.map((c) => (
                <tr key={c.name} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{c.name}</td>
                  <td className="px-3 py-1.5"><Badge tone={NEED_BADGE[c.need][0]}>{NEED_BADGE[c.need][1]}</Badge></td>
                  <td className="px-3 py-1.5 text-muted">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {reference && (
          <details className="rounded-xl border border-border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">Valid codes for program_code, college_code and department_code</summary>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-muted">Programs (students)</p>
                {reference.programs.length === 0 ? <p className="text-muted">None set up yet.</p> : <ul>{reference.programs.map((p) => <li key={p.code}><code className="text-xs">{p.code}</code> {p.name}</li>)}</ul>}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-muted">Colleges and departments (staff)</p>
                {reference.colleges.length === 0 ? <p className="text-muted">None set up yet.</p> : (
                  <ul>
                    {reference.colleges.map((c) => (
                      <li key={c.code}><code className="text-xs">{c.code}</code> {c.name}
                        <ul className="ml-4">{reference.departments.filter((d) => d.college === c.code).map((d) => <li key={d.code}><code className="text-xs">{d.code}</code> {d.name}</li>)}</ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </details>
        )}
      </section>

      {/* Submitted by hand: React clears uncontrolled fields after a form action, which would lose the chosen file between
          "Check" and "Import". The File is kept in state and attached to every request instead. */}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!file) return;
          const fd = new FormData();
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          fd.set("intent", submitter?.value === "import" ? "import" : "check");
          fd.set("file", file);
          if (sig) setChecked(sig);
          startTransition(() => action(fd));
        }}
      >
        <h3 className="text-sm font-semibold">2. Choose the file and check it</h3>
        {state.error && <Notice kind="error">{state.error}</Notice>}
        <Field id="file" label="CSV file" hint="Max 1 MB and 2000 rows per file.">
          <input id="file" name="file" type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} className={inputClass} />
        </Field>
        {headerProblems.length > 0 && (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            <p className="font-medium">This file can&apos;t be imported yet:</p>
            <ul className="list-disc pl-5">{headerProblems.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="intent" value="check" disabled={!canCheck} className={secondaryButton}>{pending ? "Working…" : "Check file (nothing is saved)"}</button>
          <button type="submit" name="intent" value="import" disabled={!canImport} className={primaryButton}>
            {canImport ? `Import ${s!.created} valid row${s!.created === 1 ? "" : "s"}` : "Import"}
          </button>
        </div>
        {file && headerProblems.length === 0 && !checkedThis && <p className="text-xs text-muted">Check the file first; the import button unlocks once the check has run.</p>}
      </form>

      {s && (
        <section ref={resultsRef} aria-live="polite" aria-label="Import results" data-keep-open className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
          <h3 className="font-semibold">{s.dryRun ? "Check results: nothing has been imported" : "Import finished"}</h3>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span>{s.total} row{s.total === 1 ? "" : "s"}</span>
            <Badge tone="green">{s.created} {s.dryRun ? "valid" : "imported"}</Badge>
            <Badge tone={s.failed ? "red" : "gray"}>{s.failed} with problems{s.failed ? " (not imported)" : ""}</Badge>
          </p>
          {!s.dryRun && s.failed > 0 && <Notice kind="error">{s.failed} row{s.failed === 1 ? " was" : "s were"} NOT imported. Fix them in the CSV and import the file again; rows that already exist are skipped, never overwritten.</Notice>}
          {!s.dryRun && s.failed === 0 && <Notice kind="success">All {s.created} rows were imported.</Notice>}
          {s.dryRun && s.failed > 0 && <Notice kind="info">Rows with problems will be skipped if you import now. Fix the CSV and check again if they should be included.</Notice>}
          {s.ignoredColumns.length > 0 && <Notice kind="info">Ignored columns: {s.ignoredColumns.join(", ")}. Imports never set roles or privileges.</Notice>}
          {s.initialPassword && <Notice kind="info">The imported accounts are active and their starting password is <strong>{s.initialPassword}</strong>. No setup links were created. Ask everyone to change it in Profile &amp; Settings.</Notice>}
          {s.links.length > 0 && (
            <div className="flex flex-col gap-2">
              <Notice kind="info">Setup links are shown only now. Download them and deliver each one to its owner securely.</Notice>
              <button type="button" className={`${primaryButton} self-start`} onClick={() => downloadLinks(s)}>Download setup links (CSV)</button>
            </div>
          )}
          {s.errors.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold">Problems to fix</h4>
              <div className="max-h-72 overflow-auto rounded-xl border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-sidebar text-xs uppercase tracking-wide text-muted"><tr><th scope="col" className="px-3 py-2">Row</th><th scope="col" className="px-3 py-2">ID</th><th scope="col" className="px-3 py-2">Problem</th></tr></thead>
                  <tbody>{s.errors.slice(0, 200).map((e) => <tr key={`${e.row}-${e.message}`} className="border-t border-border align-top"><td className="px-3 py-1.5 font-medium">{e.row}</td><td className="px-3 py-1.5">{e.studentNumber || "—"}</td><td className="px-3 py-1.5 text-danger">{e.message}</td></tr>)}</tbody>
                </table>
              </div>
              {s.errors.length > 200 && <p className="text-sm text-muted">Showing the first 200 problems.</p>}
              <button type="button" className={`${secondaryButton} self-start`} onClick={() => downloadText("tapasok-import-problems.csv", ["row,id,problem", ...s.errors.map((e) => [e.row, e.studentNumber, e.message].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\r\n"))}>Download problem list (CSV)</button>
            </div>
          )}
          {s.preview.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold">{s.total > s.preview.length ? `Preview (first ${s.preview.length} rows)` : "Preview"}</h4>
              <div className="max-h-72 overflow-auto rounded-xl border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-sidebar text-xs uppercase tracking-wide text-muted"><tr><th scope="col" className="px-3 py-2">Row</th><th scope="col" className="px-3 py-2">Type</th><th scope="col" className="px-3 py-2">ID</th><th scope="col" className="px-3 py-2">Name</th><th scope="col" className="px-3 py-2">Email</th><th scope="col" className="px-3 py-2">Result</th></tr></thead>
                  <tbody>{s.preview.map((r) => <tr key={r.row} className="border-t border-border"><td className="px-3 py-1.5">{r.row}</td><td className="px-3 py-1.5">{r.type}</td><td className="px-3 py-1.5">{r.id || "—"}</td><td className="px-3 py-1.5">{r.name || "—"}</td><td className="break-all px-3 py-1.5">{r.email || "—"}</td><td className="px-3 py-1.5">{r.ok ? <Badge tone="green">{s.dryRun ? "Valid" : "Imported"}</Badge> : <Badge tone="red">Problem</Badge>}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
