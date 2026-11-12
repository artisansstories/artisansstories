import { NextResponse } from "next/server";
import { toResponse } from "@/lib/admin-services/http";
import { uploadEmailTemplateImage } from "@/lib/admin-services/email-template";
import { authErrorResponse, requireHouseAdminTenantId } from "@/lib/admin-api";

export async function POST(req: Request) {
  try {
    await requireHouseAdminTenantId();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    return toResponse(await uploadEmailTemplateImage("logo", { buffer, name: file.name, type: file.type }));
  } catch (error) {
    const unauthorized = authErrorResponse(error);
    if (unauthorized) return unauthorized;
    console.error("Logo upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
