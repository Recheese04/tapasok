import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { photoResponse, readPhoto } from "@/features/profile/photo";

// A person's profile picture. Visible to the person, to System Admin, and to officers who may see the roster of an
// organization the person actively belongs to (see src/features/profile/photo.ts). Anything else is "not found".
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const photo = await readPhoto(user, id);
  if (!photo) return new Response("Not found", { status: 404 });
  return photoResponse(photo, new URL(request.url).searchParams.has("v"));
}
