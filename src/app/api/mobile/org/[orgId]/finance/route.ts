import { json } from "@/lib/mobile/api";
import { capabilitiesIn, orgAuthed } from "@/lib/mobile/org";
import { orgFinance, pendingPayments, recentPayments } from "@/lib/mobile/finance";

/**
 * Organization finance for the people who may see it (fees.view_org: President, Treasurer, Auditor, Adviser). The flag
 * `canManage` tells the app whether to show verify / record controls; the write routes enforce fees.manage themselves.
 */
export const GET = orgAuthed("fees.view_org", async (user, _request, orgId) => {
  const [finance, pending, recent] = await Promise.all([orgFinance(orgId), pendingPayments(orgId), recentPayments(orgId, 25)]);
  const canManage = capabilitiesIn(user, orgId)["fees.manage"];
  return json({ canManage, totals: finance.totals, owing: finance.owing, owingTruncated: finance.owingTruncated, pending, recent });
});
