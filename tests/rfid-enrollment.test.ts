import { describe, expect, it } from "vitest";
import { POST as rfidRoute } from "@/app/api/rfid/scan/route";
import { registerDevice } from "@/features/attendance/devices";
import { cancelRfidEnrollmentAction, removeRfidAction, rfidEnrollmentStatusAction, saveRfidManualAction, startRfidEnrollmentAction } from "@/features/users/rfid-actions";
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

describe("RFID card registration: tap on a terminal, or enter manually", () => {
  it("tap to register: the next tap on that terminal is saved to the student and is not counted as attendance", async () => {
    const { w, key, key2, device } = await setup();
    const ev = await makeEvent(w.orgA.id);
    await signInAs(w.admin.id);
    const started = await startRfidEnrollmentAction(w.a.MEMBER.id, device.id);
    if ("error" in started) throw new Error(started.error);
    expect(await rfidEnrollmentStatusAction(started.id, w.a.MEMBER.id)).toMatchObject({ state: "waiting" });

    // a tap on a different terminal is ordinary attendance and does not register anything
    expect(await (await post(key2, { sessionId: ev.session.id, cardUid: "04A1B2C3" })).json()).toMatchObject({ ok: false, code: "unknown_card" });
    // the tap on the chosen terminal registers the card, even with no event running (no sessionId)
    const res = await post(key, { cardUid: "04:a1:b2:c3" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, registered: true, name: w.a.MEMBER.firstName });
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBe("04A1B2C3");
    expect(await rfidEnrollmentStatusAction(started.id, w.a.MEMBER.id)).toEqual({ state: "done", cardUid: "04A1B2C3" });
    expect(await db.attendanceRecord.count()).toBe(0);
    expect(await db.auditLog.count({ where: { action: "rfid.register_tap", targetId: w.a.MEMBER.id } })).toBe(1);

    // the window is used up: the next tap is attendance again, now recognised
    expect(await (await post(key, { sessionId: ev.session.id, cardUid: "04A1B2C3" })).json()).toMatchObject({ ok: true, status: "PRESENT" });
  });

  it("refuses a card that belongs to someone else, and expired or cancelled windows do nothing", async () => {
    const { w, key, device } = await setup();
    await signInAs(w.admin.id);
    const a = await startRfidEnrollmentAction(w.a.MEMBER.id, device.id);
    if ("error" in a) throw new Error(a.error);
    const taken = await post(key, { cardUid: "AAAA1111" });
    expect(taken.status).toBe(409);
    expect((await taken.json()).message).toMatch(/already registered to/);
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBeNull();
    expect((await profile(w.a.OFFICER.id)).rfidUid).toBe("AAAA1111");
    expect(await rfidEnrollmentStatusAction(a.id, w.a.MEMBER.id)).toMatchObject({ state: "failed" });

    const b = await startRfidEnrollmentAction(w.a.MEMBER.id, device.id);
    if ("error" in b) throw new Error(b.error);
    await cancelRfidEnrollmentAction(b.id);
    expect((await post(key, { cardUid: "BBBB2222" })).status).toBe(400); // no window, no session: nothing happens
    const c = await startRfidEnrollmentAction(w.a.MEMBER.id, device.id);
    if ("error" in c) throw new Error(c.error);
    await db.rfidEnrollment.update({ where: { id: c.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await rfidEnrollmentStatusAction(c.id, w.a.MEMBER.id)).toEqual({ state: "expired" });
    expect((await post(key, { cardUid: "BBBB2222" })).status).toBe(400);
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBeNull();

    // only students, only active terminals
    expect(await startRfidEnrollmentAction(w.a.TREASURER.id, device.id)).toMatchObject({ error: expect.stringMatching(/student/) });
    await db.scannerDevice.update({ where: { id: device.id }, data: { active: false } });
    expect(await startRfidEnrollmentAction(w.a.MEMBER.id, device.id)).toMatchObject({ error: expect.stringMatching(/active terminal/) });
  });

  it("manual entry: normalizes, rejects bad or taken numbers, can replace and remove", async () => {
    const { w } = await setup();
    await signInAs(w.admin.id);
    const save = (uid: string) => saveRfidManualAction({}, form({ userId: w.a.MEMBER.id, rfidUid: uid }));
    expect((await save("xyz")).error).toMatch(/hexadecimal/);
    expect((await save("aaaa1111")).error).toMatch(/already registered to/);
    expect((await save("04 a1 b2 c3")).success).toMatch(/04A1B2C3/);
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBe("04A1B2C3");
    expect((await save("0C0C0C0C")).success).toBeDefined(); // replace
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBe("0C0C0C0C");
    await removeRfidAction(form({ userId: w.a.MEMBER.id }));
    expect((await profile(w.a.MEMBER.id)).rfidUid).toBeNull();
    expect(await db.auditLog.count({ where: { action: { in: ["rfid.register_manual", "rfid.remove"] } } })).toBe(3);
  });

  it("only system administrators can register cards", async () => {
    const { w, device } = await setup();
    for (const who of [w.a.PRESIDENT.id, w.a.SECRETARY.id, w.a.MEMBER.id]) {
      await signInAs(who);
      await expect(startRfidEnrollmentAction(w.a.MEMBER.id, device.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(saveRfidManualAction({}, form({ userId: w.a.MEMBER.id, rfidUid: "04A1B2C3" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(removeRfidAction(form({ userId: w.a.OFFICER.id }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await profile(w.a.OFFICER.id)).rfidUid).toBe("AAAA1111");
  });
});
