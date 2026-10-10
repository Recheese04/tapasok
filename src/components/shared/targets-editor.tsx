"use client";

import { useState } from "react";
import type { TreeCollege } from "@/components/shared/academic-select";
import { inputClass, secondaryButton } from "@/components/shared/ui";

export type TargetValue = { collegeId: string; departmentId: string; programId: string; yearLevel: string };

const sel = "rounded-lg border border-border bg-surface px-2 py-1 text-sm";

function TargetRow({ row, tree, onChange, onRemove }: { row: TargetValue; tree: TreeCollege[]; onChange: (r: TargetValue) => void; onRemove: () => void }) {
  const depts = tree.find((c) => c.id === row.collegeId)?.departments ?? [];
  const progs = depts.find((d) => d.id === row.departmentId)?.programs ?? [];
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
      <label className="text-xs">College<select className={`${sel} block`} value={row.collegeId} onChange={(e) => onChange({ ...row, collegeId: e.target.value, departmentId: "", programId: "" })}><option value="">Any</option>{tree.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>
      <label className="text-xs">Department<select className={`${sel} block`} value={row.departmentId} disabled={!row.collegeId} onChange={(e) => onChange({ ...row, departmentId: e.target.value, programId: "" })}><option value="">Any</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}</select></label>
      <label className="text-xs">Program<select className={`${sel} block`} value={row.programId} disabled={!row.departmentId} onChange={(e) => onChange({ ...row, programId: e.target.value })}><option value="">Any</option>{progs.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></label>
      <label className="text-xs">Year level<input type="number" min={1} max={10} className={`${sel} block w-20`} value={row.yearLevel} onChange={(e) => onChange({ ...row, yearLevel: e.target.value })} /></label>
      <button type="button" onClick={onRemove} className="text-xs text-danger hover:underline">Remove</button>
    </div>
  );
}

/**
 * Audience picker: everyone in the organization, or specific groups (college / department / program / year level).
 * Submits `targetMode` and a JSON `targets` field; the server validates both.
 */
export function TargetsEditor({ tree, initialMode = "ALL_MEMBERS", initialTargets = [], allLabel, error }: {
  tree: TreeCollege[]; initialMode?: "ALL_MEMBERS" | "FILTERED"; initialTargets?: TargetValue[]; allLabel: string; error?: string;
}) {
  const [mode, setMode] = useState(initialMode);
  const [targets, setTargets] = useState<TargetValue[]>(initialTargets);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">Audience</legend>
      {error && <p className="text-sm text-danger">{error}</p>}
      <input type="hidden" name="targets" value={JSON.stringify(targets.map((t) => ({ ...t, yearLevel: t.yearLevel === "" ? null : Number(t.yearLevel) })))} />
      <select name="targetMode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="Audience" className={inputClass}>
        <option value="ALL_MEMBERS">{allLabel}</option>
        <option value="FILTERED">Only specific groups (by college, department, program, year level)</option>
      </select>
      {mode === "FILTERED" && (
        <>
          {targets.map((t, i) => <TargetRow key={i} row={t} tree={tree} onChange={(r) => setTargets((rows) => rows.map((x, j) => (j === i ? r : x)))} onRemove={() => setTargets((rows) => rows.filter((_, j) => j !== i))} />)}
          <button type="button" className={`${secondaryButton} self-start`} onClick={() => setTargets((r) => [...r, { collegeId: "", departmentId: "", programId: "", yearLevel: "" }])}>Add group</button>
          <p className="text-xs text-muted">A student matches a group when all its filled-in fields match their enrollment in the relevant semester. Matching any group is enough.</p>
        </>
      )}
    </fieldset>
  );
}
