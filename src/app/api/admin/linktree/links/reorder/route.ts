import { NextResponse } from "next/server";
import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_URL });

export async function POST(req: Request) {
  try {
    const { linkIds } = await req.json();
    await client.connect();
    
    for (let i = 0; i < linkIds.length; i++) {
      await client.query(`UPDATE "LinkTreeLink" SET "sortOrder" = $1, "updatedAt" = NOW() WHERE id = $2`, [i, linkIds[i]]);
    }
    
    await client.end();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to reorder links:", error);
    return NextResponse.json({ error: "Failed to reorder links" }, { status: 500 });
  }
}
