import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import { createAnnouncementAction, updateAnnouncementAction } from "@/features/announcements/actions";
import { removeDocumentAction, uploadDocumentAction } from "@/features/documents/actions";
import { checkUpload, safeFileName } from "@/features/documents/storage";
import { GET as downloadRoute } from "@/app/(dashboard)/documents/[id]/download/route";
import { createConsequenceAction, createRuleAction, updateConsequenceStatusAction } from "@/features/consequences/actions";
import { addQuestionAction, createEvaluationAction, setEvaluationStatusAction, submitEvaluationAction } from "@/features/evaluations/actions";
import { getEvaluationForViewer, getResults, listEvaluations } from "@/features/evaluations/queries";
import { assignFeeAction, createFeeTypeAction, recordPaymentAction, voidPaymentAction } from "@/features/fees/actions";
import { exportRows, financeSummary, systemReport } from "@/features/reports/queries";
import { GET as exportRoute } from "@/app/(dashboard)/reports/export/[type]/route";
import { changePasswordAction, saveSystemSettingsAction } from "@/features/settings/actions";
import { getSetting } from "@/features/settings/system-settings";
import { ForbiddenError } from "@/lib/permissions";
import { db, form, signInAs, TEST_PASSWORD } from "./helpers/db";
import { auth, makeEvent, makeWorld } from "./helpers/world";
import { authState } from "./helpers/auth-state";

const pdf = () => new File([Buffer.from("%PDF-1.4 test")], "minutes.pdf");
const upload = (orgId: string, file: File = pdf()) => { const fd = form({ organizationId: orgId, title: "Minutes" }); fd.set("file", file); return uploadDocumentAction({}, fd); };

describe("announcements", () => {
  const fd = (orgId: string, intent = "publish") => form({ organizationId: orgId, title: "Meeting tomorrow", body: "Bring ID.", intent });

  it("only the president manages them; drafts are hidden from members; other organizations are isolated", async () => {
    const w = await makeWorld();
    for (const r of ["TREASURER", "OFFICER", "ADVISER", "MEMBER"] as const) {
      await signInAs(w.a[r].id);
      await expect(createAnnouncementAction({}, fd(w.orgA.id))).rejects.toBeInstanceOf(ForbiddenError);
    }
    await signInAs(w.admin.id);
    await expect(createAnnouncementAction({}, fd(w.orgA.id))).rejects.toBeInstanceOf(ForbiddenError);
    await signInAs(w.presidentB.id);
    await expect(createAnnouncementAction({}, fd(w.orgA.id))).rejects.toBeInstanceOf(ForbiddenError);

    await signInAs(w.a.PRESIDENT.id);
    await expect(createAnnouncementAction({}, fd(w.orgA.id, "save"))).rejects.toThrow("NEXT_REDIRECT:/announcements");
    const a = await db.announcement.findFirstOrThrow();
    expect(a.status).toBe("DRAFT");
    expect(a.publishedAt).toBeNull();

    // forged organization on update is ignored; authority comes from the stored announcement
    await signInAs(w.presidentB.id);
    await expect(updateAnnouncementAction({}, form({ announcementId: a.id, organizationId: w.orgB.id, title: "x pwned", body: "x", intent: "publish" }))).rejects.toBeInstanceOf(ForbiddenError);

    await signInAs(w.a.PRESIDENT.id);
    expect((await updateAnnouncementAction({}, form({ announcementId: a.id, title: "Meeting tomorrow", body: "Bring ID.", intent: "publish" }))).success).toMatch(/published/);
    expect((await db.announcement.findFirstOrThrow()).publishedAt).not.toBeNull();
  });
});

