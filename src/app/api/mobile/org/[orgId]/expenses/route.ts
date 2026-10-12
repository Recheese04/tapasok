import { z } from "zod";
import { fail, json } from "@/lib/mobile/api";
import { capabilitiesIn, orgAuthed } from "@/lib/mobile/org";
import { parseAmount } from "@/features/fees/service";
import { EXPENSE_CATEGORIES, fundSummary, INCOME_CATEGORIES, listFunds, recordFund } from "@/features/finance/funds";

/** Expenses and other funds of the organization, with the balance (fees.view_org; Auditor and Adviser read-only). */
export const GET = orgAuthed("fees.view_org", async (user, request, orgId) => {
  const status = new URL(request.url).searchParams.get("status");
  const caps = capabilitiesIn(user, orgId);
  const [summary, records] = await Promise.all([
    fundSummary(orgId),
    listFunds(orgId, status === "PENDING" || status === "APPROVED" ? { status } : {}, 60),
  ]);
  return json({ canRecord: caps["expenses.record"], canApprove: caps["expenses.approve"], me: user.id, summary, records });
});

const body = z.object({
  type: z.enum(["EXPENSE", "INCOME"]),
  title: z.string().max(150),
  amount: z.string().max(20),
  category: z.enum([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES.filter((c) => c !== "OTHER")]),
  occurredOn: z.string().max(10),
  purpose: z.string().max(500),
  notes: z.string().max(1000).optional(),
  requestId: z.uuid(),
});

/** Records an expense or other funds as PENDING (expenses.record). Receipts are attached on the website. */
export const POST = orgAuthed("expenses.record", async (user, request, orgId) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "VALIDATION", "Check the values and try again.");
  const amount = parseAmount(parsed.data.amount);
  if (!amount) return fail(400, "VALIDATION", "Enter an amount like 250 or 250.50.");
  const res = await recordFund(user.id, orgId, { ...parsed.data, amount, notes: parsed.data.notes ?? null, receipt: null });
  return res.ok ? json({ ok: true, id: res.id, duplicate: res.duplicate }, res.duplicate ? 200 : 201) : fail(400, "VALIDATION", res.error);
});
