// SAMPLE DATA FOR DEVELOPMENT AND TESTING ONLY (never production). Run with: npm run db:seed:finance
// Creates one clearly labelled sample organization with 10 fictional members and a known set of financial records, so the
// Financial Report, the Masterlist and the filters can be checked against fixed totals (see EXPECTED below).
// Safe to re-run: every row is found by a fixed key (email, student number, fee name, receipt code, request id) and
// updated or skipped, never duplicated. All names say "(Sample)" and all emails end in @tapasok.test.
//
// Tables filled (in order, respecting foreign keys):
//   school_years -> semesters                      2026-2027, 1st and 2nd semester (reused if they exist)
//   organizations                                  "Sample Finance Society" (SFS)
//   users -> student_profiles                      10 members (years 1-4) + a sample President and Treasurer
//   organization_members                           their positions in SFS
//   fee_types -> student_fees                      membership fee per semester (Membership fee kind) and an org shirt
//   payments                                       confirmed, pending, rejected and voided (returned) payments
//   fund_transactions                              approved, pending, rejected and returned income / expenses
import { Prisma, type PrismaClient } from "../src/generated/prisma/client";

/** The totals the sample data must produce (amounts in pesos). Checked by tests/sample-finance.test.ts. */
export const EXPECTED = {
  members: 10,
  charged: "5100.00", // 10 x 150 (1st sem) + 6 x 350 (shirt) + 10 x 150 (2nd sem)
  collected: "2825.00", // confirmed, not voided: 6 x 150 + 75 + 4 x 350 + 3 x 150
  outstanding: "2275.00",
  pendingPayments: 1, // one GCash payment waiting for verification (150, not counted)
  otherIncome: "1250.00", // approved: opening balance 1000 + donation 250
  expenses: "300.00", // approved printing 300 (pending food 500, rejected supplies 200 and returned venue 400 do not count)
  cashOnHand: "3775.00", // 2825 + 1250 - 300
  membershipPotentialFirstSem: "1500.00", // 10 eligible members x 150
} as const;

const D = (n: number) => new Prisma.Decimal(n);
const PASSWORD_HASH_PLACEHOLDER = "!sample-account-no-login"; // not a bcrypt hash: these accounts cannot sign in

