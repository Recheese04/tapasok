import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { canOrg } from "@/lib/permissions/policy";
import { toCsv } from "@/lib/csv";
import { db } from "@/lib/database/client";
import { finAudit } from "@/features/finance/audit";
import { isYmd, listFunds, periodReport } from "@/features/finance/funds";

// CSV of the organization's period report (summary + every approved and reversed fund record in the period).
// Allowed for reports.finance in that organization; each export is written to the financial audit trail.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const q = new URL(req.url).searchParams;
  const org = q.get("org") ?? "", from = q.get("from") ?? "", to = q.get("to") ?? "";
  if (!z.uuid().safeParse(org).success || !isYmd(from) || !isYmd(to) || from > to) return new Response("Bad request", { status: 400 });
  if (!canOrg(user, "reports.finance", org)) return new Response("Not found", { status: 404 });

  const r = await periodReport(org, from, to);
  const rows = await listFunds(org, { from, to }, 5000);
  const csv = toCsv([
    ["Period", `${from} to ${to}`],
    ["Opening balance", r.opening],
    ["Fee collections (confirmed)", r.collections],
    ["Other funds received (approved)", r.otherIncome],
    ["Total received", r.received],
    ["Expenses (approved)", r.spent],
    ["Closing balance", r.closing],
    ["Reconciles", r.reconciles ? "yes" : "NO"],
    [],
    ["Date", "Type", "Category", "Description", "Amount", "Status", "Recorded by", "Decided by", "Reason"],
    ...rows.filter((x) => x.status === "APPROVED" || x.status === "REVERSED").map((x) => [x.occurredOn, x.type, x.categoryLabel, x.title, x.amount, x.status, x.recordedBy, x.decidedBy ?? "", x.reversalReason ?? x.decisionReason ?? ""]),
  ]);
  await finAudit(db, { organizationId: org, action: "report.export", entityType: "report", actorId: user.id, after: { from, to, closing: r.closing } });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="tapasok-finance-${from}-to-${to}.csv"`, "Cache-Control": "private, no-store" } });
}
