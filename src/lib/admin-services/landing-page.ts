/**
 * admin-services/landing-page.ts — landing page CMS logic shared by
 * /api/admin/landing-page/* and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged).
 *
 * Data lives in the raw-SQL table "LandingPageSettings" (not in the Prisma
 * schema; see prisma/migrations/add_landing_page_*.sql). It is a single GLOBAL
 * row `id = 'singleton'` with NO tenantId column — it is the house (Artisans
 * Stories) public landing page. Only the house tenant may reach these functions
 * (the MCP tools are houseOnly and also check ctx.isHouse).
 *
 * Additions for MCP only: `landingPageParams` (the exact values the upsert
 * writes), `previewLandingPageUpdate`, and the shared upload helper.
 */
import { randomUUID } from "crypto";
import sharp from "sharp";
import { Client } from "pg";
import { putObject, publicUrl } from "@/lib/r2";
import { ok, type ServiceResult } from "./result";

type Row = Record<string, unknown>;

async function withPg<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end();
  }
}

// ── settings ────────────────────────────────────────────────────────────────

export async function getLandingPageSettings(): Promise<ServiceResult<{ settings: Row | null }>> {
  return withPg(async (client) => {
    const result = await client.query(`SELECT * FROM "LandingPageSettings" WHERE id = 'singleton'`);
    return ok({ settings: result.rows[0] || null });
  });
}

/** Request body accepted by POST /api/admin/landing-page/settings (full replacement). */
export type LandingPageBody = Record<string, unknown>;

/** Column order matches $1..$22 of the upsert below. */
export const LANDING_PAGE_COLUMNS = [
  "heroTitle",
  "heroSubtitle",
  "heroCTA",
  "heroImageUrl",
  "backgroundImageUrl",
  "aboutTitle",
  "aboutContent",
  "aboutImageUrl",
  "footerText",
  "midSectionContent",
  "showComingSoonBadge",
  "comingSoonText",
  "showLogo",
  "showHeroImage",
  "showAboutSection",
  "showMidSection",
  "showEmailForm",
  "showSocialIcons",
  "socialLinks",
  "emailButtonText",
  "emailButtonColor",
  "emailSubText",
] as const;

/** The exact values bound to $1..$22 (defaults applied exactly as the route does). */
export function landingPageParams(body: LandingPageBody): unknown[] {
  return [
    body.heroTitle,
    body.heroSubtitle || null,
    body.heroCTA,
    body.heroImageUrl || null,
    body.backgroundImageUrl || null,
    body.aboutTitle,
    body.aboutContent || null,
    body.aboutImageUrl || null,
    body.footerText,
    body.midSectionContent || null,
    body.showComingSoonBadge ?? true,
    body.comingSoonText || 'Coming Soon',
    body.showLogo ?? true,
    body.showHeroImage ?? true,
    body.showAboutSection ?? true,
    body.showMidSection ?? true,
    body.showEmailForm ?? true,
    body.showSocialIcons ?? true,
    JSON.stringify(body.socialLinks || []),
    body.emailButtonText || 'Notify Me When We Launch',
    body.emailButtonColor || '#8B6914',
    body.emailSubText || 'No spam, ever · Just our launch announcement',
  ];
}

export async function saveLandingPageSettings(body: LandingPageBody): Promise<ServiceResult<{ settings: Row }>> {
  console.log('[Landing Page Settings] Saving:', {
    aboutTitle: body.aboutTitle,
    aboutContentLength: ((body.aboutContent as string) || '').length,
    heroTitle: body.heroTitle,
  });
  return withPg(async (client) => {
    const result = await client.query(
      `INSERT INTO "LandingPageSettings" (
        id, "heroTitle", "heroSubtitle", "heroCTA", "heroImageUrl", "backgroundImageUrl",
        "aboutTitle", "aboutContent", "aboutImageUrl", "footerText",
        "midSectionContent", "showComingSoonBadge", "comingSoonText",
        "showLogo", "showHeroImage", "showAboutSection", "showMidSection",
        "showEmailForm", "showSocialIcons", "socialLinks",
        "emailButtonText", "emailButtonColor", "emailSubText", "updatedAt"
      )
      VALUES ('singleton', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW())
      ON CONFLICT (id) DO UPDATE SET
        "heroTitle" = $1,
        "heroSubtitle" = $2,
        "heroCTA" = $3,
        "heroImageUrl" = $4,
        "backgroundImageUrl" = $5,
        "aboutTitle" = $6,
        "aboutContent" = $7,
        "aboutImageUrl" = $8,
        "footerText" = $9,
        "midSectionContent" = $10,
        "showComingSoonBadge" = $11,
        "comingSoonText" = $12,
        "showLogo" = $13,
        "showHeroImage" = $14,
        "showAboutSection" = $15,
        "showMidSection" = $16,
        "showEmailForm" = $17,
        "showSocialIcons" = $18,
        "socialLinks" = $19,
        "emailButtonText" = $20,
        "emailButtonColor" = $21,
        "emailSubText" = $22,
        "updatedAt" = NOW()
      RETURNING *`,
      landingPageParams(body)
    );

    console.log('[Landing Page Settings] Saved successfully');
    return ok({ settings: result.rows[0] });
  });
}

function norm(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

/** Read-only: diff the current singleton row against what saveLandingPageSettings(body) writes. */
export async function previewLandingPageUpdate(body: LandingPageBody) {
  const cur = await getLandingPageSettings();
  if (!cur.ok) return cur;
  const row = cur.data.settings ?? {};
  const params = landingPageParams(body);
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  LANDING_PAGE_COLUMNS.forEach((col, i) => {
    const before = row[col];
    const raw = params[i];
    const after = col === "socialLinks" ? JSON.parse(raw as string) : raw ?? null;
    if (norm(before) !== norm(after)) changes[col] = { before: before ?? null, after };
  });
  return ok({
    affects: "The public Artisans Stories landing page (shown to every visitor while the store is not live)",
    createsRow: !cur.data.settings,
    changedFields: Object.keys(changes),
    changes,
    noop: Object.keys(changes).length === 0,
  });
}

// ── upload ──────────────────────────────────────────────────────────────────

export interface UploadFile {
  buffer: Buffer;
  name: string;
  type: string;
}

/**
 * Store a landing-page image. `tenantId` must come from the admin session /
 * verified MCP credential (never the request body); falls back to the
 * historical flat key when absent.
 */
export async function uploadLandingPageImage(
  tenantId: string | undefined | null,
  field: string,
  file: UploadFile,
): Promise<ServiceResult<{ url: string }>> {
  const buffer = file.buffer;
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  // Bring landing-page assets onto the WebP standard (specs row 4): rasters →
  // single max-width-2000 q85 WebP, like the product full-size. SVG (and
  // anything sharp can't raster) is stored raw so it isn't corrupted.
  const isSvg = file.type === "image/svg+xml" || ext === "svg";
  let body: Buffer = buffer;
  let outExt = ext || "bin";
  let contentType = file.type || "application/octet-stream";
  if (!isSvg) {
    try {
      body = await sharp(buffer)
        .resize({ width: 2000, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      outExt = "webp";
      contentType = "image/webp";
    } catch {
      // Non-raster input sharp can't decode — fall back to raw passthrough.
      body = buffer;
      outExt = ext || "bin";
      contentType = file.type || "application/octet-stream";
    }
  }

  const key = tenantId
    ? `tenants/${tenantId}/landing-page/${field}-${randomUUID()}.${outExt}`
    : `landing-page/${field}-${randomUUID()}.${outExt}`;

  await putObject(key, body, contentType);

  return ok({ url: publicUrl(key) });
}
