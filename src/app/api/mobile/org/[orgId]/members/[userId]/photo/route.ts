import { z } from "zod";
import { db } from "@/lib/database/client";
import { fail } from "@/lib/mobile/api";
import { orgAuthed } from "@/lib/mobile/org";
import { readBytes } from "@/features/documents/storage";

/**
 * A member's profile photo for the app (Bearer sign-in), with the same rule as the web photo route: officers who may see the
 * organization's roster (members.basic) see photos of its active members. Anything else is "not found".
 */
export const GET = orgAuthed<{ params: Promise<{ orgId: string; userId: string }> }>("members.basic", async (_user, _request, orgId, ctx) => {
  const { userId } = await ctx.params;
  if (!z.uuid().safeParse(userId).success) return fail(404, "NOT_FOUND", "Not found.");
  const member = await db.organizationMember.findFirst({ where: { organizationId: orgId, userId, endedAt: null }, select: { user: { select: { studentProfile: { select: { photoKey: true } } } } } });
  const key = member?.user.studentProfile?.photoKey;
  if (!key) return fail(404, "NOT_FOUND", "Not found.");
  let bytes: Buffer;
  try { bytes = await readBytes(key); } catch { return fail(404, "NOT_FOUND", "Not found."); }
  const png = bytes.subarray(0, 4).toString("hex") === "89504e47";
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": png ? "image/png" : "image/jpeg", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300" } });
});
