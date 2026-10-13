"use server";

import { z } from "zod";
import { assertSystemPermission } from "@/lib/permissions";
import {
  cancelEnrollment, confirmEnrollment, enrollmentState, normalizeUid, removeCard, setCardManually, startEnrollment,
  type CardResult, type EnrollmentState,
} from "@/features/attendance/rfid-enrollment";

// Card registration is System Admin only (users.manage). Every action authorizes before reading its input. Device keys are
// never read or returned here: the page only ever sees a terminal's id, name, organization and last contact time.

const uuid = z.uuid();

/** Scan to register: opens a 60-second window on the chosen terminal for this student. */
export async function startRfidEnrollmentAction(userId: string, deviceId: string): Promise<{ id: string; expiresAt: string } | { error: string }> {
  const admin = await assertSystemPermission("users.manage");
  if (!uuid.safeParse(userId).success || !uuid.safeParse(deviceId).success) return { error: "Choose a terminal." };
  const res = await startEnrollment(admin.id, userId, deviceId);
  return res.ok ? { id: res.id, expiresAt: res.expiresAt.toISOString() } : { error: res.error };
}

/** Polled by the scan dialog while it waits for the tap. */
export async function rfidEnrollmentStatusAction(id: string): Promise<EnrollmentState | null> {
  await assertSystemPermission("users.manage");
  if (!uuid.safeParse(id).success) return null;
  return enrollmentState(id);
}

export async function cancelRfidEnrollmentAction(id: string) {
  const admin = await assertSystemPermission("users.manage");
  if (uuid.safeParse(id).success) await cancelEnrollment(admin.id, id);
}

/** Saves the scanned card after the admin has seen the detected UID. `replace` / `reassign` are the admin's explicit confirmations. */
export async function confirmRfidEnrollmentAction(id: string, confirmed: { replace?: boolean; reassign?: boolean }): Promise<CardResult> {
  const admin = await assertSystemPermission("users.manage");
  if (!uuid.safeParse(id).success) return { ok: false, error: "Start the scan again." };
  return confirmEnrollment(admin.id, id, { replace: confirmed?.replace === true, reassign: confirmed?.reassign === true });
}

export type RfidManualState = {
  error?: string; success?: string;
  needs?: "replace" | "reassign"; // the server is asking for confirmation before going further
  uid?: string;
};

/** Manual entry: typed, or typed by a USB reader that acts as a keyboard. */
export async function saveRfidManualAction(_prev: RfidManualState, fd: FormData): Promise<RfidManualState> {
  const admin = await assertSystemPermission("users.manage");
  const userId = uuid.safeParse(fd.get("userId"));
  if (!userId.success) return { error: "Invalid account." };
  const uid = normalizeUid((fd.get("rfidUid") ?? "").toString());
  if (!uid) return { error: "Enter the card number." };
  const confirmed = { replace: fd.get("confirmReplace") === "on", reassign: fd.get("confirmReassign") === "on" };
  const res = await setCardManually(admin.id, userId.data, uid, confirmed);
  if (res.ok) return { success: `Card ${uid} registered.` };
  return { error: res.error, needs: res.needs, uid };
}

export type RfidRemoveState = { error?: string; success?: string };

export async function removeRfidAction(fd: FormData): Promise<RfidRemoveState> {
  const admin = await assertSystemPermission("users.manage");
  const userId = uuid.safeParse(fd.get("userId"));
  if (!userId.success) return { error: "Invalid account." };
  const res = await removeCard(admin.id, userId.data);
  return res.ok ? { success: "Card removed." } : { error: res.error };
}