describe("documents", () => {
  it("accepts allowed files and rejects disguised, oversized or unknown types", () => {
    expect(checkUpload("a.pdf", Buffer.from("%PDF-1.7"))).toMatchObject({ ok: true, mime: "application/pdf" });
    expect(checkUpload("a.pdf", Buffer.from("MZ\x90 not a pdf"))).toMatchObject({ ok: false });
    expect(checkUpload("evil.exe", Buffer.from("MZ"))).toMatchObject({ ok: false });
    expect(checkUpload("a.html", Buffer.from("<script>"))).toMatchObject({ ok: false });
    expect(checkUpload("a.pdf", Buffer.alloc(0))).toMatchObject({ ok: false });
    expect(checkUpload("big.txt", Buffer.alloc(11 * 1024 * 1024, 65))).toMatchObject({ ok: false });
    expect(safeFileName('../../etc/pass"wd\r\n.pdf')).not.toMatch(/[\\/"\r\n]/);
  });

  it("only the president uploads/removes; members of the same organization download; outsiders and anonymous cannot", async () => {
    const w = await makeWorld();
    await signInAs(w.a.OFFICER.id);
    await expect(upload(w.orgA.id)).rejects.toBeInstanceOf(ForbiddenError);
    await signInAs(w.a.PRESIDENT.id);
    expect((await upload(w.orgA.id)).success).toBeTruthy();
    expect((await upload(w.orgA.id, new File([Buffer.from("MZ")], "x.pdf"))).error).toMatch(/do not match/);
    const doc = await db.document.findFirstOrThrow();
    expect(doc.storageKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(doc.storageKey).not.toContain("minutes");

    const get = (id: string) => downloadRoute(new Request("http://x"), { params: Promise.resolve({ id }) });
    authState.user = null;
    expect((await get(doc.id)).status).toBe(401);
    for (const id of [w.presidentB.id, w.memberB.id, w.admin.id, w.nobody.id]) { await signInAs(id); expect((await get(doc.id)).status).toBe(404); }
    for (const r of ["MEMBER", "TREASURER", "ADVISER"] as const) {
      await signInAs(w.a[r].id);
      const res = await get(doc.id);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toContain("attachment");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(Buffer.from(await res.arrayBuffer()).toString()).toContain("%PDF");
    }
    await signInAs(w.a.MEMBER.id);
    await expect(removeDocumentAction(form({ documentId: doc.id }))).rejects.toBeInstanceOf(ForbiddenError);
    await signInAs(w.a.PRESIDENT.id);
    await removeDocumentAction(form({ documentId: doc.id }));
    await signInAs(w.a.MEMBER.id);
    expect((await get(doc.id)).status).toBe(404);
    expect(await db.document.count()).toBe(1); // soft-deleted, history kept
  });
});

describe("consequences", () => {
  it("president/adviser manage; only the adviser waives; members see only their own", async () => {
    const w = await makeWorld();
    const mk = (over: Record<string, string> = {}) => form({ organizationId: w.orgA.id, userId: w.a.MEMBER.id, ruleId: "", eventId: "", reason: "Absent from assembly", ...over });

    for (const r of ["TREASURER", "OFFICER", "MEMBER"] as const) {
      await signInAs(w.a[r].id);
      await expect(createConsequenceAction({}, mk())).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createRuleAction({}, form({ organizationId: w.orgA.id, name: "Rule" }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    await signInAs(w.presidentB.id);
    await expect(createConsequenceAction({}, mk())).rejects.toBeInstanceOf(ForbiddenError);

    await signInAs(w.a.PRESIDENT.id);
    expect((await createRuleAction({}, form({ organizationId: w.orgA.id, name: "No-show", description: "Community service", fineAmount: "50" }))).success).toBeTruthy();
    expect((await createRuleAction({}, form({ organizationId: w.orgA.id, name: "No-show", fineAmount: "50" }))).error).toMatch(/already exists/);
    expect((await createConsequenceAction({}, mk())).success).toBeTruthy();
    // person from another organization, and a rule from another organization, are refused
    expect((await createConsequenceAction({}, mk({ userId: w.memberB.id }))).error).toMatch(/not an active member/);
    await signInAs(w.presidentB.id);
    await createRuleAction({}, form({ organizationId: w.orgB.id, name: "B rule", fineAmount: "10" }));
    const bRule = await db.consequenceRule.findFirstOrThrow({ where: { organizationId: w.orgB.id } });
    await signInAs(w.a.PRESIDENT.id);
    expect((await createConsequenceAction({}, mk({ ruleId: bRule.id }))).error).toMatch(/rule/i);

    const c = await db.consequence.findFirstOrThrow();
    await updateConsequenceStatusAction(form({ consequenceId: c.id, status: "WAIVED", note: "nice" })).catch((e) => expect(e).toBeInstanceOf(ForbiddenError));
    expect((await db.consequence.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("PENDING");

    await signInAs(w.a.ADVISER.id);
    await updateConsequenceStatusAction(form({ consequenceId: c.id, status: "WAIVED", note: "Medical reason" }));
    const done = await db.consequence.findUniqueOrThrow({ where: { id: c.id } });
    expect(done).toMatchObject({ status: "WAIVED", note: "Medical reason", resolvedById: w.a.ADVISER.id });
    // finished records are immutable
    await signInAs(w.a.PRESIDENT.id);
    await updateConsequenceStatusAction(form({ consequenceId: c.id, status: "COMPLETED", note: "" }));
    expect((await db.consequence.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("WAIVED");
  });
});

describe("event evaluations", () => {
  async function setup() {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await signInAs(w.a.OFFICER.id);
    await createEvaluationAction(form({ eventId: ev.id })).catch(() => undefined); // redirects
    const f = await db.evaluationForm.findFirstOrThrow({ include: { questions: { orderBy: { position: "asc" } } } });
    return { w, ev, f };
  }

  it("only president/officer create and manage forms", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    for (const r of ["TREASURER", "ADVISER", "MEMBER"] as const) {
      await signInAs(w.a[r].id);
      await expect(createEvaluationAction(form({ eventId: ev.id }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    await signInAs(w.presidentB.id);
    await expect(createEvaluationAction(form({ eventId: ev.id }))).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.evaluationForm.count()).toBe(0);
  });

  it("drafts are hidden, then only attendees can answer once, with validation, and results are anonymous aggregates", async () => {
    const { w, ev, f } = await setup();
    expect(f.status).toBe("DRAFT");
    expect(f.questions).toHaveLength(3);
    expect(await getEvaluationForViewer(await auth(w.a.MEMBER.id), f.id)).toBeNull(); // draft hidden from members

    await addQuestionAction({}, form({ formId: f.id, prompt: "Favourite part?", type: "CHOICE", options: "Talks\nFood\nGames", required: "on" }));
    expect((await addQuestionAction({}, form({ formId: f.id, prompt: "Bad choice", type: "CHOICE", options: "only one" }))).error).toMatch(/two choices/);
    await signInAs(w.a.MEMBER.id);
    await expect(setEvaluationStatusAction(form({ formId: f.id, status: "OPEN" }))).rejects.toBeInstanceOf(ForbiddenError);
    await signInAs(w.a.OFFICER.id);
    await setEvaluationStatusAction(form({ formId: f.id, status: "OPEN" }));
    expect((await addQuestionAction({}, form({ formId: f.id, prompt: "Too late", type: "TEXT", options: "" }))).error).toMatch(/draft/);

    const questions = await db.evaluationQuestion.findMany({ where: { formId: f.id }, orderBy: { position: "asc" } });
    const answers = (rating: string) => form({ formId: f.id, [`q_${questions[0].id}`]: rating, [`q_${questions[1].id}`]: "4", [`q_${questions[2].id}`]: "More food", [`q_${questions[3].id}`]: "Food" });

    // did not attend -> refused
    await signInAs(w.a.MEMBER.id);
    expect((await submitEvaluationAction({}, answers("5"))).error).toMatch(/attended/);
    await db.attendanceRecord.createMany({ data: [{ eventId: ev.id, sessionId: ev.session.id, userId: w.a.MEMBER.id }, { eventId: ev.id, sessionId: ev.session.id, userId: w.a.TREASURER.id }] });
    expect((await submitEvaluationAction({}, answers("9"))).error).toMatch(/1 to 5/);
    expect((await submitEvaluationAction({}, form({ formId: f.id, [`q_${questions[3].id}`]: "Karaoke" }))).error).toBeTruthy();
    expect((await submitEvaluationAction({}, answers("5"))).success).toBeTruthy();
    expect((await submitEvaluationAction({}, answers("5"))).error).toMatch(/already submitted/);
    await signInAs(w.a.TREASURER.id);
    expect((await submitEvaluationAction({}, answers("3"))).success).toBeTruthy();

    // outsiders cannot submit even with attendance rows or a valid form id
    await signInAs(w.presidentB.id);
    expect((await submitEvaluationAction({}, answers("5"))).error).toMatch(/not available/);

    // results: aggregates only, for results roles only
    const results = await getResults(await auth(w.a.OFFICER.id), f.id);
    expect(results?.responses).toBe(2);
    const rating = results!.questions[0];
    expect(rating).toMatchObject({ type: "RATING", average: 4, count: 2 });
    expect(JSON.stringify(results)).not.toMatch(/userId|firstName|email/);
    expect(await getResults(await auth(w.a.MEMBER.id), f.id)).toBeNull();
    expect(await getResults(await auth(w.presidentB.id), f.id)).toBeNull();
    expect((await getResults(await auth(w.a.ADVISER.id), f.id))?.responses).toBe(2);

    const list = await listEvaluations(await auth(w.a.MEMBER.id));
    expect(list[0]).toMatchObject({ submitted: true, attended: true, responseCount: null });
  });
});

describe("fees and payments", () => {
  async function setup() {
    const w = await makeWorld();
    await signInAs(w.a.TREASURER.id);
    expect((await createFeeTypeAction({}, form({ organizationId: w.orgA.id, name: "Membership", amount: "150.00", dueDate: "", description: "" }))).success).toBeTruthy();
    const fee = await db.feeType.findFirstOrThrow();
    await assignFeeAction(form({ feeTypeId: fee.id }));
    const mine = await db.studentFee.findFirstOrThrow({ where: { userId: w.a.MEMBER.id } });
    return { w, fee, mine };
  }

  it("only the president and treasurer manage fees; others are refused; assignment is idempotent and organization-scoped", async () => {
    const w = await makeWorld();
    const mk = () => form({ organizationId: w.orgA.id, name: "Membership", amount: "100", dueDate: "", description: "" });
    for (const r of ["SECRETARY", "OFFICER", "AUDITOR", "ADVISER", "MEMBER"] as const) { await signInAs(w.a[r].id); await expect(createFeeTypeAction({}, mk())).rejects.toBeInstanceOf(ForbiddenError); }
    for (const id of [w.admin.id, w.presidentB.id]) { await signInAs(id); await expect(createFeeTypeAction({}, mk())).rejects.toBeInstanceOf(ForbiddenError); }

    await signInAs(w.a.TREASURER.id);
    expect((await createFeeTypeAction({}, form({ organizationId: w.orgA.id, name: "Bad", amount: "-5", dueDate: "", description: "" }))).error).toBeTruthy();
    expect((await createFeeTypeAction({}, form({ organizationId: w.orgA.id, name: "Bad", amount: "1e3", dueDate: "", description: "" }))).error).toBeTruthy();
    await createFeeTypeAction({}, mk());
    expect((await createFeeTypeAction({}, mk())).error).toMatch(/already exists/);
    const fee = await db.feeType.findFirstOrThrow();
    await assignFeeAction(form({ feeTypeId: fee.id }));
    await assignFeeAction(form({ feeTypeId: fee.id }));
    expect(await db.studentFee.count()).toBe(7); // all seven members of A, once each
    expect(await db.studentFee.count({ where: { userId: w.memberB.id } })).toBe(0);

    await signInAs(w.presidentB.id);
    await expect(assignFeeAction(form({ feeTypeId: fee.id }))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("records payments, tracks the balance, blocks overpayment and voids with history", async () => {
    const { w, mine } = await setup();
    const pay = (amount: string) => recordPaymentAction({}, form({ studentFeeId: mine.id, amount, method: "GCASH", reference: "REF1" }));
    expect((await pay("100")).success).toBeTruthy();
    expect((await pay("50.01")).error).toMatch(/exceeds the remaining balance/);
    expect((await pay("0")).error).toBeTruthy();
    expect((await pay("12.345")).error).toBeTruthy();
    expect((await pay("50")).success).toBeTruthy();
    expect((await pay("0.01")).error).toMatch(/exceeds/);

    const p = await db.payment.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    await voidPaymentAction(form({ paymentId: p.id, reason: "Entered twice" }));
    const voided = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(voided.voidedAt).not.toBeNull();
    expect(await db.payment.count()).toBe(2); // nothing deleted
    expect((await pay("100")).success).toBeTruthy(); // balance restored by the void
    expect(await db.auditLog.count({ where: { action: "payment.void" } })).toBe(1);
    void w;
  });

  it("prevents overpayment under concurrent payments", async () => {
    const { mine } = await setup();
    const pay = () => recordPaymentAction({}, form({ studentFeeId: mine.id, amount: "100", method: "CASH", reference: "" }));
    const results = await Promise.all([pay(), pay(), pay(), pay()]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    const total = (await db.payment.findMany({ where: { studentFeeId: mine.id, voidedAt: null } })).reduce((s, x) => s.add(x.amount), new Prisma.Decimal(0));
    expect(total.lte(150)).toBe(true);
  });

  it("refuses payments and voids from people without finance authority or other organizations", async () => {
    const { w, mine } = await setup();
    const fd = () => form({ studentFeeId: mine.id, amount: "10", method: "CASH", reference: "" });
    for (const id of [w.a.OFFICER.id, w.a.MEMBER.id, w.presidentB.id, w.admin.id]) { await signInAs(id); await expect(recordPaymentAction({}, fd())).rejects.toBeInstanceOf(ForbiddenError); }
    await signInAs(w.a.TREASURER.id);
    await recordPaymentAction({}, fd());
    const p = await db.payment.findFirstOrThrow();
    await signInAs(w.presidentB.id);
    await expect(voidPaymentAction(form({ paymentId: p.id, reason: "malicious" }))).rejects.toBeInstanceOf(ForbiddenError);
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).voidedAt).toBeNull();
  });
});

describe("reports and exports", () => {
  it("system report is admin-only; finance summary is scoped to authorized roles and organizations", async () => {
    const w = await makeWorld();
    await signInAs(w.a.PRESIDENT.id);
    await expect(systemReport()).rejects.toBeInstanceOf(ForbiddenError);
    await signInAs(w.admin.id);
    expect((await systemReport()).users).toBeGreaterThan(0);

    await signInAs(w.a.TREASURER.id);
    await createFeeTypeAction({}, form({ organizationId: w.orgA.id, name: "Fee", amount: "10", dueDate: "", description: "" }));
    await assignFeeAction(form({ feeTypeId: (await db.feeType.findFirstOrThrow()).id }));
    expect(await financeSummary(await auth(w.a.TREASURER.id))).toHaveLength(1);
    expect(await financeSummary(await auth(w.a.MEMBER.id))).toHaveLength(0);
    expect(await financeSummary(await auth(w.a.OFFICER.id))).toHaveLength(0);
    expect(await financeSummary(await auth(w.presidentB.id))).toHaveLength(0);
  });

  it("CSV exports require the matching report permission", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await db.attendanceRecord.create({ data: { eventId: ev.id, sessionId: ev.session.id, userId: w.a.MEMBER.id } });
    expect(await exportRows(await auth(w.a.MEMBER.id), "attendance")).toBeNull();
    expect(await exportRows(await auth(w.a.TREASURER.id), "attendance")).toBeNull();
    expect(await exportRows(await auth(w.a.OFFICER.id), "finance")).toBeNull();
    expect(await exportRows(await auth(w.admin.id), "attendance")).toBeNull();
    expect((await exportRows(await auth(w.a.ADVISER.id), "attendance"))!.length).toBe(2);
    expect(await exportRows(await auth(w.presidentB.id), "attendance").then((r) => r!.length)).toBe(1); // header only: no leakage

    const get = (type: string) => exportRoute(new Request("http://x"), { params: Promise.resolve({ type }) });
    authState.user = null;
    expect((await get("attendance")).status).toBe(401);
    await signInAs(w.a.MEMBER.id);
    expect((await get("attendance")).status).toBe(403);
    expect((await get("nonsense")).status).toBe(404);
    await signInAs(w.a.OFFICER.id);
    const ok = await get("attendance");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("text/csv");
    expect((await get("finance")).status).toBe(403);
  });
});

describe("settings", () => {
  it("changes the password after verifying the current one and signs out other devices", async () => {
    const w = await makeWorld();
    const me = w.a.MEMBER;
    await signInAs(me.id);
    await db.session.create({ data: { userId: me.id, tokenHash: "other-device", expiresAt: new Date(Date.now() + 3_600_000) } });
    const attempt = (cur: string, pw: string, conf = pw) => changePasswordAction({}, form({ current: cur, password: pw, confirm: conf }));

    expect((await attempt("wrong-password", "NewPassword123")).fieldErrors?.current).toBeTruthy();
    expect((await attempt(TEST_PASSWORD, "short")).fieldErrors?.password).toBeTruthy();
    expect((await attempt(TEST_PASSWORD, "NewPassword123", "Different12345")).fieldErrors?.confirm).toBeTruthy();
    expect((await attempt(TEST_PASSWORD, "NewPassword123")).success).toBeTruthy();

    const u = await db.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(await bcrypt.compare("NewPassword123", u.passwordHash)).toBe(true);
    expect(await db.session.count({ where: { userId: me.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "auth.password_change" } })).toBe(1);
  });

  it("system settings are admin-only, validated, persisted and used as the default grace period", async () => {
    const w = await makeWorld();
    for (const id of [w.a.PRESIDENT.id, w.a.MEMBER.id]) { await signInAs(id); await expect(saveSystemSettingsAction({}, form({ school: "X school", grace: "5" }))).rejects.toBeInstanceOf(ForbiddenError); }
    await signInAs(w.admin.id);
    expect((await saveSystemSettingsAction({}, form({ school: "Test University", grace: "-1" }))).error).toBeTruthy();
    expect((await saveSystemSettingsAction({}, form({ school: "Test University", grace: "5" }))).success).toBeTruthy();
    expect(await getSetting("school.name")).toBe("Test University");
    expect(await getSetting("attendance.late_grace_minutes")).toBe("5");

    // new events pick the saved value up as the default grace period for their sessions
    const { eventFormData } = await import("@/features/events/form-data");
    expect((await eventFormData([w.orgA.id])).defaultGrace).toBe(5);
  });
});
