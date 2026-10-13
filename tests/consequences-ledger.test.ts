import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { adjustAttendance, finalizeSession, recordOfficerScan } from "@/features/attendance/service";
import { makeMemberQr } from "@/features/attendance/qr";
import { calculateConsequencesForSession } from "@/features/consequences/auto";
import { createConsequenceAction, createRuleAction, updateConsequenceStatusAction } from "@/features/consequences/actions";
import {
  adjustLedgerAction, assessMemberAction, assignFeeAction, createFeeTypeAction, recordPaymentAction, submitDigitalPaymentAction, verifyPaymentAction, voidPaymentAction,
} from "@/features/fees/actions";
import { ledger } from "@/features/fees/ledger";
import { adjustLedger, recordPayment, submitDigitalPayment, verifyPayment } from "@/features/fees/service";
import { GET as proofRoute } from "@/app/(dashboard)/fees/proof/[id]/route";
import { saveBytes } from "@/features/documents/storage";
import { ForbiddenError } from "@/lib/permissions";
import { db, form, signInAs } from "./helpers/db";
import { auth, makeEvent, makeWorld } from "./helpers/world";
import { authState } from "./helpers/auth-state";

const D = (n: string | number) => new Prisma.Decimal(n);
const fineRule = (orgId: string, over: Partial<Prisma.ConsequenceRuleUncheckedCreateInput> = {}) =>
  db.consequenceRule.create({ data: { organizationId: orgId, name: `Rule ${Math.random()}`, trigger: "ABSENT", penaltyType: "FINE", fineAmount: D(50), ...over } });
const fees = (userId: string) => db.studentFee.findMany({ where: { userId }, include: { adjustments: true, payments: true } });
const balanceOf = async (userId: string, where: Prisma.StudentFeeWhereInput = {}) => (await db.studentFee.findMany({ where: { userId, ...where }, include: { adjustments: true, payments: true } })).reduce((s, f) => s.add(ledger(f).balance), D(0));

