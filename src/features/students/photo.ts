import "server-only";
import { db } from "@/lib/database/client";
import { checkPhoto, saveBytes } from "@/features/documents/storage";

/** Stores an uploaded profile photo (older files stay on disk for history) and links it to the profile. */
export async function saveStudentPhoto(userId: string, file: File): Promise<{ ok: true } | { ok: false; error: string }> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const check = checkPhoto(bytes);
  if (!check.ok) return check;
  const photoKey = await saveBytes(bytes);
  await db.studentProfile.update({ where: { userId }, data: { photoKey } });
  return { ok: true };
}
