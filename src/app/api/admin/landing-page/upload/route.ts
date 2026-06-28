import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { requireAdminSession } from "@/lib/admin-auth";
import { putObject, publicUrl } from "@/lib/r2";

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
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    // Bring landing-page assets onto the WebP standard (specs row 4): rasters →
    // single max-width-2000 q85 WebP, like the product full-size. SVG (and
    // anything sharp can't raster) is stored raw so it isn't corrupted.
    const isSvg = file.type === "image/svg+xml" || ext === "svg";
    let body: Buffer = buffer;
    let outExt = ext || "bin";
    let contentType = file.type || "application/octet-stream";
    if (!isSvg) {
      try {
        body = await sharp(buffer)
          .resize({ width: 2000, withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
        outExt = "webp";
        contentType = "image/webp";
      } catch {
        // Non-raster input sharp can't decode — fall back to raw passthrough.
        body = buffer;
        outExt = ext || "bin";
        contentType = file.type || "application/octet-stream";
      }
    }

    const key = tenantId
      ? `tenants/${tenantId}/landing-page/${field}-${randomUUID()}.${outExt}`
      : `landing-page/${field}-${randomUUID()}.${outExt}`;

    await putObject(key, body, contentType);

    return NextResponse.json({ url: publicUrl(key) });
  } catch (error) {
    console.error("R2 upload failed:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
