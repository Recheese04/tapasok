import { describe, expect, it } from "vitest";
import { POST as rfidRoute } from "@/app/api/rfid/scan/route";
import { registerDevice } from "@/features/attendance/devices";
import {
  cancelRfidEnrollmentAction, confirmRfidEnrollmentAction, removeRfidAction, rfidEnrollmentStatusAction, saveRfidManualAction, startRfidEnrollmentAction,
} from "@/features/users/rfid-actions";
import { ForbiddenError } from "@/lib/permissions";
import { db, form, signInAs } from "./helpers/db";
import { makeEvent, makeWorld } from "./helpers/world";

const post = (key: string, body: unknown) =>
  rfidRoute(new Request("http://x/api/rfid/scan", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body) }));

async function setup() {
  const w = await makeWorld();
  await db.studentProfile.create({ data: { userId: w.a.MEMBER.id, studentNumber: "2024-0001" } });
  await db.studentProfile.create({ data: { userId: w.a.OFFICER.id, studentNumber: "2024-0002", rfidUid: "AAAA1111" } });
  const reg = await registerDevice(w.a.PRESIDENT.id, w.orgA.id, "Gate 1");
  const reg2 = await registerDevice(w.a.PRESIDENT.id, w.orgA.id, "Gate 2");
  if (!reg.ok || !reg2.ok) throw new Error("device");
  const device = await db.scannerDevice.findFirstOrThrow({ where: { name: "Gate 1" } });
  return { w, key: reg.key, key2: reg2.key, device };
}
const profile = (userId: string) => db.studentProfile.findUniqueOrThrow({ where: { userId } });
const audits = (action: string) => db.auditLog.count({ where: { action } });

async function start(userId: string, deviceId: string) {
  const s = await startRfidEnrollmentAction(userId, deviceId);
  if ("error" in s) throw new Error(s.error);
  return s.id;
}

