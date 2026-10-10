import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/database/client";

const isProd = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = isProd ? "__Host-tapasok_session" : "tapasok_session";

const maxAgeHours = Number(process.env.SESSION_MAX_AGE_HOURS ?? 8);
const SESSION_MAX_AGE_MS = (Number.isFinite(maxAgeHours) && maxAgeHours > 0 ? maxAgeHours : 8) * 3_600_000;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a session row and sets the cookie. The raw token is never stored. */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);
  const h = await headers();

  await db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
      // Informational only: x-forwarded-for can be spoofed unless set by a trusted proxy.
      ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? null,
    },
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Deletes the current session (server side) and clears the cookie. Returns the user id, if any. */
export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  let userId: string | null = null;
  if (token) {
    const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
    if (session) {
      userId = session.userId;
      await db.session.delete({ where: { id: session.id } });
    }
  }
  jar.delete(SESSION_COOKIE);
  return userId;
}

/** Hash of the current request's session token (to keep this session when ending the others). */
export async function currentSessionHash() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}
