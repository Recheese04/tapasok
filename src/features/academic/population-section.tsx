import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { ModalFrame } from "@/components/shared/modal";
import { PAGE_SIZE } from "@/components/shared/pagination";
import { Badge, inputClass } from "@/components/shared/ui";
import { studentsInGroup, UNASSIGNED, type GroupFilter, type Population } from "./population";

type Href = (changes: Record<string, string | null | undefined>) => string;

const yearLabel = (y: string) => (y === UNASSIGNED ? "Unassigned" : `Year ${y}`);
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
const th = "px-3 py-2.5 font-semibold";
const td = "border-t border-border px-3 py-2.5";

/** A count that opens the student list for its group; zero is plain text. */
function CountLink({ n, href, label }: { n: number; href: string; label: string }) {
  if (!n) return <span className="text-muted">0</span>;
  return <Link href={href} scroll={false} aria-label={`${n} students: ${label}`} className="font-semibold text-primary tabular-nums hover:underline">{n}</Link>;
}

function Bar({ n, total }: { n: number; total: number }) {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <span className="h-2 w-24 overflow-hidden rounded-full bg-primary-soft"><span className="block h-full rounded-full bg-primary" style={{ width: `${pct(n, total)}%` }} /></span>
      <span className="w-12 text-xs tabular-nums text-muted">{pct(n, total)}%</span>
    </div>
  );
}

/**
 * Student Population: totals by year level, college, department, and program x year level. Every non-zero count opens the
 * list of those students. Counts are of unique students (see population.ts), not of organization memberships.
 */
