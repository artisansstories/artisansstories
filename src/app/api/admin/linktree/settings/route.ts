import { NextResponse } from "next/server";
import { Client } from "pg";
import { resolveTenantFromAdminSession, DEFAULT_TENANT_ID } from "@/lib/tenant-context";

// Raw `pg` SQL bypasses the scoped Prisma client; tenant filter/stamp applied by
// hand. LinkTreeSettings is one-per-tenant (@@unique([tenantId])).

export async function GET() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    const tenantId = (await resolveTenantFromAdminSession()) ?? DEFAULT_TENANT_ID;
    await client.connect();
    const result = await client.query(
      `SELECT * FROM "LinkTreeSettings" WHERE "tenantId" = $1`,
      [tenantId]
    );
    return NextResponse.json({ settings: result.rows[0] || null });
  } catch (error) {
    console.error("Failed to fetch LinkTree settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  } finally {
    await client.end();
  }
}

export async function POST(req: Request) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    const tenantId = (await resolveTenantFromAdminSession()) ?? DEFAULT_TENANT_ID;
    const body = await req.json();
    await client.connect();

    // Upsert on tenantId (one settings row per tenant). `id` is omitted so the
    // column default (cuid) fills it for a brand-new tenant; tenant zero's
    // existing "singleton" row is matched by the tenantId conflict target.
    const result = await client.query(
      `INSERT INTO "LinkTreeSettings" ("tenantId", "isEnabled", "profileName", "profileBio", "profileImageUrl", "customSlug", "backgroundColor", "buttonColor", "textColor", "updatedAt")
       VALUES ($9, $1, $2, $3, $4, $5, $6, $7, $8, NOW())
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
      ]
    );

    return NextResponse.json({ settings: result.rows[0] });
  } catch (error) {
    console.error("Failed to save LinkTree settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  } finally {
    await client.end();
  }
}
