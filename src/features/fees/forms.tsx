"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ModalButton } from "@/components/shared/modal";
import { Field, inputClass, Notice, primaryButton, secondaryButton } from "@/components/shared/ui";
import { CREATABLE_KINDS, FEE_KIND } from "./labels";
import { applyFeeToAllAction, type ApplyState } from "./actions";
import { adjustLedgerAction, assessMemberAction, createFeeTypeAction, recordPaymentAction, updateFeeTypeAction, submitDigitalPaymentAction, type FeeState } from "./actions";

export function FeeTypeForm({ organizationId, events }: { organizationId: string; events: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState<FeeState, FormData>(createFeeTypeAction, {});
  const [kind, setKind] = useState("DUES");
  return (
    <form action={action} className="grid max-w-xl gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:grid-cols-2">
      <h3 className="font-medium sm:col-span-2">Create a fee</h3>
      {state.error && <div className="sm:col-span-2"><Notice kind="error">{state.error}</Notice></div>}
      {state.success && <div className="sm:col-span-2"><Notice kind="success">{state.success}</Notice></div>}
      <input type="hidden" name="organizationId" value={organizationId} />
      <Field id="fee-kind" label="Type">
        <select id="fee-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
          {CREATABLE_KINDS.map((k) => <option key={k} value={k}>{FEE_KIND[k]}</option>)}
        </select>
      </Field>
      <Field id="fee-name" label="Name"><input id="fee-name" name="name" required className={inputClass} placeholder="e.g. Membership fee 2026-2027, Org shirt, ID lace" /></Field>
      <Field id="fee-amount" label="Amount (PHP)"><input id="fee-amount" name="amount" required inputMode="decimal" placeholder="150.00" className={inputClass} /></Field>
      <Field id="fee-due" label="Due date (optional)"><input id="fee-due" name="dueDate" type="date" className={inputClass} /></Field>
      {kind === "EVENT_CONTRIBUTION" && (
        <Field id="fee-event" label="Event"><select id="fee-event" name="eventId" required className={inputClass}>{events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></Field>
      )}
      <div className="sm:col-span-2"><Field id="fee-desc" label="Description (optional)"><input id="fee-desc" name="description" className={inputClass} /></Field></div>
      <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>{pending ? "Creating…" : "Create"}</button>
    </form>
  );
}

export function AssessMemberForm({ feeTypeId }: { feeTypeId: string }) {
  const [s, action, pending] = useActionState<FeeState, FormData>(assessMemberAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="feeTypeId" value={feeTypeId} />
      <input name="studentNumber" aria-label="Student number to apply this fee to" placeholder="Student no." required className="rounded-lg border border-border bg-surface px-2 py-1 text-xs" />
      <button type="submit" disabled={pending} className="text-xs text-primary hover:underline">{pending ? "…" : "Apply to one member"}</button>
      {s.error && <span role="alert" className="text-xs text-danger">{s.error}</span>}
      {s.success && <span role="status" className="text-xs text-success">{s.success}</span>}
    </form>
  );
}

export function PaymentForm({ studentFeeId, balance }: { studentFeeId: string; balance: string }) {
  const [state, action, pending] = useActionState<FeeState, FormData>(recordPaymentAction, {});
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="studentFeeId" value={studentFeeId} />
      <div className="flex flex-wrap gap-1">
        <input name="amount" aria-label="Payment amount" required inputMode="decimal" defaultValue={balance} className={`${inputClass} w-24`} />
        <select name="method" aria-label="Payment method" className={`${inputClass} w-auto`}>
          <option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="OTHER">Other</option>
        </select>
        <input name="reference" aria-label="Reference number" placeholder="Reference" maxLength={100} className={`${inputClass} w-28`} />
        <button type="submit" disabled={pending} className={secondaryButton}>{pending ? "…" : "Record"}</button>
      </div>
      {state.error && <p role="alert" className="text-xs text-danger">{state.error}</p>}
      {state.success && <p role="status" className="text-xs text-success">{state.success}</p>}
    </form>
  );
}

export function AdjustForm({ studentFeeId }: { studentFeeId: string }) {
  const [state, action, pending] = useActionState<FeeState, FormData>(adjustLedgerAction, {});
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="studentFeeId" value={studentFeeId} />
      <div className="flex flex-wrap gap-1">
        <select name="type" aria-label="Adjustment type" className={`${inputClass} w-auto`}>
          <option value="WAIVER">Waive</option><option value="DISCOUNT">Discount</option><option value="CORRECTION">Correct (reduce)</option><option value="CHARGE">Add charge</option><option value="REFUND">Refund credit</option>
        </select>
        <input name="amount" aria-label="Adjustment amount" required inputMode="decimal" placeholder="Amount" className={`${inputClass} w-24`} />
        <input name="reason" aria-label="Adjustment reason" required minLength={3} maxLength={300} placeholder="Reason" className={`${inputClass} w-32`} />
        <button type="submit" disabled={pending} className={secondaryButton}>{pending ? "…" : "Adjust"}</button>
      </div>
      {state.error && <p role="alert" className="text-xs text-danger">{state.error}</p>}
      {state.success && <p role="status" className="text-xs text-success">{state.success}</p>}
    </form>
  );
}