describe("RFID card registration: scan to register (captured, then confirmed by the admin)", () => {
  it("captures the scanned UID, saves nothing until the admin confirms, and never records attendance", async () => {
    const { w, key, key2, device } = await setup();
    const ev = await makeEvent(w.orgA.id);
    await signInAs(w.admin.id);
    const id = await start(w.a.MEMBER.id, device.id);
    expect(await rfidEnrollmentStatusAction(id)).toMatchObject({ state: "waiting", device: "Gate 1" });

    // a tap on a different terminal is ordinary attendance and captures nothing
    expect(await (await post(key2, { sessionId: ev.session.id, cardUid: "04A1B2C3" })).json()).toMatchObject({ ok: false, code: "unknown_card" });
    expect(await rfidEnrollmentStatusAction(id)).toMatchObject({ state: "waiting" });

    // the tap on the chosen terminal is captured, even when the terminal also sends a session (registration wins)
    const res = await post(key, { sessionId: ev.session.id, cardUid: "04:a1:b2:c3" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, registered: true, captured: true, name: w.a.MEMBER.firstName });
    const captured = await rfidEnrollmentStatusAction(id);
    expect(captured).toMatchObject({ state: "captured", cardUid: "04A1B2C3", device: "Gate 1", owner: null, currentCard: null, student: { userId: w.a.MEMBER.id, studentNumber: "2024-0001" } });
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBeNull(); // not saved yet
    expect(await db.attendanceRecord.count()).toBe(0);
    expect(await audits("rfid.enroll_capture")).toBe(1);

    // a second tap while waiting for confirmation is not captured over the first one
    await post(key, { cardUid: "0C0C0C0C" });
    expect(await rfidEnrollmentStatusAction(id)).toMatchObject({ state: "captured", cardUid: "04A1B2C3" });

    expect(await confirmRfidEnrollmentAction(id, {})).toEqual({ ok: true, cardUid: "04A1B2C3" });
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBe("04A1B2C3");
    expect(await rfidEnrollmentStatusAction(id)).toEqual({ state: "done", cardUid: "04A1B2C3" });
    expect(await db.attendanceRecord.count()).toBe(0);
    expect(await audits("rfid.register_tap")).toBe(1);
    expect(await confirmRfidEnrollmentAction(id, {})).toMatchObject({ ok: false }); // used up

    // the window is closed: the next tap is attendance again, now recognised
    expect(await (await post(key, { sessionId: ev.session.id, cardUid: "04A1B2C3" })).json()).toMatchObject({ ok: true, status: "PRESENT" });
  });

  it("a card registered to another student needs explicit confirmation to move, and the move is audited", async () => {
    const { w, key, device } = await setup();
    await signInAs(w.admin.id);
    const id = await start(w.a.MEMBER.id, device.id);
    await post(key, { cardUid: "AAAA1111" });
    expect(await rfidEnrollmentStatusAction(id)).toMatchObject({ state: "captured", cardUid: "AAAA1111", owner: { userId: w.a.OFFICER.id, studentNumber: "2024-0002" } });

    expect(await confirmRfidEnrollmentAction(id, {})).toMatchObject({ ok: false, needs: "reassign", owner: { userId: w.a.OFFICER.id } });
    expect((await profile(w.a.OFFICER.id)).rfidUid).toBe("AAAA1111"); // unchanged
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBeNull();

    expect(await confirmRfidEnrollmentAction(id, { reassign: true })).toEqual({ ok: true, cardUid: "AAAA1111" });
    expect((await profile(w.a.OFFICER.id)).rfidUid).toBeNull();
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBe("AAAA1111");
    expect(await db.auditLog.findFirstOrThrow({ where: { action: "rfid.reassign" } })).toMatchObject({ targetId: w.a.OFFICER.id, metadata: { cardUid: "AAAA1111", toUserId: w.a.MEMBER.id } });
  });

  it("replacing the student's existing card needs explicit confirmation", async () => {
    const { w, key, device } = await setup();
    await signInAs(w.admin.id);
    const id = await start(w.a.OFFICER.id, device.id);
    await post(key, { cardUid: "0B0B0B0B" });
    expect(await rfidEnrollmentStatusAction(id)).toMatchObject({ state: "captured", currentCard: "AAAA1111", owner: null });
    expect(await confirmRfidEnrollmentAction(id, {})).toMatchObject({ ok: false, needs: "replace", current: "AAAA1111" });
    expect((await profile(w.a.OFFICER.id)).rfidUid).toBe("AAAA1111");
    expect(await confirmRfidEnrollmentAction(id, { replace: true })).toEqual({ ok: true, cardUid: "0B0B0B0B" });
    expect((await profile(w.a.OFFICER.id)).rfidUid).toBe("0B0B0B0B");
    expect(await db.auditLog.findFirstOrThrow({ where: { action: "rfid.replace" } })).toMatchObject({ metadata: { cardUid: "0B0B0B0B", previous: "AAAA1111", method: "tap" } });
  });

  it("reports timeouts, cancellations, unreadable cards and revoked terminals, and saves nothing", async () => {
    const { w, key, device } = await setup();
    await signInAs(w.admin.id);

    // timeout with no tap: tells the admin which terminal and when it was last heard from
    const a = await start(w.a.MEMBER.id, device.id);
    await db.rfidEnrollment.update({ where: { id: a }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await rfidEnrollmentStatusAction(a)).toMatchObject({ state: "expired", captured: false, device: "Gate 1" });
    expect((await post(key, { cardUid: "BBBB2222" })).status).toBe(400); // no window, no session: nothing happens

    // captured but not confirmed in time
    const b = await start(w.a.MEMBER.id, device.id);
    await post(key, { cardUid: "BBBB2222" });
    await db.rfidEnrollment.update({ where: { id: b }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await rfidEnrollmentStatusAction(b)).toMatchObject({ state: "expired", captured: true });
    expect(await confirmRfidEnrollmentAction(b, {})).toMatchObject({ ok: false, error: expect.stringMatching(/ran out/) });

    // cancelled by the admin
    const c = await start(w.a.MEMBER.id, device.id);
    await cancelRfidEnrollmentAction(c);
    expect(await rfidEnrollmentStatusAction(c)).toEqual({ state: "cancelled" });
    expect((await post(key, { cardUid: "BBBB2222" })).status).toBe(400);
    expect(await confirmRfidEnrollmentAction(c, {})).toMatchObject({ ok: false });
    expect(await audits("rfid.enroll_cancel")).toBe(1);

    // unreadable card number (too short once separators are removed)
    const d = await start(w.a.MEMBER.id, device.id);
    expect((await post(key, { cardUid: "AB:C-" })).status).toBe(409);
    expect(await rfidEnrollmentStatusAction(d)).toMatchObject({ state: "failed", message: expect.stringMatching(/unreadable/) });

    // the terminal is revoked while waiting: its taps are refused and the page says so
    const e = await start(w.a.MEMBER.id, device.id);
    await db.scannerDevice.update({ where: { id: device.id }, data: { active: false } });
    expect((await post(key, { cardUid: "BBBB2222" })).status).toBe(401);
    expect(await rfidEnrollmentStatusAction(e)).toMatchObject({ state: "failed", message: expect.stringMatching(/revoked/) });
    expect(await startRfidEnrollmentAction(w.a.MEMBER.id, device.id)).toMatchObject({ error: expect.stringMatching(/active terminal/) });

    // only students
    await db.scannerDevice.update({ where: { id: device.id }, data: { active: true } });
    expect(await startRfidEnrollmentAction(w.a.TREASURER.id, device.id)).toMatchObject({ error: expect.stringMatching(/student/) });

    expect((await profile(w.a.MEMBER.id)).rfidUid).toBeNull();
    expect(await db.attendanceRecord.count()).toBe(0);
  });

  it("a double confirmation assigns the card once, and a terminal revoked after the read cannot be confirmed", async () => {
    const { w, key, device } = await setup();
    await signInAs(w.admin.id);
    const id = await start(w.a.MEMBER.id, device.id);
    await post(key, { cardUid: "04A1B2C3" });
    const results = await Promise.all([confirmRfidEnrollmentAction(id, {}), confirmRfidEnrollmentAction(id, {})]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await audits("rfid.register_tap")).toBe(1);
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBe("04A1B2C3");

    const id2 = await start(w.a.MEMBER.id, device.id);
    await post(key, { cardUid: "0D0D0D0D" });
    await db.scannerDevice.update({ where: { id: device.id }, data: { active: false } });
    expect(await confirmRfidEnrollmentAction(id2, { replace: true })).toMatchObject({ ok: false, error: expect.stringMatching(/revoked/) });
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBe("04A1B2C3");
    // a malformed confirmation from the browser is treated as "not confirmed", never as an error
    await db.scannerDevice.update({ where: { id: device.id }, data: { active: true } });
    expect(await confirmRfidEnrollmentAction(id2, null as never)).toMatchObject({ ok: false, needs: "replace" });
  });

  it("never exposes a device key in what the page receives", async () => {
    const { w, key, device } = await setup();
    await signInAs(w.admin.id);
    const id = await start(w.a.MEMBER.id, device.id);
    const before = JSON.stringify(await rfidEnrollmentStatusAction(id));
    await post(key, { cardUid: "04A1B2C3" });
    const after = JSON.stringify(await rfidEnrollmentStatusAction(id));
    const hash = (await db.scannerDevice.findUniqueOrThrow({ where: { id: device.id } })).keyHash;
    for (const s of [before, after]) { expect(s).not.toContain("tpd_"); expect(s).not.toContain(hash); expect(s).not.toMatch(/keyHash/); }
  });
});

describe("RFID card registration: manual entry", () => {
  it("normalizes and saves; refuses bad numbers; asks before moving or replacing; removes; audits everything", async () => {
    const { w } = await setup();
    await signInAs(w.admin.id);
    const save = (uid: string, extra: Record<string, string> = {}) => saveRfidManualAction({}, form({ userId: w.a.MEMBER.id, rfidUid: uid, ...extra }));
    expect((await save("xyz")).error).toMatch(/hexadecimal/);

    // another student's card: confirmation required, then moved
    expect(await save("aaaa1111")).toMatchObject({ needs: "reassign", uid: "AAAA1111", error: expect.stringMatching(/registered to/) });
    expect((await profile(w.a.OFFICER.id)).rfidUid).toBe("AAAA1111");

    expect((await save("04 a1 b2 c3")).success).toMatch(/04A1B2C3/);
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBe("04A1B2C3");
    expect((await save("04A1B2C3")).error).toMatch(/already registered to this student/);

    // replacing the student's own card: confirmation required
    expect(await save("0C0C0C0C")).toMatchObject({ needs: "replace" });
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBe("04A1B2C3");
    expect((await save("0C0C0C0C", { confirmReplace: "on" })).success).toBeDefined();
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBe("0C0C0C0C");

    // moving AAAA1111 to a student who already has a card needs both confirmations
    expect(await save("AAAA1111", { confirmReassign: "on" })).toMatchObject({ needs: "replace" });
    expect((await save("AAAA1111", { confirmReassign: "on", confirmReplace: "on" })).success).toBeDefined();
    expect((await profile(w.a.OFFICER.id)).rfidUid).toBeNull();
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBe("AAAA1111");

    expect(await removeRfidAction(form({ userId: w.a.MEMBER.id }))).toEqual({ success: "Card removed." });
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBeNull();
    expect(await removeRfidAction(form({ userId: w.a.MEMBER.id }))).toMatchObject({ error: expect.any(String) });

    expect(await audits("rfid.register_manual")).toBe(1);
    expect(await audits("rfid.replace")).toBe(2);
    expect(await audits("rfid.reassign")).toBe(1);
    expect(await audits("rfid.remove")).toBe(1);
    expect(await db.attendanceRecord.count()).toBe(0);
  });
});

describe("RFID card registration: authorization", () => {
  it("only system administrators can scan, confirm, enter, replace or remove cards", async () => {
    const { w, key, device } = await setup();
    await signInAs(w.admin.id);
    const id = await start(w.a.MEMBER.id, device.id);
    await post(key, { cardUid: "04A1B2C3" });
    for (const who of [w.a.PRESIDENT.id, w.a.SECRETARY.id, w.a.ADVISER.id, w.a.MEMBER.id]) {
      await signInAs(who);
      await expect(startRfidEnrollmentAction(w.a.MEMBER.id, device.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(rfidEnrollmentStatusAction(id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(confirmRfidEnrollmentAction(id, { replace: true, reassign: true })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(cancelRfidEnrollmentAction(id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(saveRfidManualAction({}, form({ userId: w.a.MEMBER.id, rfidUid: "04A1B2C3" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(removeRfidAction(form({ userId: w.a.OFFICER.id }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await profile(w.a.OFFICER.id)).rfidUid).toBe("AAAA1111");
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBeNull();
  });
});
