import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { POST as uploadRoute } from "@/app/api/admin/event-images/route";
import { GET as imageRoute } from "@/app/event-images/[id]/route";
import { imageAction, moderateFeedbackAction, removeOwnFeedbackAction, showOnLandingAction, submitFeedbackAction } from "@/features/landing/actions";
import { landingEvents, MAX_IMAGES_PER_EVENT } from "@/features/landing/images";
import { cleanComment, publicFeedback } from "@/features/landing/feedback";
import { navItemsFor } from "@/config/navigation";
import { setEventStatusAction } from "@/features/events/actions";
import { db, form, makeOrg, signInAs } from "./helpers/db";
import { authState } from "./helpers/auth-state";
import { auth, makeEvent, makeWorld } from "./helpers/world";

const img = (format: "jpeg" | "png" | "webp", w = 2400, h = 1600) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#6a2bd8" } })[format]().withMetadata({ exif: { IFD0: { Artist: "secret-camera" } } }).toBuffer();
const upload = (eventId: string, bytes: Buffer, opts: { name?: string; type?: string; alt?: string; origin?: string } = {}) => {
  const fd = new FormData();
  fd.set("eventId", eventId);
  fd.set("image", new File([new Uint8Array(bytes)], opts.name ?? "photo.jpg", { type: opts.type ?? "image/jpeg" }));
  fd.set("altText", opts.alt ?? "");
  return uploadRoute(new Request("http://localhost/api/admin/event-images", { method: "POST", body: fd, headers: opts.origin ? { origin: opts.origin } : {} }));
};
const getImage = (id: string) => imageRoute(new Request(`http://localhost/event-images/${id}`), { params: Promise.resolve({ id }) });

async function uploaded(eventId: string, alt = "") {
  const res = await upload(eventId, await img("jpeg"), { alt });
  expect(res.status).toBe(200);
  return (await res.json()).id as string;
}

