import { describe, expect, it } from "vitest";
import {
  generateJoinCodeAction,
  joinOrganizationAction,
  revokeJoinCodeAction,
} from "@/features/organizations/join-actions";
import {
  createJoinCode,
  formatJoinCode,
  hashJoinCode,
  joinCodeStatus,
  redeemJoinCode,
  REDEEM_MESSAGES,
} from "@/features/organizations/join-codes";
import { getOrganizationForViewer } from "@/features/organizations/queries";
import { ForbiddenError } from "@/lib/permissions";
import { addMembership, db, form, makeOrg, makeUser, signInAs, toAuthUser } from "./helpers/db";

async function orgWithCode(options: { expiresAt?: Date | null; maxUses?: number | null } = {}) {
  const org = await makeOrg();
  const president = await makeUser();
  await addMembership(president.id, org.id, "PRESIDENT");
  const result = await createJoinCode(president.id, org.id, options);
  if (!result.ok) throw new Error(result.error);
  return { org, president, code: result.code };
}

const memberships = (userId: string, organizationId: string) =>
  db.organizationMember.findMany({ where: { userId, organizationId } });

describe("redeeming join codes", () => {
  it("adds the user as a MEMBER, counts the use and audits it", async () => {
    const { org, code } = await orgWithCode();
    const user = await makeUser();

    const res = await redeemJoinCode(user.id, code);
    expect(res).toEqual({ ok: true, organizationId: org.id });

    const rows = await memberships(user.id, org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("MEMBER");
    expect(rows[0].endedAt).toBeNull();
    expect((await db.organizationJoinCode.findFirstOrThrow()).useCount).toBe(1);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "join_code.redeem" } });
    expect(log.actorUserId).toBe(user.id);
    expect(log.targetId).toBe(org.id);
  });

  it("accepts the code in any case and with dashes or spaces", async () => {
    const { code } = await orgWithCode();
    const user = await makeUser();
    const sloppy = formatJoinCode(code).toLowerCase().replace(/-/g, "  ");
    expect((await redeemJoinCode(user.id, sloppy)).ok).toBe(true);
  });

  it("rejects unknown and malformed codes without revealing anything", async () => {
    await orgWithCode();
    const user = await makeUser();
    for (const bad of ["", "ABC", "AAAAAAAAAAAA", "!!!!-????-****", "x".repeat(200)]) {
      expect(await redeemJoinCode(user.id, bad)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(await db.organizationMember.count({ where: { userId: user.id } })).toBe(0);
    for (const msg of Object.values(REDEEM_MESSAGES)) expect(msg).not.toMatch(/Org \d/);
  });

  it("rejects expired codes", async () => {
    const { org, code } = await orgWithCode({ expiresAt: new Date(Date.now() + 60_000) });
    await db.organizationJoinCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const user = await makeUser();
    expect(await redeemJoinCode(user.id, code)).toEqual({ ok: false, reason: "expired" });
    expect(await memberships(user.id, org.id)).toHaveLength(0);
  });

  it("rejects revoked codes", async () => {
    const { org, president, code } = await orgWithCode();
    await signInAs(president.id);
    const state = await revokeJoinCodeAction({}, form({ organizationId: org.id }));
    expect(state.success).toBeTruthy();

    const user = await makeUser();
    expect(await redeemJoinCode(user.id, code)).toEqual({ ok: false, reason: "revoked" });
    expect(await db.auditLog.count({ where: { action: "join_code.revoke" } })).toBe(1);
  });

  it("rejects exhausted codes and does not consume extra uses", async () => {
    const { org, code } = await orgWithCode({ maxUses: 2 });
    const [a, b, c] = [await makeUser(), await makeUser(), await makeUser()];
    expect((await redeemJoinCode(a.id, code)).ok).toBe(true);
    expect((await redeemJoinCode(b.id, code)).ok).toBe(true);
    expect(await redeemJoinCode(c.id, code)).toEqual({ ok: false, reason: "exhausted" });
    expect(await memberships(c.id, org.id)).toHaveLength(0);
    expect((await db.organizationJoinCode.findFirstOrThrow()).useCount).toBe(2);
  });

  it("rejects codes for archived organizations and inactive users", async () => {
    const { org, code } = await orgWithCode();
    const user = await makeUser();
    const disabled = await makeUser({ status: "DISABLED" });
    expect(await redeemJoinCode(disabled.id, code)).toEqual({ ok: false, reason: "inactive" });

    await db.organization.update({ where: { id: org.id }, data: { status: "ARCHIVED" } });
    expect(await redeemJoinCode(user.id, code)).toEqual({ ok: false, reason: "inactive" });
    expect(await db.organizationMember.count({ where: { userId: { in: [user.id, disabled.id] } } })).toBe(0);
  });
});

