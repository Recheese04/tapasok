"use server";

import { z } from "zod";
import { db } from "@/lib/database/client";
import { assertOrgPermission } from "@/lib/permissions";
import { registerDevice, revokeDevice } from "./devices";

export type DeviceState = { error?: string; key?: string };

export async function registerDeviceAction(_prev: DeviceState, fd: FormData): Promise<DeviceState> {
  const orgId = z.uuid().safeParse(fd.get("organizationId"));
  const name = z.string().trim().min(2, "Enter a device name.").max(60).safeParse(fd.get("name"));
  if (!orgId.success) return { error: "Choose an organization." };
  const actor = await assertOrgPermission("devices.manage", orgId.data);
  if (!name.success) return { error: name.error.issues[0].message };
  const res = await registerDevice(actor.id, orgId.data, name.data);
  return res.ok ? { key: res.key } : { error: res.error };
}

export async function revokeDeviceAction(fd: FormData) {
  const id = z.uuid().safeParse(fd.get("deviceId"));
  if (!id.success) return;
  const d = await db.scannerDevice.findUnique({ where: { id: id.data }, select: { organizationId: true } });
  if (!d) return;
  const actor = await assertOrgPermission("devices.manage", d.organizationId);
  await revokeDevice(actor.id, id.data);
}
