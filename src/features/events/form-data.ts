import "server-only";
import { db } from "@/lib/database/client";
import { academicTree } from "@/features/academic/service";
import { getSetting } from "@/features/settings/system-settings";

/** Reference data the event form needs: academic tree, semesters, and each organization's active rules. */
export async function eventFormData(orgIds: string[]) {
  const [tree, semesters, rules, defaultGrace] = await Promise.all([
    academicTree(),
    db.semester.findMany({ orderBy: [{ schoolYear: { startsOn: "desc" } }, { sequence: "asc" }], select: { id: true, name: true, schoolYear: { select: { label: true } } } }),
    db.consequenceRule.findMany({ where: { organizationId: { in: orgIds }, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, organizationId: true } }),
    getSetting("attendance.late_grace_minutes").then(Number),
  ]);
  const rulesByOrg: Record<string, { id: string; label: string }[]> = {};
  for (const r of rules) (rulesByOrg[r.organizationId] ??= []).push({ id: r.id, label: r.name });
  return { tree, defaultGrace: Number.isFinite(defaultGrace) ? defaultGrace : 15, semesters: semesters.map((s) => ({ id: s.id, label: `${s.schoolYear.label} · ${s.name}` })), rulesByOrg };
}