describe("duplicate memberships and history", () => {
  it("refuses a second active membership and does not consume a use", async () => {
    const { org, code } = await orgWithCode({ maxUses: 5 });
    const user = await makeUser();
    expect((await redeemJoinCode(user.id, code)).ok).toBe(true);
    expect(await redeemJoinCode(user.id, code)).toEqual({ ok: false, reason: "already_member" });
    expect(await memberships(user.id, org.id)).toHaveLength(1);
    expect((await db.organizationJoinCode.findFirstOrThrow()).useCount).toBe(1);
  });

  it("handles the same user submitting twice at once", async () => {
    const { org, code } = await orgWithCode();
    const user = await makeUser();
    const results = await Promise.all([redeemJoinCode(user.id, code), redeemJoinCode(user.id, code)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await memberships(user.id, org.id)).toHaveLength(1);
    expect((await db.organizationJoinCode.findFirstOrThrow()).useCount).toBe(1);
  });

  it("keeps history when a member leaves and allows rejoining", async () => {
    const { org, code } = await orgWithCode();
    const user = await makeUser();
    await redeemJoinCode(user.id, code);
    await db.organizationMember.updateMany({ where: { userId: user.id }, data: { endedAt: new Date() } });

    expect((await redeemJoinCode(user.id, code)).ok).toBe(true);
    const rows = await memberships(user.id, org.id);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.endedAt === null)).toHaveLength(1);
    expect(rows.filter((r) => r.endedAt !== null)).toHaveLength(1);
  });
});

