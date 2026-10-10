"use client";

import { useActionState } from "react";
import { useConfirmSubmit } from "@/components/shared/modal";
import { Field, inputClass, Notice, primaryButton, secondaryButton, dangerButton } from "@/components/shared/ui";
import { assignMembershipAction, setSystemAdminAction, setUserActiveAction, type UserFormState } from "./actions";

const box = "flex max-w-3xl flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-card";

function Msg({ s }: { s: UserFormState }) {
  return <>{s.error && <Notice kind="error">{s.error}</Notice>}{s.success && <Notice kind="success">{s.success}</Notice>}</>;
}

/** Activate / deactivate with a confirmation dialog. Deactivation signs the person out everywhere; records are kept. */
export function StatusPanel({ userId, status, isSelf }: { userId: string; status: "ACTIVE" | "INVITED" | "DISABLED"; isSelf: boolean }) {
  const [s, action, pending] = useActionState<UserFormState, FormData>(setUserActiveAction, {});
  const confirmSubmit = useConfirmSubmit();
  if (status === "INVITED") {
    return (
      <section className={box}>
        <h2 className="font-medium">Account status</h2>
        <p className="text-sm text-muted">Awaiting setup: the person has not chosen a password yet. Create a setup link below.</p>
      </section>
    );
  }
  const active = status === "ACTIVE";
  return (
    <form
      action={action}
      className={box}
      onSubmit={confirmSubmit({ title: active ? "Deactivate account?" : "Reactivate account?", message: active ? "Deactivate this account? The person is signed out everywhere and cannot sign in. Their records are kept." : "Reactivate this account?", confirmLabel: active ? "Deactivate" : "Reactivate", danger: active })}
    >
      <h2 className="font-medium">Account status</h2>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Msg s={s} />
      <p className="text-sm text-muted">{active ? "Active. Deactivating blocks sign-in but keeps every record (attendance, finance, memberships)." : "Deactivated: this account cannot sign in."}</p>
      <button type="submit" disabled={pending || (isSelf && active)} className={`${active ? dangerButton : secondaryButton} self-start`}>{active ? "Deactivate account" : "Activate account"}</button>
      {isSelf && active && <p className="text-sm text-muted">You can&apos;t deactivate your own account.</p>}
    </form>
  );
}

/** System Admin is a system-level privilege, separate from every organization position. */
export function SystemAdminPanel({ userId, isAdmin, isSelf, status }: { userId: string; isAdmin: boolean; isSelf: boolean; status: string }) {
  const [s, action, pending] = useActionState<UserFormState, FormData>(setSystemAdminAction, {});
  const confirmSubmit = useConfirmSubmit();
  return (
    <form
      action={action}
      className={box}
      onSubmit={confirmSubmit({ title: isAdmin ? "Remove administrator access?" : "Grant administrator access?", message: isAdmin ? "Remove System Administrator access from this account?" : "Give this account System Administrator access? It will be able to manage all users, organizations and system settings.", confirmLabel: isAdmin ? "Remove access" : "Grant access", danger: isAdmin })}
    >
      <h2 className="font-medium">System administrator access</h2>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="makeAdmin" value={isAdmin ? "false" : "true"} />
      <Msg s={s} />
      <p className="text-sm text-muted">This is a system-level privilege and is separate from organization positions such as President or Treasurer. It is never granted by registration or CSV import.</p>
      {isSelf ? <p className="text-sm text-muted">You can&apos;t change your own system access.</p> : !isAdmin && status !== "ACTIVE" ? <p className="text-sm text-muted">Only an active account that has finished setup can become a system administrator.</p> : (
        <button type="submit" disabled={pending} className={`${isAdmin ? dangerButton : secondaryButton} self-start`}>{isAdmin ? "Remove system administrator access" : "Make system administrator"}</button>
      )}
    </form>
  );
}

const POSITIONS: [string, string][] = [["MEMBER", "Member"], ["OFFICER", "Officer"], ["SECRETARY", "Secretary"], ["TREASURER", "Treasurer"], ["AUDITOR", "Auditor"], ["ADVISER", "Adviser"], ["PRESIDENT", "President"]];
const TITLES = ["Vice President", "Attendance Officer", "Public Relations Officer", "Business Manager", "Assistant Secretary", "Assistant Treasurer"];

/** Adds a membership/position in one organization. The person's other memberships and their account are unchanged. */
export function AssignMembershipForm({ userId, organizations }: { userId: string; organizations: { id: string; name: string }[] }) {
  const [s, action, pending] = useActionState<UserFormState, FormData>(assignMembershipAction, {});
  if (organizations.length === 0) return <p className="text-sm text-muted">No active organizations to assign yet.</p>;
  return (
    <form action={action} className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-3">
      <h3 className="font-medium sm:col-span-3">Add to an organization</h3>
      <input type="hidden" name="userId" value={userId} />
      <div className="sm:col-span-3"><Msg s={s} /></div>
      <Field id="as-org" label="Organization"><select id="as-org" name="organizationId" required defaultValue="" className={inputClass}><option value="" disabled>Choose organization</option>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
      <Field id="as-role" label="Position" hint="Permissions come from the position and apply only in this organization.">
        <select id="as-role" name="role" defaultValue="MEMBER" className={inputClass}>{POSITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </Field>
      <Field id="as-title" label="Display title (optional)" hint="For example Vice President or Attendance Officer.">
        <input id="as-title" name="title" list="as-titles" maxLength={60} className={inputClass} />
        <datalist id="as-titles">{TITLES.map((t) => <option key={t} value={t} />)}</datalist>
      </Field>
      <button type="submit" disabled={pending} className={`${primaryButton} self-start sm:col-span-3`}>{pending ? "Adding…" : "Add to organization"}</button>
    </form>
  );
}
