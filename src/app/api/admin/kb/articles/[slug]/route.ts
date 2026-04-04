import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { Client } from "pg";

const DB = process.env.DATABASE_URL!;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  await requireAdminSession();
  const { slug } = await params;

  const client = new Client({ connectionString: DB });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT * FROM "KBArticle" WHERE slug = $1`,
      [slug]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ article: result.rows[0] });
  } finally {
    await client.end();
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  await requireAdminSession();
  const { slug } = await params;

  const body = await req.json();
  const { title, category, excerpt, content, readTimeMin } = body;

  const client = new Client({ connectionString: DB });
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE "KBArticle"
       SET title = $1, category = $2, excerpt = $3, content = $4, "readTimeMin" = $5, "updatedAt" = NOW()
       WHERE slug = $6
       RETURNING *`,
      [title, category, excerpt, content, readTimeMin, slug]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ article: result.rows[0] });
  } finally {
    await client.end();
  }
}
