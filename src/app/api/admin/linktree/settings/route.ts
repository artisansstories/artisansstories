import { NextResponse } from "next/server";
import { Client } from "pg";

export async function GET() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const result = await client.query(`SELECT * FROM "LinkTreeSettings" WHERE id = 'singleton'`);
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
    const body = await req.json();
    await client.connect();
    
    const result = await client.query(
      `INSERT INTO "LinkTreeSettings" (id, "isEnabled", "profileName", "profileBio", "profileImageUrl", "customSlug", "backgroundColor", "buttonColor", "textColor", "updatedAt")
       VALUES ('singleton', $1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (id) DO UPDATE SET
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
