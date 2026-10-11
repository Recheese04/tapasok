import { authed, json } from "@/lib/mobile/api";
import { memberFees } from "@/lib/mobile/queries";

/** The signed-in member's own fees and payments only. Organization-wide finance stays on the web. */
export const GET = authed(async (user) => json({ fees: await memberFees(user) }));
