import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addQuestionAction, createEvaluationAction, deleteEvaluationAction, setEvaluationStatusAction, submitEvaluationAction, updateEvaluationAction, updateQuestionAction,
} from "@/features/evaluations/actions";
import { getEvaluationForViewer, getResults, listEvaluations } from "@/features/evaluations/queries";
import { ViewAccountModal, EditAccountModal } from "@/features/users/user-modals";
import { ForbiddenError } from "@/lib/permissions";
import { addMembership, db, form, signInAs } from "./helpers/db";
import { auth, makeEvent, makeWorld } from "./helpers/world";

const create = (eventId: string) => createEvaluationAction(form({ eventId })).then(() => "no redirect", (e: Error) => e.message);

describe("Event Evaluations: the President manages them in their own organization only", () => {
  it("a President creates, edits, publishes, closes, reopens and deletes evaluations for their organization's events", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await signInAs(w.a.PRESIDENT.id);
    expect(await create(ev.id)).toMatch(/^NEXT_REDIRECT:\/evaluations\//);
    const f = await db.evaluationForm.findFirstOrThrow();
    expect(f).toMatchObject({ organizationId: w.orgA.id, status: "DRAFT", createdById: w.a.PRESIDENT.id });

    // edit settings and questions
    expect((await updateEvaluationAction({}, form({ formId: f.id, title: "General Assembly feedback" }))).success).toBeTruthy();
    expect((await updateEvaluationAction({}, form({ formId: f.id, title: "x" }))).error).toBeTruthy();
    expect((await addQuestionAction({}, form({ formId: f.id, prompt: "Was the venue suitable?", type: "TEXT", options: "", required: "on" }))).success).toBeTruthy();
    const q = await db.evaluationQuestion.findFirstOrThrow({ where: { formId: f.id, prompt: "Was the venue suitable?" } });
    expect((await updateQuestionAction({}, form({ questionId: q.id, prompt: "Was the venue suitable for you?" }))).success).toBeTruthy();
    expect((await db.evaluationQuestion.findUniqueOrThrow({ where: { id: q.id } })).required).toBe(false);

    // publish -> unpublish (nobody answered) -> publish -> close -> reopen
    const status = (s: string) => setEvaluationStatusAction(form({ formId: f.id, status: s }));
    const current = async () => (await db.evaluationForm.findUniqueOrThrow({ where: { id: f.id } })).status;
    await status("OPEN"); expect(await current()).toBe("OPEN");
    await status("DRAFT"); expect(await current()).toBe("DRAFT");
    await status("OPEN"); await status("CLOSED"); expect(await current()).toBe("CLOSED");
    await status("OPEN"); expect(await current()).toBe("OPEN");
    // questions are frozen once it is not a draft
    expect((await updateQuestionAction({}, form({ questionId: q.id, prompt: "Changed after opening" }))).error).toMatch(/draft/);

    // results are visible to the President; an answer blocks unpublishing and deleting
    await db.attendanceRecord.create({ data: { eventId: ev.id, sessionId: ev.session.id, userId: w.a.MEMBER.id, status: "PRESENT", source: "QR_SELF" } });
    await signInAs(w.a.MEMBER.id);
    const answers = form({ formId: f.id });
    for (const question of await db.evaluationQuestion.findMany({ where: { formId: f.id } })) answers.set(`q_${question.id}`, question.type === "TEXT" ? "Great" : "5");
    expect((await submitEvaluationAction({}, answers)).success).toBeTruthy();
    await signInAs(w.a.PRESIDENT.id);
    expect((await getResults(await auth(w.a.PRESIDENT.id), f.id))?.responses).toBe(1);
    await status("DRAFT"); expect(await current()).toBe("OPEN"); // answered: cannot be pulled back
    await deleteEvaluationAction(form({ formId: f.id }));
    expect(await db.evaluationForm.count({ where: { id: f.id } })).toBe(1);
    expect(await db.evaluationResponse.count({ where: { formId: f.id } })).toBe(1); // history kept

    // an untouched draft can be deleted
    const ev2 = await makeEvent(w.orgA.id, { title: "Second" });
    await create(ev2.id);
    const draft = await db.evaluationForm.findFirstOrThrow({ where: { eventId: ev2.id } });
    expect(await deleteEvaluationAction(form({ formId: draft.id })).then(() => "no redirect", (e: Error) => e.message)).toBe("NEXT_REDIRECT:/evaluations");
    expect(await db.evaluationForm.count({ where: { id: draft.id } })).toBe(0);
  });

  it("a President of another organization, members and other positions cannot manage it", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await signInAs(w.a.PRESIDENT.id);
    await create(ev.id);
    const f = await db.evaluationForm.findFirstOrThrow();

    for (const id of [w.presidentB.id, w.a.MEMBER.id, w.a.TREASURER.id, w.a.AUDITOR.id, w.a.ADVISER.id, w.admin.id]) {
      await signInAs(id);
      await expect(createEvaluationAction(form({ eventId: ev.id }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(addQuestionAction({}, form({ formId: f.id, prompt: "Sneaky", type: "TEXT", options: "" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateEvaluationAction({}, form({ formId: f.id, title: "Hijacked title" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setEvaluationStatusAction(form({ formId: f.id, status: "OPEN" }))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deleteEvaluationAction(form({ formId: f.id }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    const after = await db.evaluationForm.findUniqueOrThrow({ where: { id: f.id } });
    expect(after.status).toBe("DRAFT");
    expect(after.title).not.toBe("Hijacked title");

    // drafts are invisible to people who cannot manage them
    expect(await getEvaluationForViewer(await auth(w.a.MEMBER.id), f.id)).toBeNull();
    expect(await getEvaluationForViewer(await auth(w.presidentB.id), f.id)).toBeNull();
    expect((await listEvaluations(await auth(w.presidentB.id))).length).toBe(0);
    expect((await listEvaluations(await auth(w.a.PRESIDENT.id))).length).toBe(1);
  });

  it("someone who is President in B and only a member in A manages B's evaluations but not A's", async () => {
    const w = await makeWorld();
    const evA = await makeEvent(w.orgA.id, { title: "A event" });
    const evB = await makeEvent(w.orgB.id, { title: "B event" });
    await addMembership(w.presidentB.id, w.orgA.id, "MEMBER");
    await signInAs(w.presidentB.id);
    expect(await create(evB.id)).toMatch(/^NEXT_REDIRECT/);
    await expect(createEvaluationAction(form({ eventId: evA.id }))).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.evaluationForm.count({ where: { organizationId: w.orgA.id } })).toBe(0);
    expect(await db.evaluationForm.count({ where: { organizationId: w.orgB.id } })).toBe(1);
  });
});

describe("User Management dialogs and the scanner", () => {
  it("account dialogs load only for system administrators", async () => {
    const w = await makeWorld();
    for (const id of [w.a.PRESIDENT.id, w.a.MEMBER.id, w.presidentB.id]) {
      await signInAs(id);
      await expect(ViewAccountModal({ userId: w.a.MEMBER.id, editHref: "/users", closeHref: "/users" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(EditAccountModal({ userId: w.a.MEMBER.id, closeHref: "/users" })).rejects.toBeInstanceOf(ForbiddenError);
    }
    await signInAs(w.admin.id);
    expect(await ViewAccountModal({ userId: w.a.MEMBER.id, editHref: "/users", closeHref: "/users" })).not.toBeNull();
    expect(await EditAccountModal({ userId: w.a.MEMBER.id, closeHref: "/users" })).not.toBeNull();
  });

  it("the scanner offers no way to type or paste a check-in code", () => {
    const camera = fs.readFileSync("src/features/attendance/qr-camera.tsx", "utf8");
    const scanner = fs.readFileSync("src/features/attendance/member-scanner.tsx", "utf8");
    const checkin = fs.readFileSync("src/app/check-in/page.tsx", "utf8");
    const forms = fs.readFileSync("src/features/attendance/session-forms.tsx", "utf8");
    for (const src of [camera, scanner, checkin]) {
      expect(src).not.toMatch(/paste/i);
      expect(src).not.toMatch(/Submit code/);
      expect(src).not.toMatch(/CheckInCodeForm/);
    }
    expect(forms).not.toMatch(/CheckInCodeForm/);
    expect(camera).not.toMatch(/<input/);
  });
});
