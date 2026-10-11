import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/database/client";
import { money } from "./queries";

// Six-month series for the officer dashboards' charts, bucketed by calendar month in Manila time. Built from the raw
// records (no sampling), so a bar always equals what the detailed screens list for that month.

const monthKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(d);
const monthLabel = (d: Date) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short" }).format(d);

function lastSixMonths(now = new Date()) {
  const start = new Date(now);
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCMonth(start.getUTCMonth() - 5);
  start.setUTCDate(start.getUTCDate() - 1); // a day early so Manila's first-of-month (UTC+8) is never cut off; filtered by key below
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(15); // mid-month avoids timezone edges when stepping back
    d.setUTCMonth(d.getUTCMonth() - (5 - i));
    return { key: monthKey(d), label: monthLabel(d) };
  });
  return { start, months };
}

/** Check-ins (any status) recorded for the organization's events, per month. */
export async function checkinsByMonth(organizationId: string) {
  const { start, months } = lastSixMonths();
  const rows = await db.attendanceRecord.findMany({ where: { event: { organizationId }, scannedAt: { gte: start } }, select: { scannedAt: true } });
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(monthKey(r.scannedAt), (counts.get(monthKey(r.scannedAt)) ?? 0) + 1);
  return months.map((m) => ({ label: m.label, value: counts.get(m.key) ?? 0 }));
}

/** Money collected (confirmed, non-voided payments) per month, by payment date. */
export async function collectionsByMonth(organizationId: string) {
  const { start, months } = lastSixMonths();
  const rows = await db.payment.findMany({ where: { status: "CONFIRMED", voidedAt: null, paidAt: { gte: start }, studentFee: { organizationId } }, select: { amount: true, paidAt: true } });
  const sums = new Map<string, Prisma.Decimal>();
  for (const r of rows) {
    const k = monthKey(r.paidAt);
    sums.set(k, (sums.get(k) ?? new Prisma.Decimal(0)).add(r.amount));
  }
  return months.map((m) => ({ label: m.label, value: money(sums.get(m.key) ?? new Prisma.Decimal(0)) }));
}