export function PopulationSection({ pop, href, collegeId, departmentId }: { pop: Population; href: Href; collegeId?: string; departmentId?: string }) {
  const basisNote = pop.basis === "current" ? "current program and year level" : `enrollment in ${pop.terms.find((t) => t.id === pop.basis)?.label ?? "the selected semester"}`;
  const programs = pop.programs.filter((p) => (!collegeId || p.collegeId === collegeId) && (!departmentId || p.departmentId === departmentId) && (p.active || p.total > 0));
  const departments = pop.departments.filter((d) => (!collegeId || d.collegeId === collegeId) && (!departmentId || d.id === departmentId) && (d.active || d.total > 0));
  const colleges = pop.colleges.filter((c) => (!collegeId || c.id === collegeId) && (c.active || c.total > 0));
  const scoped = !!(collegeId || departmentId);
  const scopeTotal = programs.reduce((s, p) => s + p.total, 0) + (scoped ? 0 : pop.unassignedProgram.total);
  const years = pop.yearLevels;
  const group = (g: Record<string, string>) => href({ gp: g.gp ?? null, gy: g.gy ?? null, gc: g.gc ?? null, gd: g.gd ?? null, gq: null, gpage: null });

  if (pop.programs.length === 0) {
    return (
      <EmptyState
        title="No academic programs are configured yet"
        hint="Student statistics group students by college, department and program. Add them under Academic Setup, then assign each student a program and year level."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        <strong className="text-foreground">{pop.total}</strong> student{pop.total === 1 ? "" : "s"} by {basisNote}
        {pop.status === "active" ? ", deactivated accounts not included" : ", including deactivated accounts"}.
        Each student is counted once, whatever organizations they belong to.
      </p>

      {/* Year level */}
      <section aria-labelledby="pop-years" className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h3 id="pop-years" className="mb-3 font-semibold">By year level</h3>
        {pop.total === 0 ? <p className="text-sm text-muted">No students yet.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {years.map((y) => {
              const n = pop.byYear[y] ?? 0;
              return (
                <li key={y}>
                  <Link href={group({ gy: y })} scroll={false} className="flex flex-col gap-2 rounded-xl border border-border p-3 hover:border-primary/40 hover:bg-primary-soft/30">
                    <span className="flex items-baseline justify-between"><span className="text-sm font-medium">{yearLabel(y)}</span><span className="text-xl font-semibold tabular-nums">{n}</span></span>
                    <Bar n={n} total={pop.total} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* College and department */}
      <div className="grid gap-5 xl:grid-cols-2">
        <section aria-labelledby="pop-colleges" className="min-w-0 rounded-2xl border border-border bg-surface shadow-card">
          <h3 id="pop-colleges" className="px-5 pt-4 font-semibold">By college</h3>
          <div className="overflow-x-auto p-2">
            <table className="w-full min-w-[26rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className={th}>College</th><th className={`${th} text-right`}>Students</th><th className={th}>Share</th></tr></thead>
              <tbody>
                {colleges.map((c) => (
                  <tr key={c.id}>
                    <td className={td}><span className="font-medium">{c.code}</span> <span className="text-muted">{c.name}</span>{!c.active ? <> <Badge>Archived</Badge></> : null}<p className="text-xs text-muted">{c.departments} department{c.departments === 1 ? "" : "s"} · {c.programs} program{c.programs === 1 ? "" : "s"}</p></td>
                    <td className={`${td} text-right`}><CountLink n={c.total} href={group({ gc: c.id })} label={c.name} /></td>
                    <td className={td}><Bar n={c.total} total={pop.total} /></td>
                  </tr>
                ))}
                {!scoped && pop.unassignedProgram.total > 0 ? (
                  <tr><td className={td}><span className="font-medium">Unassigned</span><p className="text-xs text-muted">No program recorded</p></td><td className={`${td} text-right`}><CountLink n={pop.unassignedProgram.total} href={group({ gp: UNASSIGNED })} label="no program" /></td><td className={td}><Bar n={pop.unassignedProgram.total} total={pop.total} /></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
        <section aria-labelledby="pop-depts" className="min-w-0 rounded-2xl border border-border bg-surface shadow-card">
          <h3 id="pop-depts" className="px-5 pt-4 font-semibold">By department</h3>
          <div className="overflow-x-auto p-2">
            <table className="w-full min-w-[26rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className={th}>Department</th><th className={`${th} text-right`}>Students</th><th className={th}>Share</th></tr></thead>
              <tbody>
                {departments.length === 0 ? <tr><td colSpan={3} className={`${td} text-muted`}>No departments in this selection.</td></tr> : departments.map((d) => (
                  <tr key={d.id}>
                    <td className={td}><span className="font-medium">{d.name}</span>{!d.active ? <> <Badge>Archived</Badge></> : null}<p className="text-xs text-muted">{d.collegeCode} · {d.programs} program{d.programs === 1 ? "" : "s"}</p></td>
                    <td className={`${td} text-right`}><CountLink n={d.total} href={group({ gd: d.id })} label={`${d.collegeCode} ${d.name}`} /></td>
                    <td className={td}><Bar n={d.total} total={pop.total} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Program x year level */}
      <section aria-labelledby="pop-programs" className="min-w-0 rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
          <h3 id="pop-programs" className="font-semibold">By program and year level</h3>
          <p className="text-xs text-muted">{programs.length} program{programs.length === 1 ? "" : "s"} · {scopeTotal} student{scopeTotal === 1 ? "" : "s"} · click a number to see the students</p>
        </div>
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className={th}>Program</th>
                {years.map((y) => <th key={y} className={`${th} text-right`}>{yearLabel(y)}</th>)}
                <th className={`${th} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id} className="hover:bg-primary-soft/20">
                  <td className={td}>
                    <span className="font-medium">{p.name}</span>{!p.active ? <> <Badge>Archived</Badge></> : null}
                    <p className="text-xs text-muted">{p.code} · {p.collegeCode} · {p.departmentName}</p>
                  </td>
                  {years.map((y) => <td key={y} className={`${td} text-right`}><CountLink n={p.byYear[y] ?? 0} href={group({ gp: p.id, gy: y })} label={`${p.name}, ${yearLabel(y)}`} /></td>)}
                  <td className={`${td} text-right`}><CountLink n={p.total} href={group({ gp: p.id })} label={p.name} /></td>
                </tr>
              ))}
              {!scoped && pop.unassignedProgram.total > 0 ? (
                <tr className="bg-warning/5">
                  <td className={td}><span className="font-medium">Unassigned</span><p className="text-xs text-muted">Students with no program recorded</p></td>
                  {years.map((y) => <td key={y} className={`${td} text-right`}><CountLink n={pop.unassignedProgram.byYear[y] ?? 0} href={group({ gp: UNASSIGNED, gy: y })} label={`no program, ${yearLabel(y)}`} /></td>)}
                  <td className={`${td} text-right`}><CountLink n={pop.unassignedProgram.total} href={group({ gp: UNASSIGNED })} label="no program" /></td>
                </tr>
              ) : null}
              {programs.length === 0 ? <tr><td colSpan={years.length + 2} className={`${td} text-muted`}>No programs in this selection.</td></tr> : null}
            </tbody>
            {years.length > 0 && programs.length > 0 ? (
              <tfoot>
                <tr className="font-semibold">
                  <td className={td}>Total</td>
                  {years.map((y) => {
                    const n = programs.reduce((s, p) => s + (p.byYear[y] ?? 0), 0) + (scoped ? 0 : pop.unassignedProgram.byYear[y] ?? 0);
                    return <td key={y} className={`${td} text-right tabular-nums`}>{n}</td>;
                  })}
                  <td className={`${td} text-right tabular-nums`}>{scopeTotal}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        {years.length === 0 ? <p className="px-5 pb-4 text-sm text-muted">No students have been placed in a program yet. Assign students a program and year level in User Management.</p> : null}
      </section>
    </div>
  );
}

/** The student list for one group, in a dialog (search + pagination stay in the URL). */
export async function GroupDialog({ pop, filter, page, href, closeHref }: { pop: Population; filter: GroupFilter; page: number; href: Href; closeHref: string }) {
  const { total, rows } = await studentsInGroup(filter, page);
  const program = filter.programId === UNASSIGNED ? "No program" : pop.programs.find((p) => p.id === filter.programId)?.name;
  const dept = pop.departments.find((d) => d.id === filter.departmentId);
  const college = pop.colleges.find((c) => c.id === filter.collegeId);
  const title = [program ?? (dept ? `${dept.collegeCode} · ${dept.name}` : college ? college.name : null), filter.yearLevel ? yearLabel(filter.yearLevel) : null].filter(Boolean).join(" · ") || "Students";
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <ModalFrame title={title} description={`${total} student${total === 1 ? "" : "s"} · ${pop.basis === "current" ? "current placement" : pop.terms.find((t) => t.id === pop.basis)?.label ?? ""}`} size="lg" closeLabel="Close" closeHref={closeHref}>
      <div className="flex flex-col gap-4">
        <form role="search" action="/organizations" className="flex gap-2">
          {Object.entries(Object.fromEntries(new URL(href({ gq: null, gpage: null }), "http://x").searchParams)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {/* No submit button on purpose: the dialog would promote it to its footer. Enter submits a one-field form. */}
          <input type="search" name="gq" defaultValue={filter.q} placeholder="Search name or student number, then press Enter" aria-label="Search students in this group" className={inputClass} />
        </form>
        {rows.length === 0 ? <p className="rounded-xl border border-border bg-sidebar px-4 py-6 text-center text-sm text-muted">{filter.q ? "No students match this search." : "No students in this group."}</p> : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-sidebar/70 text-xs uppercase tracking-wide text-muted"><tr><th className={th}>Student no.</th><th className={th}>Name</th><th className={th}>Program</th><th className={th}>College · department</th><th className={th}>Year</th><th className={th}>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId}>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{r.studentNumber}</td>
                    <td className={td}><Link href={`/users/${r.userId}`} className="font-medium hover:text-primary hover:underline">{r.name}</Link></td>
                    <td className={td}>{r.program ?? <span className="text-muted">Unassigned</span>}</td>
                    <td className={td}>{r.unit ?? <span className="text-muted">—</span>}</td>
                    <td className={td}>{r.yearLevel ?? <span className="text-muted">Unassigned</span>}</td>
                    <td className={td}><Badge tone={r.status === "ACTIVE" ? "green" : r.status === "INVITED" ? "amber" : "red"}>{r.status === "ACTIVE" ? "Active" : r.status === "INVITED" ? "Awaiting setup" : "Deactivated"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 ? (
          <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
            {page > 1 ? <Link scroll={false} href={href({ gpage: String(page - 1) })} className="rounded-lg border border-border px-3 py-1 hover:bg-sidebar">Previous</Link> : null}
            <span className="text-muted">Page {page} of {pages}</span>
            {page < pages ? <Link scroll={false} href={href({ gpage: String(page + 1) })} className="rounded-lg border border-border px-3 py-1 hover:bg-sidebar">Next</Link> : null}
          </nav>
        ) : null}
      </div>
    </ModalFrame>
  );
}