describe("landing-page event pictures (System Admin only, stored in the database)", () => {
  it("an admin uploads a picture: it is re-encoded to WebP, resized, stripped of metadata and stored in the database", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id, { title: "Foundation Day" });
    await signInAs(w.admin.id);
    const id = await uploaded(ev.id, "  Students   at the\u0000 gym  ");
    const row = await db.eventImage.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ eventId: ev.id, mime: "image/webp", width: 1600, height: 1067, altText: "Students at the gym", position: 1, uploadedById: w.admin.id, deletedAt: null });
    const meta = await sharp(Buffer.from(row.content)).metadata();
    expect([meta.format, meta.exif]).toEqual(["webp", undefined]);
    expect(await db.auditLog.count({ where: { action: "landing.image_add", targetId: ev.id } })).toBe(1);
    // PNG and WebP are accepted too.
    expect((await upload(ev.id, await img("png", 300, 200), { name: "a.png", type: "image/png" })).status).toBe(200);
    expect((await upload(ev.id, await img("webp", 300, 200), { name: "a.webp", type: "image/webp" })).status).toBe(200);
  });

  it("refuses non-admins, signed-out callers, other sites, fake images, unpublished events and a seventh picture", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    const good = await img("jpeg", 400, 300);
    expect((await upload(ev.id, good)).status).toBe(401);
    for (const id of [w.a.PRESIDENT.id, w.a.SECRETARY.id, w.a.ADVISER.id, w.a.MEMBER.id]) {
      await signInAs(id);
      expect((await upload(ev.id, good)).status).toBe(403);
    }
    await signInAs(w.admin.id);
    expect((await upload(ev.id, good, { origin: "https://evil.example" })).status).toBe(403);
    const fake = await upload(ev.id, Buffer.from("<script>alert(1)</script>"), { name: "x.jpg" });
    expect(fake.status).toBe(422);
    expect((await fake.json()).error).toMatch(/JPEG, PNG or WebP/);
    const truncated = await upload(ev.id, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(50)]));
    expect(truncated.status).toBe(422);
    const draft = await makeEvent(w.orgA.id, { status: "DRAFT" });
    expect((await upload(draft.id, good)).status).toBe(422);
    const archived = await makeOrg("Archived", "ARCHIVED");
    expect((await upload((await makeEvent(archived.id)).id, good)).status).toBe(422);
    for (let i = 0; i < MAX_IMAGES_PER_EVENT; i++) expect((await upload(ev.id, good)).status).toBe(200);
    const seventh = await upload(ev.id, good);
    expect(seventh.status).toBe(422);
    expect((await seventh.json()).error).toMatch(/up to 6/);
    expect(await db.eventImage.count({ where: { eventId: ev.id } })).toBe(MAX_IMAGES_PER_EVENT);
  });

  it("pictures are public only while their event is shown on the landing page; otherwise admin-only", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id, { title: "Acquaintance Party" });
    await signInAs(w.admin.id);
    const id = await uploaded(ev.id, "Dance floor");

    await signInAs(w.a.PRESIDENT.id);
    expect((await getImage(id)).status).toBe(404); // not shown yet: hidden even from the organization's officers
    expect((await showOnLandingAction({}, form({ eventId: ev.id, show: "true" }))).error).toMatch(/system administrators/);
    await signInAs(w.admin.id);
    const preview = await getImage(id);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("cache-control")).toBe("private, no-store");
    expect(await landingEvents()).toEqual([]);

    expect((await showOnLandingAction({}, form({ eventId: ev.id, show: "true" }))).success).toBeTruthy();
    const listed = await landingEvents();
    expect(listed.map((e) => [e.title, e.images.map((i) => i.altText), e.upcoming])).toEqual([["Acquaintance Party", ["Dance floor"], true]]);
    expect(JSON.stringify(listed)).not.toMatch(/@test\.local|content/); // no account data, no image bytes in the listing

    authState.user = null;
    const pub = await getImage(id);
    expect(pub.status).toBe(200);
    expect(pub.headers.get("content-type")).toBe("image/webp");
    expect(pub.headers.get("cache-control")).toMatch(/^public/);
    expect(pub.headers.get("content-security-policy")).toMatch(/sandbox/);

    // Cancelling the event takes it (and its pictures) off the landing page at once.
    await signInAs(w.a.PRESIDENT.id);
    await setEventStatusAction(form({ eventId: ev.id, status: "CANCELLED" }));
    authState.user = null;
    expect(await landingEvents()).toEqual([]);
    expect((await getImage(id)).status).toBe(404);
    expect((await getImage("not-a-uuid")).status).toBe(404);
  });

  it("showing requires a picture; removing, restoring and reordering are soft and audited", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id);
    await signInAs(w.admin.id);
    expect((await showOnLandingAction({}, form({ eventId: ev.id, show: "true" }))).error).toMatch(/at least one picture/);
    const a = await uploaded(ev.id, "A");
    const b = await uploaded(ev.id, "B");
    await showOnLandingAction({}, form({ eventId: ev.id, show: "true" }));
    const order = async () => (await landingEvents())[0]?.images.map((i) => i.altText) ?? [];
    expect(await order()).toEqual(["A", "B"]);
    expect((await imageAction({}, form({ imageId: b, op: "up" }))).success).toBeTruthy();
    expect(await order()).toEqual(["B", "A"]);
    expect((await imageAction({}, form({ imageId: a, op: "alt", altText: "Stage" }))).success).toBeTruthy();

    expect((await imageAction({}, form({ imageId: b, op: "remove" }))).success).toBeTruthy();
    expect(await db.eventImage.findUniqueOrThrow({ where: { id: b } })).toMatchObject({ deletedById: w.admin.id });
    expect(await order()).toEqual(["Stage"]);
    authState.user = null;
    expect((await getImage(b)).status).toBe(404); // removed: no longer public
    await signInAs(w.admin.id);
    expect((await getImage(b)).status).toBe(200); // the admin can still see it to decide on restoring

    expect((await imageAction({}, form({ imageId: a, op: "remove" }))).success).toBeTruthy();
    expect(await landingEvents()).toEqual([]); // no active picture left: the event drops off by itself
    expect((await imageAction({}, form({ imageId: b, op: "restore" }))).success).toBeTruthy();
    expect(await order()).toEqual(["B"]);
    expect((await db.eventImage.findUniqueOrThrow({ where: { id: b } })).restoredAt).not.toBeNull();
    const actions = (await db.auditLog.findMany({ where: { targetId: ev.id, action: { startsWith: "landing." } }, orderBy: { createdAt: "asc" } })).map((l) => l.action);
    expect(actions).toEqual(["landing.image_add", "landing.image_add", "landing.event_show", "landing.image_remove", "landing.image_remove", "landing.image_restore"]);

    // Hiding the event again.
    expect((await showOnLandingAction({}, form({ eventId: ev.id, show: "false" }))).success).toBeTruthy();
    expect(await landingEvents()).toEqual([]);
  });

  it("deleted events and archived organizations never appear, and officers keep managing their own events", async () => {
    const w = await makeWorld();
    const ev = await makeEvent(w.orgA.id, { title: "Shown" });
    await signInAs(w.admin.id);
    await uploaded(ev.id);
    await showOnLandingAction({}, form({ eventId: ev.id, show: "true" }));
    expect((await landingEvents()).length).toBe(1);
    await db.event.update({ where: { id: ev.id }, data: { deletedAt: new Date() } });
    expect(await landingEvents()).toEqual([]);
    await db.event.update({ where: { id: ev.id }, data: { deletedAt: null } });
    await db.organization.update({ where: { id: w.orgA.id }, data: { status: "ARCHIVED" } });
    expect(await landingEvents()).toEqual([]);
    // Featuring an event changed nothing the organization owns.
    expect(await db.event.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({ title: "Shown", organizationId: w.orgA.id, createdById: null });
  });
});

