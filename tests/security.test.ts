import { afterEach, describe, expect, it } from "vitest";
import { attemptLogin } from "@/features/auth/login";
import { activateAccount, createSetupLink } from "@/features/auth/activation";
import { changePasswordAction } from "@/features/settings/actions";
import { createAccountAction } from "@/features/users/actions";
import { POST as mobileLogin } from "@/app/api/mobile/login/route";
import { weakPasswordReason } from "@/lib/security/password-policy";
import nextConfig from "../next.config";
import { db, form, signInAs, TEST_PASSWORD } from "./helpers/db";
import { makeWorld } from "./helpers/world";

afterEach(() => { delete process.env.DEFAULT_ACCOUNT_PASSWORD; });

const mobile = (email: string, password: string, ip = "203.0.113.7") =>
  mobileLogin(new Request("http://x/api/mobile/login", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify({ email, password }) }));

describe("sign-in abuse protection", () => {
  it("blocks a network address after 30 failed sign-ins in 15 minutes, across different accounts, without blocking other addresses", async () => {
    const w = await makeWorld();
    const victim = await db.user.findUniqueOrThrow({ where: { id: w.a.MEMBER.id } });
    // password spraying: many emails, one guess each, from one address
    for (let i = 0; i < 30; i++) expect((await attemptLogin(`nobody${i}@test.local`, "Password123!", "198.51.100.9")).ok).toBe(false);
    // now even the correct password is refused from that address...
    expect(await attemptLogin(victim.email, TEST_PASSWORD, "198.51.100.9")).toMatchObject({ ok: false, error: expect.stringMatching(/this network/) });
    // ...but the same person can still sign in from elsewhere (the account itself was never locked)
    expect((await attemptLogin(victim.email, TEST_PASSWORD, "198.51.100.10")).ok).toBe(true);
    // and the mobile endpoint shares the same counter and answers 429
    expect((await mobile(victim.email, TEST_PASSWORD, "198.51.100.9")).status).toBe(429);
    expect(await db.auditLog.count({ where: { action: "auth.login_rate_limited" } })).toBeGreaterThan(0);
  });

  it("successful sign-ins do not count, so a busy campus network is not blocked", async () => {
    const w = await makeWorld();
    const email = (await db.user.findUniqueOrThrow({ where: { id: w.a.MEMBER.id } })).email;
    for (let i = 0; i < 40; i++) expect((await attemptLogin(email, TEST_PASSWORD, "192.0.2.50")).ok).toBe(true);
  });

  it("a single account still locks after 5 wrong passwords, and errors never reveal whether the email exists", async () => {
    const w = await makeWorld();
    const email = (await db.user.findUniqueOrThrow({ where: { id: w.a.MEMBER.id } })).email;
    const unknown = await attemptLogin("no-such-user@test.local", "whatever-123", "192.0.2.1");
    const wrong = await attemptLogin(email, "whatever-123", "192.0.2.1");
    expect(unknown).toEqual(wrong); // identical response
    for (let i = 0; i < 4; i++) await attemptLogin(email, "whatever-123", "192.0.2.1");
    expect(await attemptLogin(email, TEST_PASSWORD, "192.0.2.2")).toMatchObject({ ok: false, error: expect.stringMatching(/Too many failed attempts/) });
  });
});

describe("password rules", () => {
  async function defaultAccount() {
    process.env.DEFAULT_ACCOUNT_PASSWORD = "password";
    const w = await makeWorld();
    await signInAs(w.admin.id);
    await createAccountAction({}, form({ accountType: "ACCOUNT_ONLY", firstName: "Cy", lastName: "Lim", email: "cy.lim@x.test" }));
    const u = await db.user.findUniqueOrThrow({ where: { email: "cy.lim@x.test" } });
    return { w, u };
  }

  it("changing a password refuses weak choices", async () => {
    const { u } = await defaultAccount();
    await signInAs(u.id);
    const change = (password: string, current = "password") => changePasswordAction({}, form({ current, password, confirm: password }));
    expect((await change("password1234")).fieldErrors?.password).toMatch(/shared starting password/);
    expect((await change("qwertyuiop")).fieldErrors?.password).toMatch(/too common/);
    expect((await change("cy.lim-is-me-2026")).fieldErrors?.password).toMatch(/email/);
    expect((await change("short")).fieldErrors?.password).toMatch(/10 characters/);
    expect((await change("Green-Mango-Tide-48", "wrong")).fieldErrors?.current).toMatch(/incorrect/);
    expect((await change("Green-Mango-Tide-48")).success).toBeDefined();
    expect((await attemptLogin(u.email, "Green-Mango-Tide-48", "192.0.2.3")).ok).toBe(true);
    expect((await attemptLogin(u.email, "password", "192.0.2.3")).ok).toBe(false);
  });

  it("account setup links refuse weak passwords too", async () => {
    const w = await makeWorld();
    const link = await createSetupLink(w.admin.id, w.a.MEMBER.id);
    if (!link.ok) throw new Error(link.error);
    const token = link.path.split("/").pop()!;
    expect(await activateAccount(token, "password123")).toMatchObject({ ok: false, error: expect.stringMatching(/too common/) });
    expect(await activateAccount(token, "Quiet-River-Lamp-77")).toEqual({ ok: true });
  });

  it("weak-password rules", () => {
    process.env.DEFAULT_ACCOUNT_PASSWORD = "password";
    expect(weakPasswordReason("Password2026!", null, "a@b.c")).toMatch(/shared starting password/);
    expect(weakPasswordReason("1111111111", null, "a@b.c")).toMatch(/too common/);
    expect(weakPasswordReason("Quiet-River-Lamp-77", null, "juan.delacruz@bisu.edu.ph")).toBeNull();
  });
});

describe("security headers", () => {
  it("sends CSP, anti-framing, HSTS, nosniff and a restrictive permissions policy on every route", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source.startsWith("/((?!"))!.headers;
    const file = rules.find((r) => r.source === "/fees/proof/:id")!.headers;
    expect(file.find((x) => x.key === "Content-Security-Policy")!.value).toMatch(/^sandbox/);
    const h = Object.fromEntries(all.map((x) => [x.key, x.value]));
    expect(h["Content-Security-Policy"]).toMatch(/frame-ancestors 'none'/);
    expect(h["Content-Security-Policy"]).toMatch(/object-src 'none'/);
    expect(h["Content-Security-Policy"]).toMatch(/default-src 'self'/);
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{7,}/);
    expect(h["Permissions-Policy"]).toMatch(/geolocation=\(\)/);
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
