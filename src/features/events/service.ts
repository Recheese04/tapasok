import "server-only";
import type { SessionKind } from "@/generated/prisma/enums";
import { db } from "@/lib/database/client";
import { getActiveTerm } from "@/features/academic/service";

export type SessionInput = { label: string; kind: SessionKind; opensAt: Date; startsAt: Date; closesAt: Date; graceMinutes: number };
export type TargetInput = { collegeId?: string | null; departmentId?: string | null; programId?: string | null; yearLevel?: number | null };
export type EventInput = {
  title: string; description: string | null; venue: string; startsAt: Date; endsAt: Date; semesterId: string | null;
  targetMode: "ALL_MEMBERS" | "FILTERED"; targets: TargetInput[]; requireEvaluation: boolean; ruleIds: string[]; sessions: SessionInput[];
};

type Fail = { ok: false; error?: string; fieldErrors?: Record<string, string> };

async function validate(organizationId: string, input: EventInput): Promise<Fail | { ok: true; semesterId: string | null }> {
  const err = (fieldErrors: Record<string, string>): Fail => ({ ok: false, fieldErrors });
  if (input.endsAt <= input.startsAt) return err({ endsAt: "End must be after the start." });

  if (input.sessions.length < 1 || input.sessions.length > 8) return err({ sessions: "Add between 1 and 8 attendance sessions." });
  for (const [i, s] of input.sessions.entries()) {
    if (!s.label.trim()) return err({ sessions: `Session ${i + 1} needs a name.` });
    if (!(s.opensAt <= s.startsAt && s.startsAt < s.closesAt)) return err({ sessions: `Session ${i + 1}: opening must be at or before the start, and the start before the cut-off.` });
    if (!Number.isInteger(s.graceMinutes) || s.graceMinutes < 0 || s.graceMinutes > 240) return err({ sessions: `Session ${i + 1}: grace period must be 0-240 minutes.` });
  }

  if (input.targetMode === "FILTERED") {
    if (input.targets.length === 0) return err({ targets: "Add at least one target group, or target all members." });
    for (const t of input.targets) {
      if (!t.collegeId && !t.departmentId && !t.programId && !t.yearLevel) return err({ targets: "Each target group needs a college, department, program or year level." });
      if (t.yearLevel !== undefined && t.yearLevel !== null && (t.yearLevel < 1 || t.yearLevel > 10)) return err({ targets: "Year level must be 1-10." });
      if (t.programId) {
        const p = await db.program.findUnique({ where: { id: t.programId }, include: { department: true } });
        if (!p || (t.departmentId && p.departmentId !== t.departmentId) || (t.collegeId && p.department.collegeId !== t.collegeId)) return err({ targets: "A target program does not belong to its department/college." });
      } else if (t.departmentId) {
        const d = await db.department.findUnique({ where: { id: t.departmentId } });
        if (!d || (t.collegeId && d.collegeId !== t.collegeId)) return err({ targets: "A target department does not belong to its college." });
      } else if (t.collegeId && !(await db.college.findUnique({ where: { id: t.collegeId } }))) return err({ targets: "Unknown college in a target group." });
    }
  }

  if (input.ruleIds.length) {
    const found = await db.consequenceRule.count({ where: { id: { in: input.ruleIds }, organizationId, active: true } });
    if (found !== new Set(input.ruleIds).size) return err({ ruleIds: "Choose only active consequence rules of this organization." });
  }

  let semesterId = input.semesterId;
  if (semesterId) {
    if (!(await db.semester.findUnique({ where: { id: semesterId } }))) return err({ semesterId: "Unknown semester." });
  } else semesterId = (await getActiveTerm())?.semester.id ?? null;
  return { ok: true, semesterId };
}

const windowOf = (sessions: SessionInput[]) => ({
  attendanceOpensAt: new Date(Math.min(...sessions.map((s) => s.opensAt.getTime()))),
  attendanceClosesAt: new Date(Math.max(...sessions.map((s) => s.closesAt.getTime()))),
});

const coreData = (input: EventInput, semesterId: string | null) => ({
  title: input.title, description: input.description, venue: input.venue, startsAt: input.startsAt, endsAt: input.endsAt, semesterId,
  targetMode: input.targetMode, requireEvaluation: input.requireEvaluation, ...windowOf(input.sessions),
});

export async function createEvent(actorId: string, organizationId: string, input: EventInput): Promise<{ ok: true; id: string } | Fail> {
  const v = await validate(organizationId, input);
  if (!v.ok) return v;
  const event = await db.$transaction(async (tx) => {
    const e = await tx.event.create({ data: { ...coreData(input, v.semesterId), organizationId, createdById: actorId } });
    await tx.eventSession.createMany({ data: input.sessions.map((s, i) => ({ ...s, eventId: e.id, position: i + 1 })) });
    if (input.targetMode === "FILTERED") await tx.eventTarget.createMany({ data: input.targets.map((t) => ({ eventId: e.id, collegeId: t.collegeId ?? null, departmentId: t.departmentId ?? null, programId: t.programId ?? null, yearLevel: t.yearLevel ?? null })) });
    if (input.ruleIds.length) await tx.eventRule.createMany({ data: [...new Set(input.ruleIds)].map((ruleId) => ({ eventId: e.id, ruleId })) });
    await tx.auditLog.create({ data: { actorUserId: actorId, action: "event.create", targetType: "event", targetId: e.id } });
    return e;
  });
  return { ok: true, id: event.id };
}

/** Sessions are locked once any attendance exists (so records keep the windows they were captured under). */
export async function updateEvent(actorId: string, eventId: string, input: EventInput): Promise<{ ok: true; sessionsLocked: boolean } | Fail> {
  const existing = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true, _count: { select: { attendance: true } } } });
  if (!existing) return { ok: false, error: "Event not found." };
  const v = await validate(existing.organizationId, input);
  if (!v.ok) return v;
  const locked = existing._count.attendance > 0;

  await db.$transaction(async (tx) => {
    const data = coreData(input, v.semesterId);
    if (locked) {
      const { attendanceOpensAt: _o, attendanceClosesAt: _c, ...rest } = data;
      void _o; void _c;
      await tx.event.update({ where: { id: eventId }, data: rest });
    } else {
      await tx.event.update({ where: { id: eventId }, data });
      await tx.eventSession.deleteMany({ where: { eventId } });
      await tx.eventSession.createMany({ data: input.sessions.map((s, i) => ({ ...s, eventId, position: i + 1 })) });
    }
    await tx.eventTarget.deleteMany({ where: { eventId } });
    if (input.targetMode === "FILTERED") await tx.eventTarget.createMany({ data: input.targets.map((t) => ({ eventId, collegeId: t.collegeId ?? null, departmentId: t.departmentId ?? null, programId: t.programId ?? null, yearLevel: t.yearLevel ?? null })) });
    await tx.eventRule.deleteMany({ where: { eventId } });
    if (input.ruleIds.length) await tx.eventRule.createMany({ data: [...new Set(input.ruleIds)].map((ruleId) => ({ eventId, ruleId })) });
    await tx.auditLog.create({ data: { actorUserId: actorId, action: "event.update", targetType: "event", targetId: eventId } });
  });
  return { ok: true, sessionsLocked: locked };
}
