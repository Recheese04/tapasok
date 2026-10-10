"use client";

import { useActionState, useState } from "react";
import type { TreeCollege } from "@/components/shared/academic-select";
import { TargetsEditor, type TargetValue } from "@/components/shared/targets-editor";
import { Field, inputClass, Notice, primaryButton, secondaryButton } from "@/components/shared/ui";
import { parseManilaLocal, toManilaLocal } from "@/lib/format";
import { createEventAction, updateEventAction, type EventFormState } from "./actions";

export type SessionValue = { label: string; kind: "TIME_IN" | "TIME_OUT"; opensAt: string; startsAt: string; closesAt: string; graceMinutes: number };
type Opt = { id: string; label: string };

type Values = {
  eventId?: string; title?: string; description?: string | null; venue?: string; startsAt?: string; endsAt?: string; semesterId?: string | null;
  targetMode?: "ALL_MEMBERS" | "FILTERED"; targets?: TargetValue[];
  requireEvaluation?: boolean; ruleIds?: string[]; sessions?: SessionValue[];
};

const addMin = (local: string, minutes: number) => {
  const d = parseManilaLocal(local);
  return d ? toManilaLocal(new Date(d.getTime() + minutes * 60_000)) : local;
};

/** Starting points for the common attendance layouts. Every field stays editable. */
function preset(kind: "single" | "inout" | "halfday", start: string, end: string, grace: number): SessionValue[] {
  const day = start.slice(0, 10);
  const at = (hm: string) => `${day}T${hm}`;
  if (kind === "single") return [{ label: "Attendance", kind: "TIME_IN", opensAt: addMin(start, -30), startsAt: start, closesAt: end, graceMinutes: grace }];
  if (kind === "inout") return [
    { label: "Time-In", kind: "TIME_IN", opensAt: addMin(start, -30), startsAt: start, closesAt: addMin(start, 90), graceMinutes: grace },
    { label: "Time-Out", kind: "TIME_OUT", opensAt: addMin(end, -30), startsAt: end, closesAt: addMin(end, 60), graceMinutes: grace },
  ];
  return [
    { label: "Morning Time-In", kind: "TIME_IN", opensAt: at("07:30"), startsAt: at("08:00"), closesAt: at("09:30"), graceMinutes: grace },
    { label: "Morning Time-Out", kind: "TIME_OUT", opensAt: at("11:30"), startsAt: at("12:00"), closesAt: at("12:30"), graceMinutes: grace },
    { label: "Afternoon Time-In", kind: "TIME_IN", opensAt: at("12:30"), startsAt: at("13:00"), closesAt: at("14:30"), graceMinutes: grace },
    { label: "Afternoon Time-Out", kind: "TIME_OUT", opensAt: at("16:30"), startsAt: at("17:00"), closesAt: at("18:00"), graceMinutes: grace },
  ];
}

const sel = "rounded-lg border border-border bg-surface px-2 py-1 text-sm";

