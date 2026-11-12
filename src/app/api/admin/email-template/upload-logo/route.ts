import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { toResponse } from "@/lib/admin-services/http";
import { uploadEmailTemplateImage } from "@/lib/admin-services/email-template";

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

    const buffer = Buffer.from(await file.arrayBuffer());
    return toResponse(await uploadEmailTemplateImage("logo", { buffer, name: file.name, type: file.type }));
  } catch (error) {
    console.error("Logo upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
