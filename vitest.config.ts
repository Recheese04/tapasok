import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

dotenv.config();

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    // Tests share one database and truncate it between tests, so files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    // The app code under test reads DATABASE_URL; point it at the test database, never the dev one.
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      QR_SECRET: "test-only-qr-secret-0123456789abcdef0123456789",
      STORAGE_DIR: path.resolve(__dirname, "tests/.tmp-storage"),
    },
  },
});
