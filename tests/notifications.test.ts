import { describe, expect, it } from "vitest";
import { GET as openRoute } from "@/app/(dashboard)/notifications/[id]/route";
import { POST as login } from "@/app/api/mobile/login/route";
import { GET as appList, POST as appPost } from "@/app/api/mobile/notifications/route";
import { clearAllNotificationsAction, clearNotificationAction } from "@/features/notifications/actions";
import { safeHref } from "@/features/notifications/service";
import { authState } from "./helpers/auth-state";
import { db, form, makeUser, signInAs } from "./helpers/db";

const open = (id: string) => openRoute(new Request(`http://localhost/notifications/${id}`), { params: Promise.resolve({ id }) });
const note = (userId: string, href: string | null = "/join") => db.notification.create({ data: { userId, kind: "join_request", title: "Your request was approved", href } });
async function tokenFor(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const res = await login(new Request("http://localhost/api/mobile/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: "TestPassword1!" }) }));
  return (await res.json()).token as string;
}
const app = (t: string, body?: unknown) => new Request("http://localhost/api/mobile/notifications", { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

describe("notifications: opening marks read; people can clear their own", () => {
  it("opening a notification on the web marks it read and follows its link", async () => {
    const me = await makeUser();
    const n = await note(me.id, "/join");
    await signInAs(me.id);
    const res = await open(n.id);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/join");
    expect((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).not.toBeNull();
    // Without a link it lands back on the list (still marked read).
    const plain = await note(me.id, null);
    expect(new URL((await open(plain.id)).headers.get("location")!).pathname).toBe("/notifications");
  });

  it("never touches someone else's notification and never redirects off the site", async () => {
    const me = await makeUser(), other = await makeUser();
    const theirs = await note(other.id);
    await signInAs(me.id);
    expect(new URL((await open(theirs.id)).headers.get("location")!).pathname).toBe("/notifications");
    expect((await db.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", ""]) expect(safeHref(bad), bad).toBe("/notifications");
    expect(safeHref("/announcements")).toBe("/announcements");
    authState.user = null;
    expect(new URL((await open(theirs.id)).headers.get("location")!).pathname).toBe("/login");
  });

  it("clearing removes only the person's own notifications", async () => {
    const me = await makeUser(), other = await makeUser();
    const a = await note(me.id), b = await note(me.id), theirs = await note(other.id);
    await signInAs(me.id);
    await clearNotificationAction(form({ id: a.id }));
    await clearNotificationAction(form({ id: theirs.id }));
    expect((await db.notification.findMany({ select: { id: true } })).map((x) => x.id).sort()).toEqual([b.id, theirs.id].sort());
    await clearAllNotificationsAction();
    expect(await db.notification.count({ where: { userId: me.id } })).toBe(0);
    expect(await db.notification.count({ where: { userId: other.id } })).toBe(1);
  });

  it("the app marks one read, clears one, and clears all", async () => {
    const me = await makeUser(), other = await makeUser();
    const a = await note(me.id), b = await note(me.id), theirs = await note(other.id);
    const t = await tokenFor(me.id);
    expect((await appPost(app(t, { action: "read", id: a.id }), {} as never)).status).toBe(200);
    expect((await db.notification.findUniqueOrThrow({ where: { id: a.id } })).readAt).not.toBeNull();
    expect((await db.notification.findUniqueOrThrow({ where: { id: b.id } })).readAt).toBeNull();
    await appPost(app(t, { action: "clear", id: b.id }), {} as never);
    await appPost(app(t, { action: "clear", id: theirs.id }), {} as never);
    expect((await (await appList(app(t), {} as never)).json()).notifications.map((n: { id: string; read: boolean }) => [n.id, n.read])).toEqual([[a.id, true]]);
    expect(await db.notification.count({ where: { id: theirs.id } })).toBe(1);
    expect((await appPost(app(t, { action: "clear" }), {} as never)).status).toBe(400);
    await appPost(app(t, { action: "clear_all" }), {} as never);
    expect(await db.notification.count({ where: { userId: me.id } })).toBe(0);
  });
});
