import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { POST as webUpload, DELETE as webRemove } from "@/app/api/profile/photo/route";
import { GET as webPhoto } from "@/app/(dashboard)/users/[id]/photo/route";
import { GET as appMine, POST as appUpload, DELETE as appRemove } from "@/app/api/mobile/me/photo/route";
import { GET as appMemberPhoto } from "@/app/api/mobile/org/[orgId]/members/[userId]/photo/route";
import { GET as appMe } from "@/app/api/mobile/me/route";
import { POST as login } from "@/app/api/mobile/login/route";
import { POST as rfidRoute } from "@/app/api/rfid/scan/route";
import { registerDevice } from "@/features/attendance/devices";
import { liveSession } from "@/features/attendance/live";
import { processPhoto } from "@/features/profile/photo";
import { createAccountAction } from "@/features/users/actions";
import { db, form, signInAs } from "./helpers/db";
import { authState } from "./helpers/auth-state";
import { auth, makeEvent, makeWorld } from "./helpers/world";

const img = (format: "jpeg" | "png" | "webp", w = 800, h = 600) => sharp({ create: { width: w, height: h, channels: 3, background: "#5a3fd0" } })[format]().toBuffer();
const file = (bytes: Buffer, name = "me.jpg", type = "image/jpeg") => new File([new Uint8Array(bytes)], name, { type });
const multipart = (url: string, f: File, headers: Record<string, string> = {}) => { const fd = new FormData(); fd.set("photo", f); return new Request(url, { method: "POST", body: fd, headers }); };
const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as never;
const photoRow = (userId: string) => db.profilePhoto.findUnique({ where: { userId } });
async function tokenFor(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const res = await login(new Request("http://localhost/api/mobile/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: "TestPassword1!" }) }));
  return (await res.json()).token as string;
}
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe("profile pictures: own picture only, validated, stored in the database", () => {
  it("a student uploads, changes and removes their picture on the web; it is re-encoded and versioned", async () => {
    const w = await makeWorld();
    await signInAs(w.a.MEMBER.id);
    let res = await webUpload(multipart("http://localhost/api/profile/photo", file(await img("jpeg"))));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: 1 });
    let row = (await photoRow(w.a.MEMBER.id))!;
    expect(row).toMatchObject({ mime: "image/webp", width: 512, height: 512, version: 1 });
    const meta = await sharp(Buffer.from(row.content)).metadata();
    expect([meta.format, meta.width, meta.height, meta.exif]).toEqual(["webp", 512, 512, undefined]); // square, metadata removed

    res = await webUpload(multipart("http://localhost/api/profile/photo", file(await img("png", 300, 900), "x.png", "image/png")));
    expect(await res.json()).toEqual({ ok: true, version: 2 });
    row = (await photoRow(w.a.MEMBER.id))!;
    expect(await db.profilePhoto.count()).toBe(1); // replaced, not added: nothing left behind

    const shown = await webPhoto(new Request(`http://localhost/users/${w.a.MEMBER.id}/photo?v=2`), ctx({ id: w.a.MEMBER.id }));
    expect([shown.status, shown.headers.get("content-type"), shown.headers.get("cache-control")]).toEqual([200, "image/webp", "private, max-age=86400"]);
    expect(Buffer.from(await shown.arrayBuffer()).equals(Buffer.from(row.content))).toBe(true);

    expect((await webRemove(new Request("http://localhost/api/profile/photo", { method: "DELETE" }))).status).toBe(200);
    expect(await photoRow(w.a.MEMBER.id)).toBeNull();
    expect((await webRemove(new Request("http://localhost/api/profile/photo", { method: "DELETE" }))).status).toBe(422);
    expect((await webPhoto(new Request(`http://localhost/users/${w.a.MEMBER.id}/photo`), ctx({ id: w.a.MEMBER.id }))).status).toBe(404);
    expect(await db.auditLog.count({ where: { actorUserId: w.a.MEMBER.id, action: { in: ["profile.photo_set", "profile.photo_remove"] } } })).toBe(3);
  });

  it("every position manages its own picture; System Admin cannot set or remove any picture", async () => {
    const w = await makeWorld();
    const jpg = await img("jpeg");
    for (const id of [w.a.PRESIDENT.id, w.a.SECRETARY.id, w.a.TREASURER.id, w.a.AUDITOR.id, w.a.OFFICER.id, w.a.ADVISER.id, w.nobody.id]) {
      await signInAs(id);
      expect((await webUpload(multipart("http://localhost/api/profile/photo", file(jpg)))).status, id).toBe(200);
      expect(await photoRow(id), id).not.toBeNull();
    }
    await signInAs(w.admin.id);
    const res = await webUpload(multipart("http://localhost/api/profile/photo", file(jpg)));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/System administrator/);
    expect(await photoRow(w.admin.id)).toBeNull();
    // the account forms no longer take a picture for someone else
    const fd = form({ accountType: "ACCOUNT_ONLY", firstName: "New", lastName: "Person", email: "new.person@x.test" });
    fd.set("photo", file(jpg));
    await createAccountAction({}, fd);
    const created = await db.user.findUniqueOrThrow({ where: { email: "new.person@x.test" } });
    expect(await photoRow(created.id)).toBeNull();
  });

  it("nobody can change another person's picture: the account always comes from the sign-in", async () => {
    const w = await makeWorld();
    await signInAs(w.a.MEMBER.id);
    // a user id smuggled into the request is ignored; only the signed-in member's own picture changes
    await webUpload(multipart(`http://localhost/api/profile/photo?userId=${w.a.OFFICER.id}`, file(await img("jpeg"))));
    expect(await photoRow(w.a.MEMBER.id)).not.toBeNull();
    expect(await photoRow(w.a.OFFICER.id)).toBeNull();
    // cross-site posts are refused, and signed-out calls too
    expect((await webUpload(multipart("http://localhost/api/profile/photo", file(await img("jpeg")), { origin: "https://evil.example" }))).status).toBe(403);
    authState.user = null;
    expect((await webUpload(multipart("http://localhost/api/profile/photo", file(await img("jpeg"))))).status).toBe(401);
  });

  it("refuses wrong formats, renamed files, damaged images, oversized uploads and decompression bombs", async () => {
    expect(await processPhoto(Buffer.from("GIF89a....."))).toMatchObject({ ok: false, error: expect.stringMatching(/JPEG, PNG or WebP/) });
    expect(await processPhoto(Buffer.from("#!/bin/sh\necho hacked"))).toMatchObject({ ok: false });
    expect(await processPhoto(Buffer.alloc(0))).toMatchObject({ ok: false });
    const good = await img("jpeg");
    expect(await processPhoto(Buffer.concat([good.subarray(0, 40)]))).toMatchObject({ ok: false, error: expect.stringMatching(/could not be read/) }); // truncated
    expect(await processPhoto(Buffer.alloc(5 * 1024 * 1024 + 1, 0xff))).toMatchObject({ ok: false, error: expect.stringMatching(/under 5 MB/) });
    // a PNG header claiming 50,000 x 50,000 pixels
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(25); ihdr.writeUInt32BE(13, 0); ihdr.write("IHDR", 4); ihdr.writeUInt32BE(50000, 8); ihdr.writeUInt32BE(50000, 12); ihdr[16] = 8; ihdr[17] = 2;
    expect(await processPhoto(Buffer.concat([sig, ihdr, Buffer.alloc(64)]))).toMatchObject({ ok: false });
    for (const f of ["jpeg", "png", "webp"] as const) expect(await processPhoto(await img(f)), f).toMatchObject({ ok: true, width: 512, height: 512 });

    const w = await makeWorld();
    await signInAs(w.a.MEMBER.id);
    const renamed = await webUpload(multipart("http://localhost/api/profile/photo", file(Buffer.from("<html>not an image</html>"), "photo.jpg", "image/jpeg")));
    expect(renamed.status).toBe(422);
    expect(await photoRow(w.a.MEMBER.id)).toBeNull();
  });

  it("the app uploads, shows and removes the person's own picture", async () => {
    const w = await makeWorld();
    const t = await tokenFor(w.a.OFFICER.id);
    expect((await (await appMe(new Request("http://localhost/api/mobile/me", { headers: bearer(t) }), ctx({}))).json()).photoVersion).toBeNull();
    const up = await appUpload(multipart("http://localhost/api/mobile/me/photo", file(await img("webp"), "a.webp", "image/webp"), bearer(t)), ctx({}));
    expect(await up.json()).toEqual({ ok: true, version: 1 });
    expect((await (await appMe(new Request("http://localhost/api/mobile/me", { headers: bearer(t) }), ctx({}))).json()).photoVersion).toBe(1);
    const mine = await appMine(new Request("http://localhost/api/mobile/me/photo?v=1", { headers: bearer(t) }), ctx({}));
    expect([mine.status, mine.headers.get("content-type")]).toEqual([200, "image/webp"]);
    expect((await appUpload(multipart("http://localhost/api/mobile/me/photo", file(Buffer.from("nope"), "a.png", "image/png"), bearer(t)), ctx({}))).status).toBe(422);
    expect((await appRemove(new Request("http://localhost/api/mobile/me/photo", { method: "DELETE", headers: bearer(t) }), ctx({}))).status).toBe(200);
    expect(await photoRow(w.a.OFFICER.id)).toBeNull();
  });

  it("who can see a picture: the person, System Admin, and officers with roster access in a shared organization", async () => {
    const w = await makeWorld();
    await signInAs(w.a.MEMBER.id);
    await webUpload(multipart("http://localhost/api/profile/photo", file(await img("jpeg"))));
    const see = async (viewer: string) => { await signInAs(viewer); return (await webPhoto(new Request(`http://localhost/users/${w.a.MEMBER.id}/photo`), ctx({ id: w.a.MEMBER.id }))).status; };
    for (const id of [w.a.MEMBER.id, w.admin.id, w.a.PRESIDENT.id, w.a.SECRETARY.id, w.a.OFFICER.id, w.a.TREASURER.id, w.a.AUDITOR.id, w.a.ADVISER.id]) expect(await see(id), id).toBe(200);
    for (const id of [w.presidentB.id, w.memberB.id, w.nobody.id]) expect(await see(id), id).toBe(404);
    const sec = await tokenFor(w.a.SECRETARY.id);
    expect((await appMemberPhoto(new Request("http://x", { headers: bearer(sec) }), ctx({ orgId: w.orgA.id, userId: w.a.MEMBER.id }))).status).toBe(200);
    expect((await appMemberPhoto(new Request("http://x", { headers: bearer(await tokenFor(w.memberB.id)) }), ctx({ orgId: w.orgB.id, userId: w.a.MEMBER.id }))).status).toBe(403);
  });

  it("RFID attendance shows the current picture, and changing it never touches the card or attendance", async () => {
    const w = await makeWorld();
    await db.studentProfile.create({ data: { userId: w.a.MEMBER.id, studentNumber: "2026-0001", rfidUid: "04A1B2C3" } });
    const reg = await registerDevice(w.a.PRESIDENT.id, w.orgA.id, "Gate");
    if (!reg.ok) throw new Error("device");
    const tap = () => rfidRoute(new Request("http://x/api/rfid/scan", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${reg.key}` }, body: JSON.stringify({ cardUid: "04A1B2C3" }) }));
    const ev = await makeEvent(w.orgA.id);
    const secretary = await auth(w.a.SECRETARY.id);

    await tap();
    expect((await liveSession(secretary, ev.session.id))!.checkIns[0]).toMatchObject({ hasPhoto: false, photoVersion: null }); // initials avatar

    await signInAs(w.a.MEMBER.id);
    await webUpload(multipart("http://localhost/api/profile/photo", file(await img("jpeg"))));
    expect((await liveSession(secretary, ev.session.id))!.checkIns[0]).toMatchObject({ hasPhoto: true, photoVersion: 1 });
    const before = await db.attendanceRecord.findMany({ orderBy: { id: "asc" } });
    await webUpload(multipart("http://localhost/api/profile/photo", file(await img("png"), "b.png", "image/png")));
    expect((await liveSession(secretary, ev.session.id))!.checkIns[0]).toMatchObject({ photoVersion: 2 }); // the new picture, no re-registration

    expect((await db.studentProfile.findUniqueOrThrow({ where: { userId: w.a.MEMBER.id } })).rfidUid).toBe("04A1B2C3");
    expect(await db.attendanceRecord.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    // the card still checks in for the next session
    const ev2 = await makeEvent(w.orgA.id, { title: "Second" });
    await db.eventSession.update({ where: { id: ev.session.id }, data: { active: false } });
    expect(await (await tap()).json()).toMatchObject({ ok: true, status: "PRESENT" });
    expect((await liveSession(secretary, ev2.session.id))!.checkIns[0]).toMatchObject({ userId: w.a.MEMBER.id, photoVersion: 2 });
  });

  it("pictures are kept in the database, so a restart or redeploy does not lose them", async () => {
    const w = await makeWorld();
    await signInAs(w.a.MEMBER.id);
    await webUpload(multipart("http://localhost/api/profile/photo", file(await img("jpeg"))));
    // nothing is written to the server's disk: the bytes are in profile_photos and read back from there
    const stored = (await db.$queryRaw<{ n: bigint }[]>`SELECT octet_length(content)::bigint AS n FROM profile_photos WHERE user_id = ${w.a.MEMBER.id}::uuid`)[0];
    expect(Number(stored.n)).toBeGreaterThan(0);
    const res = await webPhoto(new Request(`http://localhost/users/${w.a.MEMBER.id}/photo`), ctx({ id: w.a.MEMBER.id }));
    expect(res.status).toBe(200);
  });
});