describe("automatic consequences", () => {
  async function absentScenario(over: Parameters<typeof fineRule>[1] = {}) {
    const w = await makeWorld();
    const rule = await fineRule(w.orgA.id, over);
    const ev = await makeEvent(w.orgA.id, { ruleIds: [rule.id] });
    await recordOfficerScan(await auth(w.a.OFFICER.id), ev.session.id, makeMemberQr(w.a.MEMBER.id)); // MEMBER attends
    return { w, rule, ev };
  }

  it("creates a pending fine and ledger entry for each absent student on finalize, none for attendees or advisers", async () => {
    const { w, rule, ev } = await absentScenario();
    await finalizeSession(await auth(w.a.PRESIDENT.id), ev.session.id);

    const cons = await db.consequence.findMany({ where: { eventId: ev.id }, include: { assessment: true } });
    expect(cons).toHaveLength(5); // the five absent students (not MEMBER, not the ADVISER)
    for (const c of cons) {
      expect(c).toMatchObject({ ruleId: rule.id, sessionId: ev.session.id, kind: "FINE", status: "PENDING" });
      expect(c.amount?.toString()).toBe("50");
      expect(c.calculatedAt).not.toBeNull();
      expect(c.sourceRecordId).not.toBeNull();
      expect(c.assessment).toMatchObject({ kind: "FINE", organizationId: w.orgA.id });
      expect(c.assessment?.amountDue.toString()).toBe("50");
    }
    const owners = cons.map((c) => c.userId);
    expect(owners).not.toContain(w.a.MEMBER.id);
    expect(owners).not.toContain(w.a.ADVISER.id);
    expect((await balanceOf(w.a.TREASURER.id)).toString()).toBe("50");
    expect(await db.notification.count({ where: { userId: w.a.TREASURER.id, kind: "consequence" } })).toBe(1);
  });

  it("applies only active rules attached to the event, honoring trigger and session kind", async () => {
    const w = await makeWorld();
    const absentFine = await fineRule(w.orgA.id);
    const lateFine = await fineRule(w.orgA.id, { trigger: "LATE", fineAmount: D(20) });
    const outOnly = await fineRule(w.orgA.id, { sessionKind: "TIME_OUT", fineAmount: D(70) });
    const inactive = await fineRule(w.orgA.id, { active: false, fineAmount: D(99) });
    const unattached = await fineRule(w.orgA.id, { fineAmount: D(11) });
    const ev = await makeEvent(w.orgA.id, { ruleIds: [absentFine.id, lateFine.id, outOnly.id, inactive.id], startsAt: new Date(Date.now() - 30 * 60_000) });
    await recordOfficerScan(await auth(w.a.OFFICER.id), ev.session.id, makeMemberQr(w.a.MEMBER.id)); // late (started 30 min ago, grace 15)
    await finalizeSession(await auth(w.a.PRESIDENT.id), ev.session.id);

    const mine = await db.consequence.findMany({ where: { userId: w.a.MEMBER.id } });
    expect(mine.map((c) => [c.ruleId, c.amount?.toString()])).toEqual([[lateFine.id, "20"]]);
    const absent = await db.consequence.findMany({ where: { userId: w.a.TREASURER.id } });
    expect(absent.map((c) => c.ruleId)).toEqual([absentFine.id]); // no time-out, inactive or unattached rule
    expect(absent.some((c) => [outOnly.id, inactive.id, unattached.id].includes(c.ruleId!))).toBe(false);
  });

  it("community-service rules create hour obligations without ledger entries", async () => {
    const { w, ev } = await absentScenario({ penaltyType: "SERVICE_HOURS", fineAmount: null, serviceHours: D(2) });
    await finalizeSession(await auth(w.a.PRESIDENT.id), ev.session.id);
    const c = await db.consequence.findFirstOrThrow({ where: { userId: w.a.TREASURER.id }, include: { assessment: true } });
    expect(c).toMatchObject({ kind: "SERVICE_HOURS", status: "PENDING", assessment: null });
    expect(c.hours?.toString()).toBe("2");
    expect(await db.studentFee.count({ where: { userId: w.a.TREASURER.id } })).toBe(0);
  });

  it("never creates duplicates, even if calculation runs again or an absence is corrected back and forth", async () => {
    const { w, ev } = await absentScenario();
    await finalizeSession(await auth(w.a.PRESIDENT.id), ev.session.id);
    await db.$transaction((tx) => calculateConsequencesForSession(tx, ev.session.id));
    await db.$transaction((tx) => calculateConsequencesForSession(tx, ev.session.id));
    expect(await db.consequence.count({ where: { eventId: ev.id } })).toBe(5);
    expect(await db.studentFee.count({ where: { kind: "FINE" } })).toBe(5);

    const rec = await db.attendanceRecord.findFirstOrThrow({ where: { userId: w.a.TREASURER.id } });
    const president = await auth(w.a.PRESIDENT.id);
    const secretary = await auth(w.a.SECRETARY.id);
    await adjustAttendance(secretary, rec.id, "EXCUSED", "Medical certificate");
    const cancelled = await db.consequence.findFirstOrThrow({ where: { userId: w.a.TREASURER.id }, include: { assessment: { include: { adjustments: true } } } });
    expect(cancelled.status).toBe("CANCELLED");
    expect((await balanceOf(w.a.TREASURER.id)).toString()).toBe("0");
    expect(await db.consequence.count({ where: { userId: w.a.TREASURER.id } })).toBe(1);

    await adjustAttendance(president, rec.id, "ABSENT", "Certificate was invalid");
    expect((await db.consequence.findFirstOrThrow({ where: { userId: w.a.TREASURER.id } })).status).toBe("PENDING");
    expect((await balanceOf(w.a.TREASURER.id)).toString()).toBe("50");
    expect(await db.consequence.count({ where: { eventId: ev.id } })).toBe(5);
    expect((await fees(w.a.TREASURER.id)).length).toBe(1); // history kept as adjustments, no second assessment
  });

  it("excused absences never generate consequences", async () => {
    const { w, ev } = await absentScenario();
    // excuse a student BEFORE finalizing (manual entry as excused is done via a correction after finalize in the UI,
    // so emulate the stored state: an EXCUSED record exists when the session is finalized)
    await db.attendanceRecord.create({ data: { eventId: ev.id, sessionId: ev.session.id, userId: w.a.AUDITOR.id, status: "EXCUSED", source: "MANUAL", remark: "Excused by adviser" } });
    await finalizeSession(await auth(w.a.PRESIDENT.id), ev.session.id);
    expect(await db.consequence.count({ where: { userId: w.a.AUDITOR.id } })).toBe(0);
    expect(await db.attendanceRecord.findFirstOrThrow({ where: { userId: w.a.AUDITOR.id } })).toMatchObject({ status: "EXCUSED" });
  });

  it("whole-day rules fire only for students absent from every session, once all sessions are final", async () => {
    const w = await makeWorld();
    const rule = await fineRule(w.orgA.id, { wholeDay: true, fineAmount: D(100) });
    const ev = await makeEvent(w.orgA.id, { sessions: 2, ruleIds: [rule.id] });
    const [s1, s2] = ev.sessions;
    const officer = await auth(w.a.OFFICER.id);
    await recordOfficerScan(officer, s1.id, makeMemberQr(w.a.MEMBER.id)); // attends only session 1
    await recordOfficerScan(officer, s2.id, makeMemberQr(w.a.TREASURER.id)); // attends only session 2
    const president = await auth(w.a.PRESIDENT.id);

    await finalizeSession(president, s1.id);
    expect(await db.consequence.count({ where: { eventId: ev.id } })).toBe(0); // second session still open
    await finalizeSession(president, s2.id);

    const cons = await db.consequence.findMany({ where: { eventId: ev.id }, include: { assessment: true } });
    const owners = cons.map((c) => c.userId).sort();
    expect(owners).toEqual([w.a.PRESIDENT.id, w.a.SECRETARY.id, w.a.AUDITOR.id, w.a.OFFICER.id].sort()); // absent from both; MEMBER and TREASURER attended one
    for (const c of cons) expect(c).toMatchObject({ sessionId: null, status: "PENDING" });
    expect(cons[0].assessment?.amountDue.toString()).toBe("100");
  });

  it("completes a fine when it is paid, reopens it if the payment is voided, and refuses manual completion", async () => {
    const { w, ev } = await absentScenario();
    await finalizeSession(await auth(w.a.PRESIDENT.id), ev.session.id);
    const c = await db.consequence.findFirstOrThrow({ where: { userId: w.a.TREASURER.id }, include: { assessment: true } });

    await signInAs(w.a.PRESIDENT.id);
    await updateConsequenceStatusAction(form({ consequenceId: c.id, status: "COMPLETED", note: "" }));
    expect((await db.consequence.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("PENDING"); // fines are completed by payment

    await signInAs(w.a.TREASURER.id);
    expect((await recordPaymentAction({}, form({ studentFeeId: c.assessment!.id, amount: "50", method: "CASH", reference: "" }))).success).toMatch(/Receipt TPK-/);
    expect((await db.consequence.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("COMPLETED");
    const pay = await db.payment.findFirstOrThrow();
    await voidPaymentAction(form({ paymentId: pay.id, reason: "Cash was counterfeit" }));
    expect((await db.consequence.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("PENDING");
  });

  it("a president's waiver also clears the unpaid fine; the read-only adviser and other positions cannot waive", async () => {
    const { w, ev } = await absentScenario();
    await finalizeSession(await auth(w.a.PRESIDENT.id), ev.session.id);
    const c = await db.consequence.findFirstOrThrow({ where: { userId: w.a.TREASURER.id } });
    for (const id of [w.a.ADVISER.id, w.a.SECRETARY.id, w.a.TREASURER.id, w.presidentB.id]) {
      await signInAs(id);
      await expect(updateConsequenceStatusAction(form({ consequenceId: c.id, status: "WAIVED", note: "x" }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await db.consequence.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("PENDING");
    await signInAs(w.a.PRESIDENT.id);
    await updateConsequenceStatusAction(form({ consequenceId: c.id, status: "WAIVED", note: "Hardship" }));
    expect((await db.consequence.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("WAIVED");
    expect((await balanceOf(w.a.TREASURER.id)).toString()).toBe("0");
    expect((await db.ledgerAdjustment.findFirstOrThrow()).type).toBe("WAIVER");
  });

  it("rule configuration and manual consequences copy the rule's penalty and need the right authority", async () => {
    const w = await makeWorld();
    for (const id of [w.a.TREASURER.id, w.a.SECRETARY.id, w.a.OFFICER.id, w.a.MEMBER.id, w.a.ADVISER.id, w.presidentB.id, w.admin.id]) {
      await signInAs(id);
      await expect(createRuleAction({}, form({ organizationId: w.orgA.id, name: "Rule", fineAmount: "50" }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    await signInAs(w.a.PRESIDENT.id);
    expect((await createRuleAction({}, form({ organizationId: w.orgA.id, name: "No fine", trigger: "ABSENT", penaltyType: "FINE" }))).error).toMatch(/fine amount/);
    expect((await createRuleAction({}, form({ organizationId: w.orgA.id, name: "Bad", trigger: "LATE", wholeDay: "on", fineAmount: "5" }))).error).toMatch(/whole-day/i);
    expect((await createRuleAction({}, form({ organizationId: w.orgA.id, name: "Service", penaltyType: "SERVICE_HOURS", serviceHours: "3" }))).success).toBeTruthy();
    await createRuleAction({}, form({ organizationId: w.orgA.id, name: "Missed meeting", fineAmount: "75" }));
    const rule = await db.consequenceRule.findFirstOrThrow({ where: { name: "Missed meeting" } });
    await createConsequenceAction({}, form({ organizationId: w.orgA.id, userId: w.a.MEMBER.id, ruleId: rule.id, eventId: "", reason: "Skipped the meeting" }));
    expect((await balanceOf(w.a.MEMBER.id)).toString()).toBe("75");
  });
});

describe("fees, payments and the ledger", () => {
  async function setup() {
    const w = await makeWorld();
    await signInAs(w.a.TREASURER.id);
    await createFeeTypeAction({}, form({ organizationId: w.orgA.id, name: "Membership", amount: "150", kind: "DUES", dueDate: "", description: "" }));
    const fee = await db.feeType.findFirstOrThrow();
    await assignFeeAction(form({ feeTypeId: fee.id }));
    const mine = await db.studentFee.findFirstOrThrow({ where: { userId: w.a.MEMBER.id } });
    return { w, fee, mine };
  }
  const proof = (type = "image/png") => new File([Buffer.concat([Buffer.from("89504e47", "hex"), Buffer.alloc(64)])], "proof.png", { type });
  const digital = (studentFeeId: string, over: Record<string, string> = {}, file: File = proof()) => { const fd = form({ studentFeeId, amount: "100", method: "GCASH", reference: "REF-12345", ...over }); fd.set("proof", file); return fd; };

  it("assesses kinds correctly: dues to members, event contributions to the event's attendees, single members by student number", async () => {
    const w = await makeWorld();
    await signInAs(w.a.TREASURER.id);
    await createFeeTypeAction({}, form({ organizationId: w.orgA.id, name: "Dues", amount: "100", kind: "DUES" }));
    expect((await createFeeTypeAction({}, form({ organizationId: w.orgA.id, name: "Shirt", amount: "250", kind: "EVENT_CONTRIBUTION" }))).error).toMatch(/event/i);
    const ev = await makeEvent(w.orgA.id, { targetMode: "FILTERED" }); // no groups -> nobody expected
    await createFeeTypeAction({}, form({ organizationId: w.orgA.id, name: "Shirt", amount: "250", kind: "EVENT_CONTRIBUTION", eventId: ev.id }));
    await createFeeTypeAction({}, form({ organizationId: w.orgA.id, name: "Special", amount: "30", kind: "SPECIAL" }));
    const [dues, shirt, special] = await Promise.all(["Dues", "Shirt", "Special"].map((name) => db.feeType.findFirstOrThrow({ where: { name } })));
    await assignFeeAction(form({ feeTypeId: dues.id })); await assignFeeAction(form({ feeTypeId: shirt.id }));
    expect(await db.studentFee.count({ where: { feeTypeId: dues.id } })).toBe(6); // every active member except the Adviser (read-only, not assessed)
    expect(await db.studentFee.count({ where: { feeTypeId: dues.id, userId: w.a.ADVISER.id } })).toBe(0);
    expect(await db.studentFee.count({ where: { feeTypeId: shirt.id } })).toBe(0);

    await db.studentProfile.create({ data: { userId: w.a.MEMBER.id, studentNumber: "2024-7777" } });
    expect((await assessMemberAction({}, form({ feeTypeId: special.id, studentNumber: "2024-7777" }))).success).toBeTruthy();
    expect((await assessMemberAction({}, form({ feeTypeId: special.id, studentNumber: "2024-7777" }))).error).toMatch(/already/);
    expect((await assessMemberAction({}, form({ feeTypeId: special.id, studentNumber: "nope" }))).error).toMatch(/No active member/);
    expect(await db.studentFee.findFirstOrThrow({ where: { feeTypeId: special.id } })).toMatchObject({ kind: "SPECIAL", userId: w.a.MEMBER.id, organizationId: w.orgA.id });
  });

  it("cash payments are confirmed with unique receipt codes and reduce the balance; overpayment is refused", async () => {
    const { mine, w } = await setup();
    const pay = (amount: string) => recordPaymentAction({}, form({ studentFeeId: mine.id, amount, method: "CASH", reference: "" }));
    const a = await pay("100");
    expect(a.success).toMatch(/Receipt TPK-\d{8}-[A-Z0-9]{8}/);
    expect((await pay("50.01")).error).toMatch(/exceeds/);
    expect((await pay("0")).error).toBeTruthy();
    expect((await pay("12.345")).error).toBeTruthy();
    await pay("50");
    const rows = await db.payment.findMany();
    expect(new Set(rows.map((r) => r.receiptCode)).size).toBe(2);
    expect(rows.every((r) => r.status === "CONFIRMED" && r.verifiedById === w.a.TREASURER.id)).toBe(true);
    expect((await balanceOf(w.a.MEMBER.id, { id: mine.id })).toString()).toBe("0");
  });

  it("digital payments stay pending and change nothing until an officer confirms them", async () => {
    const { mine, w } = await setup();
    await signInAs(w.a.MEMBER.id);
    expect((await submitDigitalPaymentAction({}, digital(mine.id))).success).toMatch(/verification/);
    const p = await db.payment.findFirstOrThrow();
    expect(p).toMatchObject({ status: "PENDING", submittedById: w.a.MEMBER.id, method: "GCASH", reference: "REF-12345" });
    expect(p.proofKey).toBeTruthy();
    expect((await balanceOf(w.a.MEMBER.id, { id: mine.id })).toString()).toBe("150"); // not paid merely because proof was uploaded

    // the student cannot verify their own payment
    await expect(verifyPaymentAction(form({ paymentId: p.id, decision: "approve" }))).rejects.toBeInstanceOf(ForbiddenError);
    await signInAs(w.a.TREASURER.id);
    await verifyPaymentAction(form({ paymentId: p.id, decision: "approve" }));
    expect(await db.payment.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ status: "CONFIRMED", verifiedById: w.a.TREASURER.id });
    expect((await balanceOf(w.a.MEMBER.id, { id: mine.id })).toString()).toBe("50");
    expect(await db.notification.count({ where: { userId: w.a.MEMBER.id, kind: "payment" } })).toBe(1);
  });

  it("rejections need a reason, keep the balance, and are recorded", async () => {
    const { mine, w } = await setup();
    await signInAs(w.a.MEMBER.id);
    await submitDigitalPaymentAction({}, digital(mine.id));
    const p = await db.payment.findFirstOrThrow();
    await signInAs(w.a.TREASURER.id);
    await verifyPaymentAction(form({ paymentId: p.id, decision: "reject", reason: "" }));
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PENDING");
    await verifyPaymentAction(form({ paymentId: p.id, decision: "reject", reason: "Reference number not found" }));
    expect(await db.payment.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ status: "REJECTED", rejectionReason: "Reference number not found" });
    expect((await balanceOf(w.a.MEMBER.id, { id: mine.id })).toString()).toBe("150");
    expect(await verifyPayment(w.a.TREASURER.id, p.id, true, null)).toMatchObject({ ok: false }); // already reviewed
  });

  it("validates digital submissions: proof required, allowed type, ownership, amount limits", async () => {
    const { mine, w } = await setup();
    const other = await db.studentFee.findFirstOrThrow({ where: { userId: w.a.TREASURER.id } });
    await signInAs(w.a.MEMBER.id);
    const noProof = form({ studentFeeId: mine.id, amount: "10", method: "GCASH", reference: "REF-1234" });
    expect((await submitDigitalPaymentAction({}, noProof)).error).toMatch(/proof/i);
    expect((await submitDigitalPaymentAction({}, digital(mine.id, {}, new File([Buffer.from("MZ not an image")], "x.png")))).error).toMatch(/PDF, PNG or JPG|do not match/);
    expect((await submitDigitalPaymentAction({}, digital(mine.id, { reference: "" }))).error).toBeTruthy();
    expect((await submitDigitalPaymentAction({}, digital(other.id))).error).toMatch(/not found/i); // someone else's assessment
    expect((await submitDigitalPaymentAction({}, digital(mine.id, { amount: "150.01" }))).error).toMatch(/more than you still owe/);
    expect((await submitDigitalPaymentAction({}, digital(mine.id, { amount: "100" }))).success).toBeTruthy();
    expect((await submitDigitalPaymentAction({}, digital(mine.id, { amount: "60" }))).error).toMatch(/more than you still owe/); // pending counts
    expect(await db.payment.count()).toBe(1);
  });

  it("simultaneous submissions and confirmations can never exceed the balance", async () => {
    const { mine } = await setup();
    const key = await saveBytes(Buffer.from("x"));
    const owner = mine.userId;
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => submitDigitalPayment(owner, mine.id, { amount: D(100), method: "GCASH", reference: `R-${i}`, proofKey: key, proofMime: "image/png" })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);

    const all = await Promise.all(Array.from({ length: 4 }, () => recordPayment(owner, mine.id, { amount: D(100), method: "CASH", reference: null })));
    expect(all.filter((r) => r.ok)).toHaveLength(1);
    const confirmed = (await db.payment.findMany({ where: { studentFeeId: mine.id, status: "CONFIRMED" } })).reduce((s, p) => s.add(p.amount), D(0));
    expect(confirmed.lte(150)).toBe(true);
  });

  it("proof files are visible only to the submitter, the treasurer and the president", async () => {
    const { mine, w } = await setup();
    await signInAs(w.a.MEMBER.id);
    await submitDigitalPaymentAction({}, digital(mine.id));
    const p = await db.payment.findFirstOrThrow();
    const get = () => proofRoute(new Request("http://x"), { params: Promise.resolve({ id: p.id }) });
    authState.user = null;
    expect((await get()).status).toBe(401);
    for (const id of [w.a.AUDITOR.id, w.a.ADVISER.id, w.presidentB.id, w.admin.id]) { await signInAs(id); expect((await get()).status).toBe(404); }
    for (const id of [w.a.MEMBER.id, w.a.TREASURER.id, w.a.PRESIDENT.id]) { await signInAs(id); const res = await get(); expect(res.status).toBe(200); expect(res.headers.get("x-content-type-options")).toBe("nosniff"); }
  });

  it("adjustments keep history, follow sign rules, and need president or treasurer authority", async () => {
    const { mine, w } = await setup();
    for (const id of [w.a.AUDITOR.id, w.a.ADVISER.id, w.a.OFFICER.id, w.a.SECRETARY.id, w.a.MEMBER.id, w.presidentB.id, w.admin.id]) {
      await signInAs(id);
      await expect(adjustLedgerAction({}, form({ studentFeeId: mine.id, type: "WAIVER", amount: "10", reason: "x y z" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(recordPaymentAction({}, form({ studentFeeId: mine.id, amount: "10", method: "CASH", reference: "" }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    await signInAs(w.a.TREASURER.id);
    const adj = (type: string, amount: string, reason = "Approved by adviser") => adjustLedgerAction({}, form({ studentFeeId: mine.id, type, amount, reason }));
    expect((await adj("WAIVER", "200")).error).toMatch(/up to the outstanding/);
    expect((await adj("REFUND", "10")).error).toMatch(/no credit/);
    expect((await adj("WAIVER", "50", "")).error).toBeTruthy();
    expect((await adj("WAIVER", "50")).success).toBeTruthy();
    expect((await adj("CHARGE", "20", "Late fee")).success).toBeTruthy();
    expect((await balanceOf(w.a.MEMBER.id, { id: mine.id })).toString()).toBe("120");

    // pay in full, then waive the remaining part retroactively -> credit -> refund restores zero
    await recordPaymentAction({}, form({ studentFeeId: mine.id, amount: "120", method: "CASH", reference: "" }));
    expect((await adj("WAIVER", "1")).error).toBeTruthy(); // nothing outstanding
    await db.ledgerAdjustment.create({ data: { studentFeeId: mine.id, type: "CORRECTION", amount: D(-30), reason: "Data fix" } });
    expect((await balanceOf(w.a.MEMBER.id, { id: mine.id })).toString()).toBe("-30");
    expect((await adj("REFUND", "40")).error).toMatch(/at most/);
    expect((await adj("REFUND", "30", "Refunded in cash")).success).toBeTruthy();
    expect((await balanceOf(w.a.MEMBER.id, { id: mine.id })).toString()).toBe("0");
    expect(await db.ledgerAdjustment.count()).toBe(4);
    expect(await db.auditLog.count({ where: { action: "ledger.adjust" } })).toBe(3);
    expect(await adjustLedger(w.a.TREASURER.id, mine.id, "WAIVER", D(0), "zero")).toMatchObject({ ok: false });
  });

  it("organizations are isolated: another organization's treasurer cannot touch these records", async () => {
    const { mine, w } = await setup();
    const treasurerB = (await import("./helpers/db")).makeUser;
    const t = await treasurerB(); await (await import("./helpers/db")).addMembership(t.id, w.orgB.id, "TREASURER");
    await signInAs(t.id);
    await expect(recordPaymentAction({}, form({ studentFeeId: mine.id, amount: "10", method: "CASH", reference: "" }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(adjustLedgerAction({}, form({ studentFeeId: mine.id, type: "WAIVER", amount: "10", reason: "abc" }))).rejects.toBeInstanceOf(ForbiddenError);
    expect((await balanceOf(w.a.MEMBER.id, { id: mine.id })).toString()).toBe("150");
  });
});
