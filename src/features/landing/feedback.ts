import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { canSystem, isSystemAdminUser, type PolicyUser } from "@/lib/permissions/policy";
import { isAdviserOnly } from "@/config/navigation";
import { ACTIVE, deletion, restoration } from "@/lib/database/soft-delete";
import { hit } from "@/lib/security/rate-limit";
import { refreshLanding } from "./cache";

// Ratings and comments about Tapasok, shown on the public landing page. Rules:
//   * Only signed-in people with a personal account may post: not System Admin (who moderates) and not Adviser-only
//     accounts (the Adviser is read-only). There is no anonymous posting, so every entry is tied to a real account.
//   * One active entry per account (rating 1-5 and an optional comment up to 500 characters). Posting again edits it.
//   * Nothing is public until a System Admin approves it; editing an entry sends it back for approval. The average and
//     count on the landing page use approved, not-deleted entries of active accounts only.
//   * Public entries show only the first name and last initial. Comments are plain text (rendered escaped, never as HTML).
//   * Moderation: approve, hide, delete (soft) and restore. Every moderation step is written to the audit log.

export const MAX_COMMENT = 500;
const EDITS_PER_HOUR = 10;

type Fail = { ok: false; error: string };
type Person = PolicyUser & { id: string };

export const canPostFeedback = (u: PolicyUser) => !isSystemAdminUser(u) && !isAdviserOnly(u);
const canModerate = (u: PolicyUser) => canSystem(u, "landing.manage");

/** Plain text only: control characters removed, whitespace runs collapsed (line breaks kept, at most two in a row). */
export function cleanComment(v: string | null | undefined): string | null {
  const s = (v ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s || null;
}

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export function myFeedback(userId: string) {
  return db.siteFeedback.findFirst({ where: { userId, ...ACTIVE }, select: { id: true, rating: true, comment: true, status: true, updatedAt: true } });
}

/** Creates or edits the person's own entry. It always goes (back) to "waiting for approval". */
export async function submitFeedback(user: Person, rating: number, rawComment: string | null): Promise<{ ok: true; created: boolean } | Fail> {
  if (!canPostFeedback(user)) return { ok: false, error: "This account cannot post feedback." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "Choose a rating from 1 to 5 stars." };
  const comment = cleanComment(rawComment);
  if (comment && comment.length > MAX_COMMENT) return { ok: false, error: `Keep your comment under ${MAX_COMMENT} characters.` };
  if ((await hit(`feedback:${user.id}`, 3600_000)) > EDITS_PER_HOUR) return { ok: false, error: "You have changed your feedback many times. Try again in an hour." };
  const data = { rating, comment, status: "PENDING" as const, moderatedById: null, moderatedAt: null };
  try {
    const result = await db.$transaction(async (tx) => {
      const mine = await tx.siteFeedback.findFirst({ where: { userId: user.id, ...ACTIVE }, select: { id: true } });
      const row = mine
        ? await tx.siteFeedback.update({ where: { id: mine.id }, data, select: { id: true } })
        : await tx.siteFeedback.create({ data: { userId: user.id, ...data }, select: { id: true } });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: mine ? "feedback.update" : "feedback.create", targetType: "feedback", targetId: row.id, metadata: { rating } } });
      return { created: !mine };
    });
    refreshLanding(); // an approved entry that was edited leaves the landing page until approved again
    return { ok: true, ...result };
  } catch (e) {
    // Two submissions at the same moment: the one-active-entry index refuses the second.
    if (isUnique(e)) return { ok: false, error: "Your feedback was just saved from another tab. Reload and try again." };
    throw e;
  }
}

/** The person removes their own entry (soft delete). They can post a new one later. */
export async function removeOwnFeedback(user: Person): Promise<{ ok: true } | Fail> {
  const mine = await db.siteFeedback.findFirst({ where: { userId: user.id, ...ACTIVE }, select: { id: true } });
  if (!mine) return { ok: false, error: "You have no feedback to remove." };
  await db.$transaction([
    db.siteFeedback.update({ where: { id: mine.id }, data: deletion(user.id) }),
    db.auditLog.create({ data: { actorUserId: user.id, action: "feedback.remove_own", targetType: "feedback", targetId: mine.id } }),
  ]);
  refreshLanding();
  return { ok: true };
}

export type ModerationAction = "approve" | "hide" | "delete" | "restore";

