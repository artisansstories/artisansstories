/**
 * admin-services/kb.ts — Knowledge Base logic shared by /api/admin/kb/* and MCP.
 *
 * Extracted verbatim from the route handlers (behavior unchanged). These routes
 * use raw `pg`, which bypasses the scoped Prisma client, so every function takes
 * an explicit `tenantId` and filters every query by it. MCP callers pass the
 * authenticated tenant (`ctx.db.$tenantId`); routes pass the admin session's.
 *
 * KB articles are internal (admin-only) docs; there is no public KB page, so
 * edits publish nothing. There are no create/delete routes.
 */
import { Client } from "pg";
import { ok, fail } from "./result";

const DB = process.env.DATABASE_URL!;

export interface KbListParams {
  search?: string;
  category?: string;
}

export async function listKbArticles(tenantId: string, p: KbListParams) {
  const search = p.search?.trim() ?? "";
  const category = p.category?.trim() ?? "";

  const client = new Client({ connectionString: DB });
  await client.connect();

  try {
    const params: string[] = [tenantId];
    let query = `
      SELECT id, title, slug, category, excerpt, "readTimeMin", "publishedAt", "updatedAt", content
      FROM "KBArticle"
      WHERE "tenantId" = $1
    `;

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (title ILIKE $${params.length} OR excerpt ILIKE $${params.length} OR content ILIKE $${params.length})`;
    }

    if (category && category !== "All") {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    query += ` ORDER BY "publishedAt" DESC`;

    const result = await client.query(query, params);

    const articles = result.rows.map((row) => {
      let matchSnippet: string | null = null;
      if (search) {
        const lc = search.toLowerCase();
        const excerptHit = row.excerpt.toLowerCase().includes(lc);
        if (!excerptHit && row.content) {
          const contentLc = row.content.toLowerCase();
          const idx = contentLc.indexOf(lc);
          if (idx !== -1) {
            const start = Math.max(0, idx - 80);
            const end = Math.min(row.content.length, idx + search.length + 80);
            matchSnippet = (start > 0 ? "…" : "") + row.content.slice(start, end).replace(/[#*`>\n]+/g, " ").trim() + (end < row.content.length ? "…" : "");
          }
        }
      }
      // Omit full content from list view
      const { content: _content, ...rest } = row;
      void _content;
      return { ...rest, matchSnippet };
    });

    // Distinct categories
    const catResult = await client.query(`SELECT DISTINCT category FROM "KBArticle" WHERE "tenantId" = $1 ORDER BY category`, [tenantId]);
    const categories = catResult.rows.map((r) => r.category);

    return ok({ articles, categories });
  } finally {
    await client.end();
  }
}

export async function getKbArticle(tenantId: string, slug: string) {
  const client = new Client({ connectionString: DB });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT * FROM "KBArticle" WHERE slug = $1 AND "tenantId" = $2`,
      [slug, tenantId]
    );
    if (result.rows.length === 0) {
      return fail(404, "Not found");
    }
    return ok({ article: result.rows[0] });
  } finally {
    await client.end();
  }
}

export interface KbArticleBody {
  title?: unknown;
  category?: unknown;
  excerpt?: unknown;
  content?: unknown;
  readTimeMin?: unknown;
}

/** Full replacement of title/category/excerpt/content/readTimeMin (as the PUT route does). */
export async function updateKbArticle(tenantId: string, slug: string, body: KbArticleBody) {
  const { title, category, excerpt, content, readTimeMin } = body;

  const client = new Client({ connectionString: DB });
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE "KBArticle"
       SET title = $1, category = $2, excerpt = $3, content = $4, "readTimeMin" = $5, "updatedAt" = NOW()
       WHERE slug = $6 AND "tenantId" = $7
       RETURNING *`,
      [title, category, excerpt, content, readTimeMin, slug, tenantId]
    );
    if (result.rows.length === 0) {
      return fail(404, "Not found");
    }
    return ok({ article: result.rows[0] });
  } finally {
    await client.end();
  }
}

const KB_FIELDS = ["title", "category", "excerpt", "content", "readTimeMin"] as const;

/**
 * MCP partial update: overlay the patch on the current article so omitted
 * fields keep their values (the PUT route would otherwise write NULLs).
 */
export async function mergeKbPatch(tenantId: string, slug: string, patch: KbArticleBody) {
  const cur = await getKbArticle(tenantId, slug);
  if (!cur.ok) return cur;
  const current = cur.data.article as Record<string, unknown>;
  const body: KbArticleBody = {};
  for (const k of KB_FIELDS) body[k] = patch[k] !== undefined ? patch[k] : current[k];
  return ok({ current, body });
}

export async function previewUpdateKbArticle(tenantId: string, slug: string, patch: KbArticleBody) {
  const m = await mergeKbPatch(tenantId, slug, patch);
  if (!m.ok) return m;
  const { current, body } = m.data;
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of KB_FIELDS) {
    if (current[k] !== body[k]) {
      // Content can be long; show sizes rather than full text for it.
      changes[k] =
        k === "content"
          ? { before: `${String(current[k] ?? "").length} chars`, after: `${String(body[k] ?? "").length} chars` }
          : { before: current[k], after: body[k] };
    }
  }
  return ok({
    slug,
    title: current.title,
    changes,
    note: Object.keys(changes).length ? "Internal admin knowledge base article; nothing is published publicly." : "No changes.",
  });
}
