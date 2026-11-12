/**
 * admin-services/settings.ts — store settings + email branding shared by
 * /api/admin/settings (GET/PUT/PATCH) and MCP.
 *
 * `getSettings`, `updateSettings`, and `updateEmailBranding` are extracted
 * verbatim from the route (behavior unchanged, including GET's create-if-missing).
 * Additions for MCP: `readSettings` (never creates), `mergeEmailBranding`
 * (omitted fields keep their current value instead of being cleared), and
 * read-only `preview*` functions.
 */
import { prisma } from "@/lib/prisma";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { ok, fail, type ServiceResult } from "./result";

/**
 * Read the per-tenant email branding fields off TenantTheme (a platform/global
 * model, NOT tenant-scoped — see tenant-prisma.ts). Returned alongside the
 * StoreSettings so the admin Settings page can populate its "Email" section.
 */
export async function getEmailBrandingFields(tenantId: string) {
  const theme = await prisma.tenantTheme.findUnique({
    where: { tenantId },
    select: {
      emailFromName: true,
      emailReplyTo: true,
      emailAccentColor: true,
      emailLogoUrl: true,
    },
  });
  return {
    emailFromName: theme?.emailFromName ?? null,
    emailReplyTo: theme?.emailReplyTo ?? null,
    emailAccentColor: theme?.emailAccentColor ?? null,
    emailLogoUrl: theme?.emailLogoUrl ?? null,
  };
}

export type EmailBrandingFields = Awaited<ReturnType<typeof getEmailBrandingFields>>;
const EMAIL_KEYS = ["emailFromName", "emailReplyTo", "emailAccentColor", "emailLogoUrl"] as const;

// ── GET ─────────────────────────────────────────────────────────────────────

/** GET /api/admin/settings — creates the default StoreSettings row if missing. */
export async function getSettings(db: TenantPrisma): Promise<ServiceResult<unknown>> {
  const emailBranding = await getEmailBrandingFields(db.$tenantId);

  // Find by tenantId (the scoped client auto-injects it into findFirst)
  let settings = await db.storeSettings.findFirst({ where: {} });
  if (!settings) {
    // Create default if missing
    settings = await db.storeSettings.create({ data: {} as never });
  }
  return ok({ ...settings, ...emailBranding });
}

/** Read-only variant for MCP: never creates a row. */
export async function readSettings(db: TenantPrisma): Promise<ServiceResult<unknown>> {
  const [emailBranding, settings] = await Promise.all([
    getEmailBrandingFields(db.$tenantId),
    db.storeSettings.findFirst({ where: {} }),
  ]);
  if (!settings) {
    return ok({
      settingsRowExists: false,
      note: "No store settings saved yet; schema defaults apply (store is in Coming Soon mode).",
      ...emailBranding,
    });
  }
  return ok({ ...settings, ...emailBranding });
}

// ── PUT (StoreSettings) ─────────────────────────────────────────────────────

/** PUT /api/admin/settings — `body` is the raw request JSON (mutated, as before). */
export async function updateSettings(
  db: TenantPrisma,
  body: Record<string, unknown>,
): Promise<ServiceResult<unknown>> {
  // Remove read-only fields
  delete body.id;
  delete body.createdAt;
  delete body.updatedAt;
  // Email branding lives on TenantTheme, not StoreSettings — strip it out here
  // so the StoreSettings upsert doesn't choke on unknown columns. The Email
  // section saves through PATCH below.
  delete body.emailFromName;
  delete body.emailReplyTo;
  delete body.emailAccentColor;
  delete body.emailLogoUrl;
  // Upsert on tenantId (unique constraint); scoped client injects tenantId automatically
  const existing = await db.storeSettings.findFirst({ where: {} });
  const settings = existing
    ? await db.storeSettings.update({ where: { id: existing.id }, data: body })
    : await db.storeSettings.create({ data: body as never });
  return ok(settings);
}

