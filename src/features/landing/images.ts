import "server-only";
import sharp from "sharp";
import { db } from "@/lib/database/client";
import { canSystem, type PolicyUser } from "@/lib/permissions/policy";
import { ACTIVE, deletion, restoration } from "@/lib/database/soft-delete";
import { refreshLanding } from "./cache";

// Landing-page event pictures. Rules:
//   * Only System Admin (landing.manage) uploads, edits, reorders, removes or restores them, and chooses which events appear
//     on the public landing page. Organization officers keep managing their own events as before; this never changes an
//     event's content or ownership.
//   * Only PUBLISHED, not-deleted events of ACTIVE organizations can be shown. Cancelling or deleting an event takes it off
//     the landing page automatically.
//   * Uploads are checked by their content, decoded, auto-rotated, resized to fit 1600 x 1600 and re-encoded as WebP with
//     all metadata (location, camera data) removed. The bytes live in the database (event_images), so they survive
//     redeployments; the server's own disk is temporary on the host.
//   * Removing a picture is a soft delete: it disappears from the landing page and can be restored.

export const MAX_INPUT_BYTES = 4 * 1024 * 1024; // the host refuses request bodies over 4.5 MB
export const MAX_IMAGES_PER_EVENT = 6;
const MAX_SIDE = 1600;
const MAX_PIXELS = 40_000_000; // refuses decompression bombs
const MAX_STORED = 2 * 1024 * 1024; // matches the database CHECK

type Fail = { ok: false; error: string };
type Admin = PolicyUser & { id: string };

const allowed = (u: Admin) => canSystem(u, "landing.manage");
const NOT_ALLOWED: Fail = { ok: false, error: "Only system administrators manage landing-page pictures." };

function sniff(bytes: Buffer): "jpeg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

/** Validates and re-encodes an upload. The original bytes are never stored. */
export async function processEventImage(bytes: Buffer): Promise<{ ok: true; content: Buffer; width: number; height: number } | Fail> {
  if (bytes.length === 0) return { ok: false, error: "Choose a picture to upload." };
  if (bytes.length > MAX_INPUT_BYTES) return { ok: false, error: "The picture is too large. Use one under 4 MB." };
  const kind = sniff(bytes);
  if (!kind) return { ok: false, error: "Use a JPEG, PNG or WebP picture." };
  try {
    const img = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "error" });
    const meta = await img.metadata();
    if (meta.format !== kind) return { ok: false, error: "The picture could not be read." };
    let quality = 82;
    for (;;) {
      const { data, info } = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).rotate()
        .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true }).webp({ quality }).toBuffer({ resolveWithObject: true });
      if (data.length <= MAX_STORED || quality <= 50) {
        if (data.length > MAX_STORED) return { ok: false, error: "The picture is too detailed to store. Try a smaller one." };
        return { ok: true, content: data, width: info.width, height: info.height };
      }
      quality -= 16;
    }
  } catch {
    return { ok: false, error: "The picture could not be read. It may be damaged or too large." };
  }
}

