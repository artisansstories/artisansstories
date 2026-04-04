import { NextResponse } from "next/server";
export async function GET() {
  try {
    
    
    const prefixes = ["SAVE", "GET", "USE", "ARTISAN", "CRAFT", "SHOP", "OFF", "DEAL"];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const number = Math.floor(Math.random() * 80) + 5; // 5–85
    return NextResponse.json({ code: `${prefix}${number}` });
  } catch (err) {
    console.error("GET /api/admin/discounts/generate-code error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
