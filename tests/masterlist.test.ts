import { describe, expect, it } from "vitest";
import { GET as exportRoute } from "@/app/(dashboard)/fees/masterlist/export/route";
import { masterlist } from "@/features/fees/masterlist";
import { filterLabel, parseFinanceFilter, termOptions } from "@/features/fees/filters";
import { authState } from "./helpers/auth-state";
import { db, signInAs } from "./helpers/db";
import { makeWorld } from "./helpers/world";

// Two school years; 2026-2027 has two semesters. Dues in each term, a fine with no fee type, and members in years 1 and 3.
async function setup() {
  const w = await makeWorld();
  const y1 = await db.schoolYear.create({ data: { label: "2025-2026", startsOn: new Date("2025-06-01Z"), endsOn: new Date("2026-05-31Z") } });
  const y2 = await db.schoolYear.create({ data: { label: "2026-2027", startsOn: new Date("2026-06-01Z"), endsOn: new Date("2027-05-31Z"), active: true } });
  const old = await db.semester.create({ data: { schoolYearId: y1.id, name: "2nd Semester", sequence: 2, startsOn: new Date("2025-11-01Z"), endsOn: new Date("2026-03-31Z") } });
  const s1 = await db.semester.create({ data: { schoolYearId: y2.id, name: "1st Semester", sequence: 1, startsOn: new Date("2026-06-01Z"), endsOn: new Date("2026-10-31Z"), active: true } });
  const s2 = await db.semester.create({ data: { schoolYearId: y2.id, name: "2nd Semester", sequence: 2, startsOn: new Date("2026-11-01Z"), endsOn: new Date("2027-03-31Z") } });
  const O = w.orgA.id;
  const member = w.a.MEMBER, officer = w.a.OFFICER;
  await db.user.update({ where: { id: member.id }, data: { firstName: "Ana", lastName: "Bautista" } });
  await db.user.update({ where: { id: officer.id }, data: { firstName: "Carlo", lastName: "Abad" } });
  await db.studentProfile.create({ data: { userId: member.id, studentNumber: "2026-0001", yearLevel: 1 } });
  await db.studentProfile.create({ data: { userId: officer.id, studentNumber: "2024-0002", yearLevel: 3 } });
  const dues = (name: string, semesterId: string, amount: number) => db.feeType.create({ data: { organizationId: O, name, amount, semesterId } });
  const oldDues = await dues("Dues 2025", old.id, 100), sem1 = await dues("Sem 1 fee", s1.id, 150), sem2 = await dues("Sem 2 fee", s2.id, 200);
  const assess = (userId: string, feeTypeId: string | null, title: string, amount: number, semesterId: string, kind: "DUES" | "FINE" = "DUES") =>
    db.studentFee.create({ data: { organizationId: O, userId, feeTypeId, title, amountDue: amount, semesterId, kind } });
  const pay = (studentFeeId: string, amount: number, status: "CONFIRMED" | "PENDING" = "CONFIRMED", code = `R-${Math.random()}`) =>
    db.payment.create({ data: { studentFeeId, amount, method: "CASH", status, receiptCode: code } });
  // Ana (year 1): Sem 1 fee paid in full; Sem 2 fee unpaid; a 50 fine half paid. Carlo (year 3): old dues paid; Sem 1 fee 100 of 150.
  const a1 = await assess(member.id, sem1.id, "Sem 1 fee", 150, s1.id); await pay(a1.id, 150);
  await assess(member.id, sem2.id, "Sem 2 fee", 200, s2.id);
  const fine = await assess(member.id, null, "Absence fine", 50, s1.id, "FINE"); await pay(fine.id, 25);
  const c0 = await assess(officer.id, oldDues.id, "Dues 2025", 100, old.id); await pay(c0.id, 100);
  const c1 = await assess(officer.id, sem1.id, "Sem 1 fee", 150, s1.id); await pay(c1.id, 100); await pay(c1.id, 50, "PENDING");
  return { w, O, y1, y2, s1, s2, member, officer };
}

