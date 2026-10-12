import { getActiveUser } from "@/lib/auth/dal";
import { toCsv } from "@/lib/csv";
import { exportRows } from "@/features/reports/queries";
import { db } from "@/lib/database/client";

export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  const user = await getActiveUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { type } = await params;
  if (type !== "attendance" && type !== "finance") return new Response("Not found", { status: 404 });

  const rows = await exportRows(user, type);
  if (!rows) return new Response("Forbidden", { status: 403 });

  await db.auditLog.create({ data: { actorUserId: user.id, action: `report.export_${type}`, metadata: { rows: rows.length - 1 } } });
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tapasok-${type}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
