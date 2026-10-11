import { db } from "@/lib/database/client";
import { json } from "@/lib/mobile/api";
import { capabilitiesIn, orgAuthed } from "@/lib/mobile/org";

/** The organization's documents (metadata only; file download and upload stay on the web). */
export const GET = orgAuthed("documents.view", async (user, _request, orgId) => {
  const docs = await db.document.findMany({
    where: { organizationId: orgId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, title: true, description: true, fileName: true, category: true, sizeBytes: true, createdAt: true },
  });
  return json({
    canManage: capabilitiesIn(user, orgId)["documents.manage"],
    documents: docs.map((d) => ({ id: d.id, title: d.title, description: d.description, fileName: d.fileName, category: d.category, sizeBytes: d.sizeBytes, at: d.createdAt.toISOString() })),
  });
});
