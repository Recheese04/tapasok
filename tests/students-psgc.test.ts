import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { clearPsgcCache, validateAddress } from "@/lib/psgc";
import { GET as psgcRoute } from "@/app/api/psgc/[kind]/route";
import { createStudentAction, generateSetupLinkAction, importStudentsAction, updateOwnProfileAction, updateStudentAction } from "@/features/students/actions";
import { activateAccountAction } from "@/features/auth/activation-actions";
import { lookupActivation } from "@/features/auth/activation";
import { importStudents } from "@/features/students/service";
import { loginAction } from "@/features/auth/actions";
import { csvCell, parseCsv } from "@/lib/csv";
import { ForbiddenError } from "@/lib/permissions";
import { db, form, makeUser, signInAs } from "./helpers/db";
import { makeWorld } from "./helpers/world";
import { authState } from "./helpers/auth-state";

// ---- PSGC fixtures mirroring the real API's response shape (verified against https://psgc.gitlab.io/api/)
const TABLE: Record<string, unknown[]> = {
  "/regions/": [{ code: "130000000", name: "NCR" }, { code: "030000000", name: "Central Luzon" }],
  "/regions/030000000/provinces/": [{ code: "035400000", name: "Pampanga" }],
  "/regions/130000000/provinces/": [],
  "/provinces/035400000/cities-municipalities/": [{ code: "035408000", name: "Candaba" }],
  "/regions/130000000/cities-municipalities/": [{ code: "133900000", name: "City of Manila" }],
  "/cities-municipalities/035408000/barangays/": [{ code: "035408001", name: "Balantacan" }, { code: "035408002", name: "Bancal Sinubli" }],
  "/cities-municipalities/133900000/barangays/": [{ code: "133901001", name: "Barangay 1" }],
};
const PAMPANGA = { regionCode: "030000000", provinceCode: "035400000", cityCode: "035408000", barangayCode: "035408001" };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearPsgcCache();
  fetchMock = vi.fn(async (url: string) => {
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body = TABLE[path];
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response("nf", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("PSGC integration", () => {
  it("validates the whole chain and returns canonical names, never trusting client text", async () => {
    const r = await validateAddress(PAMPANGA);
    expect(r).toEqual({ ok: true, address: expect.objectContaining({ regionName: "Central Luzon", provinceName: "Pampanga", cityName: "Candaba", barangayName: "Balantacan" }) });
  });

  it("supports regions without provinces (NCR)", async () => {
    const r = await validateAddress({ regionCode: "130000000", cityCode: "133900000", barangayCode: "133901001" });
    expect(r).toMatchObject({ ok: true, address: { provinceCode: null, cityName: "City of Manila" } });
    expect(await validateAddress({ regionCode: "130000000", provinceCode: "035400000", cityCode: "133900000", barangayCode: "133901001" })).toMatchObject({ ok: false, field: "provinceCode" });
  });

  it("rejects mismatched chains, missing and malformed codes", async () => {
    expect(await validateAddress({ ...PAMPANGA, barangayCode: "133901001" })).toMatchObject({ ok: false, field: "barangayCode" }); // barangay of another city
    expect(await validateAddress({ ...PAMPANGA, cityCode: "133900000" })).toMatchObject({ ok: false, field: "cityCode" });
    expect(await validateAddress({ ...PAMPANGA, regionCode: "999999999" })).toMatchObject({ ok: false, field: "regionCode" });
    expect(await validateAddress({ ...PAMPANGA, provinceCode: "" })).toMatchObject({ ok: false, field: "provinceCode" });
    expect(await validateAddress({ ...PAMPANGA, barangayCode: "abc" })).toMatchObject({ ok: false, field: "barangayCode" });
    expect(await validateAddress({ ...PAMPANGA, cityCode: "../../etc" })).toMatchObject({ ok: false, field: "cityCode" });
    expect(await validateAddress({ regionCode: "030000000" })).toMatchObject({ ok: false });
    expect(await validateAddress({})).toEqual({ ok: true, address: null });
  });

  it("caches reference data instead of re-downloading it", async () => {
    await validateAddress(PAMPANGA);
    const calls = fetchMock.mock.calls.length;
    await validateAddress(PAMPANGA);
    await validateAddress(PAMPANGA);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("fails safely when the API is down and sends only public codes to it", async () => {
    clearPsgcCache();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));
    expect(await validateAddress(PAMPANGA)).toMatchObject({ ok: false, error: expect.stringMatching(/unavailable/i) });
    for (const [url] of fetchMock.mock.calls) expect(String(url)).toMatch(/^https:\/\/psgc\.gitlab\.io\/api\//);
  });

  it("proxy route requires sign-in, rejects bad parameters and returns lists", async () => {
    const call = (kind: string, qs = "") => psgcRoute(new Request(`http://x/api/psgc/${kind}${qs}`), { params: Promise.resolve({ kind }) });
    authState.user = null;
    expect((await call("regions")).status).toBe(401);
    const w = await makeWorld();
    await signInAs(w.a.MEMBER.id);
    expect((await call("regions")).status).toBe(200);
    expect(await (await call("provinces", "?region=030000000")).json()).toEqual([{ code: "035400000", name: "Pampanga" }]);
    expect((await call("provinces", "?region=abc")).status).toBe(400);
    expect((await call("barangays", "?city=../x")).status).toBe(400);
    expect((await call("nope")).status).toBe(400);
  });
});

const studentForm = (over: Record<string, string> = {}) =>
  form({ studentNumber: "2024-0001", firstName: "Ana", lastName: "Cruz", email: "ana@example.test", middleName: "", programId: "", yearLevel: "", contactNumber: "09171234567", streetAddress: "12 Rizal St", ...PAMPANGA, ...over });

describe("student management", () => {
  it("is admin-only", async () => {
    const w = await makeWorld();
    for (const id of [w.a.PRESIDENT.id, w.a.TREASURER.id, w.a.OFFICER.id, w.a.ADVISER.id, w.a.MEMBER.id]) {
      await signInAs(id);
      await expect(createStudentAction({}, studentForm())).rejects.toBeInstanceOf(ForbiddenError);
      await expect(importStudentsAction({}, form({}))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(generateSetupLinkAction({}, form({ userId: w.nobody.id }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await db.studentProfile.count()).toBe(0);
  });

  it("creates a password-less INVITED student with canonical address, no role and a hashed single-use setup link", async () => {
    const w = await makeWorld();
    await signInAs(w.admin.id);
    const res = await createStudentAction({}, studentForm());
    expect(res.setupPath).toMatch(/^\/activate\/[\w-]{40,}$/);

    const user = await db.user.findUniqueOrThrow({ where: { email: "ana@example.test" }, include: { studentProfile: true, memberships: true, activationTokens: true } });
    expect(user.status).toBe("INVITED");
    expect(user.systemRole).toBe("USER");
    expect(user.memberships).toHaveLength(0);
    expect(user.studentProfile).toMatchObject({ studentNumber: "2024-0001", barangayName: "Balantacan", cityName: "Candaba", provinceName: "Pampanga", regionName: "Central Luzon" });
    expect(user.activationTokens).toHaveLength(1);
    expect(res.setupPath!.includes(user.activationTokens[0].tokenHash)).toBe(false);

    // cannot log in before setting a password
    expect((await loginAction({}, form({ email: "ana@example.test", password: "anything-at-all" }))).error).toBe("Invalid email or password.");
  });

  it("rejects duplicates and invalid addresses", async () => {
    const w = await makeWorld();
    await signInAs(w.admin.id);
    await createStudentAction({}, studentForm());
    expect((await createStudentAction({}, studentForm({ email: "other@example.test" }))).fieldErrors?.studentNumber).toMatch(/already exists/);
    expect((await createStudentAction({}, studentForm({ studentNumber: "2024-0002", email: "ANA@example.test" }))).fieldErrors?.email).toMatch(/already exists/);
    expect((await createStudentAction({}, studentForm({ studentNumber: "2024-0003", email: "c@example.test", barangayCode: "133901001" }))).error).toMatch(/barangay/i);
    expect((await createStudentAction({}, studentForm({ studentNumber: "x", email: "d@example.test" }))).fieldErrors?.studentNumber).toBeTruthy();
    expect(await db.studentProfile.count()).toBe(1);
  });

  it("completes setup once: sets the password, activates, ends sessions, and the link cannot be reused", async () => {
    const w = await makeWorld();
    await signInAs(w.admin.id);
    const { setupPath } = await createStudentAction({}, studentForm());
    const token = setupPath!.split("/").pop()!;
    expect(await lookupActivation(token)).toEqual({ firstName: "Ana" });

    expect((await activateAccountAction({}, form({ token, password: "short", confirm: "short" }))).fieldErrors?.password).toBeTruthy();
    expect((await activateAccountAction({}, form({ token, password: "LongEnoughPass1", confirm: "different12345" }))).fieldErrors?.confirm).toBeTruthy();

    await expect(activateAccountAction({}, form({ token, password: "LongEnoughPass1", confirm: "LongEnoughPass1" }))).rejects.toThrow("NEXT_REDIRECT:/login?activated=1");
    const user = await db.user.findUniqueOrThrow({ where: { email: "ana@example.test" } });
    expect(user.status).toBe("ACTIVE");
    expect(await bcrypt.compare("LongEnoughPass1", user.passwordHash)).toBe(true);
    expect(await lookupActivation(token)).toBeNull();
    expect((await activateAccountAction({}, form({ token, password: "AnotherPass123", confirm: "AnotherPass123" }))).error).toMatch(/invalid or has expired/);
    await expect(loginAction({}, form({ email: "ana@example.test", password: "LongEnoughPass1" }))).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  it("rejects expired links and concurrent double use", async () => {
    const w = await makeWorld();
    await signInAs(w.admin.id);
    const { setupPath } = await createStudentAction({}, studentForm());
    const token = setupPath!.split("/").pop()!;
    const fd = () => form({ token, password: "LongEnoughPass1", confirm: "LongEnoughPass1" });
    const outcomes = await Promise.all([activateAccountAction({}, fd()).catch((e: Error) => e.message), activateAccountAction({}, fd()).catch((e: Error) => e.message)]);
    expect(outcomes.filter((o) => typeof o === "string" && o.startsWith("NEXT_REDIRECT"))).toHaveLength(1);

    const w2 = await createStudentAction({}, studentForm({ studentNumber: "2024-0009", email: "z@example.test" }));
    await db.activationToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await lookupActivation(w2.setupPath!.split("/").pop()!)).toBeNull();
  });

  it("lets admins issue setup links for existing users, but not for deactivated ones", async () => {
    const w = await makeWorld();
    await signInAs(w.admin.id);
    expect((await generateSetupLinkAction({}, form({ userId: w.nobody.id }))).setupPath).toBeTruthy();
    await db.user.update({ where: { id: w.nobody.id }, data: { status: "DISABLED" } });
    expect((await generateSetupLinkAction({}, form({ userId: w.nobody.id }))).error).toBeTruthy();
  });

  it("lets a student edit only their own contact details and address", async () => {
    const w = await makeWorld();
    await signInAs(w.admin.id);
    await createStudentAction({}, studentForm());
    const stu = await db.user.findUniqueOrThrow({ where: { email: "ana@example.test" } });
    await db.user.update({ where: { id: stu.id }, data: { status: "ACTIVE" } });
    await signInAs(stu.id);
    const res = await updateOwnProfileAction({}, form({ studentNumber: "HACKED-1", firstName: "Hacker", contactNumber: "09999999999", streetAddress: "New St", ...PAMPANGA }));
    expect(res.success).toBeTruthy();
    const p = await db.studentProfile.findUniqueOrThrow({ where: { userId: stu.id } });
    expect(p.studentNumber).toBe("2024-0001");
    expect(p.contactNumber).toBe("09999999999");
    expect((await db.user.findUniqueOrThrow({ where: { id: stu.id } })).firstName).toBe("Ana");
    // and cannot use the admin update action
    await expect(updateStudentAction({}, studentForm({ userId: stu.id }))).rejects.toBeInstanceOf(ForbiddenError);
    // a user with no student profile gets a clear error
    await signInAs(w.nobody.id);
    expect((await updateOwnProfileAction({}, form({ ...PAMPANGA }))).error).toMatch(/No student profile/);
  });
});

const HEAD = "student_number,first_name,last_name,email,year_level,region_code,province_code,city_code,barangay_code";
const row = (n: number, extra = "") => `2024-${String(n).padStart(4, "0")},First${n},Last${n},s${n}@example.test,${extra || ",030000000,035400000,035408000,035408001"}`;

describe("student CSV import", () => {
  it("imports valid rows as role-less INVITED accounts with hashed one-time links, and never stores passwords", async () => {
    const w = await makeWorld();
    const r = await importStudents(w.admin.id, [HEAD, row(1), row(2)].join("\n"), false);
    expect(r.ok && r.summary).toMatchObject({ total: 2, created: 2, failed: 0 });
    if (!r.ok) throw new Error();
    expect(r.summary.links).toHaveLength(2);
    const users = await db.user.findMany({ where: { email: { endsWith: "@example.test" } }, include: { memberships: true, studentProfile: true, activationTokens: true } });
    for (const u of users) {
      expect(u.status).toBe("INVITED");
      expect(u.systemRole).toBe("USER");
      expect(u.memberships).toHaveLength(0);
      expect(u.studentProfile?.barangayName).toBe("Balantacan");
      for (const l of r.summary.links) expect(l.path.includes(u.activationTokens[0].tokenHash)).toBe(false);
    }
    expect(JSON.stringify(await db.auditLog.findMany())).not.toMatch(/activate\/|password/i);
  });

  it("validates headers and reports row errors without importing the bad rows", async () => {
    const w = await makeWorld();
    expect(await importStudents(w.admin.id, "first_name,last_name\nA,B", false)).toMatchObject({ ok: false, error: expect.stringMatching(/Missing required column/) });
    expect(await importStudents(w.admin.id, "", false)).toMatchObject({ ok: false });
    expect(await importStudents(w.admin.id, HEAD, false)).toMatchObject({ ok: false });

    const csv = [HEAD, row(1), "2024-0002,,Last2,not-an-email,99,,,,", row(3, ",030000000,035400000,035408000,133901001")].join("\n");
    const r = await importStudents(w.admin.id, csv, false);
    if (!r.ok) throw new Error(r.error);
    expect(r.summary).toMatchObject({ total: 3, created: 1, failed: 2 });
    expect(r.summary.errors.map((e) => e.row)).toEqual([3, 4]);
    expect(r.summary.errors[0].message).toMatch(/First name|email|year/i);
    expect(r.summary.errors[1].message).toMatch(/Address.*barangay/i);
    expect(await db.studentProfile.count()).toBe(1);
  });

  it("flags duplicates inside the file and never overwrites existing students", async () => {
    const w = await makeWorld();
    await importStudents(w.admin.id, [HEAD, row(1)].join("\n"), false);
    const before = await db.user.findUniqueOrThrow({ where: { email: "s1@example.test" } });

    const csv = [HEAD, `2024-0001,Changed,Name,s1@example.test,,,,,`, row(5), `2024-0005,Dup,Num,other@example.test,,,,,`, `2024-0006,Dup,Mail,s5@example.test,,,,,`].join("\n");
    const r = await importStudents(w.admin.id, csv, false);
    if (!r.ok) throw new Error(r.error);
    expect(r.summary).toMatchObject({ total: 4, created: 1, failed: 3 });
    expect(r.summary.errors.map((e) => e.message).join("|")).toMatch(/never overwritten|already exists/i);
    expect(r.summary.errors.some((e) => /Duplicate student number/.test(e.message))).toBe(true);
    expect(r.summary.errors.some((e) => /Duplicate email/.test(e.message))).toBe(true);
    const after = await db.user.findUniqueOrThrow({ where: { email: "s1@example.test" } });
    expect(after.firstName).toBe(before.firstName);
  });

  it("is idempotent: importing the same file twice creates nobody the second time", async () => {
    const w = await makeWorld();
    const csv = [HEAD, row(1), row(2)].join("\n");
    await importStudents(w.admin.id, csv, false);
    const again = await importStudents(w.admin.id, csv, false);
    if (!again.ok) throw new Error();
    expect(again.summary).toMatchObject({ created: 0, failed: 2 });
    expect(await db.studentProfile.count()).toBe(2);
  });

  it("ignores role/privilege columns instead of applying them", async () => {
    const w = await makeWorld();
    const csv = `student_number,first_name,last_name,email,role,system_role,organization\n2024-0001,A,B,a@example.test,PRESIDENT,SYSTEM_ADMIN,Org A`;
    const r = await importStudents(w.admin.id, csv, false);
    if (!r.ok) throw new Error(r.error);
    expect(r.summary.ignoredColumns).toEqual(["role", "system_role", "organization"]);
    const u = await db.user.findUniqueOrThrow({ where: { email: "a@example.test" }, include: { memberships: true } });
    expect(u.systemRole).toBe("USER");
    expect(u.memberships).toHaveLength(0);
  });

  it("check-only mode validates without creating anything", async () => {
    const w = await makeWorld();
    const r = await importStudents(w.admin.id, [HEAD, row(1), "bad"].join("\n"), true);
    if (!r.ok) throw new Error();
    expect(r.summary).toMatchObject({ dryRun: true, created: 1, failed: 1, links: [] });
    expect(await db.studentProfile.count()).toBe(0);
  });

  it("enforces upload limits through the action", async () => {
    const w = await makeWorld();
    await signInAs(w.admin.id);
    const send = (file: File, intent = "import") => { const fd = new FormData(); fd.set("file", file); fd.set("intent", intent); return importStudentsAction({}, fd); };
    expect((await send(new File(["x".repeat(1_100_000)], "big.csv"))).error).toMatch(/too large/);
    expect((await send(new File(["a"], "students.exe"))).error).toMatch(/\.csv/);
    expect((await send(new File([[HEAD, row(1)].join("\n")], "ok.csv"))).summary?.created).toBe(1);
  });
});

describe("csv helpers", () => {
  it("parses quotes, commas, newlines and BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"']]);
  });
  it("neutralizes spreadsheet formulas on output", () => {
    for (const s of ["=1+1", "+cmd", "-2", "@SUM(A1)"]) expect(csvCell(s).startsWith("'")).toBe(true);
    expect(csvCell('a"b')).toBe('"a""b"');
  });
});

void makeUser;