describe("landing-page ratings and comments", () => {
  const send = (rating: string, comment = "") => submitFeedbackAction({}, form({ rating, comment }));

  it("a member rates once (editing updates the same entry), and nothing is public until an admin approves it", async () => {
    const w = await makeWorld();
    await db.user.update({ where: { id: w.a.MEMBER.id }, data: { firstName: "Maria Clara", lastName: "dela Cruz" } });
    await signInAs(w.a.MEMBER.id);
    expect((await send("4", "Very useful")).success).toMatch(/once an administrator approves/);
    expect((await send("5", "Even better now")).success).toBeTruthy();
    const rows = await db.siteFeedback.findMany();
    expect(rows).toHaveLength(1); // one entry per account
    expect(rows[0]).toMatchObject({ rating: 5, comment: "Even better now", status: "PENDING" });
    expect(await publicFeedback()).toMatchObject({ total: 0, average: null, comments: [] });

    await signInAs(w.a.MEMBER.id);
    expect((await moderateFeedbackAction({}, form({ feedbackId: rows[0].id, action: "approve" }))).error).toMatch(/system administrators/);
    await signInAs(w.admin.id);
    expect((await moderateFeedbackAction({}, form({ feedbackId: rows[0].id, action: "approve" }))).success).toBeTruthy();
    const pub = await publicFeedback();
    expect(pub).toMatchObject({ total: 1, average: 5 });
    expect(pub.comments).toEqual([expect.objectContaining({ rating: 5, comment: "Even better now", name: "Maria D." })]);
    expect(JSON.stringify(pub)).not.toMatch(/@|dela Cruz|userId|studentNumber/); // no private account data

    // Editing an approved entry sends it back for approval and takes it off the landing page.
    await signInAs(w.a.MEMBER.id);
    await send("1", "Changed my mind");
    expect(await publicFeedback()).toMatchObject({ total: 0 });
    expect(await db.siteFeedback.count()).toBe(1);
  });

  it("validates input and keeps comments as plain text", async () => {
    const w = await makeWorld();
    await signInAs(w.a.MEMBER.id);
    for (const r of ["0", "6", "2.5", "x", ""]) expect((await send(r)).error, r).toMatch(/1 to 5/);
    expect((await send("3", "a".repeat(501))).error).toMatch(/500/);
    expect(await db.siteFeedback.count()).toBe(0);
    expect((await send("3", "<script>alert('x')</script>‮\u0007 ok\n\n\n\nbye")).success).toBeTruthy();
    const row = await db.siteFeedback.findFirstOrThrow();
    expect(row.comment).toBe("<script>alert('x')</script> ok\n\nbye"); // stored as text; React escapes it when shown
    expect(cleanComment("   ")).toBeNull();
    expect((await send("2")).success).toBeTruthy(); // rating only
    expect((await db.siteFeedback.findFirstOrThrow()).comment).toBeNull();
  });

  it("only personal accounts post: not System Admin, not Adviser-only, not signed-out visitors", async () => {
    const w = await makeWorld();
    await signInAs(w.admin.id);
    expect((await send("5")).error).toMatch(/cannot post/);
    await signInAs(w.a.ADVISER.id);
    expect((await send("5")).error).toMatch(/cannot post/);
    authState.user = null;
    await expect(send("5")).rejects.toThrow(/NEXT_REDIRECT:\/login/);
    expect(await db.siteFeedback.count()).toBe(0);
    // Navigation matches: members see "Rate Tapasok"; System Admin sees "Landing Page"; Adviser-only sees neither.
    const has = async (id: string, href: string) => navItemsFor(await auth(id)).some((i) => i.href === href);
    expect([await has(w.a.MEMBER.id, "/feedback"), await has(w.a.PRESIDENT.id, "/feedback"), await has(w.a.ADVISER.id, "/feedback"), await has(w.admin.id, "/feedback")]).toEqual([true, true, false, false]);
    expect([await has(w.admin.id, "/landing-page"), await has(w.a.PRESIDENT.id, "/landing-page")]).toEqual([true, false]);
    // An account with no organization yet can still rate.
    await signInAs(w.nobody.id);
    expect((await send("4")).success).toBeTruthy();
  });

  it("limits how often one account can change its feedback", async () => {
    const w = await makeWorld();
    await signInAs(w.a.MEMBER.id);
    for (let i = 0; i < 10; i++) expect((await send("4", `try ${i}`)).success).toBeTruthy();
    expect((await send("4", "spam")).error).toMatch(/Try again in an hour/);
  });

  it("the average uses approved, not-deleted entries of active accounts only; moderation can hide, delete and restore", async () => {
    const w = await makeWorld();
    const people = [w.a.MEMBER, w.a.OFFICER, w.a.TREASURER, w.a.SECRETARY];
    const ratings = [5, 4, 1, 2];
    for (const [i, p] of people.entries()) { await signInAs(p.id); await send(String(ratings[i]), `Comment ${i}`); }
    const ids = Object.fromEntries((await db.siteFeedback.findMany({ select: { id: true, userId: true } })).map((r) => [r.userId, r.id]));
    await signInAs(w.admin.id);
    const mod = (userId: string, action: string) => moderateFeedbackAction({}, form({ feedbackId: ids[userId], action }));
    for (const p of people.slice(0, 3)) await mod(p.id, "approve");
    expect(await publicFeedback()).toMatchObject({ total: 3, average: 3.3 }); // (5 + 4 + 1) / 3; the pending 2 is not counted
    expect((await publicFeedback()).breakdown).toEqual([{ stars: 5, count: 1 }, { stars: 4, count: 1 }, { stars: 3, count: 0 }, { stars: 2, count: 0 }, { stars: 1, count: 1 }]);

    await mod(w.a.TREASURER.id, "hide");
    expect(await publicFeedback()).toMatchObject({ total: 2, average: 4.5 });
    await mod(w.a.OFFICER.id, "delete");
    expect(await publicFeedback()).toMatchObject({ total: 1, average: 5 });
    expect(await db.siteFeedback.findUniqueOrThrow({ where: { id: ids[w.a.OFFICER.id] } })).toMatchObject({ deletedById: w.admin.id, status: "APPROVED" });
    expect((await mod(w.a.OFFICER.id, "approve")).error).toMatch(/Restore this feedback first/);
    expect((await mod(w.a.OFFICER.id, "restore")).success).toBeTruthy();
    expect(await publicFeedback()).toMatchObject({ total: 2, average: 4.5 });

    // A disabled account's feedback stops counting.
    await db.user.update({ where: { id: w.a.MEMBER.id }, data: { status: "DISABLED" } });
    expect(await publicFeedback()).toMatchObject({ total: 1, average: 4 });
    const log = (await db.auditLog.findMany({ where: { action: { startsWith: "feedback." } } })).map((l) => l.action);
    expect(log.filter((a) => a === "feedback.approve")).toHaveLength(3);
    expect(log).toEqual(expect.arrayContaining(["feedback.hide", "feedback.delete", "feedback.restore"]));
  });

  it("deleted feedback does not block new feedback, and an old entry cannot be restored over a newer one", async () => {
    const w = await makeWorld();
    await signInAs(w.a.MEMBER.id);
    await send("2", "First try");
    const first = await db.siteFeedback.findFirstOrThrow();
    expect((await removeOwnFeedbackAction()).success).toBeTruthy();
    expect(await db.siteFeedback.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ deletedById: w.a.MEMBER.id });
    expect((await removeOwnFeedbackAction()).error).toMatch(/no feedback/);
    expect((await send("5", "Second try")).success).toBeTruthy();
    expect(await db.siteFeedback.count()).toBe(2); // the deleted one is kept; the new one is the active one
    await signInAs(w.admin.id);
    expect((await moderateFeedbackAction({}, form({ feedbackId: first.id, action: "restore" }))).error).toMatch(/newer feedback/);
    // The database itself refuses two active entries for one account.
    await expect(db.siteFeedback.create({ data: { userId: w.a.MEMBER.id, rating: 3 } })).rejects.toThrow();
    await expect(db.siteFeedback.create({ data: { userId: w.a.OFFICER.id, rating: 9 } })).rejects.toThrow();
  });
});