const cleanAlt = (v: string | null | undefined) => (v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || null;

/** An event that may carry landing-page pictures: published, not deleted, of an active organization. */
async function eligibleEvent(eventId: string) {
  return db.event.findFirst({ where: { id: eventId, status: "PUBLISHED", ...ACTIVE, organization: { status: "ACTIVE" } }, select: { id: true, title: true } });
}

export async function addEventImage(admin: Admin, eventId: string, bytes: Buffer, alt: string | null): Promise<{ ok: true; id: string } | Fail> {
  if (!allowed(admin)) return NOT_ALLOWED;
  const event = await eligibleEvent(eventId);
  if (!event) return { ok: false, error: "Only published events can have landing-page pictures." };
  const processed = await processEventImage(bytes);
  if (!processed.ok) return processed;
  // Serialized per event so two uploads at once cannot both take the last free slot.
  const res = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId}::uuid FOR UPDATE`;
    const count = await tx.eventImage.count({ where: { eventId, ...ACTIVE } });
    if (count >= MAX_IMAGES_PER_EVENT) return null;
    const last = await tx.eventImage.aggregate({ where: { eventId, ...ACTIVE }, _max: { position: true } });
    const row = await tx.eventImage.create({
      data: {
        eventId, content: new Uint8Array(processed.content), mime: "image/webp", width: processed.width, height: processed.height,
        byteSize: processed.content.length, altText: cleanAlt(alt), position: (last._max.position ?? 0) + 1, uploadedById: admin.id,
      },
      select: { id: true },
    });
    await tx.auditLog.create({ data: { actorUserId: admin.id, action: "landing.image_add", targetType: "event", targetId: eventId, metadata: { imageId: row.id, bytes: processed.content.length } } });
    return row;
  });
  if (!res) return { ok: false, error: `An event can have up to ${MAX_IMAGES_PER_EVENT} pictures. Remove one first.` };
  refreshLanding();
  return { ok: true, id: res.id };
}

async function imageFor(admin: Admin, imageId: string) {
  if (!allowed(admin)) return null;
  return db.eventImage.findUnique({ where: { id: imageId }, select: { id: true, eventId: true, deletedAt: true, position: true } });
}

export async function updateImageAlt(admin: Admin, imageId: string, alt: string | null): Promise<{ ok: true } | Fail> {
  const img = await imageFor(admin, imageId);
  if (!img || img.deletedAt) return allowed(admin) ? { ok: false, error: "Picture not found." } : NOT_ALLOWED;
  await db.eventImage.update({ where: { id: imageId }, data: { altText: cleanAlt(alt) } });
  refreshLanding();
  return { ok: true };
}

/** Moves a picture one place earlier or later among the event's active pictures (the first one is the cover). */
export async function moveImage(admin: Admin, imageId: string, direction: "up" | "down"): Promise<{ ok: true } | Fail> {
  const img = await imageFor(admin, imageId);
  if (!img || img.deletedAt) return allowed(admin) ? { ok: false, error: "Picture not found." } : NOT_ALLOWED;
  const list = await db.eventImage.findMany({ where: { eventId: img.eventId, ...ACTIVE }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const i = list.findIndex((x) => x.id === imageId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  await db.$transaction(list.map((x, k) => db.eventImage.update({ where: { id: x.id }, data: { position: k + 1 } })));
  refreshLanding();
  return { ok: true };
}

export async function removeImage(admin: Admin, imageId: string): Promise<{ ok: true } | Fail> {
  const img = await imageFor(admin, imageId);
  if (!img || img.deletedAt) return allowed(admin) ? { ok: false, error: "Picture not found." } : NOT_ALLOWED;
  await db.$transaction([
    db.eventImage.update({ where: { id: imageId }, data: deletion(admin.id) }),
    db.auditLog.create({ data: { actorUserId: admin.id, action: "landing.image_remove", targetType: "event", targetId: img.eventId, metadata: { imageId } } }),
  ]);
  refreshLanding();
  return { ok: true };
}

export async function restoreImage(admin: Admin, imageId: string): Promise<{ ok: true } | Fail> {
  const img = await imageFor(admin, imageId);
  if (!img?.deletedAt) return allowed(admin) ? { ok: false, error: "Picture not found." } : NOT_ALLOWED;
  const res = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${img.eventId}::uuid FOR UPDATE`;
    const count = await tx.eventImage.count({ where: { eventId: img.eventId, ...ACTIVE } });
    if (count >= MAX_IMAGES_PER_EVENT) return false;
    const last = await tx.eventImage.aggregate({ where: { eventId: img.eventId, ...ACTIVE }, _max: { position: true } });
    await tx.eventImage.update({ where: { id: imageId }, data: { ...restoration(), position: (last._max.position ?? 0) + 1 } });
    await tx.auditLog.create({ data: { actorUserId: admin.id, action: "landing.image_restore", targetType: "event", targetId: img.eventId, metadata: { imageId } } });
    return true;
  });
  if (!res) return { ok: false, error: `This event already has ${MAX_IMAGES_PER_EVENT} pictures. Remove one before restoring another.` };
  refreshLanding();
  return { ok: true };
}

