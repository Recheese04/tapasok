import { z } from "zod";
import { db } from "@/lib/database/client";
import { getCurrentUser } from "@/lib/auth/dal";
import { canOrg } from "@/lib/permissions/policy";
import { readBytes, safeFileName } from "@/features/documents/storage";

// Receipts for organization expenses and other funds: only for people who may see the organization's finances
// (fees.view_org: President, Treasurer, Auditor, Adviser) in the record's own organization.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const t = z.uuid().safeParse(id).success ? await db.fundTransaction.findUnique({ where: { id }, select: { organizationId: true, receiptKey: true, receiptMime: true, receiptName: true } }) : null;
  if (!t?.receiptKey || !t.receiptMime || !canOrg(user, "fees.view_org", t.organizationId)) return new Response("Not found", { status: 404 });

  let bytes: Buffer;
  try { bytes = await readBytes(t.receiptKey); } catch { return new Response("Not found", { status: 404 }); }
  // Images open in a sandboxed page; PDFs download (a sandboxed page cannot run the PDF viewer).
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": t.receiptMime,
      "Content-Disposition": t.receiptMime.startsWith("image/") ? "inline" : `attachment; filename="${safeFileName(t.receiptName ?? "receipt.pdf")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "Cache-Control": "private, no-store",
    },
  });
}
