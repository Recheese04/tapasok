import "server-only";
import { db } from "@/lib/database/client";
import { canOrg, orgIdsWith } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/dal";

/** Forms visible to the user: non-draft forms of their organizations, plus drafts where they manage evaluations. */
export async function listEvaluations(user: AuthUser) {
  const forms = await db.evaluationForm.findMany({
    where: {
      organizationId: { in: orgIdsWith(user, "org.view") },
      OR: [{ status: { not: "DRAFT" } }, { organizationId: { in: orgIdsWith(user, "evaluations.manage") } }],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, title: true, status: true, organizationId: true,
      organization: { select: { name: true } },
      event: { select: { id: true, attendance: { where: { userId: user.id, status: { in: ["PRESENT", "LATE"] } }, select: { id: true } } } },
      responses: { where: { userId: user.id }, select: { id: true } },
      _count: { select: { responses: true } },
    },
  });
  return forms.map((f) => ({
    id: f.id, title: f.title, status: f.status, organizationId: f.organizationId, organizationName: f.organization.name,
    attended: f.event.attendance.length > 0, submitted: f.responses.length > 0,
    responseCount: canOrg(user, "evaluations.results", f.organizationId) ? f._count.responses : null,
  }));
}

export async function getEvaluationForViewer(user: AuthUser, id: string) {
  const form = await db.evaluationForm.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { position: "asc" } },
      event: { select: { id: true, title: true, attendance: { where: { userId: user.id, status: { in: ["PRESENT", "LATE"] } }, select: { id: true } } } },
      organization: { select: { name: true } },
      responses: { where: { userId: user.id }, select: { id: true } },
    },
  });
  if (!form || !canOrg(user, "org.view", form.organizationId)) return null;
  const manage = canOrg(user, "evaluations.manage", form.organizationId);
  if (form.status === "DRAFT" && !manage) return null;
  return {
    form, manage,
    canViewResults: canOrg(user, "evaluations.results", form.organizationId),
    canAnswer: form.status === "OPEN" && form.event.attendance.length > 0 && form.responses.length === 0,
    attended: form.event.attendance.length > 0,
    submitted: form.responses.length > 0,
  };
}

export type QuestionResult =
  | { id: string; prompt: string; type: "RATING" | "LIKERT"; average: number | null; distribution: number[]; count: number }
  | { id: string; prompt: string; type: "CHOICE"; counts: { option: string; count: number }[]; count: number }
  | { id: string; prompt: string; type: "TEXT"; answers: string[]; count: number };

/** Aggregates only. Respondents are never attached to answers in the result. */
export async function getResults(user: AuthUser, formId: string): Promise<{ responses: number; eligible: number; questions: QuestionResult[] } | null> {
  const form = await db.evaluationForm.findUnique({ where: { id: formId }, select: { organizationId: true, eventId: true } });
  if (!form || !canOrg(user, "evaluations.results", form.organizationId)) return null;

  const [questions, responses, eligibleRows] = await Promise.all([
    db.evaluationQuestion.findMany({ where: { formId }, orderBy: { position: "asc" }, include: { answers: { select: { ratingValue: true, textValue: true } } } }),
    db.evaluationResponse.count({ where: { formId } }),
    db.attendanceRecord.findMany({ where: { eventId: form.eventId, status: { in: ["PRESENT", "LATE"] } }, select: { userId: true }, distinct: ["userId"] }),
  ]);
  return {
    responses,
    eligible: eligibleRows.length,
    questions: questions.map((q): QuestionResult => {
      if (q.type === "RATING" || q.type === "LIKERT") {
        const vals = q.answers.map((a) => a.ratingValue).filter((v): v is number => v !== null);
        return {
          id: q.id, prompt: q.prompt, type: q.type, count: vals.length,
          average: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null,
          distribution: [1, 2, 3, 4, 5].map((n) => vals.filter((v) => v === n).length),
        };
      }
      if (q.type === "CHOICE") {
        const opts = Array.isArray(q.options) ? (q.options as string[]) : [];
        return { id: q.id, prompt: q.prompt, type: "CHOICE", count: q.answers.length, counts: opts.map((option) => ({ option, count: q.answers.filter((a) => a.textValue === option).length })) };
      }
      return { id: q.id, prompt: q.prompt, type: "TEXT", count: q.answers.length, answers: q.answers.map((a) => a.textValue ?? "").filter(Boolean) };
    }),
  };
}

export type ParticipantFilter = {
  page: number; q?: string; yearLevel?: number | "none"; accountStatus?: "ACTIVE" | "INVITED" | "DISABLED"; submitted?: "yes" | "no";
};

/**
 * Who was expected to answer (attended the event: present or late) and whether they submitted. For people who may see
 * results (evaluations.results). It never shows anyone's answers: those stay anonymous in the results above.
 * Every filter runs in the database and combines with the others and with paging.
 */
export async function getParticipants(user: AuthUser, formId: string, f: ParticipantFilter, pageSize = 25) {
  const form = await db.evaluationForm.findUnique({ where: { id: formId }, select: { organizationId: true, eventId: true } });
  if (!form || !canOrg(user, "evaluations.results", form.organizationId)) return null;
  const attendees = (await db.attendanceRecord.findMany({ where: { eventId: form.eventId, status: { in: ["PRESENT", "LATE"] } }, select: { userId: true }, distinct: ["userId"] })).map((r) => r.userId);
  const respondents = new Set((await db.evaluationResponse.findMany({ where: { formId }, select: { userId: true } })).map((r) => r.userId));
  const q = (f.q ?? "").trim().slice(0, 100);
  const ids = f.submitted === "yes" ? attendees.filter((id) => respondents.has(id)) : f.submitted === "no" ? attendees.filter((id) => !respondents.has(id)) : attendees;
  const where = {
    id: { in: ids },
    ...(f.accountStatus ? { status: f.accountStatus } : {}),
    ...(f.yearLevel === "none" ? { OR: [{ studentProfile: null }, { studentProfile: { yearLevel: null } }] } : f.yearLevel ? { studentProfile: { yearLevel: f.yearLevel } } : {}),
    ...(q ? { AND: [{ OR: [
      { firstName: { contains: q, mode: "insensitive" as const } }, { lastName: { contains: q, mode: "insensitive" as const } },
      { studentProfile: { studentNumber: { contains: q, mode: "insensitive" as const } } },
    ] }] } : {}),
  };
  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], skip: (f.page - 1) * pageSize, take: pageSize,
      select: { id: true, firstName: true, lastName: true, status: true, studentProfile: { select: { studentNumber: true, yearLevel: true, course: true, program: { select: { code: true } } } } },
    }),
  ]);
  return {
    total, attendees: attendees.length, submittedCount: attendees.filter((id) => respondents.has(id)).length,
    rows: rows.map((u) => ({
      id: u.id, name: `${u.lastName}, ${u.firstName}`, status: u.status, submitted: respondents.has(u.id),
      studentNumber: u.studentProfile?.studentNumber ?? null, yearLevel: u.studentProfile?.yearLevel ?? null, program: u.studentProfile?.program?.code ?? u.studentProfile?.course ?? null,
    })),
  };
}