/** Shows or hides an event on the landing page. Showing needs a published event with at least one picture. */
export async function setShowOnLanding(admin: Admin, eventId: string, show: boolean): Promise<{ ok: true } | Fail> {
  if (!allowed(admin)) return NOT_ALLOWED;
  if (show) {
    const event = await eligibleEvent(eventId);
    if (!event) return { ok: false, error: "Only published events can be shown on the landing page." };
    if (!(await db.eventImage.count({ where: { eventId, ...ACTIVE } }))) return { ok: false, error: "Add at least one picture before showing this event." };
  } else if (!(await db.event.findUnique({ where: { id: eventId }, select: { id: true } }))) return { ok: false, error: "Event not found." };
  await db.$transaction([
    db.event.update({ where: { id: eventId }, data: { showOnLanding: show } }),
    db.auditLog.create({ data: { actorUserId: admin.id, action: show ? "landing.event_show" : "landing.event_hide", targetType: "event", targetId: eventId } }),
  ]);
  refreshLanding();
  return { ok: true };
}

/** Where-clause for pictures anyone may see: active picture of a shown, published, active event. */
const PUBLIC_IMAGE = { ...ACTIVE, event: { showOnLanding: true, status: "PUBLISHED" as const, ...ACTIVE, organization: { status: "ACTIVE" as const } } };

/**
 * Picture bytes for the image route. Public when the picture is on the landing page; otherwise only System Admin sees it
 * (previews of pictures not shown yet, and removed pictures before restoring). Anything else is "not found".
 */
export async function readEventImage(imageId: string, viewer: Admin | null): Promise<{ bytes: Buffer; public: boolean } | null> {
  const pub = await db.eventImage.findFirst({ where: { id: imageId, ...PUBLIC_IMAGE }, select: { content: true } });
  if (pub) return { bytes: Buffer.from(pub.content), public: true };
  if (!viewer || !allowed(viewer)) return null;
  const row = await db.eventImage.findUnique({ where: { id: imageId }, select: { content: true } });
  return row ? { bytes: Buffer.from(row.content), public: false } : null;
}

/** The events shown on the landing page: upcoming first (soonest first), then the most recent past ones. */
export async function landingEvents(limit = 6) {
  const rows = await db.event.findMany({
    where: { showOnLanding: true, status: "PUBLISHED", ...ACTIVE, organization: { status: "ACTIVE" }, images: { some: ACTIVE } },
    orderBy: { startsAt: "desc" }, take: 30,
    select: {
      id: true, title: true, description: true, venue: true, startsAt: true, endsAt: true,
      organization: { select: { name: true, acronym: true } },
      images: { where: ACTIVE, orderBy: [{ position: "asc" }, { createdAt: "asc" }], take: MAX_IMAGES_PER_EVENT, select: { id: true, altText: true, width: true, height: true } },
    },
  });
  const now = Date.now();
  const upcoming = rows.filter((e) => e.endsAt.getTime() >= now).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = rows.filter((e) => e.endsAt.getTime() < now);
  return [...upcoming, ...past].slice(0, limit).map((e) => ({ ...e, upcoming: e.endsAt.getTime() >= now }));
}
export type LandingEvent = Awaited<ReturnType<typeof landingEvents>>[number];

/** Admin list: published events with their picture counts, searchable, newest first. */
export async function adminLandingEvents(q: string, page: number, pageSize: number) {
  const where = {
    status: "PUBLISHED" as const, ...ACTIVE, organization: { status: "ACTIVE" as const },
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { organization: { name: { contains: q, mode: "insensitive" as const } } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    db.event.count({ where }),
    db.event.findMany({
      where, orderBy: [{ showOnLanding: "desc" }, { startsAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, title: true, venue: true, startsAt: true, showOnLanding: true, organization: { select: { name: true } }, _count: { select: { images: { where: ACTIVE } } } },
    }),
  ]);
  return { total, rows };
}

/** One event's pictures for the admin editor (active and removed). */
export async function adminEventImages(eventId: string) {
  const event = await db.event.findFirst({
    where: { id: eventId, ...ACTIVE },
    select: { id: true, title: true, venue: true, startsAt: true, status: true, showOnLanding: true, organization: { select: { name: true, status: true } } },
  });
  if (!event) return null;
  const images = await db.eventImage.findMany({
    where: { eventId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, altText: true, width: true, height: true, byteSize: true, createdAt: true, deletedAt: true, deletedById: true, restoredAt: true },
  });
  return { event, active: images.filter((i) => !i.deletedAt), removed: images.filter((i) => i.deletedAt) };
}