describe("organization isolation", () => {
  it("a code only ever joins its own organization", async () => {
    const a = await orgWithCode();
    const b = await orgWithCode();
    const user = await makeUser();
    await redeemJoinCode(user.id, a.code);
    expect(await memberships(user.id, a.org.id)).toHaveLength(1);
    expect(await memberships(user.id, b.org.id)).toHaveLength(0);
    expect((await db.organizationJoinCode.findMany({ where: { organizationId: b.org.id } }))[0].useCount).toBe(0);
  });

  it("a president of one organization cannot manage another organization's code", async () => {
    const a = await orgWithCode();
    const b = await orgWithCode();
    await signInAs(a.president.id);
    await expect(generateJoinCodeAction({}, form({ organizationId: b.org.id }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(revokeJoinCodeAction({}, form({ organizationId: b.org.id }))).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.organizationJoinCode.count({ where: { organizationId: b.org.id, revokedAt: null } })).toBe(1);
  });

  it("plain members do not see the roster of the organization they joined", async () => {
    const { org, code } = await orgWithCode();
    const user = await makeUser();
    await redeemJoinCode(user.id, code);
    const view = await getOrganizationForViewer(await toAuthUser(user.id), org.id);
    expect(view?.name).toBe(org.name);
    expect(view?.canViewRoster).toBe(false);
    expect(view?.members).toEqual([]);

    const stranger = await makeUser();
    expect(await getOrganizationForViewer(await toAuthUser(stranger.id), org.id)).toBeNull();
  });
});

describe("privilege escalation through join codes", () => {
  it("always grants MEMBER, even when a role is forged into the form", async () => {
    const { org, code } = await orgWithCode();
    for (const role of ["PRESIDENT", "ADVISER", "TREASURER", "OFFICER", "SYSTEM_ADMIN"]) {
      const user = await makeUser();
      await signInAs(user.id);
      const err = await joinOrganizationAction({}, form({ code, role, systemRole: role, organizationId: "x" })).catch(
        (e: Error) => e,
      );
      expect((err as Error).message).toBe(`NEXT_REDIRECT:/organizations/${org.id}`);
      expect((await memberships(user.id, org.id))[0].role).toBe("MEMBER");
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).systemRole).toBe("USER");
    }
  });

  it("does not change an existing officer's role", async () => {
    const { org, code } = await orgWithCode();
    const officer = await makeUser();
    await addMembership(officer.id, org.id, "OFFICER");
    expect(await redeemJoinCode(officer.id, code)).toEqual({ ok: false, reason: "already_member" });
    expect((await memberships(officer.id, org.id))[0].role).toBe("OFFICER");
  });

  it("only presidents of the organization and system admins can generate codes", async () => {
    const org = await makeOrg();
    for (const role of ["MEMBER", "TREASURER", "OFFICER", "ADVISER"] as const) {
      const u = await makeUser();
      await addMembership(u.id, org.id, role);
      await signInAs(u.id);
      await expect(generateJoinCodeAction({}, form({ organizationId: org.id }))).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await db.organizationJoinCode.count()).toBe(0);

    const admin = await makeUser({ systemRole: "SYSTEM_ADMIN" });
    await signInAs(admin.id);
    const state = await generateJoinCodeAction({}, form({ organizationId: org.id }));
    expect(state.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("requires a signed-in user to redeem", async () => {
    const { code } = await orgWithCode();
    await expect(joinOrganizationAction({}, form({ code }))).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});

describe("code storage and lifecycle", () => {
  it("stores only a hash, never the raw code", async () => {
    const { code } = await orgWithCode();
    const row = await db.organizationJoinCode.findFirstOrThrow();
    expect(row.codeHash).toBe(hashJoinCode(code));
    expect(row.codeHash).not.toContain(code);
    expect(JSON.stringify(row)).not.toContain(code);
    expect(row.codeHint).toBe(code.slice(-4));
    const audit = JSON.stringify(await db.auditLog.findMany());
    expect(audit).not.toContain(code);
  });

  it("generates unpredictable, well-formed codes", async () => {
    const org = await makeOrg();
    const admin = await makeUser();
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const res = await createJoinCode(admin.id, org.id);
      if (!res.ok) throw new Error(res.error);
      expect(res.code).toMatch(/^[23456789A-HJKMNP-Z]{12}$/);
      seen.add(res.code);
    }
    expect(seen.size).toBe(20);
  });

  it("regenerating revokes the old code and keeps exactly one active code", async () => {
    const { org, president, code: oldCode } = await orgWithCode();
    await signInAs(president.id);
    const state = await generateJoinCodeAction({}, form({ organizationId: org.id, maxUses: "3" }));
    expect(state.code).toBeTruthy();

    const user = await makeUser();
    expect(await redeemJoinCode(user.id, oldCode)).toEqual({ ok: false, reason: "revoked" });
    expect((await redeemJoinCode(user.id, state.code!)).ok).toBe(true);
    expect(await db.organizationJoinCode.count({ where: { organizationId: org.id, revokedAt: null } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "join_code.create" } })).toBe(2);
  });

  it("validates expiry and maximum uses, and refuses archived organizations", async () => {
    const org = await makeOrg();
    const admin = await makeUser();
    expect((await createJoinCode(admin.id, org.id, { expiresAt: new Date(Date.now() - 1000) })).ok).toBe(false);
    expect((await createJoinCode(admin.id, org.id, { maxUses: 0 })).ok).toBe(false);
    await db.organization.update({ where: { id: org.id }, data: { status: "ARCHIVED" } });
    expect((await createJoinCode(admin.id, org.id)).ok).toBe(false);
    expect(await db.organizationJoinCode.count()).toBe(0);
  });

  it("reports status as active, expired, exhausted or revoked", () => {
    const base = { revokedAt: null, expiresAt: null, maxUses: null, useCount: 0 };
    const now = new Date();
    expect(joinCodeStatus(base, now)).toBe("active");
    expect(joinCodeStatus({ ...base, revokedAt: now }, now)).toBe("revoked");
    expect(joinCodeStatus({ ...base, expiresAt: new Date(now.getTime() - 1) }, now)).toBe("expired");
    expect(joinCodeStatus({ ...base, maxUses: 2, useCount: 2 }, now)).toBe("exhausted");
    expect(joinCodeStatus({ ...base, maxUses: 2, useCount: 1 }, now)).toBe("active");
  });

  it("the database itself rejects use counts above the limit", async () => {
    const { org } = await orgWithCode({ maxUses: 1 });
    await expect(
      db.organizationJoinCode.updateMany({ where: { organizationId: org.id }, data: { useCount: 2 } }),
    ).rejects.toThrow();
  });
});

describe("concurrent redemption", () => {
  it("never exceeds the maximum number of uses", async () => {
    const { org, code } = await orgWithCode({ maxUses: 3 });
    const users = await Promise.all(Array.from({ length: 12 }, () => makeUser()));

    const results = await Promise.all(users.map((u) => redeemJoinCode(u.id, code)));

    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.reason === "exhausted")).toHaveLength(9);
    expect((await db.organizationJoinCode.findFirstOrThrow()).useCount).toBe(3);
    expect(await db.organizationMember.count({ where: { organizationId: org.id, role: "MEMBER" } })).toBe(3);
  });
});
