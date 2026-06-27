/**
 * seed-platform-operator.ts — Bootstrap platform operators (P9)
 *
 * Idempotent. Run with: npx tsx scripts/seed-platform-operator.ts
 *
 * Upserts the bootstrap operator(s) by email. Running twice yields exactly the
 * same rows (no dupes) — each upsert sets isActive:true on update and creates
 * with the configured name otherwise.
 *
 * Source of emails: PLATFORM_OPERATOR_EMAILS (comma-separated) if set, else the
 * two default bootstrap operators below. Names are taken from DEFAULT_OPERATORS
 * when known, otherwise derived from the local-part of the email.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import * as path from "path";

// --- load DATABASE_URL from .env / .env.local (tsx does not do this for us) ---
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
const root = path.resolve(__dirname, "..");
loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));

// Default bootstrap operators (used when PLATFORM_OPERATOR_EMAILS is unset).
const DEFAULT_OPERATORS: { email: string; name: string }[] = [
  { email: "wayne@orangeslicesport.com", name: "Wayne Kool" },
  { email: "mike@orangeslicesport.com", name: "Mike" },
];

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/** Build the operator list from env override, falling back to defaults. */
function resolveOperators(): { email: string; name: string }[] {
  const raw = process.env.PLATFORM_OPERATOR_EMAILS;
  if (!raw || !raw.trim()) return DEFAULT_OPERATORS;

  const knownName = new Map(DEFAULT_OPERATORS.map((o) => [o.email.toLowerCase(), o.name]));
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"))
    .map((email) => ({
      email,
      // Prefer a known name; otherwise derive a readable name from the local-part.
      name: knownName.get(email) ?? email.split("@")[0],
    }));
}

async function main() {
  console.log("=== P9 platform-operator bootstrap ===\n");

  const operators = resolveOperators();
  if (operators.length === 0) {
    throw new Error("No operators to seed (PLATFORM_OPERATOR_EMAILS yielded none).");
  }

  for (const { email, name } of operators) {
    const op = await prisma.platformOperator.upsert({
      where: { email },
      update: { isActive: true },
      create: { email, name, isActive: true },
    });
    console.log(`  upserted: ${op.email.padEnd(32)} name="${op.name}" active=${op.isActive}`);
  }

  // Print the resulting rows for the seeded emails.
  const rows = await prisma.platformOperator.findMany({
    where: { email: { in: operators.map((o) => o.email) } },
    orderBy: { email: "asc" },
  });

  console.log("\n=== PlatformOperator rows ===");
  for (const r of rows) {
    console.log(
      `  id=${r.id} email=${r.email} name="${r.name}" role=${r.role} active=${r.isActive}`,
    );
  }
  console.log(`\nTotal seeded operators: ${rows.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
