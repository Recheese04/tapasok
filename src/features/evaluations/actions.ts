"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/database/client";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { assertOrgPermission, canOrg } from "@/lib/permissions";
import { notify } from "@/features/notifications/service";

export type EvalState = { error?: string; success?: string };

const DEFAULT_QUESTIONS = [
  { prompt: "Overall, how would you rate this event?", type: "RATING" as const },
  { prompt: "The event was well organized.", type: "LIKERT" as const },
  { prompt: "What could we improve?", type: "TEXT" as const },
];

export async function createEvaluationAction(fd: FormData) {
  const eventId = z.uuid().safeParse(fd.get("eventId"));
  if (!eventId.success) return;
  const event = await db.event.findUnique({ where: { id: eventId.data }, select: { id: true, title: true, organizationId: true, evaluation: { select: { id: true } } } });
  if (!event) return;
  const actor = await assertOrgPermission("evaluations.manage", event.organizationId);
  if (event.evaluation) redirect(`/evaluations/${event.evaluation.id}`);

  const form = await db.evaluationForm.create({
    data: {
      organizationId: event.organizationId, eventId: event.id, title: `${event.title} evaluation`, createdById: actor.id,
      questions: { create: DEFAULT_QUESTIONS.map((q, i) => ({ ...q, position: i + 1 })) },
    },
  });
  await db.auditLog.create({ data: { actorUserId: actor.id, action: "evaluation.create", targetType: "evaluation", targetId: form.id } });
  redirect(`/evaluations/${form.id}`);
}

async function loadFormForManage(formId: string) {
  const form = await db.evaluationForm.findUnique({ where: { id: formId }, select: { id: true, status: true, organizationId: true, _count: { select: { questions: true, responses: true } } } });
  if (!form) return null;
  const actor = await assertOrgPermission("evaluations.manage", form.organizationId);
  return { form, actor };
}

const questionSchema = z.object({
  formId: z.uuid(),
  prompt: z.string().trim().min(3, "Enter the question.").max(300),
  type: z.enum(["RATING", "LIKERT", "TEXT", "CHOICE"]),
  options: z.string().max(1000),
  required: z.boolean(),
});