export function EventForm({ organizations, values, tree, semesters, rulesByOrg, sessionsLocked = false, defaultGrace = 15 }: {
  organizations?: Opt[]; values?: Values; tree: TreeCollege[]; semesters: Opt[]; rulesByOrg: Record<string, Opt[]>; sessionsLocked?: boolean; defaultGrace?: number;
}) {
  const editing = !!values?.eventId;
  const [state, action, pending] = useActionState<EventFormState, FormData>(editing ? updateEventAction : createEventAction, {});
  const fe = state.fieldErrors ?? {};

  const [orgId, setOrgId] = useState(organizations?.[0]?.id ?? "");
  const [start, setStart] = useState(values?.startsAt ?? "");
  const [end, setEnd] = useState(values?.endsAt ?? "");
  const [sessions, setSessions] = useState<SessionValue[]>(values?.sessions ?? (values?.startsAt && values?.endsAt ? preset("single", values.startsAt, values.endsAt, defaultGrace) : []));
  const [ruleIds, setRuleIds] = useState<string[]>(values?.ruleIds ?? []);

  const rules = rulesByOrg[editing ? "_" : orgId] ?? [];
  const patch = (i: number, p: Partial<SessionValue>) => setSessions((rows) => rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <form action={action} className="flex max-w-4xl flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-card">
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.success && <Notice kind="success">{state.success}</Notice>}
      <input type="hidden" name="sessions" value={JSON.stringify(sessions)} />
      <input type="hidden" name="ruleIds" value={JSON.stringify(ruleIds)} />

      {editing ? <input type="hidden" name="eventId" value={values!.eventId} /> : (
        <Field id="organizationId" label="Organization">
          <select id="organizationId" name="organizationId" required value={orgId} onChange={(e) => { setOrgId(e.target.value); setRuleIds([]); }} className={inputClass}>
            {organizations!.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="title" label="Title" error={fe.title}><input id="title" name="title" required defaultValue={values?.title} className={inputClass} /></Field>
        <Field id="venue" label="Venue" error={fe.venue} hint="Room, building or campus location. It is shown to attendees; it is not used to check anyone's location."><input id="venue" name="venue" required defaultValue={values?.venue} className={inputClass} /></Field>
        <Field id="startsAt" label="Starts" error={fe.startsAt}><input id="startsAt" name="startsAt" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} /></Field>
        <Field id="endsAt" label="Ends" error={fe.endsAt}><input id="endsAt" name="endsAt" type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} /></Field>
        <Field id="semesterId" label="School year and semester" hint="Defaults to the active term." error={fe.semesterId}>
          <select id="semesterId" name="semesterId" defaultValue={values?.semesterId ?? ""} className={inputClass}><option value="">Active term</option>{semesters.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </Field>
        <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" name="requireEvaluation" defaultChecked={values?.requireEvaluation} /> Attendees must submit the evaluation</label>
      </div>
      <Field id="description" label="Description (optional)" error={fe.description}><textarea id="description" name="description" rows={3} defaultValue={values?.description ?? ""} className={inputClass} /></Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Attendance sessions</legend>
        {fe.sessions && <p className="text-sm text-danger">{fe.sessions}</p>}
        {sessionsLocked ? <p className="text-sm text-muted">Sessions are locked because attendance has been recorded.</p> : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} disabled={!start || !end} onClick={() => setSessions(preset("single", start, end, defaultGrace))}>One session</button>
            <button type="button" className={secondaryButton} disabled={!start || !end} onClick={() => setSessions(preset("inout", start, end, defaultGrace))}>Time-in and time-out</button>
            <button type="button" className={secondaryButton} disabled={!start} onClick={() => setSessions(preset("halfday", start, end, defaultGrace))}>Morning &amp; afternoon in/out</button>
            <button type="button" className={secondaryButton} onClick={() => setSessions((r) => [...r, { label: `Session ${r.length + 1}`, kind: "TIME_IN", opensAt: start, startsAt: start, closesAt: end, graceMinutes: defaultGrace }])}>Add session</button>
          </div>
        )}
        {sessions.length === 0 && <p className="text-sm text-muted">Pick a layout above after setting the start and end times.</p>}
        {sessions.map((s, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-6">
            <label className="text-xs sm:col-span-2">Name<input className={`${sel} block w-full`} value={s.label} disabled={sessionsLocked} onChange={(e) => patch(i, { label: e.target.value })} /></label>
            <label className="text-xs">Type<select className={`${sel} block w-full`} value={s.kind} disabled={sessionsLocked} onChange={(e) => patch(i, { kind: e.target.value as SessionValue["kind"] })}><option value="TIME_IN">Time-in</option><option value="TIME_OUT">Time-out</option></select></label>
            <label className="text-xs">Grace (min)<input type="number" min={0} max={240} className={`${sel} block w-full`} value={s.graceMinutes} disabled={sessionsLocked} onChange={(e) => patch(i, { graceMinutes: Number(e.target.value) })} /></label>
            <div className="flex items-end justify-end">{!sessionsLocked && sessions.length > 1 && <button type="button" className="text-xs text-danger hover:underline" onClick={() => setSessions((r) => r.filter((_, j) => j !== i))}>Remove</button>}</div>
            <label className="text-xs sm:col-span-2">Opens<input type="datetime-local" className={`${sel} block w-full`} value={s.opensAt} disabled={sessionsLocked} onChange={(e) => patch(i, { opensAt: e.target.value })} /></label>
            <label className="text-xs sm:col-span-2">On time until start + grace<input type="datetime-local" className={`${sel} block w-full`} value={s.startsAt} disabled={sessionsLocked} onChange={(e) => patch(i, { startsAt: e.target.value })} /></label>
            <label className="text-xs sm:col-span-2">Cut-off<input type="datetime-local" className={`${sel} block w-full`} value={s.closesAt} disabled={sessionsLocked} onChange={(e) => patch(i, { closesAt: e.target.value })} /></label>
          </div>
        ))}
      </fieldset>

      <TargetsEditor tree={tree} initialMode={values?.targetMode} initialTargets={values?.targets} allLabel="All student members of the organization" error={fe.targets} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Consequence rules that apply</legend>
        {fe.ruleIds && <p className="text-sm text-danger">{fe.ruleIds}</p>}
        {rules.length === 0 ? <p className="text-sm text-muted">No active rules yet. Rules are configured under Consequences; without any, no consequences are generated.</p> : rules.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ruleIds.includes(r.id)} onChange={(e) => setRuleIds((ids) => (e.target.checked ? [...ids, r.id] : ids.filter((x) => x !== r.id)))} /> {r.label}</label>
        ))}
      </fieldset>

      <button type="submit" disabled={pending} className={`${primaryButton} self-start`}>{pending ? "Saving…" : editing ? "Save changes" : "Create event"}</button>
    </form>
  );
}
