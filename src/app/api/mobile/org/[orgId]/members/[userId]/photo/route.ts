import { z } from "zod";
import { db } from "@/lib/database/client";
import { fail } from "@/lib/mobile/api";
import { orgAuthed } from "@/lib/mobile/org";
import { photoResponse, readPhoto } from "@/features/profile/photo";

/**
 * A member's profile picture for the app (Bearer sign-in), with the same rule as the web photo route: officers who may see the
 * organization's roster (members.basic) see pictures of its active members. Anything else is "not found".
 */
export const GET = orgAuthed<{ params: Promise<{ orgId: string; userId: string }> }>("members.basic", async (user, request, orgId, ctx) => {
  const { userId } = await ctx.params;
  if (!z.uuid().safeParse(userId).success) return fail(404, "NOT_FOUND", "Not found.");
  const member = await db.organizationMember.findFirst({ where: { organizationId: orgId, userId, endedAt: null }, select: { id: true } });
  const photo = member ? await readPhoto(user, userId) : null;
  return photo ? photoResponse(photo, new URL(request.url).searchParams.has("v")) : fail(404, "NOT_FOUND", "Not found.");
});
