import { NextResponse } from "next/server";
import { toResponse } from "@/lib/admin-services/http";
import { uploadLandingPageImage } from "@/lib/admin-services/landing-page";
import { resolveTenantFromAdminSession } from "@/lib/tenant-context";
import { authErrorResponse, requireAdminApiSession } from "@/lib/admin-api";

export async function POST(req: Request) {
  try {
    await requireAdminApiSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Tenant derived ONLY from the admin session (never the request body). The
  // service refuses (403) anything but the house store.
  const tenantId = await resolveTenantFromAdminSession().catch(() => null);
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    const unauthorized = authErrorResponse(error);
    if (unauthorized) return unauthorized;
    console.error("R2 upload failed:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
