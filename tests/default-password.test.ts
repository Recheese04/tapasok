import { afterEach, describe, expect, it } from "vitest";
import { loginAction } from "@/features/auth/actions";
import { importStudentsAction } from "@/features/students/actions";
import { createAccountAction } from "@/features/users/actions";
import { db, form, signInAs } from "./helpers/db";
import { makeWorld } from "./helpers/world";

// DEFAULT_ACCOUNT_PASSWORD is for test installations. Unset (the default) means the secure setup-link flow.
afterEach(() => { delete process.env.DEFAULT_ACCOUNT_PASSWORD; });

const staff = (email: string) => form({ accountType: "STAFF", firstName: "Ben", lastName: "Reyes", email, employeeId: `E-${email.charCodeAt(0)}` });

describe("optional shared default password for new accounts", () => {
  it("is off by default: accounts are invited with a one-time setup link and cannot sign in yet", async () => {
    const w = await makeWorld();
    await signInAs(w.admin.id);
    const res = await createAccountAction({}, staff("a@x.test"));
    expect(res.setupPath).toMatch(/^\/activate\//);
    expect(res.initialPassword).toBeUndefined();
    expect(await db.user.findUniqueOrThrow({ where: { email: "a@x.test" } })).toMatchObject({ status: "INVITED" });
    expect((await loginAction({}, form({ email: "a@x.test", password: "password" }))).error).toBe("Invalid email or password.");
  });

  it("when set, created accounts are active with that password and no setup link; they can sign in", async () => {
    process.env.DEFAULT_ACCOUNT_PASSWORD = "password";
    const w = await makeWorld();
    await signInAs(w.admin.id);
    for (const [i, f] of [staff("b@x.test"), form({ accountType: "ACCOUNT_ONLY", firstName: "Cy", lastName: "Lim", email: "c@x.test" }), form({ accountType: "STUDENT", firstName: "Ana", lastName: "Cruz", email: "d@x.test", studentNumber: "2026-1" })].entries()) {
      const res = await createAccountAction({}, f);
      expect(res.error, String(i)).toBeUndefined();
      expect(res).toMatchObject({ initialPassword: "password" });
      expect(res.setupPath).toBeUndefined();
    }
    const u = await db.user.findUniqueOrThrow({ where: { email: "b@x.test" }, include: { activationTokens: true } });
    expect(u).toMatchObject({ status: "ACTIVE", systemRole: "USER" });
    expect(u.activationTokens).toHaveLength(0);
    expect(u.passwordHash).not.toContain("password"); // only a hash is stored
    await expect(loginAction({}, form({ email: "b@x.test", password: "password" }))).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect((await loginAction({}, form({ email: "b@x.test", password: "wrong-password" }))).error).toBe("Invalid email or password.");
  });

  it("CSV import creates active accounts with the default password and says so; the check step creates nothing", async () => {
    process.env.DEFAULT_ACCOUNT_PASSWORD = "password";
    const w = await makeWorld();
    await signInAs(w.admin.id);
    const run = (intent: string) => {
      const fd = form({ intent });
      fd.set("file", new File(["first_name,last_name,email,student_number\nAna,Cruz,ana@x.test,2026-1\nBen,Lim,ben@x.test,2026-2"], "p.csv", { type: "text/csv" }));
      return importStudentsAction({}, fd);
    };
    const checked = await run("check");
    expect(checked.summary).toMatchObject({ dryRun: true, created: 2 });
    expect(await db.user.count({ where: { email: { endsWith: "@x.test" } } })).toBe(0);
    const done = await run("import");
    expect(done.summary).toMatchObject({ dryRun: false, created: 2, failed: 0, initialPassword: "password" });
    expect(done.summary?.links).toEqual([]);
    expect(await db.user.count({ where: { email: { endsWith: "@x.test" }, status: "ACTIVE", systemRole: "USER" } })).toBe(2);
    await expect(loginAction({}, form({ email: "ana@x.test", password: "password" }))).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });
});
