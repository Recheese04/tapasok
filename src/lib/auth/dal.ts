import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/database/client";
import type { OrganizationRole, SystemRole } from "@/generated/prisma/enums";
import { SESSION_COOKIE, hashToken } from "./session";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  systemRole: SystemRole;
  memberships: {
    organizationId: string;
    organizationName: string;
    role: OrganizationRole;
    title: string | null;
  }[];
};

/**
 * Resolves the signed-in user from the session cookie, validated against the database
 * on every request (so logout, expiry and disabled accounts take effect immediately).
 * Memoized per request.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  // The session is validated against the database and the clock on every request: explicitly request-time work.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          memberships: {
            where: { endedAt: null, organization: { status: "ACTIVE" } },
            include: { organization: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") return null;

  const { user } = session;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    systemRole: user.systemRole,
    memberships: user.memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organization.name,
      role: m.role,
      title: m.title,
    })),
  };
});

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
