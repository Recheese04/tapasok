"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AcademicSelect, type TreeCollege } from "@/components/shared/academic-select";
import { AddressFields } from "@/components/shared/address-fields";
import { Field, inputClass, Notice, primaryButton } from "@/components/shared/ui";
import { SetupLinkBox } from "@/features/students/student-forms";
import { createAccountAction, updateAccountAction, type UserFormState } from "./actions";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPES, type AccountType } from "./types";

export type UserFormValues = {
  userId?: string; type?: AccountType; firstName?: string; lastName?: string; email?: string;
  middleName?: string | null; contactNumber?: string | null;
  // student
  studentNumber?: string; programId?: string | null; collegeId?: string | null; departmentId?: string | null; yearLevel?: number | null; rfidUid?: string | null; streetAddress?: string | null;
  regionCode?: string | null; provinceCode?: string | null; cityCode?: string | null; barangayCode?: string | null; hasPhoto?: boolean;
  // staff
  employeeId?: string; jobTitle?: string | null;
};

/**
 * The one form for every kind of account. The sections shown depend on the account type, and the server validates the same
 * rules again. Creating an account never assigns a position or privilege; positions are managed per organization.
 */
export function UserForm({ tree, values, initialType = "STUDENT" }: { tree: TreeCollege[]; values?: UserFormValues; initialType?: AccountType }) {
  const editing = !!values?.userId;
  const [state, action, pending] = useActionState<UserFormState, FormData>(editing ? updateAccountAction : createAccountAction, {});
  const [type, setType] = useState<AccountType>(values?.type ?? initialType);
  const fe = state.fieldErrors ?? {};
  const t = editing ? values!.type! : type;
  const hasProfile = t !== "ACCOUNT_ONLY";

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-card">
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.success && <Notice kind="success">{state.success}</Notice>}
      {state.initialPassword && (
        <div data-keep-open className="flex flex-col gap-2 rounded-xl border border-border bg-sidebar px-4 py-3 text-sm">
          <p>The account is active. Its starting password is <code className="rounded bg-surface px-1.5 py-0.5 font-mono">{state.initialPassword}</code>. Tell the person to change it in Profile &amp; Settings.</p>
          {state.userId && <Link href={`/users/${state.userId}`} className="text-primary hover:underline">Open this account to assign organizations and positions</Link>}
        </div>
      )}
      {state.setupPath && (
        <div data-keep-open className="flex flex-col gap-3">
          <SetupLinkBox path={state.setupPath} />
          {state.userId && <Link href={`/users/${state.userId}`} className="text-sm text-primary hover:underline">Open this account to assign organizations and positions</Link>}
        </div>
      )}
      {editing && <input type="hidden" name="userId" value={values!.userId} />}
      <input type="hidden" name="accountType" value={t} />

      {!editing && (
        <Field id="accountType-select" label="Account type" hint="A person has one account. Officer positions are added later, per organization, and do not change the account type.">
          <select id="accountType-select" value={type} onChange={(e) => setType(e.target.value as AccountType)} className={inputClass}>
            {ACCOUNT_TYPES.map((a) => <option key={a} value={a}>{ACCOUNT_TYPE_LABEL[a]}</option>)}
          </select>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="firstName" label="First name" error={fe.firstName}><input id="firstName" name="firstName" required defaultValue={values?.firstName} className={inputClass} /></Field>
        <Field id="lastName" label="Last name" error={fe.lastName}><input id="lastName" name="lastName" required defaultValue={values?.lastName} className={inputClass} /></Field>
        {hasProfile && <Field id="middleName" label="Middle name (optional)" error={fe.middleName}><input id="middleName" name="middleName" defaultValue={values?.middleName ?? ""} className={inputClass} /></Field>}
        <Field id="email" label="Email" error={fe.email}><input id="email" name="email" type="email" required autoComplete="off" defaultValue={values?.email} className={inputClass} /></Field>
        {hasProfile && <Field id="contactNumber" label="Contact number (optional)" error={fe.contactNumber}><input id="contactNumber" name="contactNumber" inputMode="tel" placeholder="09171234567" defaultValue={values?.contactNumber ?? ""} className={inputClass} /></Field>}
      </div>

      {t === "STUDENT" && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-medium">Student profile</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="studentNumber" label="Student number" error={fe.studentNumber}><input id="studentNumber" name="studentNumber" required defaultValue={values?.studentNumber} className={inputClass} /></Field>
            <Field id="yearLevel" label="Year level" error={fe.yearLevel}><input id="yearLevel" name="yearLevel" type="number" min={1} max={10} defaultValue={values?.yearLevel ?? ""} className={inputClass} /></Field>
            {editing ? (
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium">RFID card</span>
                <span className="font-mono text-muted">{values?.rfidUid ?? "None"}</span>
                <Link href={`/users/${values!.userId}#rfid`} className="text-xs font-medium text-primary hover:underline">{values?.rfidUid ? "Change card" : "Register a card"} (scan or enter the UID)</Link>
              </div>
            ) : (
              <Field id="rfidUid" label="RFID card UID (optional)" error={fe.rfidUid} hint="Hexadecimal, for example 04A1B2C3."><input id="rfidUid" name="rfidUid" defaultValue={values?.rfidUid ?? ""} autoCapitalize="characters" className={`${inputClass} font-mono`} /></Field>
            )}
          </div>
          <div>
            <AcademicSelect tree={tree} depth="program" defaults={values} errors={fe} />
            <p className="mt-1 text-xs text-muted">College, department and program come from the academic setup. Program and year level are recorded for the active semester.</p>
          </div>
          <Field id="streetAddress" label="House no. / street (optional)" error={fe.streetAddress}><input id="streetAddress" name="streetAddress" defaultValue={values?.streetAddress ?? ""} className={inputClass} /></Field>
          <AddressFields defaults={values} errors={fe} />
          <Field id="photo" label={`Profile photo (optional)${values?.hasPhoto ? " — replaces the current one" : ""}`} error={fe.photo} hint="JPG or PNG, up to 2 MB.">
            <input id="photo" name="photo" type="file" accept="image/jpeg,image/png" className={inputClass} />
          </Field>
        </fieldset>
      )}

      {t === "STAFF" && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-medium">Faculty / staff profile</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="employeeId" label="Employee / staff ID" error={fe.employeeId}><input id="employeeId" name="employeeId" required defaultValue={values?.employeeId} className={inputClass} /></Field>
            <Field id="jobTitle" label="Job title (optional)" error={fe.jobTitle}><input id="jobTitle" name="jobTitle" defaultValue={values?.jobTitle ?? ""} className={inputClass} /></Field>
          </div>
          <AcademicSelect tree={tree} depth="department" defaults={values} errors={fe} />
          <p className="text-xs text-muted">Adviser duties are not a profile field: assign the Adviser position to this account for each organization it advises.</p>
        </fieldset>
      )}

      {t === "ACCOUNT_ONLY" && <p className="text-sm text-muted">An account with no student or staff profile (for example a dedicated administrator). It can still be given organization positions.</p>}

      <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>{pending ? "Saving…" : editing ? "Save changes" : "Create account"}</button>
      {!editing && <p className="text-xs text-muted">No password is set here. The account is created as &quot;awaiting setup&quot; and the person chooses their own password with the one-time setup link.</p>}
    </form>
  );
}
