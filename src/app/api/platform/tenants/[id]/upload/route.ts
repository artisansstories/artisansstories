import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import heicConvert from "heic-convert";
import { prisma } from "@/lib/prisma";
import { requirePlatformOperator, platformAuthErrorResponse } from "@/lib/platform-auth";
import { putObject, publicUrl, isR2Configured } from "@/lib/r2";

/**
 * POST /api/platform/tenants/[id]/upload — tenant-isolated branding/product
 * upload, operator-gated (U2).
 *
 * Mirrors the operator surface of `tenants/[id]/theme` (same auth check, same
 * `platformAuthErrorResponse`, 404 if the tenant is missing) and the sharp
 * pipeline + return shape of `admin/upload`. The crucial isolation property:
 *
 *   The storage key prefix is SERVER-DERIVED from the route path `[id]` ONLY.
 *   A `tenantId` (or any prefix-bearing field) in the request body is IGNORED —
 *   the path wins, always. This is what guarantees per-tenant namespaces never
 *   collide regardless of what the client sends.
 *
 * Body: multipart/form-data
 *   - file: required
 *   - kind: required, one of "logo" | "favicon" | "product" (controls resize +
 *           validation rules per UPLOADS_PLAN AD-4 / AD-5)
 *
 * Returns the admin-uploader-compatible JSON:
 *   { url, urlThumb?, urlMedium?, width, height, size, altText? }
 * (thumb/medium/altText only for kind=product).
 */

const SVG_MIME = "image/svg+xml";

type Kind = "logo" | "favicon" | "product";

interface KindConfig {
  maxSize: number;
  /** Accepted upload mime types (server-authoritative allowlist). */
  mimes: string[];
}

const MB = 1024 * 1024;

const KIND_CONFIG: Record<Kind, KindConfig> = {
  // Logo: transparent PNG/SVG/WebP/JPEG, landscape. SVG passes through raw.
  logo: { maxSize: 2 * MB, mimes: ["image/png", "image/webp", "image/jpeg", SVG_MIME] },
  // Favicon: square PNG/SVG (WebP/JPEG converted to PNG, cover-cropped). ICO skipped.
  favicon: { maxSize: 1 * MB, mimes: ["image/png", "image/webp", "image/jpeg", SVG_MIME] },
  // Product: the existing live pipeline — JPEG/PNG/WebP/HEIC/HEIF, 3 webp sizes.
  product: {
    maxSize: 10 * MB,
    mimes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  },
};

function isKind(v: unknown): v is Kind {
  return v === "logo" || v === "favicon" || v === "product";
}

