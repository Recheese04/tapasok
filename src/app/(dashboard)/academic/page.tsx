import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { ModalButton } from "@/components/shared/modal";
import { actionButton, Badge, Card, Page, PageHeader, StatCard } from "@/components/shared/ui";
import { Icon } from "@/components/layout/icons";
import { db } from "@/lib/database/client";
import { requireSystemPermissionPage } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { setUnitActiveAction } from "@/features/academic/actions";
import { ActiveTermForm, CollegeForm, DepartmentForm, ProgramForm, SchoolYearForm, SemesterForm } from "@/features/academic/academic-forms";
import { DeleteRecord, SchoolYearEdit, SemesterEdit, UnitEdit } from "@/features/academic/academic-manage";

// Signed-in page: it validates the session cookie against the database and loads data scoped to the person on every
// request, so it cannot be prerendered or shared. The layout and loading.tsx stream the frame and a skeleton while it
// renders; this opts the page out of the "instant navigation" check that would flag the session read.
export const instant = false;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

function Archive({ kind, id, active, name }: { kind: "college" | "department" | "program"; id: string; active: boolean; name: string }) {
  return (
    <form action={setUnitActiveAction} className="inline">
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} /><input type="hidden" name="active" value={String(!active)} />
      <ConfirmButton
        title={active ? "Archive?" : "Restore?"}
        confirmLabel={active ? "Archive" : "Restore"}
        message={active ? `Archive ${name}? It disappears from selection lists, but every existing record keeps it.` : `Restore ${name} so it can be chosen again?`}
        className={actionButton}
      >
        {active ? "Archive" : "Restore"}
      </ConfirmButton>
    </form>
  );
}

const TABS = [["structure", "Colleges, departments & programs"], ["terms", "School years & terms"]] as const;

