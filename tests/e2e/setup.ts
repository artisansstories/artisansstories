/**
 * Per-file setup for the e2e suite: safe env, external services faked, and a
 * fresh seeded database before every test.
 */
import { vi, beforeEach, afterAll } from "vitest";
import { applyE2EEnv } from "./env";

applyE2EEnv();

vi.mock("stripe", async () => {
  const { FakeStripe } = await import("./helpers/fakes");
  return { default: FakeStripe, Stripe: FakeStripe };
});
vi.mock("resend", async () => {
  const { FakeResend } = await import("./helpers/fakes");
  return { Resend: FakeResend };
});
vi.mock("@aws-sdk/client-s3", async () => {
  const f = await import("./helpers/fakes");
  return {
    S3Client: f.FakeS3Client,
    PutObjectCommand: f.PutObjectCommand,
    ListObjectsV2Command: f.ListObjectsV2Command,
    DeleteObjectsCommand: f.DeleteObjectsCommand,
    GetObjectCommand: f.GetObjectCommand,
    DeleteObjectCommand: f.DeleteObjectCommand,
  };
});
vi.mock("@sendgrid/mail", () => ({ default: { setApiKey() {}, send: async () => [{ statusCode: 202 }] } }));
vi.mock("@/lib/tracking", async () => {
  const { fakeCheckTracking } = await import("./helpers/fakes");
  return { checkTracking: fakeCheckTracking, checkUSPS: (n: string) => fakeCheckTracking("USPS", n), checkUPS: (n: string) => fakeCheckTracking("UPS", n) };
});
// Image-URL tools resolve the host before fetching; the fake image host is "public".
vi.mock("dns/promises", () => ({
  lookup: async (host: string) => {
    if (host === "images.example.test") return [{ address: "93.184.216.34", family: 4 }];
    if (host === "private.example.test") return [{ address: "10.0.0.5", family: 4 }];
    throw new Error(`[e2e] blocked DNS lookup for ${host}`);
  },
}));
// Route handlers run outside a Next request: cookies() reads the test cookie jar,
// and cache revalidation is a no-op.
vi.mock("next/headers", async () => {
  const { cookieStore, headerStore } = await import("./helpers/cookie-jar");
  return { cookies: async () => cookieStore, headers: async () => headerStore() };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: <T>(fn: T) => fn }));

const realFetch = globalThis.fetch;

beforeEach(async () => {
  const fakes = await import("./helpers/fakes");
  globalThis.fetch = fakes.guardedFetch as typeof fetch;
  fakes.resetAllFakes();
  const { resetAndSeed } = await import("./seed");
  const { prisma } = await import("@/lib/prisma");
  await resetAndSeed(prisma);
  const { __resetRateLimits } = await import("@/lib/mcp/rate-limit");
  __resetRateLimits();
  const { _clearEmailBrandingCache } = await import("@/lib/email-branding");
  _clearEmailBrandingCache();
  const { signOut } = await import("./helpers/session");
  signOut();
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
});
