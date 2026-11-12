/**
 * admin-services/uploads.ts — product image processing shared by
 * POST /api/admin/upload and the MCP products_upload_image tool.
 *
 * Extracted verbatim from the route (behavior unchanged): type check, size check,
 * HEIC→JPEG conversion, sharp webp variants (full/medium/thumb), R2 upload, AI
 * alt text, and mock URLs when R2 is not configured.
 *
 * Alt text never blocks or fails an upload or a product save. If OpenRouter is
 * unconfigured, slow (8s timeout) or fails, the image gets a fallback alt text
 * ("<product name> — image <n>"), a warning is logged, and
 * regenerateProductAltText can retry the AI later.
 *
 * `tenantId` MUST come from the authenticated admin session (route) or the MCP
 * context — never from request input. It only selects the storage key prefix.
 */
import sharp from "sharp";
import heicConvert from "heic-convert";
import { putObject, publicUrl, isR2Configured } from "@/lib/r2";
import type { TenantPrisma } from "@/lib/tenant-prisma";
import { fetchRemoteImage } from "@/lib/mcp/fetch-image";
import { ok, fail } from "./result";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

// ─── AI Alt Text ─────────────────────────────────────────────────────────────

export const ALT_TEXT_TIMEOUT_MS = 8000;

/** Alt text used when the AI isn't available: product name plus position. */
export function fallbackAltText(productName: string | undefined | null, position?: number): string {
  const name = productName?.trim() || "Product";
  return position && position > 0 ? `${name} — image ${position}` : `${name} image`;
}

/** True for alt text that came from fallbackAltText (or is missing). */
export function isFallbackAltText(alt: string | null | undefined): boolean {
  return !alt?.trim() || / — image \d+$/.test(alt) || / image$/.test(alt);
}

// Calls Gemini Flash via OpenRouter with the thumb image + product context
// Returns a concise, SEO-friendly alt text string, or null on failure
async function generateAltText(
  thumbBuffer: Buffer,
  context: { productName?: string; artisanName?: string; variantHint?: string }
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("[alt-text] OPENROUTER_API_KEY is not set; using fallback alt text.");
    return null;
  }
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
      // A hung provider must not hold the upload open.
      signal: AbortSignal.timeout(ALT_TEXT_TIMEOUT_MS),
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
    if (!res.ok) {
      console.warn(`[alt-text] OpenRouter returned ${res.status}; using fallback alt text.`);
      return null;
    }
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) console.warn("[alt-text] OpenRouter returned no text; using fallback alt text.");
    return text || null;
  } catch (err) {
    // never block upload on alt text failure
    console.warn(`[alt-text] OpenRouter call failed (${err instanceof Error ? err.message : String(err)}); using fallback alt text.`);
    return null;
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
  /** 1-based position of the image on the product, for the fallback alt text. */
  position?: number;
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
  const { tenantId, productName, artisanName, variantHint, contentType, position } = input;
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
      altText: fallbackAltText(productName, position),
      altTextSource: "fallback" as const,
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
  const aiAlt = altTextResult.status === "fulfilled" ? altTextResult.value : null;

  return ok({
    url: publicUrl(fullKey),
    urlThumb: publicUrl(thumbKey),
    urlMedium: publicUrl(mediumKey),
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    size: buffer.byteLength,
    altText: aiAlt ?? fallbackAltText(productName, position),
    altTextSource: aiAlt ? ("ai" as const) : ("fallback" as const),
  });
}

// ─── Regenerate alt text later ───────────────────────────────────────────────

async function altTargets(db: TenantPrisma, productId: string, all: boolean) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, artisanName: true, images: { orderBy: { position: "asc" }, select: { id: true, url: true, urlThumb: true, altText: true, position: true } } },
  });
  if (!product) return fail(404, "Product not found");
  const images = product.images.filter((img) => all || isFallbackAltText(img.altText));
  return ok({ product, images });
}

export async function previewRegenerateAltText(db: TenantPrisma, productId: string, all = false) {
  const t = await altTargets(db, productId, all);
  if (!t.ok) return t;
  return ok({
    product: { id: t.data.product.id, name: t.data.product.name },
    images: t.data.images.map((i) => ({ id: i.id, currentAltText: i.altText })),
    aiConfigured: !!process.env.OPENROUTER_API_KEY,
    effect: t.data.images.length
      ? "Asks the AI for a new alt text for each image listed. Images where the AI fails keep their current text (or get the fallback). The product and its images are otherwise unchanged."
      : "Nothing to do: every image already has a custom or AI alt text. Pass all=true to redo them anyway.",
  });
}

/**
 * Ask the AI again for images that only have fallback alt text (or every
 * image with `all`). Never fails because of the AI: images it can't describe
 * keep their text, or get the fallback if they had none.
 */
export async function regenerateProductAltText(db: TenantPrisma, productId: string, all = false) {
  const t = await altTargets(db, productId, all);
  if (!t.ok) return t;
  const { product, images } = t.data;
  const results: Array<{ id: string; url: string; altText: string; source: "ai" | "fallback" | "unchanged" }> = [];
  for (const img of images) {
    const position = img.position + 1;
    let ai: string | null = null;
    const fetched = await fetchRemoteImage(img.urlThumb ?? img.url);
    if (fetched.ok) ai = await generateAltText(fetched.image.buffer, { productName: product.name, artisanName: product.artisanName ?? undefined });
    else console.warn(`[alt-text] could not fetch image ${img.id} to describe it: ${fetched.error}`);
    const next = ai ?? (img.altText?.trim() ? img.altText : fallbackAltText(product.name, position));
    const source = ai ? "ai" : next === img.altText ? "unchanged" : "fallback";
    if (next !== img.altText) await db.productImage.update({ where: { id: img.id }, data: { altText: next } });
    results.push({ id: img.id, url: img.url, altText: next, source });
  }
  const aiCount = results.filter((r) => r.source === "ai").length;
  return ok({
    productId: product.id,
    images: results,
    regenerated: aiCount,
    ...(aiCount < results.length ? { note: "Some images kept their fallback alt text because the AI wasn't available. Try again later, or type the alt text in the product form." } : {}),
  });
}