export async function seedSampleFinance(db: PrismaClient) {
  // Term: 2026-2027 with two semesters. The active term is left as it is (set it under Academic Setup if needed).
  const sy = await db.schoolYear.upsert({ where: { label: "2026-2027" }, update: {}, create: { label: "2026-2027", startsOn: new Date("2026-06-01Z"), endsOn: new Date("2027-05-31Z") } });
  const sem1 = await db.semester.upsert({ where: { schoolYearId_sequence: { schoolYearId: sy.id, sequence: 1 } }, update: {}, create: { schoolYearId: sy.id, name: "1st Semester", sequence: 1, startsOn: new Date("2026-06-01Z"), endsOn: new Date("2026-10-31Z") } });
  const sem2 = await db.semester.upsert({ where: { schoolYearId_sequence: { schoolYearId: sy.id, sequence: 2 } }, update: {}, create: { schoolYearId: sy.id, name: "2nd Semester", sequence: 2, startsOn: new Date("2026-11-01Z"), endsOn: new Date("2027-03-31Z") } });

  const org = await db.organization.upsert({
    where: { name: "Sample Finance Society" }, update: {},
    create: { name: "Sample Finance Society", acronym: "SFS", description: "Sample data for testing the finance pages. Not a real organization.", scope: "CO_CURRICULAR" },
  });

  const person = async (email: string, firstName: string, lastName: string) =>
    db.user.upsert({ where: { email }, update: {}, create: { email, firstName, lastName, passwordHash: PASSWORD_HASH_PLACEHOLDER, status: "ACTIVE" } });
  const position = async (userId: string, role: "PRESIDENT" | "TREASURER" | "MEMBER") => {
    const existing = await db.organizationMember.findFirst({ where: { organizationId: org.id, userId, endedAt: null } });
    if (!existing) await db.organizationMember.create({ data: { organizationId: org.id, userId, role, semesterId: sem1.id, startedAt: new Date("2026-06-15Z") } });
  };

  const president = await person("sample.president@tapasok.test", "Paula", "Presidente (Sample)");
  const treasurer = await person("sample.treasurer@tapasok.test", "Tomas", "Tesorero (Sample)");
  await position(president.id, "PRESIDENT");
  await position(treasurer.id, "TREASURER");

  const FIRST = ["Andrea", "Benjo", "Carmela", "Dindo", "Elisa", "Ferdie", "Gina", "Hector", "Isay", "Jomar"];
  const members = [];
  for (let i = 0; i < 10; i++) {
    const n = String(i + 1).padStart(2, "0");
    const u = await person(`sample.member${n}@tapasok.test`, FIRST[i], `Member ${n} (Sample)`);
    await db.studentProfile.upsert({ where: { userId: u.id }, update: {}, create: { userId: u.id, studentNumber: `SAMPLE-${n}`, yearLevel: (i % 4) + 1, course: "BS Sample Studies" } });
    await position(u.id, "MEMBER");
    members.push(u);
  }

  const feeType = (name: string, kind: "DUES" | "OTHER", amount: number, semesterId: string) =>
    db.feeType.upsert({ where: { organizationId_name: { organizationId: org.id, name } }, update: {}, create: { organizationId: org.id, name, kind, amount: D(amount), semesterId } });
  const mem1 = await feeType("Membership fee 2026-2027 1st Sem (Sample)", "DUES", 150, sem1.id);
  const shirt = await feeType("Org shirt (Sample)", "OTHER", 350, sem1.id);
  const mem2 = await feeType("Membership fee 2026-2027 2nd Sem (Sample)", "DUES", 150, sem2.id);

  const charge = (fee: { id: string; name: string; kind: "DUES" | "SEMESTER_FEE" | "EVENT_CONTRIBUTION" | "SPECIAL" | "FINE" | "OTHER"; amount: Prisma.Decimal; semesterId: string | null }, userId: string) =>
    db.studentFee.upsert({
      where: { feeTypeId_userId: { feeTypeId: fee.id, userId } }, update: {},
      create: { organizationId: org.id, userId, feeTypeId: fee.id, title: fee.name, kind: fee.kind, amountDue: fee.amount, semesterId: fee.semesterId },
    });
  const pay = (studentFeeId: string, code: string, amount: number, extra: Partial<Prisma.PaymentUncheckedCreateInput> = {}) =>
    db.payment.upsert({
      where: { receiptCode: `SAMPLE-${code}` }, update: {},
      create: { studentFeeId, receiptCode: `SAMPLE-${code}`, amount: D(amount), method: "CASH", status: "CONFIRMED", recordedById: treasurer.id, paidAt: new Date("2026-07-10T02:00:00Z"), ...extra },
    });

  // 1st semester membership: members 1-6 paid in full, 7 paid half, 8 sent GCash (pending), 9 GCash rejected,
  // 10 paid but the payment was voided (returned).
  for (const [i, m] of members.entries()) {
    const f = await charge(mem1, m.id);
    const n = String(i + 1).padStart(2, "0");
    if (i < 6) await pay(f.id, `M1-${n}`, 150);
    else if (i === 6) await pay(f.id, `M1-${n}`, 75);
    else if (i === 7) await pay(f.id, `M1-${n}`, 150, { method: "GCASH", reference: "SAMPLE-GC-1001", status: "PENDING", recordedById: null, submittedById: m.id });
    else if (i === 8) await pay(f.id, `M1-${n}`, 150, { method: "GCASH", reference: "SAMPLE-GC-1002", status: "REJECTED", recordedById: null, submittedById: m.id, verifiedById: treasurer.id, verifiedAt: new Date("2026-07-12Z"), rejectionReason: "Reference number not found in the GCash history (sample)." });
    else await pay(f.id, `M1-${n}`, 150, { voidedAt: new Date("2026-07-15Z"), voidReason: "Recorded twice by mistake; money returned (sample)." });
  }
  // Org shirt: charged to members 1-6; members 1-4 paid.
  for (const [i, m] of members.slice(0, 6).entries()) {
    const f = await charge(shirt, m.id);
    if (i < 4) await pay(f.id, `SH-${String(i + 1).padStart(2, "0")}`, 350);
  }
  // 2nd semester membership: everyone charged; members 1-3 paid.
  for (const [i, m] of members.entries()) {
    const f = await charge(mem2, m.id);
    if (i < 3) await pay(f.id, `M2-${String(i + 1).padStart(2, "0")}`, 150, { paidAt: new Date("2026-11-20T02:00:00Z") });
  }

  // Organization funds: recorded by the Treasurer, decided by the President (independent approval).
  const fund = (requestId: string, data: Omit<Prisma.FundTransactionUncheckedCreateInput, "organizationId" | "requestId" | "recordedById">) =>
    db.fundTransaction.upsert({ where: { requestId: `sample-${requestId}` }, update: {}, create: { organizationId: org.id, requestId: `sample-${requestId}`, recordedById: treasurer.id, ...data } });
  const decided = { decidedById: president.id, decidedAt: new Date("2026-07-20Z") };
  await fund("opening", { type: "INCOME", category: "OPENING_BALANCE", title: "Opening balance (Sample)", amount: D(1000), occurredOn: new Date("2026-06-15Z"), purpose: "Money carried over from last year", status: "APPROVED", ...decided });
  await fund("donation", { type: "INCOME", category: "DONATION", title: "Alumni donation (Sample)", amount: D(250), occurredOn: new Date("2026-08-01Z"), purpose: "Donation for the general assembly", status: "APPROVED", ...decided });
  await fund("printing", { type: "EXPENSE", category: "PRINTING", title: "Tarpaulin printing (Sample)", amount: D(300), occurredOn: new Date("2026-07-18Z"), purpose: "General assembly tarpaulin", status: "APPROVED", ...decided });
  await fund("food", { type: "EXPENSE", category: "FOOD", title: "Snacks for orientation (Sample)", amount: D(500), occurredOn: new Date("2026-08-05Z"), purpose: "Orientation snacks", status: "PENDING" });
  await fund("supplies", { type: "EXPENSE", category: "SUPPLIES", title: "Markers and paper (Sample)", amount: D(200), occurredOn: new Date("2026-08-06Z"), purpose: "Booth supplies", status: "REJECTED", ...decided, decisionReason: "No receipt attached (sample)." });
  await fund("venue", { type: "EXPENSE", category: "VENUE", title: "Venue deposit (Sample)", amount: D(400), occurredOn: new Date("2026-08-08Z"), purpose: "Venue reservation", status: "REVERSED", ...decided, reversedById: president.id, reversedAt: new Date("2026-08-20Z"), reversalReason: "Deposit returned after the event moved to campus (sample)." });

  return { organizationId: org.id, semesterIds: { first: sem1.id, second: sem2.id }, treasurerId: treasurer.id, presidentId: president.id };
}
