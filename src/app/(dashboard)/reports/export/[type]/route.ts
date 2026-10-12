import { getCurrentUser } from "@/lib/auth/dal";
import { toCsv } from "@/lib/csv";
import { exportRows } from "@/features/reports/queries";
import { db } from "@/lib/database/client";
import { orgIdsWith } from "@/lib/permissions/policy";
import { finAudit } from "@/features/finance/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { type } = await params;
  if (type !== "attendance" && type !== "finance") return new Response("Not found", { status: 404 });

  const rows = await exportRows(user, type);
  if (!rows) return new Response("Forbidden", { status: 403 });

  await db.auditLog.create({ data: { actorUserId: user.id, action: `report.export_${type}`, metadata: { rows: rows.length - 1 } } });
  if (type === "finance") {
    for (const organizationId of orgIdsWith(user, "reports.finance")) await finAudit(db, { organizationId, action: "report.export", entityType: "report", actorId: user.id, after: { report: "finance summary", rows: rows.length - 1 } });
  }
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tapasok-${type}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