/** Student pays outside the app (for example GCash) and uploads proof; an officer must verify it. */
export function PayOnlineForm({ studentFeeId, balance }: { studentFeeId: string; balance: string }) {
  const [state, action, pending] = useActionState<FeeState, FormData>(submitDigitalPaymentAction, {});
  const [method, setMethod] = useState("GCASH");
  const cash = method === "CASH";
  return (
    <form action={action} className="flex max-w-md flex-col gap-2 rounded-lg border border-border p-3">
      <input type="hidden" name="studentFeeId" value={studentFeeId} />
      <p className="text-xs text-muted">
        {cash
          ? "Paying cash? Hand it to the treasurer. This records it as pending, and it counts once the treasurer confirms they received it."
          : "Paid by GCash or bank transfer? Submit the details and proof. It counts only after the treasurer verifies it."}
      </p>
      <div className="flex flex-wrap gap-2">
        <input name="amount" aria-label="Amount paid" required inputMode="decimal" defaultValue={balance} className={`${inputClass} w-28`} />
        <select name="method" aria-label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)} className={`${inputClass} w-auto`}>
          <option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CASH">Cash</option><option value="OTHER">Other</option>
        </select>
        {!cash && <input name="reference" aria-label="Payment reference number" required minLength={3} maxLength={100} placeholder="Reference no." className={`${inputClass} w-40`} />}
      </div>
      {!cash && <input name="proof" type="file" required accept="image/png,image/jpeg,application/pdf" aria-label="Proof of payment" className={inputClass} />}
      <button type="submit" disabled={pending} className={`${secondaryButton} self-start`}>{pending ? "Submitting…" : cash ? "Record cash payment" : "Submit for verification"}</button>
      {state.error && <p role="alert" className="text-xs text-danger">{state.error}</p>}
      {state.success && <p role="status" className="text-xs text-success">{state.success}</p>}
    </form>
  );
}

type FeeEditProps = { feeTypeId: string; name: string; amount: string; dueDate: string; description: string };

/** Edit a fee's details in a dialog. People already assessed keep their original amount. */
export function FeeTypeEdit(props: FeeEditProps) {
  return (
    <ModalButton label="Edit" variant="link" title="Edit fee" description={props.name} size="md">
      <FeeTypeEditForm {...props} />
    </ModalButton>
  );
}

