"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/database/client";
import { assertOrgPermission } from "@/lib/permissions";
import { fieldErrorsOf, parseManilaLocal } from "@/lib/format";
import { createEvent, updateEvent, type EventInput } from "./service";

export type EventFormState = { error?: string; success?: string; fieldErrors?: Record<string, string | undefined> };

const dt = (label: string) => z.string().refine((v) => parseManilaLocal(v) !== null, `${label} is required.`).transform((v) => parseManilaLocal(v)!);
const optUuid = z.union([z.uuid(), z.literal("")]).transform((v) => v || null).nullable().optional();

const sessionSchema = z.object({
  label: z.string().trim().min(1).max(60), kind: z.enum(["TIME_IN", "TIME_OUT"]),
  opensAt: dt("Opening time"), startsAt: dt("Start time"), closesAt: dt("Cut-off time"),
  graceMinutes: z.coerce.number().int().min(0).max(240),
});
const targetSchema = z.object({ collegeId: optUuid, departmentId: optUuid, programId: optUuid, yearLevel: z.union([z.number().int(), z.string(), z.null()]).transform((v) => (v === "" || v === null ? null : Number(v))).nullable().optional() });

const json = <T extends z.ZodType>(schema: T) =>
  z.string().transform((v, ctx) => { try { return JSON.parse(v || "[]"); } catch { ctx.addIssue({ code: "custom", message: "Invalid data." }); return z.NEVER; } }).pipe(schema);

const eventSchema = z.object({
  title: z.string().trim().min(2, "Title is required.").max(150),
  description: z.string().trim().max(2000).transform((v) => v || null),
  venue: z.string().trim().min(2, "Venue is required.").max(200),
  startsAt: dt("Start"), endsAt: dt("End"),
  semesterId: optUuid,
  targetMode: z.enum(["ALL_MEMBERS", "FILTERED"]),
  requireEvaluation: z.boolean(),
  sessions: json(z.array(sessionSchema)),
  targets: json(z.array(targetSchema)),
  ruleIds: json(z.array(z.uuid())),
});

function read(fd: FormData) {
  const s = (k: string) => (fd.get(k) ?? "").toString();
  return eventSchema.safeParse({
    title: s("title"), description: s("description"), venue: s("venue"), startsAt: s("startsAt"), endsAt: s("endsAt"), semesterId: s("semesterId"),
    targetMode: s("targetMode") || "ALL_MEMBERS", requireEvaluation: fd.get("requireEvaluation") === "on",
    sessions: s("sessions"), targets: s("targets"), ruleIds: s("ruleIds"),
  });
}

const toInput = (d: z.infer<typeof eventSchema>): EventInput => ({
  ...d, semesterId: d.semesterId ?? null,
  targets: d.targets.map((t) => ({ collegeId: t.collegeId ?? null, departmentId: t.departmentId ?? null, programId: t.programId ?? null, yearLevel: t.yearLevel ?? null })),
});

export async function createEventAction(_prev: EventFormState, fd: FormData): Promise<EventFormState> {
  const orgId = z.uuid().safeParse(fd.get("organizationId"));
  if (!orgId.success) return { error: "Choose an organization." };
  const actor = await assertOrgPermission("events.manage", orgId.data);

  const parsed = read(fd);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const res = await createEvent(actor.id, orgId.data, toInput(parsed.data));
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors };
  redirect(`/events/${res.id}`);
}

export async function updateEventAction(_prev: EventFormState, fd: FormData): Promise<EventFormState> {
  const eventId = z.uuid().safeParse(fd.get("eventId"));
  if (!eventId.success) return { error: "Invalid event." };
  // Authorize against the event's real organization, never one supplied by the form.
  const event = await db.event.findUnique({ where: { id: eventId.data }, select: { organizationId: true } });
  if (!event) return { error: "Event not found." };
  const actor = await assertOrgPermission("events.manage", event.organizationId);

  const parsed = read(fd);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const res = await updateEvent(actor.id, eventId.data, toInput(parsed.data));
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors };
  return { success: res.sessionsLocked ? "Saved. Attendance sessions are locked because attendance has already been recorded." : "Saved." };
}

const statusSchema = z.object({ eventId: z.uuid(), status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]) });

export async function setEventStatusAction(fd: FormData) {
  const parsed = statusSchema.parse({ eventId: fd.get("eventId"), status: fd.get("status") });
  const event = await db.event.findUnique({ where: { id: parsed.eventId }, select: { organizationId: true, status: true, _count: { select: { attendance: true } } } });
  if (!event) return;
  const actor = await assertOrgPermission("events.manage", event.organizationId);
  // An event with recorded attendance can be cancelled but not pulled back to draft.
  if (parsed.status === "DRAFT" && event._count.attendance > 0) return;

  await db.event.update({ where: { id: parsed.eventId }, data: { status: parsed.status } });
  if (parsed.status !== "PUBLISHED") await db.eventSession.updateMany({ where: { eventId: parsed.eventId, finalizedAt: null }, data: { active: false } });
  await db.auditLog.create({
    data: { actorUserId: actor.id, action: `event.${parsed.status.toLowerCase()}`, targetType: "event", targetId: parsed.eventId },
  });
}

/**
 * Deletes an event that was never used: still a draft, with no attendance, consequences, evaluation, fees, obligations or
 * documents attached. Anything else is cancelled instead so its history stays intact.
 */
export async function deleteEventAction(fd: FormData) {
  const id = z.uuid().safeParse(fd.get("eventId"));
  if (!id.success) return;
  const e = await db.event.findUnique({
    where: { id: id.data },
    select: {
      organizationId: true, status: true,
      _count: { select: { attendance: true, consequences: true, obligations: true } },
      evaluation: { select: { id: true } },
    },
  });
  if (!e) return;
  const actor = await assertOrgPermission("events.manage", e.organizationId);
  const [fees, docs] = await Promise.all([db.feeType.count({ where: { eventId: id.data } }), db.document.count({ where: { eventId: id.data } })]);
  if (e.status !== "DRAFT" || e._count.attendance || e._count.consequences || e._count.obligations || e.evaluation || fees || docs) return;
  await db.$transaction([
    db.eventTarget.deleteMany({ where: { eventId: id.data } }),
    db.eventRule.deleteMany({ where: { eventId: id.data } }),
    db.eventSession.deleteMany({ where: { eventId: id.data } }),
    db.event.delete({ where: { id: id.data } }),
    db.auditLog.create({ data: { actorUserId: actor.id, action: "event.delete", targetType: "event", targetId: id.data } }),
  ]);
  redirect("/events");
}
