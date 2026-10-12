import { z } from "zod";
import { db } from "@/lib/database/client";
import { getCurrentUser } from "@/lib/auth/dal";
import { canOrg } from "@/lib/permissions/policy";
import { readBytes, safeFileName } from "@/features/documents/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = z.uuid().safeParse(id).success ? await db.document.findUnique({ where: { id } }) : null;
  // 404 for missing, deleted, or documents of organizations the user does not belong to.
  if (!doc || doc.deletedAt || !canOrg(user, "documents.view", doc.organizationId)) return new Response("Not found", { status: 404 });

  let bytes: Buffer;
  try { bytes = await readBytes(doc.storageKey); } catch { return new Response("Not found", { status: 404 }); }

  await db.auditLog.create({ data: { actorUserId: user.id, action: "document.download", targetType: "document", targetId: doc.id } });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename="${safeFileName(doc.fileName)}"`,
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "Cache-Control": "private, no-store",
    },
  });
}
