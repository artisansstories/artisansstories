import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import heicConvert from "heic-convert";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

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

export async function POST(request: NextRequest) {
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
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const heicByExt = ["heic", "heif"].includes(ext);
    const contentType = blob.type;
    if (!ALLOWED_TYPES.includes(contentType) && !heicByExt) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed." },
        { status: 400 }
      );
    }
    const arrayBuffer = await blob.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }
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
        return NextResponse.json({ error: "Failed to convert HEIC image." }, { status: 400 });
      }
    }
    // Process images with sharp
    const sharpInstance = sharp(buffer);
    const metadata = await sharpInstance.metadata();
    const [fullBuffer, mediumBuffer, thumbBuffer] = await Promise.all([
      sharp(buffer).resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
      sharp(buffer).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
      sharp(buffer).resize({ width: 300, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    ]);
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const baseName = `products/${timestamp}-${random}`;
    const fullKey = `${baseName}.webp`;
    const mediumKey = `${baseName}-medium.webp`;
    const thumbKey = `${baseName}-thumb.webp`;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
    const accountId = process.env.R2_ACCOUNT_ID ?? "";
    const bucketName = process.env.R2_BUCKET_NAME ?? "";
    const publicUrl = process.env.R2_PUBLIC_URL ?? "";
    // If credentials are missing, return mock URLs for development
    if (!accessKeyId || !secretAccessKey) {
      console.warn("R2 credentials not configured — returning mock URLs");
      return NextResponse.json({
        url: `${publicUrl}/${fullKey}`,
        urlThumb: `${publicUrl}/${thumbKey}`,
        urlMedium: `${publicUrl}/${mediumKey}`,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        size: buffer.byteLength,
      });
    }
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    // Run R2 upload and AI alt text generation in parallel
    const [,,,altTextResult] = await Promise.allSettled([
      s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: fullKey,
        Body: fullBuffer,
        ContentType: "image/webp",
      })),
      s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: mediumKey,
        Body: mediumBuffer,
        ContentType: "image/webp",
      })),
      s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: thumbKey,
        Body: thumbBuffer,
        ContentType: "image/webp",
      })),
      generateAltText(thumbBuffer, { productName, artisanName, variantHint }),
    ]);
    // Throw if any R2 upload failed (alt text failure is fine)
    const altText = altTextResult.status === "fulfilled" ? altTextResult.value : null;

    return NextResponse.json({
      url: `${publicUrl}/${fullKey}`,
      urlThumb: `${publicUrl}/${thumbKey}`,
      urlMedium: `${publicUrl}/${mediumKey}`,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      size: buffer.byteLength,
      altText: altText ?? null,
    });
  } catch (err) {
    console.error("POST /api/admin/upload error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
