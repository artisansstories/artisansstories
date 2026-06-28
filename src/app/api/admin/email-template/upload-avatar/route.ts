import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { putObject, publicUrl } from "@/lib/r2";

export async function POST(req: Request) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "jpg";
    const key = `email/avatar-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await putObject(key, buffer, file.type);

    return NextResponse.json({ url: publicUrl(key), filename: file.name });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
