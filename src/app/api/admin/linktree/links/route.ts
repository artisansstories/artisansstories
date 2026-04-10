import { NextResponse } from "next/server";
import { Client } from "pg";
import { randomUUID } from "crypto";

export async function GET() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const result = await client.query(`SELECT * FROM "LinkTreeLink" ORDER BY "sortOrder" ASC`);
    return NextResponse.json({ links: result.rows });
  } catch (error) {
    console.error("Failed to fetch links:", error);
    return NextResponse.json({ error: "Failed to fetch links" }, { status: 500 });
  } finally {
    await client.end();
  }
}

export async function POST(req: Request) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    const body = await req.json();
    await client.connect();
    
    const maxOrder = await client.query(`SELECT MAX("sortOrder") as max FROM "LinkTreeLink"`);
    const nextOrder = (maxOrder.rows[0]?.max ?? -1) + 1;
    
    const result = await client.query(
      `INSERT INTO "LinkTreeLink" (id, title, url, description, icon, "isEnabled", "sortOrder", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [randomUUID(), body.title, body.url, body.description || null, body.icon || null, true, nextOrder]
    );
    
    return NextResponse.json({ link: result.rows[0] });
  } catch (error) {
    console.error("Failed to create link:", error);
    return NextResponse.json({ error: "Failed to create link" }, { status: 500 });
  } finally {
    await client.end();
  }
}

export async function PUT(req: Request) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    const body = await req.json();
    await client.connect();
    
    const result = await client.query(
      `UPDATE "LinkTreeLink"
       SET title = COALESCE($2, title),
           url = COALESCE($3, url),
           description = $4,
           "isEnabled" = COALESCE($5, "isEnabled"),
           "updatedAt" = NOW()
       WHERE id = $1
       RETURNING *`,
      [body.id, body.title, body.url, body.description || null, body.isEnabled]
    );
    
    return NextResponse.json({ link: result.rows[0] });
  } catch (error) {
    console.error("Failed to update link:", error);
    return NextResponse.json({ error: "Failed to update link" }, { status: 500 });
  } finally {
    await client.end();
  }
}

export async function DELETE(req: Request) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    
    await client.connect();
    await client.query(`DELETE FROM "LinkTreeLink" WHERE id = $1`, [id]);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete link:", error);
    return NextResponse.json({ error: "Failed to delete link" }, { status: 500 });
  } finally {
    await client.end();
  }
}
