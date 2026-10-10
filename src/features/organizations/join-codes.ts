import "server-only";
import { createHash, randomInt } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";

// Join codes let a signed-in user become a MEMBER of an organization. Nothing here can grant
// any other role. Only a SHA-256 hash of each code is stored; the raw code is returned once.

// No 0/O/1/I/L to avoid transcription mistakes. 12 chars from 31 symbols is about 59 bits.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 12;

export function generateJoinCode() {
  let raw = "";
  for (let i = 0; i < CODE_LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return raw;
}

/** Display form: XXXX-XXXX-XXXX */
export const formatJoinCode = (raw: string) => raw.match(/.{1,4}/g)?.join("-") ?? raw;

/** Accepts user input with any case, spaces or dashes. */
export const normalizeJoinCode = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const hashJoinCode = (raw: string) => createHash("sha256").update(normalizeJoinCode(raw)).digest("hex");

export type JoinCodeStatus = "active" | "expired" | "exhausted" | "revoked";

export function joinCodeStatus(
  code: { revokedAt: Date | null; expiresAt: Date | null; maxUses: number | null; useCount: number },
  now = new Date(),
): JoinCodeStatus {
  if (code.revokedAt) return "revoked";
  if (code.expiresAt && code.expiresAt <= now) return "expired";
  if (code.maxUses !== null && code.useCount >= code.maxUses) return "exhausted";
  return "active";
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Creates a new code for the organization, revoking any current one (so "generate" and
 * "regenerate" are the same operation). Callers must have authorized the actor.
 */
export async function createJoinCode(
  actorId: string,
  organizationId: string,
  options: { expiresAt?: Date | null; maxUses?: number | null } = {},
): Promise<Result<{ code: string }>> {
  const { expiresAt = null, maxUses = null } = options;
  if (expiresAt && expiresAt <= new Date()) return { ok: false, error: "The expiry date must be in the future." };
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100_000)) {
    return { ok: false, error: "Maximum uses must be a whole number of at least 1." };
  }

  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { status: true } });
  if (!org || org.status !== "ACTIVE") return { ok: false, error: "This organization is not active." };

  const raw = generateJoinCode();
  try {
    await db.$transaction(async (tx) => {
      await tx.organizationJoinCode.updateMany({
        where: { organizationId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const created = await tx.organizationJoinCode.create({
        data: {
          organizationId,
          codeHash: hashJoinCode(raw),
          codeHint: raw.slice(-4),
          createdById: actorId,
          expiresAt,
          maxUses,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actorId,
          action: "join_code.create",
          targetType: "organization",
          targetId: organizationId,
          metadata: { joinCodeId: created.id, expiresAt: expiresAt?.toISOString() ?? null, maxUses },
        },
      });
    });
  } catch (e) {
    // Two admins generating at the same moment: the one-active-code index rejects the loser.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "A code was generated at the same time. Please try again." };
    }
    throw e;
  }
  return { ok: true, code: raw };
}

export async function revokeJoinCode(actorId: string, organizationId: string): Promise<Result> {
  const { count } = await db.organizationJoinCode.updateMany({
    where: { organizationId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) return { ok: false, error: "There is no active code to revoke." };
  await db.auditLog.create({
    data: { actorUserId: actorId, action: "join_code.revoke", targetType: "organization", targetId: organizationId },
  });
  return { ok: true };
}

/** The most recent code for an organization (any status), without its hash. */
export function getLatestJoinCode(organizationId: string) {
  return db.organizationJoinCode.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHint: true, expiresAt: true, maxUses: true, useCount: true, revokedAt: true, createdAt: true },
  });
}

export type RedeemFailure = "invalid" | "revoked" | "expired" | "exhausted" | "inactive" | "already_member";

class Rollback extends Error {
  constructor(public reason: RedeemFailure) {
    super(reason);
  }
}

/**
 * Redeems a code for `userId`. The new membership always has the MEMBER role.
 * The use is claimed with a single conditional UPDATE, so concurrent redemptions cannot
 * exceed max_uses; everything happens in one transaction, so a failed join consumes no use.
 */
export async function redeemJoinCode(
  userId: string,
  rawCode: string,
): Promise<{ ok: true; organizationId: string } | { ok: false; reason: RedeemFailure }> {
  const normalized = normalizeJoinCode(rawCode);
  if (normalized.length !== CODE_LENGTH) return { ok: false, reason: "invalid" };

  try {
    const organizationId = await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!user || user.status !== "ACTIVE") throw new Rollback("inactive");

      const code = await tx.organizationJoinCode.findUnique({
        where: { codeHash: hashJoinCode(normalized) },
        include: { organization: { select: { status: true } } },
      });
      if (!code) throw new Rollback("invalid");

      const status = joinCodeStatus(code);
      if (status !== "active") throw new Rollback(status);
      if (code.organization.status !== "ACTIVE") throw new Rollback("inactive");

      const existing = await tx.organizationMember.findFirst({
        where: { organizationId: code.organizationId, userId, endedAt: null },
        select: { id: true },
      });
      if (existing) throw new Rollback("already_member");

      // Atomic claim: the row lock serializes concurrent redeemers, and the WHERE clause is
      // re-evaluated for each, so the limit cannot be exceeded.
      const claimed = await tx.$executeRaw`
        UPDATE "organization_join_codes"
        SET "use_count" = "use_count" + 1
        WHERE "id" = ${code.id}::uuid
          AND "revoked_at" IS NULL
          AND ("expires_at" IS NULL OR "expires_at" > now())
          AND ("max_uses" IS NULL OR "use_count" < "max_uses")`;
      if (claimed === 0) throw new Rollback("exhausted");

      await tx.organizationMember.create({
        data: { organizationId: code.organizationId, userId, role: "MEMBER" },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: "join_code.redeem",
          targetType: "organization",
          targetId: code.organizationId,
          metadata: { joinCodeId: code.id },
        },
      });
      return code.organizationId;
    });
    return { ok: true, organizationId };
  } catch (e) {
    if (e instanceof Rollback) return { ok: false, reason: e.reason };
    // Concurrent double-submit by the same user: the active-membership unique index rejects the second.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, reason: "already_member" };
    }
    throw e;
  }
}

/** Messages that never mention organization names or details. */
export const REDEEM_MESSAGES: Record<RedeemFailure, string> = {
  invalid: "That code is not valid. Check it and try again.",
  revoked: "This code is no longer active. Ask an organization officer for a new one.",
  expired: "This code has expired. Ask an organization officer for a new one.",
  exhausted: "This code has reached its usage limit. Ask an organization officer for a new one.",
  inactive: "This code can't be used right now.",
  already_member: "You are already a member of that organization.",
};
