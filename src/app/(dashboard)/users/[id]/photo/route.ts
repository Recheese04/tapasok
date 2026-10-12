import { z } from "zod";
import { db } from "@/lib/database/client";
import { getCurrentUser } from "@/lib/auth/dal";
import { canOrg, canSystem } from "@/lib/permissions/policy";
import { readBytes } from "@/features/documents/storage";

// A student's photo is visible to the student, to system admins, and to officers who may see the roster
// of an organization the student actively belongs to.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });

  const profile = await db.studentProfile.findUnique({ where: { userId: id }, select: { photoKey: true, user: { select: { memberships: { where: { endedAt: null }, select: { organizationId: true } } } } } });
  if (!profile?.photoKey) return new Response("Not found", { status: 404 });

  const allowed = user.id === id || canSystem(user, "students.manage") || profile.user.memberships.some((m) => canOrg(user, "members.basic", m.organizationId));
  if (!allowed) return new Response("Not found", { status: 404 });

  let bytes: Buffer;
  try { bytes = await readBytes(profile.photoKey); } catch { return new Response("Not found", { status: 404 }); }
  const png = bytes.subarray(0, 4).toString("hex") === "89504e47";
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": png ? "image/png" : "image/jpeg", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'", "Cache-Control": "private, max-age=300" },
  });
}
