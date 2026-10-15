import "server-only";
import { revalidateTag } from "next/cache";

// The public landing page caches its event pictures and approved feedback (tag below) so it stays fast for every visitor.
// Anything that changes what it shows calls refreshLanding(): the next visit gets fresh data instead of stale content.
export const LANDING_TAG = "landing";

export function refreshLanding() {
  try {
    revalidateTag(LANDING_TAG, { expire: 0 });
  } catch {
    // Outside a Next.js request (scripts, tests) there is no cache to refresh.
  }
}