function randSuffix(): string {
  // {ts}-{rand}, base36 6 chars — matches the admin uploader.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── AI Alt Text (product only) ──────────────────────────────────────────────
// Ported from admin/upload: Gemini Flash via OpenRouter. Never blocks an upload.
async function generateAltText(
  thumbBuffer: Buffer,
  context: { productName?: string; artisanName?: string; variantHint?: string },
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  try {
    const base64 = thumbBuffer.toString("base64");
    const contextParts: string[] = [];
    if (context.productName) contextParts.push(`Product: ${context.productName}`);
    if (context.artisanName) contextParts.push(`Made by: ${context.artisanName}`);
    if (context.variantHint) contextParts.push(`Variant: ${context.variantHint}`);
    const contextStr =
      contextParts.length > 0 ? `\n\nContext: ${contextParts.join(" | ")}` : "";

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://artisansstories.com",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        max_tokens: 80,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Write a concise, descriptive alt text for this product image. Be specific about what you see: materials, colors, design details, style. Do not start with "Image of" or "Photo of". Keep it under 125 characters.${contextStr}`,
              },
              { type: "image_url", image_url: { url: `data:image/webp;base64,${base64}` } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Operator gate (mirrors tenants/[id]/theme exactly) ─────────────────────
  try {
    await requirePlatformOperator(req);
  } catch (err) {
    const res = platformAuthErrorResponse(err);
    if (res) return res;
    throw err;
  }

  // ── Resolve tenant from the PATH only; 404 if missing (mirror theme route) ──
  const { id: tenantId } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  try {
    const formData = await req.formData();
    const kindRaw = formData.get("kind");
    // NOTE: any `tenantId` field in the body is deliberately NOT read — the key
    // prefix below is derived from the path `tenantId` resolved above.

    const errors: string[] = [];

    if (!isKind(kindRaw)) {
      return NextResponse.json(
        {
          error: "validation_failed",
          errors: ["`kind` is required and must be one of: logo, favicon, product."],
        },
        { status: 400 },
      );
    }
    const kind: Kind = kindRaw;
    const config = KIND_CONFIG[kind];

    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "validation_failed", errors: ["`file` is required."] },
        { status: 400 },
      );
    }

    const blob = file as Blob;
    const fileName = (file as File).name ?? "";
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const contentType = blob.type || "";
    const heicByExt = ["heic", "heif"].includes(ext);
    const isSvg = contentType === SVG_MIME || ext === "svg";

    // Mime allowlist (server-authoritative). HEIC for product may arrive with an
    // empty/odd mime from some clients, so also accept by extension there.
    const mimeOk =
      config.mimes.includes(contentType) ||
      (kind === "product" && heicByExt) ||
      (isSvg && config.mimes.includes(SVG_MIME));
    if (!mimeOk) {
      errors.push(
        `Invalid file type "${contentType || ext || "unknown"}" for kind "${kind}". Accepted: ${config.mimes.join(", ")}.`,
      );
    }

    const arrayBuffer = await blob.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    if (buffer.byteLength > config.maxSize) {
      const mb = (config.maxSize / MB).toFixed(0);
      errors.push(`File too large for kind "${kind}". Maximum size is ${mb}MB.`);
    }

    if (errors.length) {
      return NextResponse.json({ error: "validation_failed", errors }, { status: 400 });
    }

    const branding = `tenants/${tenantId}/branding`;
    const originalSize = buffer.byteLength;

    // ── SVG passthrough (logo / favicon): store raw bytes, no sharp ───────────
    if (isSvg && (kind === "logo" || kind === "favicon")) {
      const key = `${branding}/${kind}-${randSuffix()}.svg`;
      if (isR2Configured()) {
        await putObject(key, buffer, SVG_MIME);
      } else {
        console.warn("R2 credentials not configured — returning mock URL");
      }
      return NextResponse.json({
        url: publicUrl(key),
        width: null,
        height: null,
        size: originalSize,
      });
    }

    // ── Logo (raster): max-width 800, q90, alpha preserved, no crop ───────────
    if (kind === "logo") {
      const out = await sharp(buffer)
        .resize({ width: 800, withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer();
      const meta = await sharp(out).metadata();
      const key = `${branding}/logo-${randSuffix()}.webp`;
      if (isR2Configured()) {
        await putObject(key, out, "image/webp");
      } else {
        console.warn("R2 credentials not configured — returning mock URL");
      }
      return NextResponse.json({
        url: publicUrl(key),
        width: meta.width ?? null,
        height: meta.height ?? null,
        size: originalSize,
      });
    }

    // ── Favicon (raster): 256×256 cover-crop center → PNG ─────────────────────
    if (kind === "favicon") {
      const out = await sharp(buffer)
        .resize(256, 256, { fit: "cover", position: "centre" })
        .png()
        .toBuffer();
      const key = `${branding}/favicon-${randSuffix()}.png`;
      if (isR2Configured()) {
        await putObject(key, out, "image/png");
      } else {
        console.warn("R2 credentials not configured — returning mock URL");
      }
      return NextResponse.json({
        url: publicUrl(key),
        width: 256,
        height: 256,
        size: originalSize,
      });
    }

    // ── Product: the existing 3-size webp pipeline + HEIC + optional alt text ──
    const productName = formData.get("productName")?.toString() ?? undefined;
    const artisanName = formData.get("artisanName")?.toString() ?? undefined;
    const variantHint = formData.get("variantHint")?.toString() ?? undefined;

    if (heicByExt || contentType === "image/heic" || contentType === "image/heif") {
      try {
        const converted = await heicConvert({
          buffer: new Uint8Array(buffer),
          format: "JPEG",
          quality: 0.92,
        });
        buffer = Buffer.from(converted);
      } catch (heicErr) {
        console.error("HEIC conversion failed:", heicErr);
        return NextResponse.json(
          { error: "validation_failed", errors: ["Failed to convert HEIC image."] },
          { status: 400 },
        );
      }
    }

    const metadata = await sharp(buffer).metadata();
    const [fullBuffer, mediumBuffer, thumbBuffer] = await Promise.all([
      sharp(buffer).resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
      sharp(buffer).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
      sharp(buffer).resize({ width: 300, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    ]);

    const base = `tenants/${tenantId}/products/${randSuffix()}`;
    const fullKey = `${base}.webp`;
    const mediumKey = `${base}-medium.webp`;
    const thumbKey = `${base}-thumb.webp`;

    if (!isR2Configured()) {
      console.warn("R2 credentials not configured — returning mock URLs");
      return NextResponse.json({
        url: publicUrl(fullKey),
        urlThumb: publicUrl(thumbKey),
        urlMedium: publicUrl(mediumKey),
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        size: originalSize,
      });
    }

    const [, , , altTextResult] = await Promise.allSettled([
      putObject(fullKey, fullBuffer, "image/webp"),
      putObject(mediumKey, mediumBuffer, "image/webp"),
      putObject(thumbKey, thumbBuffer, "image/webp"),
      generateAltText(thumbBuffer, { productName, artisanName, variantHint }),
    ]);
    const altText = altTextResult.status === "fulfilled" ? altTextResult.value : null;

    return NextResponse.json({
      url: publicUrl(fullKey),
      urlThumb: publicUrl(thumbKey),
      urlMedium: publicUrl(mediumKey),
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      size: originalSize,
      altText: altText ?? null,
    });
  } catch (err) {
    console.error("POST /api/platform/tenants/[id]/upload error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
