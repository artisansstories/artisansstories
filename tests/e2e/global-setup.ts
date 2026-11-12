/**
 * Brings up the throwaway Postgres (scripts/test-db.sh start: init if needed,
 * start, create db, prisma db push, prod-drift SQL) before the suite and stops
 * it afterwards if this run started it. E2E_KEEP_DB=1 leaves it running.
 */
import { execFileSync } from "child_process";
import path from "path";
import { E2E_ENV, assertLocalDatabaseUrl } from "./env";

const root = path.resolve(__dirname, "../..");
const script = path.join(root, "scripts/test-db.sh");

function db(cmd: string): string {
  return execFileSync("bash", [script, cmd], {
    cwd: root,
    encoding: "utf8",
    // Only the local URL; nothing from .env reaches the schema push.
    env: { ...process.env, DATABASE_URL: E2E_ENV.DATABASE_URL, TEST_DB_NAME: new URL(E2E_ENV.DATABASE_URL).pathname.slice(1) },
  }).trim();
}

export default function setup() {
  assertLocalDatabaseUrl(E2E_ENV.DATABASE_URL);
  const wasRunning = db("status").startsWith("running");
  const url = db("start").split("\n").pop();
  assertLocalDatabaseUrl(url);
  if (url !== E2E_ENV.DATABASE_URL) throw new Error(`[e2e] test-db.sh started ${url}, expected ${E2E_ENV.DATABASE_URL}`);
  return () => {
    if (!wasRunning && process.env.E2E_KEEP_DB !== "1") db("stop");
  };
}