describe("fees masterlist and year filters", () => {
  it("lists every member (not the Adviser) with one column per fee, using ledger rules", async () => {
    const { w, O } = await setup();
    const all = await masterlist(O, parseFinanceFilter({}));
    expect(all.columns.map((c) => c.label)).toEqual(["Dues 2025", "Sem 1 fee", "Sem 2 fee", "Fines & other charges"]);
    expect(all.rows.map((r) => r.userId)).not.toContain(w.a.ADVISER.id);
    expect(all.rows.length).toBe(6); // President, Secretary, Treasurer, Auditor, Officer, Member of org A
    const ana = all.rows.find((r) => r.name === "Bautista, Ana")!;
    expect([ana.due.toFixed(2), ana.paid.toFixed(2), ana.balance.toFixed(2), ana.status]).toEqual(["400.00", "175.00", "225.00", "PARTIAL"]);
    const carlo = all.rows.find((r) => r.name === "Abad, Carlo")!;
    // The pending 50 is not counted until the treasurer confirms it.
    expect([carlo.paid.toFixed(2), carlo.balance.toFixed(2), carlo.yearLevel, carlo.studentNumber]).toEqual(["200.00", "50.00", 3, "2024-0002"]);
    expect(all.rows[0].name).toBe("Abad, Carlo"); // sorted by last name
    expect(all.counts).toMatchObject({ members: 6, withBalance: 2, notAssessed: 4, fullyPaid: 0 });
    expect(all.totals.due.toFixed(2)).toBe("650.00");
  });

  it("filters by school year, semester and year level", async () => {
    const { O, y1, y2, s1, s2 } = await setup();
    const view = (sp: Record<string, string>) => masterlist(O, parseFinanceFilter(sp));
    expect((await view({ sy: y1.id })).columns.map((c) => c.label)).toEqual(["Dues 2025"]);
    expect((await view({ sy: y2.id })).columns.map((c) => c.label)).toEqual(["Sem 1 fee", "Sem 2 fee", "Fines & other charges"]);
    const sem2 = await view({ sem: s2.id });
    expect(sem2.columns.map((c) => c.label)).toEqual(["Sem 2 fee"]);
    expect(sem2.totals.due.toFixed(2)).toBe("200.00");
    const year3 = await view({ sem: s1.id, yl: "3" });
    expect(year3.rows.map((r) => r.name)).toEqual(["Abad, Carlo"]);
    expect((await view({ yl: "none" })).rows.every((r) => r.yearLevel === null)).toBe(true);
    // Invalid values are ignored rather than failing.
    expect((await view({ sy: "nope", yl: "9" })).columns.length).toBe(4);
    const terms = await termOptions();
    expect(filterLabel(parseFinanceFilter({ sem: s1.id, yl: "1" }), terms)).toBe("2026-2027 · 1st Semester · Year 1");
    expect(filterLabel(parseFinanceFilter({}), terms)).toBe("All school years");
  });

  it("status and search narrow the rows; counts still describe everyone", async () => {
    const { O, s1 } = await setup();
    const balance = await masterlist(O, parseFinanceFilter({ sem: s1.id }), { status: "balance" });
    expect(balance.rows.map((r) => r.name).sort()).toEqual(["Abad, Carlo", "Bautista, Ana"]);
    const paidInS1 = await masterlist(O, parseFinanceFilter({ sem: s1.id }), { status: "none" });
    expect(paidInS1.rows.every((r) => r.status === null)).toBe(true);
    expect(paidInS1.counts.members).toBe(6);
    const search = await masterlist(O, parseFinanceFilter({}), { q: "2026-0001" });
    expect(search.rows.map((r) => r.name)).toEqual(["Bautista, Ana"]);
  });

  it("CSV export: finance positions only, same filters, written to the financial audit trail", async () => {
    const { w, O, s1 } = await setup();
    const get = (qs: string) => exportRoute(new Request(`http://localhost/fees/masterlist/export?${qs}`));
    authState.user = null;
    expect((await get(`org=${O}`)).status).toBe(401);
    for (const id of [w.a.MEMBER.id, w.a.SECRETARY.id, w.a.OFFICER.id, w.presidentB.id, w.admin.id]) {
      await signInAs(id);
      expect((await get(`org=${O}`)).status, id).toBe(404);
    }
    await signInAs(w.a.TREASURER.id);
    expect((await get("org=bad")).status).toBe(400);
    const res = await get(`org=${O}&sem=${s1.id}&status=balance`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/tapasok-masterlist-2026-2027-1st-semester\.csv/);
    const csv = await res.text();
    expect(csv).toContain("View,2026-2027 · 1st Semester");
    expect(csv).toContain("Sem 1 fee paid,Sem 1 fee balance");
    expect(csv).toContain("Bautista,Ana,2026-0001");
    expect(csv).not.toContain("Sem 2 fee");
    expect(await db.financialAuditEntry.count({ where: { action: "masterlist.export", actorId: w.a.TREASURER.id } })).toBe(1);
  });
});
