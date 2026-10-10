"use client";

import { useState } from "react";

export type TreeCollege = { id: string; code: string; name: string; departments: { id: string; code: string; name: string; programs: { id: string; code: string; name: string }[] }[] };
type Defaults = { collegeId?: string | null; departmentId?: string | null; programId?: string | null };

const control = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";

/**
 * College > Department > Program cascade over the configured academic structure.
 * `depth` controls how far the chain goes. The server re-validates that each choice belongs to its parent.
 */
export function AcademicSelect({ tree, depth, defaults = {}, required = false, errors = {} }: {
  tree: TreeCollege[]; depth: "college" | "department" | "program"; defaults?: Defaults; required?: boolean; errors?: Record<string, string | undefined>;
}) {
  const [college, setCollege] = useState(defaults.collegeId ?? "");
  const [department, setDepartment] = useState(defaults.departmentId ?? "");
  const [program, setProgram] = useState(defaults.programId ?? "");

  const departments = tree.find((c) => c.id === college)?.departments ?? [];
  const programs = departments.find((d) => d.id === department)?.programs ?? [];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div>
        <label htmlFor="collegeId" className="mb-1 block text-sm font-medium">College</label>
        <select id="collegeId" name="collegeId" value={college} required={required} className={control}
          onChange={(e) => { setCollege(e.target.value); setDepartment(""); setProgram(""); }}>
          <option value="">Select college</option>
          {tree.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        {errors.collegeId && <p className="mt-1 text-sm text-danger">{errors.collegeId}</p>}
      </div>
      {depth !== "college" && (
        <div>
          <label htmlFor="departmentId" className="mb-1 block text-sm font-medium">Department</label>
          <select id="departmentId" name="departmentId" value={department} required={required} disabled={!college} className={control}
            onChange={(e) => { setDepartment(e.target.value); setProgram(""); }}>
            <option value="">{college ? "Select department" : "—"}</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {errors.departmentId && <p className="mt-1 text-sm text-danger">{errors.departmentId}</p>}
        </div>
      )}
      {depth === "program" && (
        <div>
          <label htmlFor="programId" className="mb-1 block text-sm font-medium">Program / course</label>
          <select id="programId" name="programId" value={program} required={required} disabled={!department} className={control}
            onChange={(e) => setProgram(e.target.value)}>
            <option value="">{department ? "Select program" : "—"}</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
          {errors.programId && <p className="mt-1 text-sm text-danger">{errors.programId}</p>}
        </div>
      )}
    </div>
  );
}
