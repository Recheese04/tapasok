import { db } from "@/lib/database/client";
import { authState } from "./auth-state";
import type { AuthUser } from "@/lib/auth/dal";
import type { OrganizationRole, SystemRole } from "@/generated/prisma/enums";

// Precomputed bcrypt hash (cost 4) of "TestPassword1!" so fixtures stay fast.
export const TEST_PASSWORD = "TestPassword1!";
export const TEST_PASSWORD_HASH = "$2b$04$QWueNNUH1hC9nJ6Y8TnhO.Y0xWtE6QcNdyKah9Gun3.tCkSGUuVoq";

export { db };

export async function resetDatabase() {
  const dbName = new URL(process.env.DATABASE_URL!).pathname.replace(/^\//, "");
  if (!/_test$/.test(dbName)) throw new Error(`Refusing to truncate non-test database "${dbName}".`);

  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(",")} RESTART IDENTITY CASCADE`);
  authState.user = null;
}

export const disconnect = () => db.$disconnect();

let counter = 0;

export async function makeUser(opts: { systemRole?: SystemRole; status?: "ACTIVE" | "DISABLED"; email?: string; name?: string } = {}) {
  counter++;
  return db.user.create({
    data: {
      email: opts.email ?? `user${counter}@test.local`,
      passwordHash: TEST_PASSWORD_HASH,
      firstName: opts.name ?? `First${counter}`,
      lastName: `Last${counter}`,
      systemRole: opts.systemRole ?? "USER",
      status: opts.status ?? "ACTIVE",
    },
  });
}

export async function makeOrg(name = `Org ${++counter}`, status: "ACTIVE" | "ARCHIVED" = "ACTIVE") {
  return db.organization.create({ data: { name, status } });
}

export async function addMembership(userId: string, organizationId: string, role: OrganizationRole = "MEMBER") {
  return db.organizationMember.create({ data: { userId, organizationId, role } });
}

/** Builds the AuthUser the app would derive from a session, from current database state. */
export async function toAuthUser(userId: string): Promise<AuthUser> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      memberships: { where: { endedAt: null }, include: { organization: { select: { name: true } } } },
    },
  });
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

export async function signInAs(userId: string) {
  authState.user = await toAuthUser(userId);
}

export function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
