"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputClass, Notice, primaryButton, dangerButton, secondaryButton } from "@/components/shared/ui";
import { cancelFundAction, decideFundAction, editFundAction, recordFundAction, reverseFundAction, type FundState } from "./actions";

const EXPENSE = [["SUPPLIES", "Supplies"], ["EVENT_MATERIALS", "Event materials"], ["PRINTING", "Printing"], ["TRANSPORTATION", "Transportation"], ["FOOD", "Food"], ["VENUE", "Venue"], ["SERVICES", "Services"], ["OTHER", "Other"]] as const;
const INCOME = [["OPENING_BALANCE", "Opening balance (cash on hand)"], ["DONATION", "Donation"], ["SPONSORSHIP", "Sponsorship"], ["OTHER", "Other"]] as const;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

export type FundRow = { id: string; type: "EXPENSE" | "INCOME"; title: string; amount: string; category: string; occurredOn: string; purpose: string; notes: string | null };

function Msg({ s }: { s: FundState }) {
  return <>{s.error ? <Notice kind="error">{s.error}</Notice> : null}{s.success ? <Notice kind="success">{s.success}</Notice> : null}</>;
}

/** Record a new expense or other money received. A per-form request id makes a double submit create one record only. */
export function RecordFundForm({ organizationId, type }: { organizationId: string; type: "EXPENSE" | "INCOME" }) {
  const [state, action, pending] = useActionState<FundState, FormData>(recordFundAction, {});
  const [requestId] = useState(() => crypto.randomUUID());
  const cats = type === "EXPENSE" ? EXPENSE : INCOME;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Msg s={state} /></div>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="requestId" value={requestId} />
      <div className="sm:col-span-2"><Field id="f-title" label="Description"><input id="f-title" name="title" required minLength={3} maxLength={150} placeholder={type === "EXPENSE" ? "e.g. Tarpaulin for Foundation Day" : "e.g. Cash on hand from last semester"} className={inputClass} /></Field></div>
      <Field id="f-amount" label="Amount (PHP)"><input id="f-amount" name="amount" required inputMode="decimal" pattern="\d{1,7}(\.\d{1,2})?" placeholder="850.00" className={inputClass} /></Field>
      <Field id="f-date" label={type === "EXPENSE" ? "Date spent" : "Date received"}><input id="f-date" name="occurredOn" type="date" required max={today()} defaultValue={today()} className={inputClass} /></Field>
      <Field id="f-cat" label="Category"><select id="f-cat" name="category" required className={inputClass}>{cats.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field id="f-receipt" label="Receipt (optional)" hint="PDF, PNG or JPG, up to 10 MB."><input id="f-receipt" name="receipt" type="file" accept="application/pdf,image/png,image/jpeg" className={inputClass} /></Field>
      <div className="sm:col-span-2"><Field id="f-purpose" label="Purpose or reason"><textarea id="f-purpose" name="purpose" required minLength={3} maxLength={500} rows={2} className={inputClass} /></Field></div>
      <div className="sm:col-span-2"><Field id="f-notes" label="Notes (optional)"><textarea id="f-notes" name="notes" maxLength={1000} rows={2} className={inputClass} /></Field></div>
      <p className="text-sm text-muted sm:col-span-2">It is saved as <strong>pending</strong> and only changes the balance once the President approves it.</p>
      <button type="submit" disabled={pending || !!state.success} className={`${primaryButton} justify-self-start`}>{pending ? "Saving…" : type === "EXPENSE" ? "Record expense" : "Record funds"}</button>
    </form>
  );
}

export function EditFundForm({ row }: { row: FundRow }) {
  const [state, action, pending] = useActionState<FundState, FormData>(editFundAction, {});
  const cats = row.type === "EXPENSE" ? EXPENSE : INCOME;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Msg s={state} /></div>
      <input type="hidden" name="fundId" value={row.id} />
      <div className="sm:col-span-2"><Field id="e-title" label="Description"><input id="e-title" name="title" required defaultValue={row.title} maxLength={150} className={inputClass} /></Field></div>
      <Field id="e-amount" label="Amount (PHP)"><input id="e-amount" name="amount" required inputMode="decimal" defaultValue={row.amount} className={inputClass} /></Field>
      <Field id="e-date" label="Date"><input id="e-date" name="occurredOn" type="date" required max={today()} defaultValue={row.occurredOn} className={inputClass} /></Field>
      <Field id="e-cat" label="Category"><select id="e-cat" name="category" defaultValue={row.category} className={inputClass}>{cats.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field id="e-receipt" label="Replace receipt (optional)"><input id="e-receipt" name="receipt" type="file" accept="application/pdf,image/png,image/jpeg" className={inputClass} /></Field>
      <div className="sm:col-span-2"><Field id="e-purpose" label="Purpose or reason"><textarea id="e-purpose" name="purpose" required defaultValue={row.purpose} rows={2} className={inputClass} /></Field></div>
      <div className="sm:col-span-2"><Field id="e-notes" label="Notes (optional)"><textarea id="e-notes" name="notes" defaultValue={row.notes ?? ""} rows={2} className={inputClass} /></Field></div>
      <p className="text-sm text-muted sm:col-span-2">The old and new values are both kept in the financial audit trail.</p>
      <button type="submit" disabled={pending} className={`${primaryButton} justify-self-start`}>{pending ? "Saving…" : "Save changes"}</button>
    </form>
  );
}

type Kind = "approve" | "reject" | "cancel" | "reverse";
const COPY: Record<Kind, { button: string; reason: string | null; hint: string; danger: boolean }> = {
  approve: { button: "Approve", reason: "Note (optional)", hint: "Approving counts this record in the balance. Expenses larger than the available balance are refused.", danger: false },
  reject: { button: "Reject", reason: "Reason (required)", hint: "Rejected records never count. The person who recorded it sees the reason.", danger: true },
  cancel: { button: "Cancel record", reason: "Reason (required)", hint: "Withdraws your pending record. It is kept in the history and never counts.", danger: true },
  reverse: { button: "Reverse", reason: "Reason (required)", hint: "Use when an approved record was wrong or refunded. It stops counting; the record and the reason stay in the audit trail.", danger: true },
};

/** Approve / reject / cancel / reverse with the reason the audit trail needs. */
export function DecideFundForm({ id, kind, summary }: { id: string; kind: Kind; summary: string }) {
  const action = kind === "cancel" ? cancelFundAction : kind === "reverse" ? reverseFundAction : decideFundAction;
  const [state, run, pending] = useActionState<FundState, FormData>(action, {});
  const router = useRouter();
  useEffect(() => { if (state.success) router.refresh(); }, [state.success, router]);
  const c = COPY[kind];
  return (
    <form action={run} className="flex flex-col gap-4">
      <Msg s={state} />
      <input type="hidden" name="fundId" value={id} />
      {kind === "approve" || kind === "reject" ? <input type="hidden" name="decision" value={kind} /> : null}
      <p className="rounded-xl border border-border bg-sidebar px-3 py-2 text-sm">{summary}</p>
      {c.reason ? <Field id={`r-${kind}-${id}`} label={c.reason}><textarea id={`r-${kind}-${id}`} name="reason" required={kind !== "approve"} minLength={kind === "approve" ? 0 : 3} maxLength={500} rows={2} className={inputClass} /></Field> : null}
      <p className="text-sm text-muted">{c.hint}</p>
      <button type="submit" disabled={pending || !!state.success} className={`${c.danger ? dangerButton : primaryButton} self-start`}>{pending ? "Saving…" : c.button}</button>
    </form>
  );
}

export { secondaryButton };
