import "server-only";
import { db } from "@/lib/database/client";

// Soft delete, used by events, announcements, documents, landing-page event pictures and site feedback.
//   * Deleting sets deleted_at (when) and deleted_by_id (who); nothing is removed, so the record and everything that
//     refers to it stay intact and the deletion can be undone.
//   * Every normal query adds `deletedAt: null` (ACTIVE): deleted records never appear in lists, counts, dashboards,
//     the mobile API or the public landing page. Only the "Recently deleted" views ask for deleted rows.
//   * Restoring clears both columns and stamps restored_at (the UI marks the record "Restored" for a week). Each delete and restore is written to the audit log by the caller.
// Attendance, payments, fees and other accountability records are NOT soft-deleted: they keep their own correction,
// void and reversal workflows.

export const ACTIVE = { deletedAt: null } as const;
export const DELETED = { deletedAt: { not: null } } as const;

export const deletion = (actorId: string) => ({ deletedAt: new Date(), deletedById: actorId });
export const restoration = () => ({ deletedAt: null, deletedById: null, restoredAt: new Date() });

/** Recently restored records are marked "Restored" for a week so people can tell what came back. */
export const RESTORED_BADGE_MS = 7 * 24 * 3600_000;
export const recentlyRestored = (restoredAt: Date | null | undefined) => !!restoredAt && Date.now() - restoredAt.getTime() < RESTORED_BADGE_MS;

/** Display names for the people who deleted records (deleted_by_id is a plain column, so old rows keep working). */
export async function deleterNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((i): i is string => !!i))];
  if (!unique.length) return new Map();
  const users = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true } });
  return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
}
