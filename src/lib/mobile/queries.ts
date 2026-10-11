import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { orgIdsWith } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/dal";
import { audienceMatches } from "@/features/announcements/service";
import { ledger } from "@/features/fees/ledger";

export const money = (d: Prisma.Decimal) => d.toFixed(2);

/** Published announcements of the member's organizations that are aimed at them (audience targeting applies). */
export async function memberAnnouncements(user: AuthUser, limit: number) {
  const candidates = await db.announcement.findMany({
    where: { organizationId: { in: orgIdsWith(user, "announcements.view") }, status: "PUBLISHED" },
    orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 100,
    select: { id: true, title: true, body: true, publishedAt: true, createdAt: true, targetMode: true, semesterId: true, organizationId: true, organization: { select: { name: true } } },
  });
  const out = [];
  for (const a of candidates) {
    if (await audienceMatches(a, user.id, false)) {
      out.push({ id: a.id, title: a.title, body: a.body, organization: a.organization.name, at: (a.publishedAt ?? a.createdAt).toISOString() });
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** The member's own assessments with derived balances. Never includes anyone else's records. */
export async function memberFees(user: AuthUser) {
  const fees = await db.studentFee.findMany({
    where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100,
    include: {
      organization: { select: { name: true } }, feeType: { select: { dueDate: true } },
      adjustments: { select: { amount: true } },
      payments: { where: { voidedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, amount: true, status: true, voidedAt: true, method: true, receiptCode: true, paidAt: true, rejectionReason: true } },
    },
  });
  return fees.map((f) => {
    const l = ledger(f);
    return {
      id: f.id, title: f.title, kind: f.kind, organization: f.organization.name, dueDate: f.feeType?.dueDate?.toISOString() ?? null,
      amountDue: money(f.amountDue), adjustments: money(l.adjustments), paid: money(l.paid), pending: money(l.pending), balance: money(l.balance), status: l.status,
      payments: f.payments.map((p) => ({ id: p.id, amount: money(p.amount), method: p.method, status: p.status, receiptCode: p.receiptCode, paidAt: p.paidAt.toISOString(), rejectionReason: p.rejectionReason })),
    };
  });
}
