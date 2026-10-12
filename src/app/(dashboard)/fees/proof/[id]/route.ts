import { z } from "zod";
import { db } from "@/lib/database/client";
import { getCurrentUser } from "@/lib/auth/dal";
import { canOrg } from "@/lib/permissions/policy";
import { readBytes } from "@/features/documents/storage";

// Payment evidence is restricted to the student who submitted it and the organization's treasurer.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const p = z.uuid().safeParse(id).success ? await db.payment.findUnique({ where: { id }, select: { proofKey: true, proofMime: true, submittedById: true, studentFee: { select: { organizationId: true } } } }) : null;
  if (!p?.proofKey || !p.proofMime) return new Response("Not found", { status: 404 });
  if (p.submittedById !== user.id && !canOrg(user, "fees.manage", p.studentFee.organizationId)) return new Response("Not found", { status: 404 });

  let bytes: Buffer;
  try { bytes = await readBytes(p.proofKey); } catch { return new Response("Not found", { status: 404 }); }
  // Images open in a sandboxed page; PDFs download (a sandboxed page cannot run the PDF viewer).
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": p.proofMime, "Content-Disposition": p.proofMime.startsWith("image/") ? "inline" : "attachment; filename=\"payment-proof.pdf\"", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'", "Cache-Control": "private, no-store" },
  });
}
