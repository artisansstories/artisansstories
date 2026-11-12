/**
 * admin-services/email-template.ts — welcome-email template logic shared by
 * /api/admin/email-template/* and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged). The routes
 * use raw `pg`, which bypasses the scoped Prisma client, so every statement is
 * scoped to the tenant by hand — the caller passes the resolved tenantId.
 * WelcomeEmailTemplate is one-per-tenant (@@unique([tenantId])).
 *
 * Additions for MCP only: `emailTemplateParams` (the exact column values the
 * UPDATE writes, so previews show the real effect), `previewEmailTemplateUpdate`,
 * and the upload helper shared by upload-logo / upload-avatar.
 */
import { Client } from "pg";
import { putObject, publicUrl } from "@/lib/r2";
import { ok, fail, type ServiceResult } from "./result";

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

// ── read ────────────────────────────────────────────────────────────────────

export async function getEmailTemplate(tenantId: string): Promise<ServiceResult<{ template: Row | null }>> {
  return withPg(async (client) => {
    const result = await client.query(`SELECT * FROM "WelcomeEmailTemplate" WHERE "tenantId" = $1`, [tenantId]);
    return ok({ template: result.rows[0] || null });
  });
}

// ── update ──────────────────────────────────────────────────────────────────

/** Request body accepted by POST /api/admin/email-template (full replacement). */
export type EmailTemplateBody = Record<string, unknown>;

/** Column order matches $1..$30 of the UPDATE below. */
export const EMAIL_TEMPLATE_COLUMNS = [
  "logoUrl",
  "headerBgColor",
  "cardBgColor",
  "greetingText",
  "greetingItalic",
  "bodyParagraph1",
  "bodyParagraph2",
  "bulletSectionTitle",
  "bullet1Label",
  "bullet1Text",
  "bullet2Label",
  "bullet2Text",
  "bullet3Label",
  "bullet3Text",
  "closingText",
  "signatureText",
  "signatureName",
  "signatureSubtitle",
  "avatarUrl",
  "instagramUrl",
  "tiktokUrl",
  "instagramButtonColor",
  "tiktokButtonColor",
  "textColorDark",
  "textColorMedium",
  "textColorLight",
  "accentColor",
  "bodyHtml",
  "socialLinks",
  "signatureData",
] as const;

/** The exact values bound to $1..$30 (defaults applied exactly as the route does). */
export function emailTemplateParams(body: EmailTemplateBody): unknown[] {
  return [
    body.logoUrl,
    body.headerBgColor,
    body.cardBgColor,
    body.greetingText,
    body.greetingItalic ?? true,
    body.bodyParagraph1,
    body.bodyParagraph2,
    body.bulletSectionTitle,
    body.bullet1Label,
    body.bullet1Text,
    body.bullet2Label,
    body.bullet2Text,
    body.bullet3Label,
    body.bullet3Text,
    body.closingText,
    body.signatureText,
    body.signatureName,
    body.signatureSubtitle,
    body.avatarUrl,
    body.instagramUrl,
    body.tiktokUrl,
    body.instagramButtonColor || '#E4405F',
    body.tiktokButtonColor || '#000000',
    body.textColorDark || '#4a3728',
    body.textColorMedium || '#5a4a3a',
    body.textColorLight || '#a89070',
    body.accentColor || '#c8956c',
    body.bodyHtml,
    body.socialLinks ? JSON.stringify(body.socialLinks) : null,
    body.signatureData ? JSON.stringify(body.signatureData) : null,
  ];
}

export async function saveEmailTemplate(
  tenantId: string,
  body: EmailTemplateBody,
): Promise<ServiceResult<{ template: Row | undefined }>> {
  return withPg(async (client) => {
    const result = await client.query(
      `UPDATE "WelcomeEmailTemplate"
       SET
         "logoUrl" = $1,
         "headerBgColor" = $2,
         "cardBgColor" = $3,
         "greetingText" = $4,
         "greetingItalic" = $5,
         "bodyParagraph1" = $6,
         "bodyParagraph2" = $7,
         "bulletSectionTitle" = $8,
         "bullet1Label" = $9,
         "bullet1Text" = $10,
         "bullet2Label" = $11,
         "bullet2Text" = $12,
         "bullet3Label" = $13,
         "bullet3Text" = $14,
         "closingText" = $15,
         "signatureText" = $16,
         "signatureName" = $17,
         "signatureSubtitle" = $18,
         "avatarUrl" = $19,
         "instagramUrl" = $20,
         "tiktokUrl" = $21,
         "instagramButtonColor" = $22,
         "tiktokButtonColor" = $23,
         "textColorDark" = $24,
         "textColorMedium" = $25,
         "textColorLight" = $26,
         "accentColor" = $27,
         "bodyHtml" = $28,
         "socialLinks" = $29::jsonb,
         "signatureData" = $30::jsonb,
         "updatedAt" = NOW()
       WHERE "tenantId" = $31
       RETURNING *`,
      [...emailTemplateParams(body), tenantId]
    );

    return ok({ template: result.rows[0] });
  });
}

/** Normalize a column value for comparison (jsonb comes back parsed; params are strings). */
function norm(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

/**
 * Read-only: diff the current row against what saveEmailTemplate(body) would
 * write. The route only UPDATEs, so a missing row means nothing would change.
 */
export async function previewEmailTemplateUpdate(tenantId: string, body: EmailTemplateBody) {
  const cur = await getEmailTemplate(tenantId);
  if (!cur.ok) return cur;
  const row = cur.data.template;
  if (!row) return fail(404, "No email template exists for this store yet; create it in the admin first.");
  const params = emailTemplateParams(body);
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  EMAIL_TEMPLATE_COLUMNS.forEach((col, i) => {
    const before = row[col];
    const raw = params[i];
    const after = (col === "socialLinks" || col === "signatureData") && typeof raw === "string" ? JSON.parse(raw) : raw ?? null;
    if (norm(before) !== norm(after)) changes[col] = { before: before ?? null, after };
  });
  return ok({
    affects: "The welcome email sent to new subscribers",
    changedFields: Object.keys(changes),
    changes,
    noop: Object.keys(changes).length === 0,
  });
}

// ── uploads (upload-logo / upload-avatar) ───────────────────────────────────

export interface UploadFile {
  buffer: Buffer;
  name: string;
  type: string;
}

export type EmailImageKind = "logo" | "avatar";

/** Key the route would use (ext from the file name, default jpg). */
export function emailImageKey(kind: EmailImageKind, name: string, now = Date.now()): string {
  const ext = name.split(".").pop() || "jpg";
  return `email/${kind}-${now}.${ext}`;
}

export async function uploadEmailTemplateImage(
  kind: EmailImageKind,
  file: UploadFile,
): Promise<ServiceResult<{ url: string; filename: string }>> {
  const key = emailImageKey(kind, file.name);
  await putObject(key, file.buffer, file.type);
  return ok({ url: publicUrl(key), filename: file.name });
}
