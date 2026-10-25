import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { canOrg } from "@/lib/permissions/policy";
import { toCsv } from "@/lib/csv";
import { db } from "@/lib/database/client";
import { finAudit } from "@/features/finance/audit";
import { filterLabel, parseFinanceFilter, termOptions } from "@/features/fees/filters";
import { masterlist, type MasterlistStatus } from "@/features/fees/masterlist";

// CSV of the fees masterlist with the same filters as the page. Allowed for reports.finance in that organization (the same
// rule as the financial report export); every export is written to the financial audit trail.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const p = new URL(req.url).searchParams;
  const org = p.get("org") ?? "";
  if (!z.uuid().safeParse(org).success) return new Response("Bad request", { status: 400 });
  if (!canOrg(user, "reports.finance", org)) return new Response("Not found", { status: 404 });

  const filter = parseFinanceFilter({ sy: p.get("sy") ?? undefined, sem: p.get("sem") ?? undefined, yl: p.get("yl") ?? undefined });
  const status = (["all", "paid", "balance", "none"] as const).find((s) => s === p.get("status")) ?? ("all" as MasterlistStatus);
  const [terms, list, orgRow] = await Promise.all([
    termOptions(), masterlist(org, filter, { q: p.get("q") ?? "", status }),
    db.organization.findUnique({ where: { id: org }, select: { name: true } }),
  ]);
  const label = filterLabel(filter, terms);
  const csv = toCsv([
    ["Organization", orgRow?.name ?? ""],
    ["View", label],
    [],
    ["#", "Last name", "First name", "Student number", "Program", "Year level", ...list.columns.flatMap((c) => [`${c.label} paid`, `${c.label} balance`]), "Total due", "Total paid", "Balance", "Status"],
    ...list.rows.map((r, i) => [
      i + 1, r.lastName, r.firstName, r.studentNumber ?? "", r.program ?? "", r.yearLevel ?? "",
      ...list.columns.flatMap((c) => { const cell = r.cells[c.key]; return cell ? [cell.paid.toFixed(2), cell.balance.toFixed(2)] : ["", ""]; }),
      r.due.toFixed(2), r.paid.toFixed(2), r.balance.toFixed(2), r.status ?? "NOT ASSESSED",
    ]),
    [],
    ["", "Total", "", "", "", "", ...list.columns.flatMap((c) => [list.columnTotals[c.key].paid.toFixed(2), list.columnTotals[c.key].due.sub(list.columnTotals[c.key].paid).toFixed(2)]), list.totals.due.toFixed(2), list.totals.paid.toFixed(2), list.totals.balance.toFixed(2), ""],
  ]);
  await finAudit(db, { organizationId: org, action: "masterlist.export", entityType: "report", actorId: user.id, after: { view: label, rows: list.rows.length } });
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="tapasok-masterlist-${slug}.csv"`, "Cache-Control": "private, no-store" } });
}
