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
  /** Still on the shared default password: may only change it (and sign out) until they choose their own. */
  mustChangePassword: boolean;
  memberships: {
    organizationId: string;
    organizationName: string;
    role: OrganizationRole;
    title: string | null;
  }[];
};

/**
 * Resolves the signed-in user from a raw session token (cookie or mobile bearer token), validated against the database:
 * the session must exist, be unexpired, and belong to an ACTIVE account. Returns null otherwise.
 */
export async function loadUserByToken(token: string): Promise<AuthUser | null> {
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
    mustChangePassword: user.mustChangePassword,
    memberships: user.memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organization.name,
      role: m.role,
      title: m.title,
    })),
  };
}

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  // The session is validated against the database and the clock on every request: explicitly request-time work.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return loadUserByToken(token);
});

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Accounts still on the shared default password can do nothing else until they choose their own.
  if (user.mustChangePassword) redirect("/change-password");
  return user;
}

/** For the change-password page and action only: signed in, even if a password change is still required. */
export async function requireUserForPasswordChange(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For route handlers (downloads, exports): the signed-in user, or null when signed out or a password change is pending. */
export async function getActiveUser(): Promise<AuthUser | null> {
  const user = await getCurrentUser();
  return user && !user.mustChangePassword ? user : null;
}