export async function moderateFeedback(admin: Person, id: string, action: ModerationAction): Promise<{ ok: true } | Fail> {
  if (!canModerate(admin)) return { ok: false, error: "Only system administrators moderate feedback." };
  const row = await db.siteFeedback.findUnique({ where: { id }, select: { id: true, userId: true, status: true, deletedAt: true } });
  if (!row) return { ok: false, error: "Feedback not found." };
  const now = new Date();
  let data: Prisma.SiteFeedbackUpdateInput;
  if (action === "restore") {
    if (!row.deletedAt) return { ok: false, error: "This feedback is not deleted." };
    data = restoration();
  } else {
    if (row.deletedAt) return { ok: false, error: "Restore this feedback first." };
    data = action === "delete" ? deletion(admin.id)
      : { status: action === "approve" ? "APPROVED" : "HIDDEN", moderatedById: admin.id, moderatedAt: now };
  }
  try {
    await db.$transaction([
      db.siteFeedback.update({ where: { id }, data }),
      db.auditLog.create({ data: { actorUserId: admin.id, action: `feedback.${action}`, targetType: "feedback", targetId: id, metadata: { authorId: row.userId, before: row.status } } }),
    ]);
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: "This person has posted newer feedback since. Their newer entry stays; this one cannot be restored." };
    throw e;
  }
  refreshLanding();
  return { ok: true };
}

const publicName = (first: string, last: string) => `${first.trim().split(/\s+/)[0] ?? ""} ${last.trim().charAt(0).toUpperCase()}.`.trim();

/** What counts publicly: approved, not deleted, from an account that is not disabled. */
const PUBLIC = { status: "APPROVED" as const, ...ACTIVE, user: { status: { not: "DISABLED" as const } } };

/** Average, total, star breakdown and the latest approved comments. No email, student number or other private data. */
export async function publicFeedback(limit = 6) {
  const [agg, groups, latest] = await Promise.all([
    db.siteFeedback.aggregate({ where: PUBLIC, _avg: { rating: true }, _count: { _all: true } }),
    db.siteFeedback.groupBy({ by: ["rating"], where: PUBLIC, _count: { _all: true } }),
    db.siteFeedback.findMany({
      where: { ...PUBLIC, comment: { not: null } }, orderBy: { updatedAt: "desc" }, take: limit,
      select: { id: true, rating: true, comment: true, updatedAt: true, user: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  const breakdown = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: groups.find((g) => g.rating === stars)?._count._all ?? 0 }));
  return {
    average: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
    total: agg._count._all,
    breakdown,
    comments: latest.map((f) => ({ id: f.id, rating: f.rating, comment: f.comment!, at: f.updatedAt, name: publicName(f.user.firstName, f.user.lastName) })),
  };
}
export type PublicFeedback = Awaited<ReturnType<typeof publicFeedback>>;

export type ModerationTab = "pending" | "approved" | "hidden" | "deleted";

/** Moderation queue for System Admin. Shows the author's name and email so abuse can be traced; never shown publicly. */
export async function moderationList(tab: ModerationTab, page: number, pageSize: number) {
  const where: Prisma.SiteFeedbackWhereInput =
    tab === "deleted" ? { deletedAt: { not: null } } : { ...ACTIVE, status: tab === "pending" ? "PENDING" : tab === "approved" ? "APPROVED" : "HIDDEN" };
  const [total, rows, counts] = await Promise.all([
    db.siteFeedback.count({ where }),
    db.siteFeedback.findMany({
      where, orderBy: tab === "deleted" ? { deletedAt: "desc" } : { updatedAt: tab === "pending" ? "asc" : "desc" }, skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, rating: true, comment: true, status: true, createdAt: true, updatedAt: true, moderatedAt: true, deletedAt: true, deletedById: true, restoredAt: true,
        user: { select: { firstName: true, lastName: true, email: true, status: true } },
      },
    }),
    db.siteFeedback.groupBy({ by: ["status"], where: ACTIVE, _count: { _all: true } }),
  ]);
  const deleted = await db.siteFeedback.count({ where: { deletedAt: { not: null } } });
  const n = (s: "PENDING" | "APPROVED" | "HIDDEN") => counts.find((c) => c.status === s)?._count._all ?? 0;
  return { total, rows, counts: { pending: n("PENDING"), approved: n("APPROVED"), hidden: n("HIDDEN"), deleted } };
}
