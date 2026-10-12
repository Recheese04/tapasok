import "server-only";
import { db } from "@/lib/database/client";

// Fixed-window counters stored in Postgres, so limits hold across every serverless instance. Used for failed sign-ins
// per network address (account lockout already covers each email). Keys never contain passwords or tokens.

type Count = { count: number; window_start: Date };

/** Current count inside the window, without changing it. */
export async function peek(key: string, windowMs: number): Promise<number> {
  const row = await db.rateLimit.findUnique({ where: { key } });
  if (!row || row.windowStart.getTime() + windowMs <= Date.now()) return 0;
  return row.count;
}

/** Adds one to the counter (starting a new window when the old one has passed) and returns the new count. Atomic. */
export async function hit(key: string, windowMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - windowMs);
  const rows = await db.$queryRaw<Count[]>`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start <= ${cutoff} THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start <= ${cutoff} THEN now() ELSE rate_limits.window_start END
    RETURNING count, window_start`;
  return rows[0]?.count ?? 1;
}

/**
 * The client's address as reported by the hosting proxy. On Vercel `x-real-ip` / the first `x-forwarded-for` entry is
 * set by the platform; elsewhere it may be absent, and everything then shares one bucket (still bounded, never bypassed).
 */
export function clientIp(h: Headers): string {
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0];
  return (ip ?? "unknown").trim().slice(0, 64) || "unknown";
}
