// Loads the sample finance data (prisma/sample-finance.ts) into a LOCAL development database.
// Usage: npm run db:seed:finance
// Refuses production and any database that is not on this computer, so it can never write sample rows to the live site.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { EXPECTED, seedSampleFinance } from "../prisma/sample-finance";

const url = process.env.DATABASE_URL;
if (process.env.NODE_ENV === "production") throw new Error("Refusing to load sample data in production.");
if (!url) throw new Error("DATABASE_URL is not set.");
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error(`Refusing to load sample data into ${host}: sample data is for a local database only.`);

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
seedSampleFinance(db)
  .then(() => {
    console.log("Sample finance data is ready: organization \"Sample Finance Society\", 10 sample members.");
    console.log("Expected Financial Report totals (all school years):", EXPECTED);
  })
  .finally(() => db.$disconnect());
