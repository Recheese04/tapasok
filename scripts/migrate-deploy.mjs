// Applies pending database migrations before a production build (Vercel provides DATABASE_URL).
//
// Why not `prisma migrate deploy`: on Vercel, DATABASE_URL goes through Supabase's connection pooler, which the app uses
// without problems but where Prisma's migration engine hangs. This script does what `migrate deploy` does, using the same
// `pg` driver the app uses:
//   * reads prisma/migrations/*/migration.sql in order and skips those already recorded in _prisma_migrations;
//   * applies each pending one inside a transaction together with its _prisma_migrations record (same checksum format as
//     Prisma: sha256 of the file), so Prisma sees it as applied and the record and the change are all-or-nothing;
//   * an earlier attempt that never finished is marked rolled back first (exactly what `prisma migrate resolve` would do).
// A hard time limit makes a stuck connection fail the build quickly; the current live version then stays up.
import { readdir, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";

const LIMIT_MS = 3 * 60_000;
const DIR = path.join(process.cwd(), "prisma", "migrations");
setTimeout(() => { console.error(`[migrate] did not finish within ${LIMIT_MS / 1000}s; stopping the build so the live version stays up.`); process.exit(1); }, LIMIT_MS).unref();

const url = process.env.DATABASE_URL;
if (!url) { console.log("[migrate] DATABASE_URL is not set; skipping."); process.exit(0); }

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 20_000, statement_timeout: 120_000 });
try {
  await client.connect();
  const exists = (await client.query("SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS ok")).rows[0].ok;
  if (!exists) throw new Error("_prisma_migrations does not exist; set up this database with `prisma migrate deploy` first.");
  const rows = (await client.query("SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations")).rows;
  const done = new Set(rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name));

  const names = (await readdir(DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const pending = names.filter((n) => !done.has(n));
  if (!pending.length) { console.log(`[migrate] database is up to date (${names.length} migrations).`); process.exit(0); }

  for (const name of pending) {
    const sql = await readFile(path.join(DIR, name, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    console.log(`[migrate] applying ${name}`);
    await client.query("BEGIN");
    try {
      await client.query("UPDATE _prisma_migrations SET rolled_back_at = now() WHERE migration_name = $1 AND finished_at IS NULL AND rolled_back_at IS NULL", [name]);
      await client.query(sql);
      await client.query(
        "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES ($1, $2, now(), $3, NULL, NULL, now(), 1)",
        [randomUUID(), checksum, name],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw new Error(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
    console.log(`[migrate] applied ${name}`);
  }
  console.log("[migrate] all migrations applied.");
  process.exit(0);
} catch (e) {
  console.error(`[migrate] failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
