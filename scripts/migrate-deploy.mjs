// Applies pending database migrations before a production build (Vercel provides DATABASE_URL).
// - The migration lock is disabled: Supabase's connection pooler does not support the advisory lock Prisma waits on.
//   Deploys run one at a time, so the lock is not needed.
// - A hard time limit makes a stuck migration fail the build quickly; the current live version then stays up.
import { spawn } from "node:child_process";

const LIMIT_MS = 3 * 60_000;
const child = spawn("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" },
});
const timer = setTimeout(() => {
  console.error(`prisma migrate deploy did not finish within ${LIMIT_MS / 1000}s; stopping the build so the live version stays up.`);
  child.kill("SIGKILL");
  process.exit(1);
}, LIMIT_MS);
child.on("exit", (code) => { clearTimeout(timer); process.exit(code ?? 1); });
