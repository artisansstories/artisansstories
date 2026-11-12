/**
 * admin-services/linktree.ts — Link Hub logic shared by /api/admin/linktree/*
 * and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged). These use raw
 * `pg`, which bypasses the scoped Prisma client, so the tenant filter/stamp is
 * applied by hand on every statement — the caller passes the resolved tenantId
 * (admin session in routes, verified credential in MCP; never request input).
 *
 * Additions for MCP only: `getLinkTreeLink` and the read-only `preview*`
 * functions.
 */
import { Client } from "pg";
import { randomUUID } from "crypto";
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

function norm(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

function diff(before: Row, after: Row) {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const [k, v] of Object.entries(after)) {
    if (norm(before[k]) !== norm(v)) changes[k] = { before: before[k] ?? null, after: v ?? null };
  }
  return { changedFields: Object.keys(changes), changes, noop: Object.keys(changes).length === 0 };
}

// ── settings ────────────────────────────────────────────────────────────────

export async function getLinkTreeSettings(tenantId: string): Promise<ServiceResult<{ settings: Row | null }>> {
  return withPg(async (client) => {
    const result = await client.query(
      `SELECT * FROM "LinkTreeSettings" WHERE "tenantId" = $1`,
      [tenantId]
    );
    return ok({ settings: result.rows[0] || null });
  });
}

/** Request body accepted by POST /api/admin/linktree/settings (full replacement). */
export type LinkTreeSettingsBody = Record<string, unknown>;

/** The exact values the upsert writes (defaults applied exactly as the route does). */
export function linkTreeSettingsValues(body: LinkTreeSettingsBody): Row {
  return {
    isEnabled: body.isEnabled,
    profileName: body.profileName,
    profileBio: body.profileBio || null,
    profileImageUrl: body.profileImageUrl || null,
    customSlug: body.customSlug || null,
    backgroundColor: body.backgroundColor,
    buttonColor: body.buttonColor,
    textColor: body.textColor,
  };
}

export async function saveLinkTreeSettings(
  tenantId: string,
  body: LinkTreeSettingsBody,
): Promise<ServiceResult<{ settings: Row }>> {
  return withPg(async (client) => {
    // Upsert on tenantId (one settings row per tenant). `id` is supplied: the
    // schema's cuid() default is Prisma-side only (no DB default under
    // `prisma db push`; prod's raw-SQL default is the constant 'singleton'),
    // and Postgres checks NOT NULL before ON CONFLICT, so omitting it fails
    // even an update. An existing row keeps its id (matched on tenantId).
    const result = await client.query(
      `INSERT INTO "LinkTreeSettings" (id, "tenantId", "isEnabled", "profileName", "profileBio", "profileImageUrl", "customSlug", "backgroundColor", "buttonColor", "textColor", "updatedAt")
       VALUES ($10, $9, $1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT ("tenantId") DO UPDATE SET
         "isEnabled" = $1,
         "profileName" = $2,
         "profileBio" = $3,
         "profileImageUrl" = $4,
         "customSlug" = $5,
         "backgroundColor" = $6,
         "buttonColor" = $7,
         "textColor" = $8,
         "updatedAt" = NOW()
       RETURNING *`,
      [
        body.isEnabled,
        body.profileName,
        body.profileBio || null,
        body.profileImageUrl || null,
        body.customSlug || null,
        body.backgroundColor,
        body.buttonColor,
        body.textColor,
        tenantId,
        randomUUID(),
      ]
    );

    return ok({ settings: result.rows[0] });
  });
}

export async function previewLinkTreeSettings(tenantId: string, body: LinkTreeSettingsBody) {
  const cur = await getLinkTreeSettings(tenantId);
  if (!cur.ok) return cur;
  const after = linkTreeSettingsValues(body);
  return ok({
    affects: "The public Link Hub page (/links)",
    createsRow: !cur.data.settings,
    ...diff(cur.data.settings ?? {}, after),
  });
}

// ── links ───────────────────────────────────────────────────────────────────

export async function listLinkTreeLinks(tenantId: string): Promise<ServiceResult<{ links: Row[] }>> {
  return withPg(async (client) => {
    const result = await client.query(
      `SELECT * FROM "LinkTreeLink" WHERE "tenantId" = $1 ORDER BY "sortOrder" ASC`,
      [tenantId]
    );
    return ok({ links: result.rows });
  });
}

