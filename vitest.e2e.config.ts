import { defineConfig } from "vitest/config";
import path from "path";
import { E2E_ENV, assertLocalDatabaseUrl } from "./tests/e2e/env";

// Integration suite: real route handlers + real MCP server against the local
// throwaway Postgres (scripts/test-db.sh), external services faked.
assertLocalDatabaseUrl(E2E_ENV.DATABASE_URL);

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    environment: "node",
    env: E2E_ENV,
    globalSetup: ["tests/e2e/global-setup.ts"],
    setupFiles: ["tests/e2e/setup.ts"],
    // One database: files run one at a time, each test starts from a fresh seed.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
