import "server-only";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/database/client";
import { loadUserByToken, type AuthUser } from "@/lib/auth/dal";
import { hashToken } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/permissions";

// Token-based access for the Tapasok mobile app. It reuses the web app's session table and rules: the app holds an opaque
// random token (only its SHA-256 hash is stored), sent as "Authorization: Bearer <token>". Every request re-validates the
// session against the database, so signing out, expiry and deactivation take effect immediately. No cookies are involved.
// The mobile app is for members: System Administrator accounts get no mobile session (administration is web-only).

const days = Number(process.env.MOBILE_SESSION_DAYS ?? 30);
const MOBILE_SESSION_MS = (Number.isFinite(days) && days > 0 ? days : 30) * 86_400_000;

export const NO_STORE = { "Cache-Control": "no-store" };
export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: NO_STORE });
export const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

export async function issueMobileToken(userId: string, request: Request) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MOBILE_SESSION_MS);
  await db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  await db.session.create({
    data: {
      userId, tokenHash: hashToken(token), expiresAt,
      userAgent: `mobile:${request.headers.get("user-agent") ?? ""}`.slice(0, 255),
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? null,
    },
  });
  return { token, expiresAt };
}

export function bearerToken(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(h);
  return m ? m[1] : null;
}

type Handler<C> = (user: AuthUser, request: Request, ctx: C) => Promise<Response>;

/** Wraps a route: requires a valid bearer token, blocks administrators, and turns permission errors into 403 responses. */
export function authed<C = unknown>(handler: Handler<C>) {
  return async (request: Request, ctx: C): Promise<Response> => {
    const token = bearerToken(request);
    const user = token ? await loadUserByToken(token) : null;
    if (!user) return fail(401, "UNAUTHORIZED", "Please sign in again.");
    if (user.systemRole === "SYSTEM_ADMIN") return fail(403, "ADMIN_WEB_ONLY", "System administration is available on the Tapasok web app.");
    try {
      return await handler(user, request, ctx);
    } catch (e) {
      if (e instanceof ForbiddenError) return fail(403, "FORBIDDEN", "You do not have access to that.");
      throw e;
    }
  };
}
