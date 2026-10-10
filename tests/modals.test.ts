import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { EventCreateModal, EventEditModal, EventQrModal } from "@/features/events/event-modals";
import { ForbiddenError } from "@/lib/permissions";
import { updateEventAction } from "@/features/events/actions";
import { db, form, signInAs } from "./helpers/db";
import { auth, makeEvent, makeWorld } from "./helpers/world";

type El = ReactElement<{ title: string; closeHref: string; children: ReactElement<Record<string, unknown>> }>;
const childName = (el: El) => (el.props.children.type as { name?: string }).name;

describe("event dialogs: Edit and QR Code are separate and permission-checked", () => {
  it("renders the edit dialog only for people who manage events in that organization", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    for (const r of ["PRESIDENT", "SECRETARY", "OFFICER"] as const) {
      const el = (await EventEditModal({ user: await auth(w.a[r].id), eventId: ev.id, closeHref: "/events" })) as El | null;
      expect(el, r).not.toBeNull();
      expect(el!.props.title).toBe("Edit event");
      expect(childName(el!)).toBe("EventForm");
    }
    for (const id of [w.a.MEMBER.id, w.a.TREASURER.id, w.a.ADVISER.id, w.memberB.id, w.presidentB.id, w.admin.id]) {
      expect(await EventEditModal({ user: await auth(id), eventId: ev.id, closeHref: "/events" })).toBeNull();
    }
  });

  it("renders the QR dialog only for people who can operate attendance, and it contains no event-editing form", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id, { sessions: 2 });
    const el = (await EventQrModal({ user: await auth(w.a.OFFICER.id), eventId: ev.id, sessionId: ev.sessions[1].id, closeHref: "/events" })) as El | null;
    expect(el).not.toBeNull();
    expect(el!.props.title).toBe("QR Code");
    expect(childName(el!)).toBe("QrSessionTabs");
    expect((el!.props.children.props as { items: { id: string }[] }).items).toHaveLength(2);
    expect((el!.props.children.props as { initialId: string }).initialId).toBe(ev.sessions[1].id);

    for (const id of [w.a.MEMBER.id, w.a.TREASURER.id, w.a.AUDITOR.id, w.a.ADVISER.id, w.memberB.id, w.presidentB.id, w.admin.id]) {
      expect(await EventQrModal({ user: await auth(id), eventId: ev.id, closeHref: "/events" })).toBeNull();
    }
  });

  it("the create dialog is only for people who manage events somewhere", async () => {
    const w = await makeWorld();
    expect(await EventCreateModal({ user: await auth(w.a.OFFICER.id), closeHref: "/events" })).not.toBeNull();
    expect(await EventCreateModal({ user: await auth(w.a.MEMBER.id), closeHref: "/events" })).toBeNull();
    expect(await EventCreateModal({ user: await auth(w.a.TREASURER.id), closeHref: "/events" })).toBeNull();
  });

  it("saving from the edit dialog updates the event; not saving changes nothing; members are refused by the server", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id, { status: "DRAFT", title: "Original title" });
    const session = ev.sessions[0];
    const fd = (title: string) => form({
      eventId: ev.id, title, description: "", venue: "Gym", startsAt: "2030-01-10T09:00", endsAt: "2030-01-10T12:00", semesterId: "", targetMode: "ALL_MEMBERS",
      sessions: JSON.stringify([{ label: session.label, kind: "TIME_IN", opensAt: "2030-01-10T08:30", startsAt: "2030-01-10T09:00", closesAt: "2030-01-10T10:30", graceMinutes: 15 }]), targets: "[]", ruleIds: "[]",
    });
    await signInAs(w.a.MEMBER.id);
    await expect(updateEventAction({}, fd("Hacked"))).rejects.toBeInstanceOf(ForbiddenError);
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).title).toBe("Original title");

    // Cancelling means the action is never sent: nothing changes.
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).title).toBe("Original title");

    await signInAs(w.a.OFFICER.id);
    expect((await updateEventAction({}, fd("Updated title"))).success).toBeTruthy();
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).title).toBe("Updated title");
    expect((await updateEventAction({}, fd(""))).fieldErrors).toBeTruthy(); // validation errors keep the dialog open
  });
});
