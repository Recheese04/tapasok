import { db } from "@/lib/database/client";
import { hashToken } from "@/lib/auth/session";
import { bearerToken, json } from "@/lib/mobile/api";

/** Ends this device's session on the server. Always succeeds, so the app can clear its token either way. */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  return json({ ok: true });
}