export async function getLinkTreeLink(tenantId: string, id: string): Promise<Row | null> {
  return withPg(async (client) => {
    const result = await client.query(
      `SELECT * FROM "LinkTreeLink" WHERE id = $1 AND "tenantId" = $2`,
      [id, tenantId]
    );
    return result.rows[0] || null;
  });
}

export interface LinkCreateBody {
  title?: unknown;
  url?: unknown;
  description?: unknown;
  icon?: unknown;
}

export async function createLinkTreeLink(
  tenantId: string,
  body: LinkCreateBody,
): Promise<ServiceResult<{ link: Row }>> {
  if (typeof body.title !== "string" || !body.title.trim() || typeof body.url !== "string" || !body.url.trim()) {
    return fail(400, "title and url are required");
  }
  return withPg(async (client) => {
    const maxOrder = await client.query(
      `SELECT MAX("sortOrder") as max FROM "LinkTreeLink" WHERE "tenantId" = $1`,
      [tenantId]
    );
    const nextOrder = (maxOrder.rows[0]?.max ?? -1) + 1;

    const result = await client.query(
      `INSERT INTO "LinkTreeLink" (id, "tenantId", title, url, description, icon, "isEnabled", "sortOrder", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [randomUUID(), tenantId, body.title, body.url, body.description || null, body.icon || null, true, nextOrder]
    );

    return ok({ link: result.rows[0] });
  });
}

export async function previewCreateLinkTreeLink(tenantId: string, body: LinkCreateBody) {
  const cur = await listLinkTreeLinks(tenantId);
  if (!cur.ok) return cur;
  return ok({
    affects: "The public Link Hub page (/links)",
    willCreate: {
      title: body.title,
      url: body.url,
      description: body.description || null,
      icon: body.icon || null,
      isEnabled: true,
      position: cur.data.links.length + 1,
    },
    existingLinkCount: cur.data.links.length,
  });
}

export interface LinkUpdateBody {
  id?: unknown;
  title?: unknown;
  url?: unknown;
  description?: unknown;
  isEnabled?: unknown;
}

/** Note: `description` is always overwritten (missing → NULL); `icon` is not updatable here. */
export async function updateLinkTreeLink(
  tenantId: string,
  body: LinkUpdateBody,
): Promise<ServiceResult<{ link: Row }>> {
  if (typeof body.id !== "string" || !body.id) return fail(400, "id is required");
  return withPg(async (client) => {
    const result = await client.query(
      `UPDATE "LinkTreeLink"
       SET title = COALESCE($2, title),
           url = COALESCE($3, url),
           description = $4,
           "isEnabled" = COALESCE($5, "isEnabled"),
           "updatedAt" = NOW()
       WHERE id = $1 AND "tenantId" = $6
       RETURNING *`,
      [body.id, body.title, body.url, body.description || null, body.isEnabled, tenantId]
    );
    // Unknown id, or another store's link (tenant filter matched nothing).
    if (!result.rows[0]) return fail(404, "Link not found");
    return ok({ link: result.rows[0] });
  });
}

export async function previewUpdateLinkTreeLink(tenantId: string, body: LinkUpdateBody) {
  const link = await getLinkTreeLink(tenantId, String(body.id));
  if (!link) return fail(404, "Link not found");
  const after: Row = {
    title: body.title ?? link.title,
    url: body.url ?? link.url,
    description: body.description || null,
    isEnabled: body.isEnabled ?? link.isEnabled,
  };
  return ok({ affects: "The public Link Hub page (/links)", linkId: link.id, ...diff(link, after) });
}

export async function deleteLinkTreeLink(tenantId: string, id: string | null): Promise<ServiceResult<{ success: true }>> {
  if (!id) return fail(400, "id is required");
  return withPg(async (client) => {
    const result = await client.query(`DELETE FROM "LinkTreeLink" WHERE id = $1 AND "tenantId" = $2 RETURNING id`, [id, tenantId]);
    if (!result.rows[0]) return fail(404, "Link not found");
    return ok({ success: true as const });
  });
}

export async function previewDeleteLinkTreeLink(tenantId: string, id: string) {
  const link = await getLinkTreeLink(tenantId, id);
  if (!link) return fail(404, "Link not found");
  const logs = await withPg((client) =>
    client.query(`SELECT COUNT(*)::int AS n FROM "LinkTreeClickLog" WHERE "linkId" = $1 AND "tenantId" = $2`, [id, tenantId])
  );
  return ok({
    affects: "The public Link Hub page (/links)",
    willDelete: {
      id: link.id,
      title: link.title,
      url: link.url,
      isEnabled: link.isEnabled,
      clicks: link.clicks,
    },
    clickLogRows: logs.rows[0]?.n ?? 0,
    note: "Permanent. The link's click history rows are removed with it (ON DELETE CASCADE per the schema).",
  });
}

// ── reorder ─────────────────────────────────────────────────────────────────

export async function reorderLinkTreeLinks(tenantId: string, linkIds: unknown): Promise<ServiceResult<{ success: true }>> {
  if (!Array.isArray(linkIds) || !linkIds.every((id) => typeof id === "string")) {
    return fail(400, "linkIds must be an array of link ids");
  }
  return withPg(async (client) => {
    for (let i = 0; i < linkIds.length; i++) {
      await client.query(`UPDATE "LinkTreeLink" SET "sortOrder" = $1, "updatedAt" = NOW() WHERE id = $2 AND "tenantId" = $3`, [i, linkIds[i], tenantId]);
    }
    return ok({ success: true as const });
  });
}

/**
 * Read-only: old vs new order. Stricter than the route (which silently skips
 * unknown ids): MCP requires linkIds to list every link exactly once.
 */
export async function previewReorderLinkTreeLinks(tenantId: string, linkIds: string[]) {
  const cur = await listLinkTreeLinks(tenantId);
  if (!cur.ok) return cur;
  const links = cur.data.links;
  const byId = new Map(links.map((l) => [String(l.id), l]));
  const unknown = linkIds.filter((id) => !byId.has(id));
  const dupes = linkIds.filter((id, i) => linkIds.indexOf(id) !== i);
  const missing = links.map((l) => String(l.id)).filter((id) => !linkIds.includes(id));
  if (unknown.length || dupes.length || missing.length) {
    return fail(400, "linkIds must list every existing link exactly once (use linktree_links_list).", {
      unknownIds: unknown,
      duplicateIds: [...new Set(dupes)],
      missingIds: missing,
    });
  }
  const label = (l: Row) => ({ id: l.id, title: l.title });
  return ok({
    affects: "The public Link Hub page (/links)",
    before: links.map(label),
    after: linkIds.map((id) => label(byId.get(id) as Row)),
    noop: links.every((l, i) => String(l.id) === linkIds[i]),
  });
}

// ── analytics ───────────────────────────────────────────────────────────────

export async function getLinkTreeAnalytics(tenantId: string) {
  return withPg(async (client) => {
    // Total clicks per link
    const linkClicks = await client.query(`
      SELECT l.id, l.title, l.icon, l.url, l.clicks,
        COUNT(log.id) as recent_clicks
      FROM "LinkTreeLink" l
      LEFT JOIN "LinkTreeClickLog" log
        ON log."linkId" = l.id AND log."clickedAt" > NOW() - INTERVAL '7 days'
      WHERE l."tenantId" = $1
      GROUP BY l.id, l.title, l.icon, l.url, l.clicks
      ORDER BY l.clicks DESC
    `, [tenantId]);

    // Recent click log (last 20)
    const recentLog = await client.query(`
      SELECT log.id, log."clickedAt", log.referrer, log.ip,
        l.title as "linkTitle", l.icon as "linkIcon"
      FROM "LinkTreeClickLog" log
      JOIN "LinkTreeLink" l ON l.id = log."linkId"
      WHERE l."tenantId" = $1
      ORDER BY log."clickedAt" DESC
      LIMIT 20
    `, [tenantId]);

    // Daily totals last 7 days
    const dailyTotals = await client.query(`
      SELECT DATE("clickedAt") as date, COUNT(*) as clicks
      FROM "LinkTreeClickLog"
      WHERE "clickedAt" > NOW() - INTERVAL '7 days'
        AND "tenantId" = $1
      GROUP BY DATE("clickedAt")
      ORDER BY date DESC
    `, [tenantId]);

    return ok({
      linkClicks: linkClicks.rows,
      recentLog: recentLog.rows,
      dailyTotals: dailyTotals.rows,
      totalAllTime: linkClicks.rows.reduce((s: number, r: { clicks: string }) => s + parseInt(r.clicks || "0"), 0),
    });
  });
}
