/**
 * Environment for the e2e suite. Imported first by tests/e2e/setup.ts and
 * evaluated by vitest.e2e.config.ts, before any application module loads.
 *
 * SAFETY: .env / .env.local point at the PRODUCTION Neon database and hold live
 * Stripe / Resend / R2 keys. Nothing here reads them: every external secret is
 * replaced with an inert dummy, and DATABASE_URL must be the local throwaway
 * cluster (scripts/test-db.sh) or the suite refuses to run.
 */
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:54329/artisans_test";

export function assertLocalDatabaseUrl(url: string | undefined): void {
  if (!url) throw new Error("[e2e] DATABASE_URL is not set");
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("[e2e] DATABASE_URL is not a valid URL");
  }
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`[e2e] REFUSING TO RUN: DATABASE_URL host is "${host}", not localhost/127.0.0.1`);
  }
}

export const E2E_ENV: Record<string, string> = {
  DATABASE_URL: E2E_DATABASE_URL,
  NODE_ENV: "test",
  NEXTAUTH_SECRET: "e2e-nextauth-secret-e2e-nextauth-secret",
  MCP_ENABLED: "true",
  MCP_TOKEN_SECRET: "e2e-mcp-token-secret-e2e-mcp-token-secret-0123",
  NEXT_PUBLIC_SITE_URL: "https://artisansstories.com",
  // Inert dummies; the SDK modules are mocked anyway.
  STRIPE_SECRET_KEY: "sk_test_e2e_dummy",
  RESEND_API_KEY: "re_e2e_dummy",
  SENDGRID_API_KEY: "SG.e2e-dummy",
  R2_ACCOUNT_ID: "e2e-account",
  R2_ACCESS_KEY_ID: "e2e-access-key",
  R2_SECRET_ACCESS_KEY: "e2e-secret",
  R2_BUCKET_NAME: "e2e-bucket",
  R2_PUBLIC_URL: "https://r2.e2e.test",
};

/** Secrets that must never be visible to the suite. */
export const E2E_UNSET = [
  "OPENROUTER_API_KEY",
  "INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
  "USPS_CLIENT_ID",
  "USPS_CLIENT_SECRET",
  "UPS_CLIENT_ID",
  "UPS_CLIENT_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "STRIPE_WEBHOOK_SECRET",
];

export function applyE2EEnv(): void {
  for (const k of E2E_UNSET) delete process.env[k];
  Object.assign(process.env, E2E_ENV);
  assertLocalDatabaseUrl(process.env.DATABASE_URL);
}
