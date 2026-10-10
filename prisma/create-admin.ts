// Creates the first System Administrator on a fresh database (for example a hosted test/production database).
// The account has NO password: the script prints a one-time setup link where the person chooses their own.
// Safe to re-run: if the email already exists nothing is changed and no new link is created.
// Usage: ADMIN_EMAIL=you@school.edu ADMIN_FIRST_NAME=Ana ADMIN_LAST_NAME=Cruz npm run db:create-admin
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const firstName = process.env.ADMIN_FIRST_NAME?.trim();
const lastName = process.env.ADMIN_LAST_NAME?.trim();
if (!email || !firstName || !lastName) throw new Error("Set ADMIN_EMAIL, ADMIN_FIRST_NAME and ADMIN_LAST_NAME.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  if (await db.user.findUnique({ where: { email: email! } })) {
    console.log(`An account with ${email} already exists. Nothing was changed.`);
    return;
  }
  const token = randomBytes(32).toString("base64url");
  const user = await db.user.create({
    data: { email: email!, firstName: firstName!, lastName: lastName!, systemRole: "SYSTEM_ADMIN", status: "INVITED", passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10) },
  });
  await db.activationToken.create({
    data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 14 * 86_400_000) },
  });
  await db.auditLog.create({ data: { action: "user.create_admin_bootstrap", targetType: "user", targetId: user.id } });
  console.log(`System administrator created for ${email}.`);
  console.log(`Open this link once (valid 14 days) to choose a password:\n  <your APP_URL>/activate/${token}`);
}

main().finally(() => db.$disconnect());
