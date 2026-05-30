import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    const { linkId } = await request.json() as { linkId: string };
    if (!linkId) return NextResponse.json({ error: "linkId required" }, { status: 400 });

    const userAgent = request.headers.get("user-agent") ?? null;
    const referrer = request.headers.get("referer") ?? null;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip")
      ?? null;

    await client.connect();

    // Increment click count + log entry atomically
    await client.query(`UPDATE "LinkTreeLink" SET clicks = clicks + 1 WHERE id = $1`, [linkId]);
    await client.query(
      `INSERT INTO "LinkTreeClickLog" (id, "linkId", "userAgent", referrer, ip) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), linkId, userAgent, referrer, ip]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/links/click]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  } finally {
    await client.end();
  }
}
