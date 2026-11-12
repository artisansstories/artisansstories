import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { toResponse } from "@/lib/admin-services/http";
import { uploadLandingPageImage } from "@/lib/admin-services/landing-page";

export async function POST(req: Request) {
  let session;
  try {
    session = await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Tenant prefix derived ONLY from the admin session (never the request body),
  // mirroring the product uploader. Falls back to the historical flat key if a
  // legacy session carries no tenantId.
  const tenantId = session.tenantId;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const field = formData.get("field") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    return toResponse(await uploadLandingPageImage(tenantId, field, { buffer, name: file.name, type: file.type }));
  } catch (error) {
    console.error("R2 upload failed:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
