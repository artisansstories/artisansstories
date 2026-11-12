import { NextRequest, NextResponse } from "next/server";
import { checkProductImage, processProductImage } from "@/lib/admin-services/uploads";
import { toResponse } from "@/lib/admin-services/http";
import { authErrorResponse, requireAdminTenantId } from "@/lib/admin-api";

export async function POST(request: NextRequest) {
  let tenantId: string;
  try {
    // Tenant prefix is derived ONLY from the authenticated admin session — the same
    // resolution the scoped Prisma client uses (the session's tenantId claim, else
    // the admin's own record), so an operator impersonating a tenant writes under
    // that tenant's prefix too. The request body can never steer it. A session
    // whose tenant can't be resolved (e.g. deleted admin, no claim) is a 401: it
    // must never fall back to the house store's flat key prefix.
    tenantId = await requireAdminTenantId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    // Optional product context for AI alt text
    const productName = formData.get("productName")?.toString() ?? undefined;
    const artisanName = formData.get("artisanName")?.toString() ?? undefined;
    const variantHint = formData.get("variantHint")?.toString() ?? undefined;
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const blob = file as Blob;
    const fileName = (file as File).name ?? "";
    // main rejected a bad type BEFORE reading the file body; keep that order.
    // (processProductImage re-runs the same check, including the size limit.)
    const typeCheck = checkProductImage({ contentType: blob.type, fileName, size: 0 });
    if (!typeCheck.ok) return toResponse(typeCheck);
    const buffer = Buffer.from(await blob.arrayBuffer());
    return toResponse(await processProductImage({
      buffer,
      contentType: blob.type,
      fileName,
      tenantId,
      productName,
      artisanName,
      variantHint,
    }));
  } catch (err) {
    const unauthorized = authErrorResponse(err);
    if (unauthorized) return unauthorized;
    console.error("POST /api/admin/upload error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
