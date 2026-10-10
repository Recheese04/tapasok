import { Prisma } from "@/generated/prisma/client";

// The student obligation ledger. An assessment's balance is derived, never stored:
//   balance = amount due + sum(adjustments) - sum(CONFIRMED, non-voided payments)
// Pending (unverified) and rejected digital payments never reduce the balance.

type Dec = Prisma.Decimal;
export type LedgerFee = {
  amountDue: Dec;
  adjustments: { amount: Dec }[];
  payments: { amount: Dec; status: "CONFIRMED" | "PENDING" | "REJECTED"; voidedAt: Date | null }[];
};

const ZERO = () => new Prisma.Decimal(0);

export function ledger(fee: LedgerFee) {
  const adjustments = fee.adjustments.reduce((s, a) => s.add(a.amount), ZERO());
  const paid = fee.payments.filter((p) => p.status === "CONFIRMED" && !p.voidedAt).reduce((s, p) => s.add(p.amount), ZERO());
  const pending = fee.payments.filter((p) => p.status === "PENDING" && !p.voidedAt).reduce((s, p) => s.add(p.amount), ZERO());
  const effectiveDue = fee.amountDue.add(adjustments);
  const balance = effectiveDue.sub(paid);
  const status: "PAID" | "PARTIAL" | "UNPAID" | "CREDIT" = balance.lt(0) ? "CREDIT" : balance.isZero() ? "PAID" : paid.gt(0) ? "PARTIAL" : "UNPAID";
  return { adjustments, paid, pending, effectiveDue, balance, status };
}

/** Unique, human-readable receipt/reference code. */
export function newReceiptCode(now = new Date()) {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let tail = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) tail += alphabet[b % alphabet.length];
  const ymd = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now).replaceAll("-", "");
  return `TPK-${ymd}-${tail}`;
}
