"use client";

import { useActionState, useState } from "react";
import { AddressFields } from "@/components/shared/address-fields";
import { AcademicSelect, type TreeCollege } from "@/components/shared/academic-select";
import { Badge, Field, inputClass, Notice, primaryButton, secondaryButton, Table, Td } from "@/components/shared/ui";
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

export function ImportForm() {
  const [state, action, pending] = useActionState<StudentFormState, FormData>(importStudentsAction, {});
  const s = state.summary;
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex max-w-3xl flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
        {state.error && <Notice kind="error">{state.error}</Notice>}
        <Field id="file" label="CSV file" hint="Required columns: student_number, first_name, last_name, email. Max 1 MB / 2000 rows.">
          <input id="file" name="file" type="file" accept=".csv,text/csv" required className={inputClass} />
        </Field>
        <p className="text-sm text-muted">
          Imported students get an account without a password and a one-time setup link. Imports never assign roles,
          and existing students are never overwritten.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="intent" value="check" disabled={pending} className={secondaryButton}>Check file only</button>
          <button type="submit" name="intent" value="import" disabled={pending} className={primaryButton}>{pending ? "Working…" : "Import students"}</button>
        </div>
      </form>

      {s && (
        <section aria-live="polite" data-keep-open className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-card">
          <h2 className="font-medium">{s.dryRun ? "Check results (nothing was imported)" : "Import results"}</h2>
          <p className="text-sm">
            {s.total} rows &middot; <Badge tone="green">{s.created} {s.dryRun ? "valid" : "created"}</Badge>{" "}
            <Badge tone={s.failed ? "red" : "gray"}>{s.failed} failed</Badge>
          </p>
          {s.ignoredColumns.length > 0 && <Notice kind="info">Ignored columns: {s.ignoredColumns.join(", ")}. Imports never set roles.</Notice>}
          {s.links.length > 0 && (
            <div className="flex flex-col gap-2">
              <Notice kind="info">Setup links are shown only now. Download them and deliver each one to its student securely.</Notice>
              <button type="button" className={`${primaryButton} self-start`} onClick={() => downloadLinks(s)}>Download setup links (CSV)</button>
            </div>
          )}
          {s.errors.length > 0 && (
            <Table head={["Row", "Student number", "Problem"]}>
              {s.errors.slice(0, 200).map((e) => (
                <tr key={`${e.row}-${e.message}`}><Td>{e.row}</Td><Td>{e.studentNumber || "—"}</Td><Td>{e.message}</Td></tr>
              ))}
            </Table>
          )}
          {s.errors.length > 200 && <p className="text-sm text-muted">Showing the first 200 problems.</p>}
        </section>
      )}
    </div>
  );
}
