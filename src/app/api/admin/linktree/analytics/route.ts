import { NextResponse } from "next/server";
import { Client } from "pg";
import { requireAdminSession } from "@/lib/admin-auth";
import { resolveTenantFromAdminSession, DEFAULT_TENANT_ID } from "@/lib/tenant-context";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    // Raw pg bypasses the scoped client — every query is filtered by tenant.
    const tenantId = (await resolveTenantFromAdminSession()) ?? DEFAULT_TENANT_ID;
    await client.connect();

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

    return NextResponse.json({
      linkClicks: linkClicks.rows,
      recentLog: recentLog.rows,
      dailyTotals: dailyTotals.rows,
      totalAllTime: linkClicks.rows.reduce((s: number, r: { clicks: string }) => s + parseInt(r.clicks || "0"), 0),
    });
  } catch (err) {
    console.error("[linktree analytics]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  } finally {
    await client.end();
  }
}