export default async function AcademicPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSystemPermissionPage("academic.manage");
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "terms" ? "terms" : "structure";

  // Counts of everything that points at an entry decide whether Delete is offered; the server enforces the same rule.
  const [years, colleges] = await Promise.all([
    db.schoolYear.findMany({
      orderBy: { startsOn: "desc" },
      include: {
        semesters: {
          orderBy: { sequence: "asc" },
          include: { _count: { select: { members: true, enrollments: true, events: true, assessments: true, feeTypes: true, announcements: true, documents: true } } },
        },
      },
    }),
    db.college.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { organizations: true, staffProfiles: true } },
        departments: {
          orderBy: { name: "asc" },
          include: {
            _count: { select: { organizations: true, staffProfiles: true } },
            programs: { orderBy: { name: "asc" }, include: { _count: { select: { students: true, enrollments: true, organizations: true } } } },
          },
        },
      },
    }),
  ]);

  const departmentCount = colleges.reduce((n, c) => n + c.departments.length, 0);
  const programCount = colleges.reduce((n, c) => n + c.departments.reduce((m, d) => m + d.programs.length, 0), 0);
  const activeYear = years.find((y) => y.active);
  const activeSemester = years.flatMap((y) => y.semesters).find((s) => s.active);
  const semesterOptions = years.flatMap((y) => y.semesters.map((s) => ({ id: s.id, label: `${y.label} · ${s.name}` })));
  const activeColleges = colleges.filter((c) => c.active);
  const allDepartments = activeColleges.flatMap((c) => c.departments.filter((d) => d.active).map((d) => ({ id: d.id, label: `${c.name} › ${d.name}` })));

  return (
    <Page>
      <PageHeader
        title="Academic Setup"
        subtitle="The school years, colleges, departments and degree programs that students, organizations and events refer to. Archive an entry to hide it; it can only be deleted when nothing uses it."
        actions={tab === "terms" ? (
          <>
            <ModalButton label="+ Add school year" variant="primary" title="Add school year" size="sm"><SchoolYearForm /></ModalButton>
            <ModalButton label="+ Add semester" title="Add semester" size="sm"><SemesterForm years={years.map((y) => ({ id: y.id, label: y.label }))} /></ModalButton>
            <ModalButton label="Set active term" title="Set the active term" description="New events, fees and enrollments use the active term." size="sm"><ActiveTermForm semesters={semesterOptions} /></ModalButton>
          </>
        ) : (
          <>
            <ModalButton label="+ Add college" variant="primary" title="Add college" size="sm"><CollegeForm /></ModalButton>
            <ModalButton label="+ Add department" title="Add department" size="sm"><DepartmentForm colleges={activeColleges.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))} /></ModalButton>
            <ModalButton label="+ Add program" title="Add degree program" size="sm"><ProgramForm departments={allDepartments} /></ModalButton>
          </>
        )}
      />

      <section aria-label="Overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Colleges" value={colleges.length} icon={<Icon name="building" />} />
        <StatCard label="Departments" value={departmentCount} icon={<Icon name="academic" />} tone="blue" />
        <StatCard label="Programs" value={programCount} icon={<Icon name="clipboard" />} tone="green" />
        <StatCard label="Active term" value={activeYear ? activeYear.label : "Not set"} hint={activeSemester ? activeSemester.name : "Use Set active term on the School years tab"} icon={<Icon name="calendar" />} tone="amber" />
      </section>

      <nav aria-label="Academic setup sections" className="flex flex-wrap gap-2 border-b border-border">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/academic?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium ${tab === key ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "terms" ? (
        years.length === 0 ? (
          <EmptyState title="No school years yet" hint="Add a school year, then its semesters, then set the active term." />
        ) : (
          <div className="flex flex-col gap-4">
            {years.map((y) => (
              <Card key={y.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
                      School year {y.label} {y.active && <Badge tone="green">Active</Badge>}
                    </h2>
                    <p className="text-sm text-muted">{formatDate(y.startsOn)} – {formatDate(y.endsOn)} · {y.semesters.length} semester{y.semesters.length === 1 ? "" : "s"}{y.semesters.length === 0 ? " · add a semester to be able to set this year active" : ""}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ModalButton label="+ Semester" variant="action" title="Add semester" description={`School year ${y.label}`} size="sm"><SemesterForm years={[{ id: y.id, label: y.label }]} /></ModalButton>
                    <SchoolYearEdit id={y.id} label={y.label} startsOn={iso(y.startsOn)} endsOn={iso(y.endsOn)} />
                    <DeleteRecord kind="school_year" id={y.id} label={`school year ${y.label}`} blocked={y.active ? "The active school year cannot be deleted." : y.semesters.length ? "Delete or move its semesters first." : undefined} />
                  </div>
                </div>
                {y.semesters.length > 0 && (
                  <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-sidebar/70 text-xs uppercase tracking-wide text-muted">
                        <tr><th scope="col" className="px-4 py-2 font-semibold">Semester</th><th scope="col" className="px-4 py-2 font-semibold">Dates</th><th scope="col" className="px-4 py-2 font-semibold">Status</th><th scope="col" className="px-4 py-2 font-semibold">Actions</th></tr>
                      </thead>
                      <tbody>
                        {y.semesters.map((s) => {
                          const used = sum(s._count);
                          return (
                            <tr key={s.id} className="border-t border-border">
                              <td className="px-4 py-2.5 font-medium">{s.name}</td>
                              <td className="px-4 py-2.5 text-muted">{formatDate(s.startsOn)} – {formatDate(s.endsOn)}</td>
                              <td className="px-4 py-2.5">{s.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex flex-wrap items-start gap-2">
                                  <SemesterEdit id={s.id} name={s.name} sequence={s.sequence} startsOn={iso(s.startsOn)} endsOn={iso(s.endsOn)} />
                                  <DeleteRecord kind="semester" id={s.id} label={`${y.label} ${s.name}`} blocked={s.active ? "The active semester cannot be deleted." : used ? "Records use this semester." : undefined} />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )
      ) : colleges.length === 0 ? (
        <EmptyState title="No colleges yet" hint="Add a college first, then its departments and programs." />
      ) : (
        <div className="flex flex-col gap-5">
          {colleges.map((c) => {
            const programs = c.departments.reduce((n, d) => n + d.programs.length, 0);
            return (
              <section key={c.id} aria-label={c.name} className={`overflow-hidden rounded-2xl border border-border bg-surface shadow-card ${c.active ? "" : "opacity-80"}`}>
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-primary-soft/40 px-5 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground" aria-hidden="true"><Icon name="building" /></span>
                    <div className="min-w-0">
                      <h2 className="break-words text-base font-semibold leading-snug">{c.name}</h2>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                        <Badge tone="purple">{c.code}</Badge>
                        {!c.active && <Badge>Archived</Badge>}
                        <span>{c.departments.length} department{c.departments.length === 1 ? "" : "s"} · {programs} program{programs === 1 ? "" : "s"}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {c.active && <ModalButton label="+ Department" variant="action" title="Add department" description={c.name} size="sm"><DepartmentForm colleges={[{ id: c.id, label: `${c.code} — ${c.name}` }]} /></ModalButton>}
                    <UnitEdit kind="college" id={c.id} code={c.code} name={c.name} />
                    <Archive kind="college" id={c.id} active={c.active} name={c.name} />
                    <DeleteRecord kind="college" id={c.id} label={c.name} blocked={c.departments.length ? "Remove its departments first." : sum(c._count) ? "Organizations or staff use this college." : undefined} />
                  </div>
                </header>

                {c.departments.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted">No departments yet. Programs are added under a department.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {c.departments.map((d) => (
                      <div key={d.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                            {d.name} <Badge tone="gray">{d.code}</Badge> {!d.active && <Badge>Archived</Badge>}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            {d.active && <ModalButton label="+ Program" variant="action" title="Add degree program" description={`${c.name} › ${d.name}`} size="sm"><ProgramForm departments={[{ id: d.id, label: `${c.name} › ${d.name}` }]} /></ModalButton>}
                            <UnitEdit kind="department" id={d.id} code={d.code} name={d.name} />
                            <Archive kind="department" id={d.id} active={d.active} name={d.name} />
                            <DeleteRecord kind="department" id={d.id} label={d.name} blocked={d.programs.length ? "Remove its programs first." : sum(d._count) ? "Organizations or staff use this department." : undefined} />
                          </div>
                        </div>

                        {d.programs.length === 0 ? (
                          <p className="mt-3 text-sm text-muted">No programs yet.</p>
                        ) : (
                          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
                            <table className="w-full text-left text-sm">
                              <thead className="bg-sidebar/70 text-xs uppercase tracking-wide text-muted">
                                <tr>
                                  <th scope="col" className="px-4 py-2 font-semibold">Code</th>
                                  <th scope="col" className="px-4 py-2 font-semibold">Program / course</th>
                                  <th scope="col" className="px-4 py-2 font-semibold">Students</th>
                                  <th scope="col" className="px-4 py-2 font-semibold">Status</th>
                                  <th scope="col" className="px-4 py-2 font-semibold">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {d.programs.map((p) => (
                                  <tr key={p.id} className="border-t border-border">
                                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted">{p.code}</td>
                                    <td className="min-w-48 px-4 py-2.5 font-medium">{p.name}</td>
                                    <td className="px-4 py-2.5">{p._count.students}</td>
                                    <td className="px-4 py-2.5">{p.active ? <Badge tone="green">Active</Badge> : <Badge>Archived</Badge>}</td>
                                    <td className="px-4 py-2.5">
                                      <div className="flex flex-wrap items-start gap-2">
                                        <UnitEdit kind="program" id={p.id} code={p.code} name={p.name} />
                                        <Archive kind="program" id={p.id} active={p.active} name={p.name} />
                                        <DeleteRecord kind="program" id={p.id} label={p.name} blocked={sum(p._count) ? "Students or organizations use this program." : undefined} />
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Page>
  );
}
