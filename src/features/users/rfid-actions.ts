"use server";

import { z } from "zod";
import { assertSystemPermission } from "@/lib/permissions";
import { cancelEnrollment, enrollmentState, normalizeUid, setCardManually, startEnrollment, type EnrollmentState } from "@/features/attendance/rfid-enrollment";

const uuid = z.uuid();

/** Tap to register: opens a 60-second window on the chosen terminal for this student. */
export async function startRfidEnrollmentAction(userId: string, deviceId: string): Promise<{ id: string; expiresAt: string } | { error: string }> {
  const admin = await assertSystemPermission("users.manage");
  if (!uuid.safeParse(userId).success || !uuid.safeParse(deviceId).success) return { error: "Choose a terminal." };
  const res = await startEnrollment(admin.id, userId, deviceId);
  return res.ok ? { id: res.id, expiresAt: res.expiresAt.toISOString() } : { error: res.error };
}

/** Polled by the page while it waits for the tap. */
export async function rfidEnrollmentStatusAction(id: string, userId: string): Promise<EnrollmentState | null> {
  await assertSystemPermission("users.manage");
  if (!uuid.safeParse(id).success) return null;
  void userId;
  return enrollmentState(id); // the page refreshes itself when the state is "done"
}

export async function cancelRfidEnrollmentAction(id: string) {
  const admin = await assertSystemPermission("users.manage");
  if (uuid.safeParse(id).success) await cancelEnrollment(admin.id, id);
}

export type RfidManualState = { error?: string; success?: string };

/** Manual entry: typed, or typed by a USB reader that acts as a keyboard. */
export async function saveRfidManualAction(_prev: RfidManualState, fd: FormData): Promise<RfidManualState> {
  const admin = await assertSystemPermission("users.manage");
  const userId = uuid.safeParse(fd.get("userId"));
  if (!userId.success) return { error: "Invalid account." };
  const uid = normalizeUid((fd.get("rfidUid") ?? "").toString());
  if (!uid) return { error: "Enter the card number." };
  const res = await setCardManually(admin.id, userId.data, uid);
  if (!res.ok) return { error: res.error };
  return { success: `Card ${uid} registered.` };
}

export async function removeRfidAction(fd: FormData) {
  const admin = await assertSystemPermission("users.manage");
  const userId = uuid.safeParse(fd.get("userId"));
  if (!userId.success) return;
  await setCardManually(admin.id, userId.data, null);
}
