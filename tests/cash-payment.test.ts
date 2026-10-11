import { describe, expect, it } from "vitest";
import { submitDigitalPaymentAction, verifyPaymentAction } from "@/features/fees/actions";
import { ledger } from "@/features/fees/ledger";
import { db, form, signInAs } from "./helpers/db";
import { makeWorld } from "./helpers/world";

async function setup() {
  const w = await makeWorld();
  const ft = await db.feeType.create({ data: { organizationId: w.orgA.id, name: "Dues", amount: 100 } });
  const fee = await db.studentFee.create({ data: { organizationId: w.orgA.id, userId: w.a.MEMBER.id, feeTypeId: ft.id, title: "Dues", amountDue: 100 } });
  return { w, fee };
}
const full = (id: string) => db.studentFee.findUniqueOrThrow({ where: { id }, include: { adjustments: true, payments: true } });

describe("members can choose Cash as the payment method", () => {
  it("records a pending cash payment with no proof file; it counts only after the treasurer confirms", async () => {
    const { w, fee } = await setup();
    await signInAs(w.a.MEMBER.id);
    const res = await submitDigitalPaymentAction({}, form({ studentFeeId: fee.id, amount: "60", method: "CASH", reference: "" }));
    expect(res.error).toBeUndefined();
    expect(res.success).toMatch(/pending/i);
    const p = await db.payment.findFirstOrThrow({ where: { studentFeeId: fee.id } });
    expect(p).toMatchObject({ method: "CASH", status: "PENDING", proofKey: null, submittedById: w.a.MEMBER.id });
    expect(ledger(await full(fee.id)).paid.toString()).toBe("0"); // not counted yet

    await signInAs(w.a.TREASURER.id);
    await verifyPaymentAction(form({ paymentId: p.id, decision: "approve" }));
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("CONFIRMED");
    expect(ledger(await full(fee.id)).paid.toString()).toBe("60");
  });

  it("still requires a reference and proof for GCash, and cannot pay for someone else or overpay", async () => {
    const { w, fee } = await setup();
    await signInAs(w.a.MEMBER.id);
    expect((await submitDigitalPaymentAction({}, form({ studentFeeId: fee.id, amount: "50", method: "GCASH", reference: "" }))).error).toMatch(/reference/i);
    expect((await submitDigitalPaymentAction({}, form({ studentFeeId: fee.id, amount: "50", method: "GCASH", reference: "REF123" }))).error).toMatch(/proof/i);
    expect((await submitDigitalPaymentAction({}, form({ studentFeeId: fee.id, amount: "500", method: "CASH", reference: "" }))).error).toMatch(/more than you still owe/);
    await signInAs(w.a.OFFICER.id);
    expect((await submitDigitalPaymentAction({}, form({ studentFeeId: fee.id, amount: "10", method: "CASH", reference: "" }))).error).toMatch(/not found/i);
    expect(await db.payment.count()).toBe(0);
  });
});
