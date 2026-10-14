import "server-only";
import { unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { db } from "@/lib/database/client";
import { canOrg, canSystem, type PolicyUser } from "@/lib/permissions/policy";
import { readBytes } from "@/features/documents/storage";

// Profile pictures. Rules:
//   * Everyone with an organization or student account manages ONLY their own picture: the account comes from the signed-in
//     session, never from the request. System administrators cannot set or remove anyone's picture, including their own.
//   * Uploads are checked by their content (not the file name or browser type), decoded, auto-rotated, cropped to a square,
//     resized to 512 x 512 and re-encoded as WebP with all metadata removed (location, camera data, hidden payloads).
//   * Pictures live in the database (profile_photos), so they survive redeployments. One row per account: replacing or
//     removing a picture replaces or deletes the row. An older file-based picture (student_profiles.photo_key) is cleared
//     and its file deleted when the person sets or removes a picture.
//   * Who may SEE a picture: the person, System Admin (students.manage), and officers with roster access (members.basic) in an
//     organization the person actively belongs to.
// A picture is linked to the account only. RFID cards and attendance records never reference it.

export const MAX_INPUT_BYTES = 5 * 1024 * 1024; // what may be uploaded
const SIZE = 512;
const MAX_PIXELS = 40_000_000; // refuses decompression bombs (e.g. a tiny file that claims 50,000 x 50,000 pixels)

type Fail = { ok: false; error: string };

/** Content sniffing: JPEG, PNG or WebP by their magic bytes, whatever the file is called. */
function sniff(bytes: Buffer): "jpeg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

/** Validates and re-encodes an upload. Never stores the original bytes. */
export async function processPhoto(bytes: Buffer): Promise<{ ok: true; content: Buffer; width: number; height: number } | Fail> {
  if (bytes.length === 0) return { ok: false, error: "Choose a picture to upload." };
  if (bytes.length > MAX_INPUT_BYTES) return { ok: false, error: "The picture is too large. Use one under 5 MB." };
  const kind = sniff(bytes);
  if (!kind) return { ok: false, error: "Use a JPEG, PNG or WebP picture." };
  try {
    const img = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "error" });
    const meta = await img.metadata();
    if (meta.format !== kind && !(kind === "jpeg" && meta.format === "jpeg")) return { ok: false, error: "The picture could not be read." };
    const content = await img.rotate().resize(SIZE, SIZE, { fit: "cover", position: "attention" }).webp({ quality: 82 }).toBuffer();
    return { ok: true, content, width: SIZE, height: SIZE };
  } catch {
    return { ok: false, error: "The picture could not be read. It may be damaged or too large." };
  }
}

type Owner = PolicyUser & { id: string };

async function clearLegacyFile(userId: string) {
  const sp = await db.studentProfile.findUnique({ where: { userId }, select: { photoKey: true } });
  if (!sp?.photoKey) return;
  await db.studentProfile.update({ where: { userId }, data: { photoKey: null } });
  // Best effort: the old file may already be gone (the host's disk is temporary).
  const root = path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_DIR ?? "./storage");
  if (/^[0-9a-f-]{36}$/.test(sp.photoKey)) await unlink(path.join(/* turbopackIgnore: true */ root, sp.photoKey)).catch(() => undefined);
}

/** Sets the signed-in person's own picture. */
export async function setOwnPhoto(user: Owner, bytes: Buffer): Promise<{ ok: true; version: number } | Fail> {
  if (user.systemRole === "SYSTEM_ADMIN") return { ok: false, error: "System administrator accounts do not have a profile picture." };
  const processed = await processPhoto(bytes);
  if (!processed.ok) return processed;
  const data = { content: new Uint8Array(processed.content), mime: "image/webp", width: processed.width, height: processed.height, byteSize: processed.content.length };
  const row = await db.profilePhoto.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: { ...data, version: { increment: 1 } },
    select: { version: true },
  });
  await clearLegacyFile(user.id);
  await db.auditLog.create({ data: { actorUserId: user.id, action: "profile.photo_set", targetType: "user", targetId: user.id, metadata: { bytes: data.byteSize, version: row.version } } });
  return { ok: true, version: row.version };
}

/** Removes the signed-in person's own picture. */
export async function removeOwnPhoto(user: Owner): Promise<{ ok: true } | Fail> {
  if (user.systemRole === "SYSTEM_ADMIN") return { ok: false, error: "System administrator accounts do not have a profile picture." };
  const { count } = await db.profilePhoto.deleteMany({ where: { userId: user.id } });
  const legacy = await db.studentProfile.findUnique({ where: { userId: user.id }, select: { photoKey: true } });
  if (!count && !legacy?.photoKey) return { ok: false, error: "You have no profile picture to remove." };
  await clearLegacyFile(user.id);
  await db.auditLog.create({ data: { actorUserId: user.id, action: "profile.photo_remove", targetType: "user", targetId: user.id } });
  return { ok: true };
}

/** May `viewer` see `targetId`'s picture? */
export async function canSeePhoto(viewer: Owner, targetId: string) {
  if (viewer.id === targetId || canSystem(viewer, "students.manage")) return true;
  const orgs = await db.organizationMember.findMany({ where: { userId: targetId, endedAt: null }, select: { organizationId: true } });
  return orgs.some((m) => canOrg(viewer, "members.basic", m.organizationId));
}

/** The picture bytes for a viewer, or null (missing or not allowed: the caller answers "not found" either way). */
export async function readPhoto(viewer: Owner, targetId: string): Promise<{ bytes: Buffer; mime: string; version: number } | null> {
  if (!(await canSeePhoto(viewer, targetId))) return null;
  const row = await db.profilePhoto.findUnique({ where: { userId: targetId }, select: { content: true, mime: true, version: true } });
  if (row) return { bytes: Buffer.from(row.content), mime: row.mime, version: row.version };
  // Older picture kept as a file (only present where that disk still has it).
  const sp = await db.studentProfile.findUnique({ where: { userId: targetId }, select: { photoKey: true } });
  if (!sp?.photoKey) return null;
  try {
    const bytes = await readBytes(sp.photoKey);
    return { bytes, mime: sniff(bytes) === "png" ? "image/png" : "image/jpeg", version: 0 };
  } catch {
    return null;
  }
}

/** HTTP response for a picture: never cached by shared caches; versioned URLs (?v=) can be cached privately for a day. */
export function photoResponse(p: { bytes: Buffer; mime: string; version: number }, versioned: boolean) {
  return new Response(new Uint8Array(p.bytes), {
    headers: {
      "Content-Type": p.mime, "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "Cache-Control": versioned ? "private, max-age=86400" : "private, no-cache",
      ETag: `"p${p.version}"`,
    },
  });
}

/** The current picture version for display (null = no picture: show the initials avatar). */
export async function photoVersion(userId: string): Promise<number | null> {
  const row = await db.profilePhoto.findUnique({ where: { userId }, select: { version: true } });
  if (row) return row.version;
  const sp = await db.studentProfile.findUnique({ where: { userId }, select: { photoKey: true } });
  return sp?.photoKey ? 0 : null;
}