/** Read-only: field-by-field before/after of a StoreSettings update. */
export async function previewUpdateSettings(
  db: TenantPrisma,
  patch: Record<string, unknown>,
): Promise<ServiceResult<unknown>> {
  const fields = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (fields.length === 0) return fail(400, "No settings fields provided to change");

  const existing = (await db.storeSettings.findFirst({ where: {} })) as Record<string, unknown> | null;
  const changes: Array<{ field: string; before: unknown; after: unknown }> = [];
  const unchanged: string[] = [];
  for (const f of fields) {
    const before = existing ? existing[f] ?? null : "(schema default)";
    if (existing && before === patch[f]) unchanged.push(f);
    else changes.push({ field: f, before, after: patch[f] });
  }

  let storeVisibility: string | undefined;
  if ("storeEnabled" in patch && patch.storeEnabled !== undefined) {
    const was = existing ? existing.storeEnabled === true : false;
    const will = patch.storeEnabled === true;
    if (!was && will) storeVisibility = "PUBLISH: the storefront goes LIVE to the public and accepts orders.";
    else if (was && !will) storeVisibility = "UNPUBLISH: the storefront returns to Coming Soon mode; shoppers can no longer buy.";
  }

  return ok({
    action: existing ? "update_store_settings" : "create_store_settings",
    ...(existing ? {} : { note: "No settings row exists yet; one is created with schema defaults plus these fields." }),
    changes,
    unchanged,
    ...(storeVisibility ? { storeVisibility } : {}),
    sendsEmail: false,
  });
}

// ── PATCH (email branding on TenantTheme) ───────────────────────────────────

const norm = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
};

/**
 * PATCH /api/admin/settings — update the tenant's email branding (E1).
 *
 * These four fields live on TenantTheme (a platform/global model), so we upsert
 * by tenantId on the raw client rather than the tenant-scoped one. Empty strings
 * are normalized to null so "leave blank to use the store default" works.
 * NOTE: all four fields are written; a field missing from `body` becomes null.
 */
export async function updateEmailBranding(
  db: TenantPrisma,
  body: Record<string, unknown>,
): Promise<ServiceResult<unknown>> {
  const data = {
    emailFromName: norm(body.emailFromName),
    emailReplyTo: norm(body.emailReplyTo),
    emailAccentColor: norm(body.emailAccentColor),
    emailLogoUrl: norm(body.emailLogoUrl),
  };

  const theme = await prisma.tenantTheme.upsert({
    where: { tenantId: db.$tenantId },
    update: data,
    create: { tenantId: db.$tenantId, ...data },
    select: {
      emailFromName: true,
      emailReplyTo: true,
      emailAccentColor: true,
      emailLogoUrl: true,
    },
  });

  return ok(theme);
}

/**
 * MCP partial update: fields omitted from `partial` keep their current value
 * (the route's PATCH would clear them). Empty string still clears a field.
 */
export async function mergeEmailBranding(
  db: TenantPrisma,
  partial: Partial<Record<(typeof EMAIL_KEYS)[number], string>>,
): Promise<{ current: EmailBrandingFields; body: Record<string, unknown> }> {
  const current = await getEmailBrandingFields(db.$tenantId);
  const body: Record<string, unknown> = {};
  for (const k of EMAIL_KEYS) body[k] = partial[k] !== undefined ? partial[k] : current[k];
  return { current, body };
}

/** Read-only: before/after of the email branding PATCH for `body`. */
export async function previewUpdateEmailBranding(
  db: TenantPrisma,
  body: Record<string, unknown>,
  current?: EmailBrandingFields,
): Promise<ServiceResult<unknown>> {
  const before = current ?? (await getEmailBrandingFields(db.$tenantId));
  const changes: Array<{ field: string; before: string | null; after: string | null }> = [];
  for (const k of EMAIL_KEYS) {
    const after = norm(body[k]);
    if (after !== before[k]) changes.push({ field: k, before: before[k], after });
  }
  if (changes.length === 0) return fail(400, "No email branding changes: the values match what is already saved");
  return ok({
    action: "update_email_branding",
    changes,
    note: "Applies to every future transactional email (order confirmations, shipping, admin sign-in). A null value falls back to the store default.",
    sendsEmail: false,
  });
}
