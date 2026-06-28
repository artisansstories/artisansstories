import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import { randomUUID } from "crypto";
import { resolveTenantFromHost } from "@/lib/tenant-context";

export async function POST(request: NextRequest) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    const { linkId } = await request.json() as { linkId: string };
    if (!linkId) return NextResponse.json({ error: "linkId required" }, { status: 400 });

    // Raw pg bypasses the scoped Prisma client — apply the tenant filter/stamp by hand.
    const tenantId = await resolveTenantFromHost(request);

    const userAgent = request.headers.get("user-agent") ?? null;
    const referrer = request.headers.get("referer") ?? null;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip")
      ?? null;

    await client.connect();

    // Increment click count + log entry atomically
    await client.query(`UPDATE "LinkTreeLink" SET clicks = clicks + 1 WHERE id = $1 AND "tenantId" = $2`, [linkId, tenantId]);
    await client.query(
      `INSERT INTO "LinkTreeClickLog" (id, "tenantId", "linkId", "userAgent", referrer, ip) VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), tenantId, linkId, userAgent, referrer, ip]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/links/click]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  } finally {
    await client.end();
  }
}
