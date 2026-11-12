/**
 * admin-services/uploads.ts — product image processing shared by
 * POST /api/admin/upload and the MCP products_upload_image tool.
 *
 * Extracted verbatim from the route (behavior unchanged): type check, size check,
 * HEIC→JPEG conversion, sharp webp variants (full/medium/thumb), R2 upload, AI
 * alt text, and mock URLs when R2 is not configured.
 *
 * `tenantId` MUST come from the authenticated admin session (route) or the MCP
 * context — never from request input. It only selects the storage key prefix.
 */
import sharp from "sharp";
import heicConvert from "heic-convert";
import { putObject, publicUrl, isR2Configured } from "@/lib/r2";
import { ok, fail } from "./result";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

// ─── AI Alt Text ─────────────────────────────────────────────────────────────
// Calls Gemini Flash via OpenRouter with the thumb image + product context
// Returns a concise, SEO-friendly alt text string, or null on failure
async function generateAltText(
  thumbBuffer: Buffer,
  context: { productName?: string; artisanName?: string; variantHint?: string }
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  try {
    const base64 = thumbBuffer.toString("base64");
    const contextParts: string[] = [];
    if (context.productName) contextParts.push(`Product: ${context.productName}`);
    if (context.artisanName) contextParts.push(`Made by: ${context.artisanName}`);
    if (context.variantHint) contextParts.push(`Variant: ${context.variantHint}`);
    const contextStr = contextParts.length > 0 ? `\n\nContext: ${contextParts.join(" | ")}` : "";

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://artisansstories.com",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        max_tokens: 80,
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `Write a concise, descriptive alt text for this product image. Be specific about what you see: materials, colors, design details, style. Do not start with "Image of" or "Photo of". Keep it under 125 characters.${contextStr}`,
            },
            {
              type: "image_url",
              image_url: { url: `data:image/webp;base64,${base64}` },
            },
          ],
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text ?? null;
  } catch {
    return null; // never block upload on alt text failure
  }
}

export interface ProductImageUpload {
  buffer: Buffer;
  /** MIME type as reported by the client / remote server. */
  contentType: string;
  /** Original file name (only its extension is used, for HEIC detection). */
  fileName: string;
  /** From the session / MCP context only. Selects the R2 key prefix. */
  tenantId?: string | null;
  productName?: string;
  artisanName?: string;
  variantHint?: string;
}

function isHeicByExt(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ["heic", "heif"].includes(ext);
}

/** Type + size checks shared by the upload and its preview. */
export function checkProductImage(input: Pick<ProductImageUpload, "contentType" | "fileName"> & { size: number }) {
  const heicByExt = isHeicByExt(input.fileName);
  if (!ALLOWED_IMAGE_TYPES.includes(input.contentType) && !heicByExt) {
    return fail(400, "Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed.");
  }
  if (input.size > MAX_IMAGE_SIZE) {
    return fail(400, "File too large. Maximum size is 10MB.");
  }
  return ok({ heicByExt });
}

export async function processProductImage(input: ProductImageUpload) {
  const { tenantId, productName, artisanName, variantHint, contentType } = input;
  let buffer = input.buffer;
  const check = checkProductImage({ contentType, fileName: input.fileName, size: buffer.byteLength });
  if (!check.ok) return check;
  const { heicByExt } = check.data;
  // Convert HEIC/HEIF to JPEG before processing with sharp
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
      return fail(400, "Failed to convert HEIC image.");
    }
  }
  // Process images with sharp. Bytes that aren't a decodable image (wrong or
  // spoofed content type) are the caller's mistake, not a server error.
  let metadata: sharp.Metadata;
  let fullBuffer: Buffer, mediumBuffer: Buffer, thumbBuffer: Buffer;
  try {
    metadata = await sharp(buffer).metadata();
    [fullBuffer, mediumBuffer, thumbBuffer] = await Promise.all([
      sharp(buffer).resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
      sharp(buffer).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
      sharp(buffer).resize({ width: 300, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    ]);
  } catch (imgErr) {
    console.error("Image processing failed:", imgErr);
    return fail(400, "Could not read the image. Upload a valid JPEG, PNG, WebP or HEIC file.");
  }
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const baseName = tenantId
    ? `tenants/${tenantId}/products/${timestamp}-${random}`
    : `products/${timestamp}-${random}`;
  const fullKey = `${baseName}.webp`;
  const mediumKey = `${baseName}-medium.webp`;
  const thumbKey = `${baseName}-thumb.webp`;
  // If credentials are missing, return mock URLs for development
  if (!isR2Configured()) {
    console.warn("R2 credentials not configured — returning mock URLs");
    return ok({
      url: publicUrl(fullKey),
      urlThumb: publicUrl(thumbKey),
      urlMedium: publicUrl(mediumKey),
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      size: buffer.byteLength,
    });
  }
  // Run R2 upload and AI alt text generation in parallel
  const [fullPut, mediumPut, thumbPut, altTextResult] = await Promise.allSettled([
    putObject(fullKey, fullBuffer, "image/webp"),
    putObject(mediumKey, mediumBuffer, "image/webp"),
    putObject(thumbKey, thumbBuffer, "image/webp"),
    generateAltText(thumbBuffer, { productName, artisanName, variantHint }),
  ]);
  // Any failed R2 write means the returned URLs would be dead: report it
  // (alt text failure is fine).
  const failedPut = [fullPut, mediumPut, thumbPut].find((r) => r.status === "rejected");
  if (failedPut) {
    console.error("R2 upload failed:", (failedPut as PromiseRejectedResult).reason);
    return fail(502, "Image storage failed, so the image was not saved. Try again.");
  }
  const altText = altTextResult.status === "fulfilled" ? altTextResult.value : null;

  return ok({
    url: publicUrl(fullKey),
    urlThumb: publicUrl(thumbKey),
    urlMedium: publicUrl(mediumKey),
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    size: buffer.byteLength,
    altText: altText ?? null,
  });
}
