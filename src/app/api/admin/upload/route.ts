import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { checkProductImage, processProductImage } from "@/lib/admin-services/uploads";
import { toResponse } from "@/lib/admin-services/http";

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Tenant prefix is derived ONLY from the authenticated admin session — the same
  // source the scoped Prisma client keys off (`session.tenantId`), so an
  // operator impersonating a tenant writes under that tenant's prefix too. The
  // request body can never steer it. If tenant is unknown (legacy session minted
  // before P2), fall back to the historical flat key so the upload still works.
  const tenantId = session.tenantId;
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
    console.error("POST /api/admin/upload error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
