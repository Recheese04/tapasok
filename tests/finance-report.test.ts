import { describe, expect, it } from "vitest";
import { EXPECTED, seedSampleFinance } from "../prisma/sample-finance";
import { cashOnHand, feeBreakdowns, membershipPotential, transactions } from "@/features/finance/overview";
import { parseFinanceFilter } from "@/features/fees/filters";
import { masterlist } from "@/features/fees/masterlist";
import { applyFeeToAllAction } from "@/features/fees/actions";
import { applyPreview } from "@/features/fees/service";
import { ForbiddenError } from "@/lib/permissions";
import { db, form, signInAs } from "./helpers/db";

const counts = async () => Promise.all([db.user.count(), db.organizationMember.count(), db.feeType.count(), db.studentFee.count(), db.payment.count(), db.fundTransaction.count()]);

describe("sample finance data and the Financial Report", () => {
  it("the sample data produces exactly the documented totals, and re-running it creates nothing new", async () => {
    const { organizationId: O, semesterIds } = await seedSampleFinance(db);
    const all = parseFinanceFilter({});
    const b = await feeBreakdowns(O, all);
    expect([b.all.charged, b.all.collected, b.all.outstanding]).toEqual([EXPECTED.charged, EXPECTED.collected, EXPECTED.outstanding]);
    const cash = await cashOnHand(O);
    expect([cash.collected, cash.otherIncome, cash.expenses, cash.available]).toEqual([EXPECTED.collected, EXPECTED.otherIncome, EXPECTED.expenses, EXPECTED.cashOnHand]);
    // The pending GCash payment, the rejected one and the voided (returned) one never count.
    expect(await db.payment.count({ where: { status: "PENDING", voidedAt: null } })).toBe(EXPECTED.pendingPayments);

    const before = await counts();
    await seedSampleFinance(db);
    expect(await counts()).toEqual(before);
    expect((await masterlist(O, all)).rows.filter((r) => r.position === "MEMBER")).toHaveLength(EXPECTED.members);

    // A. Possible membership fee collection: 10 eligible members x 150 in the 1st semester, apart from what was collected.
    const pot = await membershipPotential(O, parseFinanceFilter({ sem: semesterIds.first }));
    expect(pot.rows).toHaveLength(1);
    expect(pot.rows[0]).toMatchObject({ eligibleMembers: 12, perMember: "150.00" }); // 10 members + President + Treasurer
    const membersOnly = await db.organizationMember.count({ where: { organizationId: O, role: "MEMBER" } });
    expect(membersOnly).toBe(10);
    expect(pot.rows[0].charged).toBe("1500.00");
    expect(pot.rows[0].collected).toBe("975.00"); // 6 x 150 + 75
    expect(Number(pot.rows[0].potential)).toBeGreaterThanOrEqual(Number(EXPECTED.membershipPotentialFirstSem));
  });

  it("breakdowns by semester, year level and fee respect the filters and never double-count", async () => {
    const { organizationId: O, semesterIds } = await seedSampleFinance(db);
    const sem2 = await feeBreakdowns(O, parseFinanceFilter({ sem: semesterIds.second }));
    expect([sem2.all.charged, sem2.all.collected]).toEqual(["1500.00", "450.00"]);
    expect(sem2.byFee.map((f) => f.label)).toEqual(["Membership fee 2026-2027 2nd Sem (Sample)"]);
    const all = await feeBreakdowns(O, parseFinanceFilter({}));
    const sum = (rows: { charged: string }[]) => rows.reduce((t, r) => t + Number(r.charged), 0).toFixed(2);
    expect([sum(all.bySemester), sum(all.byYearLevel), sum(all.byFee)]).toEqual([EXPECTED.charged, EXPECTED.charged, EXPECTED.charged]);
    const year1 = await feeBreakdowns(O, parseFinanceFilter({ yl: "1" }));
    expect(year1.byYearLevel.map((y) => y.label)).toEqual(["Year 1"]);
    expect(Number(year1.all.charged)).toBeLessThan(Number(EXPECTED.charged));
  });

  it("transaction history: status filters map each record's own status; returned items are listed but never counted", async () => {
    const { organizationId: O } = await seedSampleFinance(db);
    const statuses = async (s: Parameters<typeof transactions>[1]) => (await transactions(O, s)).map((t) => t.status);
    expect(new Set(await statuses("returned"))).toEqual(new Set(["returned"]));
    const returned = await transactions(O, "returned");
    expect(returned).toHaveLength(2);
    expect(returned.some((t) => t.kind === "Fee payment" && t.title.includes("Member 10"))).toBe(true); // voided payment
    expect(returned.some((t) => t.kind === "Expense" && t.title === "Venue deposit (Sample)")).toBe(true); // returned expense
    const pending = await transactions(O, "pending");
    expect(pending).toHaveLength(2);
    expect(pending.some((t) => t.title.includes("Member 08")) && pending.some((t) => t.title === "Snacks for orientation (Sample)")).toBe(true);
    expect((await transactions(O, "rejected")).length).toBe(2);
    const confirmedIn = (await transactions(O, "confirmed")).filter((t) => t.direction === "in").reduce((s, t) => s + Number(t.amount), 0);
    expect(confirmedIn.toFixed(2)).toBe((Number(EXPECTED.collected) + Number(EXPECTED.otherIncome)).toFixed(2));
  });
});

describe("Apply to all members", () => {
  it("previews the organization, term, amount and counts, then charges only those who do not have it; safe to repeat", async () => {
    const { organizationId: O, treasurerId, presidentId } = await seedSampleFinance(db);
    const fee = await db.feeType.create({ data: { organizationId: O, name: "ID lace (Sample)", kind: "OTHER", amount: 60, semesterId: (await db.semester.findFirstOrThrow({ where: { name: "1st Semester", schoolYear: { label: "2026-2027" } } })).id } });
    const preview = (await applyPreview(fee.id))!;
    expect(preview).toMatchObject({ organization: "Sample Finance Society", schoolYear: "2026-2027", semester: "1st Semester", amount: "60.00", eligible: 12, alreadyApplied: 0, toAdd: 12, totalToAdd: "720.00" });

    // One member already has it (added by hand): the bulk apply skips them.
    const someone = await db.user.findUniqueOrThrow({ where: { email: "sample.member01@tapasok.test" } });
    await db.studentFee.create({ data: { organizationId: O, userId: someone.id, feeTypeId: fee.id, title: fee.name, kind: "OTHER", amountDue: 60 } });

    await signInAs((await db.user.findUniqueOrThrow({ where: { email: "sample.member02@tapasok.test" } })).id);
    await expect(applyFeeToAllAction({}, form({ feeTypeId: fee.id }))).rejects.toBeInstanceOf(ForbiddenError);

    await signInAs(treasurerId);
    expect(await applyFeeToAllAction({}, form({ feeTypeId: fee.id }))).toEqual({ result: { assigned: 11, skipped: 1, eligible: 12 } });
    expect(await applyFeeToAllAction({}, form({ feeTypeId: fee.id }))).toEqual({ result: { assigned: 0, skipped: 12, eligible: 12 } });
    expect(await db.studentFee.count({ where: { feeTypeId: fee.id } })).toBe(12);
    expect((await applyPreview(fee.id))!.toAdd).toBe(0);
    void presidentId;
  });
});
