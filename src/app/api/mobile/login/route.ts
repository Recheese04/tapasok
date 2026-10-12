import { z } from "zod";
import { db } from "@/lib/database/client";
import { attemptLogin } from "@/features/auth/login";
import { fail, issueMobileToken, json } from "@/lib/mobile/api";
import { clientIp } from "@/lib/security/rate-limit";

const body = z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().min(1).max(200) });

/** Signs in with the same account and rules as the web app and returns a bearer token for the app to keep securely. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "BAD_REQUEST", "Enter your email and password.");
  const result = await attemptLogin(parsed.data.email, parsed.data.password, clientIp(request.headers));
  if (!result.ok) return fail(result.error.startsWith("Too many failed sign-ins") ? 429 : 401, "INVALID_CREDENTIALS", result.error);
  if (result.systemRole === "SYSTEM_ADMIN") return fail(403, "ADMIN_WEB_ONLY", "System administration is available on the Tapasok web app. Please use the web app.");

  if (result.mustChangePassword) return fail(403, "PASSWORD_CHANGE_REQUIRED", "Choose your own password on the Tapasok website first, then sign in here.");

  const { token, expiresAt } = await issueMobileToken(result.userId, request);
  await db.auditLog.create({ data: { actorUserId: result.userId, action: "auth.login_mobile", targetType: "user", targetId: result.userId } });
  return json({ token, expiresAt: expiresAt.toISOString() });
}
