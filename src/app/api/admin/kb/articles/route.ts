import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { Client } from "pg";

const DB = process.env.DATABASE_URL!;

export async function GET(req: NextRequest) {
  await requireAdminSession();

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const category = searchParams.get("category")?.trim() ?? "";

  const client = new Client({ connectionString: DB });
  await client.connect();

  try {
    let query = `
      SELECT id, title, slug, category, excerpt, "readTimeMin", "publishedAt", "updatedAt", content
      FROM "KBArticle"
      WHERE 1=1
    `;
    const params: string[] = [];

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
    const catResult = await client.query(`SELECT DISTINCT category FROM "KBArticle" ORDER BY category`);
    const categories = catResult.rows.map((r) => r.category);

    return NextResponse.json({ articles, categories });
  } finally {
    await client.end();
  }
}