export async function addQuestionAction(_prev: EvalState, fd: FormData): Promise<EvalState> {
  const parsed = questionSchema.safeParse({
    formId: fd.get("formId"), prompt: fd.get("prompt"), type: fd.get("type"),
    options: (fd.get("options") ?? "").toString(), required: fd.get("required") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid question." };
  const ctx = await loadFormForManage(parsed.data.formId);
  if (!ctx) return { error: "Form not found." };
  if (ctx.form.status !== "DRAFT") return { error: "Questions can only be changed while the form is a draft." };

  let options: string[] | null = null;
  if (parsed.data.type === "CHOICE") {
    options = [...new Set(parsed.data.options.split("\n").map((s) => s.trim()).filter(Boolean))].slice(0, 10);
    if (options.length < 2) return { error: "Give at least two choices, one per line." };
  }
  const last = await db.evaluationQuestion.findFirst({ where: { formId: ctx.form.id }, orderBy: { position: "desc" }, select: { position: true } });
  await db.evaluationQuestion.create({
    data: { formId: ctx.form.id, position: (last?.position ?? 0) + 1, prompt: parsed.data.prompt, type: parsed.data.type, options: options ?? Prisma.JsonNull, required: parsed.data.required },
  });
  return { success: "Question added." };
}

export async function deleteQuestionAction(fd: FormData) {
  const q = await db.evaluationQuestion.findUnique({ where: { id: z.uuid().parse(fd.get("questionId")) }, select: { id: true, formId: true } });
  if (!q) return;
  const ctx = await loadFormForManage(q.formId);
  if (!ctx || ctx.form.status !== "DRAFT") return;
  await db.evaluationQuestion.delete({ where: { id: q.id } });
}

/**
 * Lifecycle of an evaluation, always inside the organization that owns it:
 *   DRAFT -> OPEN (publish, needs questions) -> CLOSED -> OPEN (reopen);   OPEN -> DRAFT (unpublish, only while nobody has answered).
 */
export async function setEvaluationStatusAction(fd: FormData) {
  const parsed = z.object({ formId: z.uuid(), status: z.enum(["DRAFT", "OPEN", "CLOSED"]) }).parse({ formId: fd.get("formId"), status: fd.get("status") });
  const ctx = await loadFormForManage(parsed.formId);
  if (!ctx) return;
  const { status, _count } = ctx.form;
  const allowed =
    (parsed.status === "OPEN" && status === "DRAFT" && _count.questions > 0) ||
    (parsed.status === "OPEN" && status === "CLOSED") ||
    (parsed.status === "CLOSED" && status === "OPEN") ||
    (parsed.status === "DRAFT" && status === "OPEN" && _count.responses === 0);
  if (!allowed) return;
  await db.evaluationForm.update({ where: { id: ctx.form.id }, data: { status: parsed.status } });
  await db.auditLog.create({ data: { actorUserId: ctx.actor.id, action: `evaluation.${parsed.status.toLowerCase()}`, targetType: "evaluation", targetId: ctx.form.id } });
  if (parsed.status === "OPEN" && status === "DRAFT") {
    const form = await db.evaluationForm.findUniqueOrThrow({ where: { id: ctx.form.id }, select: { title: true, eventId: true } });
    const attendees = await db.attendanceRecord.findMany({ where: { eventId: form.eventId, status: { in: ["PRESENT", "LATE"] } }, select: { userId: true }, distinct: ["userId"] });
    await notify(attendees.map((a) => a.userId), { kind: "evaluation", title: `Please evaluate: ${form.title.replace(/ evaluation$/, "")}`, href: `/evaluations/${ctx.form.id}` });
  }
}

/** Renames an evaluation. Questions and responses are untouched. */
export async function updateEvaluationAction(_prev: EvalState, fd: FormData): Promise<EvalState> {
  const parsed = z.object({ formId: z.uuid(), title: z.string().trim().min(3, "Give the evaluation a title.").max(150) }).safeParse({ formId: fd.get("formId"), title: fd.get("title") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid evaluation." };
  const ctx = await loadFormForManage(parsed.data.formId);
  if (!ctx) return { error: "Evaluation not found." };
  await db.$transaction([
    db.evaluationForm.update({ where: { id: ctx.form.id }, data: { title: parsed.data.title } }),
    db.auditLog.create({ data: { actorUserId: ctx.actor.id, action: "evaluation.update", targetType: "evaluation", targetId: ctx.form.id } }),
  ]);
  return { success: "Saved." };
}

/** Edits a question's wording and whether it is required, while the evaluation is still a draft (so answers never change meaning). */
export async function updateQuestionAction(_prev: EvalState, fd: FormData): Promise<EvalState> {
  const parsed = z.object({ questionId: z.uuid(), prompt: z.string().trim().min(3, "Enter the question.").max(300), required: z.boolean() })
    .safeParse({ questionId: fd.get("questionId"), prompt: fd.get("prompt") ?? "", required: fd.get("required") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid question." };
  const q = await db.evaluationQuestion.findUnique({ where: { id: parsed.data.questionId }, select: { id: true, formId: true } });
  if (!q) return { error: "Question not found." };
  const ctx = await loadFormForManage(q.formId);
  if (!ctx) return { error: "Question not found." };
  if (ctx.form.status !== "DRAFT") return { error: "Questions can only be changed while the evaluation is a draft." };
  await db.evaluationQuestion.update({ where: { id: q.id }, data: { prompt: parsed.data.prompt, required: parsed.data.required } });
  return { success: "Saved." };
}

/** Only a draft (which can have no responses) is deleted; an evaluation that was ever open is closed instead, so answers are kept. */
export async function deleteEvaluationAction(fd: FormData) {
  const id = z.uuid().safeParse(fd.get("formId"));
  if (!id.success) return;
  const ctx = await loadFormForManage(id.data);
  if (!ctx || ctx.form.status !== "DRAFT" || ctx.form._count.responses > 0) return;
  await db.$transaction([
    db.evaluationQuestion.deleteMany({ where: { formId: ctx.form.id } }),
    db.evaluationForm.delete({ where: { id: ctx.form.id } }),
    db.auditLog.create({ data: { actorUserId: ctx.actor.id, action: "evaluation.delete", targetType: "evaluation", targetId: ctx.form.id } }),
  ]);
  redirect("/evaluations");
}

/** Who may answer: an active member of the organization who attended the event, once, while the form is open. */
export async function submitEvaluationAction(_prev: EvalState, fd: FormData): Promise<EvalState> {
  const user = await requireUser();
  const formId = z.uuid().safeParse(fd.get("formId"));
  if (!formId.success) return { error: "Invalid form." };

  const form = await db.evaluationForm.findUnique({ where: { id: formId.data }, include: { questions: { orderBy: { position: "asc" } } } });
  if (!form || form.status !== "OPEN" || !canOrg(user, "org.view", form.organizationId)) return { error: "This evaluation is not available." };

  const attended = await db.attendanceRecord.findFirst({ where: { eventId: form.eventId, userId: user.id, status: { in: ["PRESENT", "LATE"] } }, select: { id: true } });
  if (!attended) return { error: "Only members who attended the event can evaluate it." };

  const answers: { questionId: string; ratingValue: number | null; textValue: string | null }[] = [];
  for (const q of form.questions) {
    const raw = (fd.get(`q_${q.id}`) ?? "").toString().trim();
    if (!raw) {
      if (q.required) return { error: `Please answer: ${q.prompt}` };
      continue;
    }
    if (q.type === "RATING" || q.type === "LIKERT") {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 5) return { error: "Ratings must be from 1 to 5." };
      answers.push({ questionId: q.id, ratingValue: n, textValue: null });
    } else if (q.type === "CHOICE") {
      if (!Array.isArray(q.options) || !q.options.includes(raw)) return { error: "Choose one of the listed options." };
      answers.push({ questionId: q.id, ratingValue: null, textValue: raw });
    } else {
      answers.push({ questionId: q.id, ratingValue: null, textValue: raw.slice(0, 1000) });
    }
  }

  try {
    await db.evaluationResponse.create({ data: { formId: form.id, userId: user.id, answers: { create: answers } } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "You have already submitted this evaluation." };
    throw e;
  }
  return { success: "Thank you! Your evaluation was submitted." };
}