function FeeTypeEditForm({ feeTypeId, name, amount, dueDate, description }: FeeEditProps) {
  const [state, action, pending] = useActionState<FeeState, FormData>(updateFeeTypeAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="feeTypeId" value={feeTypeId} />
      {state.error && <div className="sm:col-span-2"><Notice kind="error">{state.error}</Notice></div>}
      {state.success && <div className="sm:col-span-2"><Notice kind="success">{state.success}</Notice></div>}
      <Field id={`ft-name-${feeTypeId}`} label="Name"><input id={`ft-name-${feeTypeId}`} name="name" required defaultValue={name} className={inputClass} /></Field>
      <Field id={`ft-amount-${feeTypeId}`} label="Amount (PHP)"><input id={`ft-amount-${feeTypeId}`} name="amount" required inputMode="decimal" defaultValue={amount} className={inputClass} /></Field>
      <Field id={`ft-due-${feeTypeId}`} label="Due date (optional)"><input id={`ft-due-${feeTypeId}`} name="dueDate" type="date" defaultValue={dueDate} className={inputClass} /></Field>
      <Field id={`ft-desc-${feeTypeId}`} label="Notes (optional)"><input id={`ft-desc-${feeTypeId}`} name="description" defaultValue={description} className={inputClass} /></Field>
      <p className="text-sm text-muted sm:col-span-2">Members already assessed keep the amount they were assessed; the new amount applies from now on.</p>
      <button type="submit" disabled={pending} className={`${primaryButton} sm:col-span-2`}>{pending ? "Saving…" : "Save fee"}</button>
    </form>
  );
}

type Preview = { feeTypeId: string; name: string; amount: string; organization: string; schoolYear: string | null; semester: string | null; event: string | null; eligible: number; alreadyApplied: number; toAdd: number; totalToAdd: string };

const peso = (v: string) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(v));

/**
 * "Apply to all members": a dialog that first shows exactly what will happen (organization, term, amount, how many members
 * are eligible, already have it, and would be charged), then applies it on confirmation and reports the result.
 * Safe to press again: members who already have the fee are skipped.
 */
export function ApplyToAllButton({ preview }: { preview: Preview }) {
  return (
    <ModalButton label="Apply to all members…" variant="secondary" title={`Apply "${preview.name}" to all members`} description="Check the details, then confirm. Members who already have this fee are skipped." size="md">
      <ApplyToAllBody preview={preview} />
    </ModalButton>
  );
}

function ApplyToAllBody({ preview: p }: { preview: Preview }) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyFeeToAllAction, {});
  const router = useRouter();
  useEffect(() => { if (state.result) router.refresh(); }, [state, router]);
  const term = [p.schoolYear, p.semester].filter(Boolean).join(" · ") || "No school year set";
  const rows: [string, string][] = [
    ["Organization", p.organization], ["School year · semester", term], ...(p.event ? [["Event", p.event] as [string, string]] : []),
    ["Amount per member", peso(p.amount)], ["Eligible members", String(p.eligible)], ["Already have this fee", String(p.alreadyApplied)],
    ["Will be charged now", `${p.toAdd} member${p.toAdd === 1 ? "" : "s"} · ${peso(p.totalToAdd)} in total`],
  ];
  if (state.result) {
    const r = state.result;
    return (
      <div className="flex flex-col gap-3">
        <Notice kind="success">Done. {r.assigned} member{r.assigned === 1 ? " was" : "s were"} charged; {r.skipped} skipped because they already had it.</Notice>
        <dl className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-success/10 p-3"><dt className="text-xs text-muted">Added</dt><dd className="text-xl font-semibold">{r.assigned}</dd></div>
          <div className="rounded-xl bg-sidebar p-3"><dt className="text-xs text-muted">Skipped</dt><dd className="text-xl font-semibold">{r.skipped}</dd></div>
          <div className="rounded-xl bg-sidebar p-3"><dt className="text-xs text-muted">Failed</dt><dd className="text-xl font-semibold">0</dd></div>
        </dl>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="feeTypeId" value={p.feeTypeId} />
      <dl className="divide-y divide-border rounded-xl border border-border text-sm">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-3 py-2"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
      </dl>
      <p className="text-xs text-muted">Eligible: current members whose membership has not ended and whose account is not disabled. Advisers are not charged.{p.event ? " Event contributions go to the event's expected attendees." : ""}</p>
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {p.toAdd === 0 ? <Notice kind="info">Everyone eligible already has this fee. Nothing to apply.</Notice> : (
        <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>{pending ? "Applying…" : `Confirm: charge ${p.toAdd} member${p.toAdd === 1 ? "" : "s"}`}</button>
      )}
    </form>
  );
}
