import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";

// RFID terminals authenticate with a per-device key. Only its SHA-256 hash is stored; the key is shown once.

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

export async function registerDevice(actorId: string, organizationId: string, name: string): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const key = `tpd_${randomBytes(24).toString("base64url")}`;
  try {
    const d = await db.scannerDevice.create({ data: { organizationId, name, keyHash: hash(key), createdById: actorId } });
    await db.auditLog.create({ data: { actorUserId: actorId, action: "device.register", targetType: "device", targetId: d.id } });
    return { ok: true, key };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "A device with this name already exists." };
    throw e;
  }
}

export async function revokeDevice(actorId: string, deviceId: string) {
  await db.scannerDevice.update({ where: { id: deviceId }, data: { active: false } });
  await db.auditLog.create({ data: { actorUserId: actorId, action: "device.revoke", targetType: "device", targetId: deviceId } });
}

/** Resolves a presented key to an active device and records that it was seen. */
export async function authenticateDevice(key: string | null) {
  if (!key || !key.startsWith("tpd_") || key.length > 100) return null;
  const device = await db.scannerDevice.findUnique({ where: { keyHash: hash(key) } });
  if (!device || !device.active) return null;
  await db.scannerDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  return device;
}
