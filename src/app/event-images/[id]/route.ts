import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { readEventImage } from "@/features/landing/images";

// A landing-page event picture. Pictures of events shown on the landing page are public; anything else (a preview of a
// picture not shown yet, or a removed one) is visible to System Admin only. Everyone else gets "not found".
// Stored pictures never change (a new upload is a new id), but they can be removed, so public caching is kept short.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  let img = await readEventImage(id, null);
  if (!img) img = await readEventImage(id, await getCurrentUser());
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(img.bytes), {
    headers: {
      "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "Cache-Control": img.public ? "public, max-age=300, s-maxage=300, stale-while-revalidate=60" : "private, no-store",
    },
  });
}
