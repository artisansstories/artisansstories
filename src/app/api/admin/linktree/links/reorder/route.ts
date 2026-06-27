import { NextResponse } from "next/server";
import { Client } from "pg";
import { resolveTenantFromAdminSession, DEFAULT_TENANT_ID } from "@/lib/tenant-context";

export async function POST(req: Request) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    // Raw pg bypasses the scoped client — scope each UPDATE to the admin's tenant.
    const tenantId = (await resolveTenantFromAdminSession()) ?? DEFAULT_TENANT_ID;
    const { linkIds } = await req.json();
    await client.connect();

    for (let i = 0; i < linkIds.length; i++) {
      await client.query(`UPDATE "LinkTreeLink" SET "sortOrder" = $1, "updatedAt" = NOW() WHERE id = $2 AND "tenantId" = $3`, [i, linkIds[i], tenantId]);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to reorder links:", error);
    return NextResponse.json({ error: "Failed to reorder links" }, { status: 500 });
  } finally {
    await client.end();
  }
}
