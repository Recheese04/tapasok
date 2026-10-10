import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set. Create a separate *_test database and set it in .env.");
  }
  const dbName = new URL(url).pathname.replace(/^\//, "");
  // Tests truncate every table. Refuse to run against anything that is not clearly a test database.
  if (!/_test$/.test(dbName)) {
    throw new Error(`Refusing to run tests: database "${dbName}" does not end in "_test".`);
  }
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });
}
