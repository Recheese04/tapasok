"use client";

import { useActionState, useState } from "react";
import { Field, inputClass, Notice, primaryButton } from "@/components/shared/ui";
import { createConsequenceAction, createRuleAction, updateRuleAction, type ConsequenceState } from "./actions";

type Opt = { id: string; label: string };

/** Values of an existing rule, as plain strings, to edit it. */
export type RuleValues = {
  id: string; name: string; description: string; trigger: string; sessionKind: string; wholeDay: boolean;
  penaltyType: string; fineAmount: string; serviceHours: string;
};

export function RuleForm({ organizationId, rule }: { organizationId: string; rule?: RuleValues }) {
  const [state, action, pending] = useActionState<ConsequenceState, FormData>(rule ? updateRuleAction : createRuleAction, {});
  const [penalty, setPenalty] = useState(rule?.penaltyType ?? "FINE");
  const f = rule ? `rule-${rule.id}` : "rule"; // unique ids when several forms are on the page
  return (
    <form action={action} className="grid max-w-xl gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:grid-cols-2">
      <h3 className="font-medium sm:col-span-2">{rule ? "Edit consequence rule" : "Add a consequence rule"}</h3>
      {state.error && <div className="sm:col-span-2"><Notice kind="error">{state.error}</Notice></div>}
      {state.success && <div className="sm:col-span-2"><Notice kind="success">{state.success}</Notice></div>}
      {rule ? <input type="hidden" name="ruleId" value={rule.id} /> : <input type="hidden" name="organizationId" value={organizationId} />}
      <div className="sm:col-span-2"><Field id={`${f}-name`} label="Rule name"><input id={`${f}-name`} name="name" required defaultValue={rule?.name} className={inputClass} placeholder="e.g. Missed session" /></Field></div>
      <Field id={`${f}-trigger`} label="Applies when the student is">
        <select id={`${f}-trigger`} name="trigger" defaultValue={rule?.trigger} className={inputClass}><option value="ABSENT">Absent (unexcused)</option><option value="LATE">Late</option></select>
      </Field>
      <Field id={`${f}-kind`} label="Session type">
        <select id={`${f}-kind`} name="sessionKind" defaultValue={rule?.sessionKind} className={inputClass}><option value="">Any session</option><option value="TIME_IN">Time-in only</option><option value="TIME_OUT">Time-out only</option></select>
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="wholeDay" defaultChecked={rule?.wholeDay} /> Whole-day rule: only when absent from every session of the event</label>
      <Field id={`${f}-penalty`} label="Consequence">
        <select id={`${f}-penalty`} name="penaltyType" value={penalty} onChange={(e) => setPenalty(e.target.value)} className={inputClass}><option value="FINE">Fine (PHP)</option><option value="SERVICE_HOURS">Community service</option></select>
      </Field>
      {penalty === "FINE"
        ? <Field id={`${f}-amount`} label="Fine amount (PHP)"><input id={`${f}-amount`} name="fineAmount" inputMode="decimal" required defaultValue={rule?.fineAmount} className={inputClass} /></Field>
        : <Field id={`${f}-hours`} label="Service hours"><input id={`${f}-hours`} name="serviceHours" inputMode="decimal" required defaultValue={rule?.serviceHours} className={inputClass} /></Field>}
      <div className="sm:col-span-2"><Field id={`${f}-desc`} label="Notes (optional)"><input id={`${f}-desc`} name="description" defaultValue={rule?.description} className={inputClass} /></Field></div>
      {rule && <p className="text-xs text-muted sm:col-span-2">Changes apply to sessions finalized from now on. Consequences already recorded keep their penalty.</p>}
      <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>{pending ? (rule ? "Saving…" : "Adding…") : rule ? "Save rule" : "Add rule"}</button>
    </form>
  );
}

export function ConsequenceForm({ organizationId, members, rules, events }: { organizationId: string; members: Opt[]; rules: Opt[]; events: Opt[] }) {
  const [state, action, pending] = useActionState<ConsequenceState, FormData>(createConsequenceAction, {});
  return (
    <form action={action} className="grid max-w-xl gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
      <h3 className="font-medium">Record a consequence manually</h3>
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.success && <Notice kind="success">{state.success}</Notice>}
      <input type="hidden" name="organizationId" value={organizationId} />
      <Field id="c-user" label="Member"><select id="c-user" name="userId" required className={inputClass}>{members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></Field>
      <Field id="c-rule" label="Rule (copies its fine or service hours)"><select id="c-rule" name="ruleId" className={inputClass}><option value="">— none —</option>{rules.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></Field>
      <Field id="c-event" label="Related event (optional)"><select id="c-event" name="eventId" className={inputClass}><option value="">— none —</option>{events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select></Field>
      <Field id="c-reason" label="Reason"><textarea id="c-reason" name="reason" rows={3} required maxLength={500} className={inputClass} /></Field>
      <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>{pending ? "Saving…" : "Record consequence"}</button>
    </form>
  );
}
